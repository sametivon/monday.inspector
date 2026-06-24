import { describe, it, expect, beforeEach, vi } from "vitest";
import { runFullMondayExportImport } from "./importOrchestrators";
import type {
  ColumnMapping,
  MondayColumn,
  ParsedFileMondayExport,
} from "../../utils/types";

// Regression guard for THE critical path the user cares about most: a
// monday.com classic board export re-imported via the two-phase
// runFullMondayExportImport (create parents, then nest subitems under the
// newly-created parents). Mirrors the shape of the user's real file:
// one group, one parent ("Mollu (Test 3)"), a couple of subitems.

function makeFetchResponses(responses: Array<{ ok: boolean; body: unknown }>) {
  const queue = [...responses];
  return vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error("Unexpected extra fetch() call");
    return {
      ok: next.ok,
      status: next.ok ? 200 : 500,
      statusText: next.ok ? "OK" : "Server Error",
      text: async () => JSON.stringify(next.body),
      json: async () => next.body,
    } as Response;
  });
}

const BOARD_COLUMNS: MondayColumn[] = [
  { id: "status", title: "Status", type: "status", settings_str: "{}" },
  { id: "owner", title: "Project Owner", type: "text", settings_str: "{}" },
];
const SUBITEM_COLUMNS: MondayColumn[] = [
  { id: "sub_status", title: "Supplier Status", type: "status", settings_str: "{}" },
];

function fixture(): ParsedFileMondayExport {
  return {
    kind: "monday_export",
    boardName: "Sourcing Tracker",
    fileName: "Untitled spreadsheet.xlsx",
    parentHeaders: ["Status", "Project Owner"],
    subitemHeaders: ["Supplier Status"],
    groups: [
      {
        groupName: "New Request",
        items: [
          {
            name: "Mollu (Test 3)",
            values: { Status: "Working on it", "Project Owner": "Mark J" },
            subitems: [
              { name: "Supplier Search", values: { "Supplier Status": "In Progress" } },
              { name: "Quote Review", values: { "Supplier Status": "Pending" } },
            ],
          },
        ],
      },
    ],
    flatSubitems: [
      {
        groupName: "New Request",
        parentItemName: "Mollu (Test 3)",
        subitemName: "Supplier Search",
        values: { "Supplier Status": "In Progress" },
      },
      {
        groupName: "New Request",
        parentItemName: "Mollu (Test 3)",
        subitemName: "Quote Review",
        values: { "Supplier Status": "Pending" },
      },
    ],
    rowCount: 2,
  };
}

const PARENT_MAPPINGS: ColumnMapping[] = [
  { fileColumn: "Status", mondayColumnId: "status" },
  { fileColumn: "Project Owner", mondayColumnId: "owner" },
];
const SUBITEM_MAPPINGS: ColumnMapping[] = [
  { fileColumn: "Supplier Status", mondayColumnId: "sub_status" },
];

describe("runFullMondayExportImport — monday classic export path", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates the parent then nests both subitems under it", async () => {
    // Fetch sequence:
    //  1) fetchBoardGroups → returns the "New Request" group
    //  2) create_item (parent) → id 555
    //  3) create_subitem (Supplier Search) → id 556
    //  4) create_subitem (Quote Review) → id 557
    const fetchMock = makeFetchResponses([
      {
        ok: true,
        body: { data: { boards: [{ groups: [{ id: "grp1", title: "New Request" }] }] } },
      },
      { ok: true, body: { data: { create_item: { id: "555", name: "Mollu (Test 3)" } } } },
      { ok: true, body: { data: { create_subitem: { id: "556", name: "Supplier Search" } } } },
      { ok: true, body: { data: { create_subitem: { id: "557", name: "Quote Review" } } } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await runFullMondayExportImport(
      "tok",
      fixture(),
      PARENT_MAPPINGS,
      SUBITEM_MAPPINGS,
      "board-1",
      BOARD_COLUMNS,
      SUBITEM_COLUMNS,
      { onRowUpdate: () => {}, onBatchComplete: () => {} },
    );

    // 1 parent + 2 subitems = 3 rows, all succeed
    expect(result.total).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);

    // Parent row records the new id; subitem rows record parent linkage
    const parentRow = result.rows.find((r) => r.kind === "parent");
    expect(parentRow?.createdItemId).toBe("555");
    const subRows = result.rows.filter((r) => r.kind === "subitem");
    expect(subRows).toHaveLength(2);
    expect(subRows.every((r) => r.parentItemId === "555")).toBe(true);
  });

  it("auto-creates a missing group on the target board and uses its new id", async () => {
    // The source export's group is "New Request". The target board returns
    // NO groups with that title — so the orchestrator must call create_group
    // before phase 1, then pass that new id into create_item.
    const fetchMock = makeFetchResponses([
      // fetchBoardGroups — empty groups list on the target board
      { ok: true, body: { data: { boards: [{ groups: [] }] } } },
      // create_group — returns the new group with id "grp-NEW"
      {
        ok: true,
        body: { data: { create_group: { id: "grp-NEW", title: "New Request" } } },
      },
      // create_item (parent) — assert below that group_id was set to grp-NEW
      { ok: true, body: { data: { create_item: { id: "555", name: "Mollu (Test 3)" } } } },
      // create_subitem ×2
      { ok: true, body: { data: { create_subitem: { id: "556", name: "Supplier Search" } } } },
      { ok: true, body: { data: { create_subitem: { id: "557", name: "Quote Review" } } } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await runFullMondayExportImport(
      "tok",
      fixture(),
      PARENT_MAPPINGS,
      SUBITEM_MAPPINGS,
      "board-1",
      BOARD_COLUMNS,
      SUBITEM_COLUMNS,
      { onRowUpdate: () => {}, onBatchComplete: () => {} },
    );

    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);

    // The 2nd fetch call must be the create_group mutation with the
    // source group's name — proves the auto-create fired before phase 1.
    const createGroupBody = JSON.parse(
      (fetchMock.mock.calls[1]?.[1] as { body: string }).body,
    );
    expect(createGroupBody.query).toContain("create_group");
    expect(createGroupBody.variables.groupName).toBe("New Request");

    // The 3rd fetch call (create_item) must pass groupId = "grp-NEW".
    const createItemBody = JSON.parse(
      (fetchMock.mock.calls[2]?.[1] as { body: string }).body,
    );
    expect(createItemBody.variables.groupId).toBe("grp-NEW");
  });

  it("creates groups in REVERSE source order so monday's top-insertion preserves source order on the board", async () => {
    // Source has 3 distinct groups (A, B, C). monday's create_group puts
    // each new group at the TOP of the board, so if we created them in
    // source order the final board reads C, B, A (reversed). Instead the
    // orchestrator iterates in reverse: C is created first (lands at top),
    // then B (now above C), then A (now above B) → board reads A, B, C.
    const multiGroupFixture = {
      kind: "monday_export" as const,
      boardName: "P",
      fileName: "p.xlsx",
      parentHeaders: ["Status"],
      subitemHeaders: [],
      groups: [
        { groupName: "GroupA", items: [{ name: "a1", values: { Status: "Done" }, subitems: [] }] },
        { groupName: "GroupB", items: [{ name: "b1", values: { Status: "Done" }, subitems: [] }] },
        { groupName: "GroupC", items: [{ name: "c1", values: { Status: "Done" }, subitems: [] }] },
      ],
      flatSubitems: [],
      rowCount: 3,
    };
    const fetchMock = makeFetchResponses([
      { ok: true, body: { data: { boards: [{ groups: [] }] } } },
      { ok: true, body: { data: { create_group: { id: "gC", title: "GroupC" } } } },
      { ok: true, body: { data: { create_group: { id: "gB", title: "GroupB" } } } },
      { ok: true, body: { data: { create_group: { id: "gA", title: "GroupA" } } } },
      { ok: true, body: { data: { create_item: { id: "i1", name: "a1" } } } },
      { ok: true, body: { data: { create_item: { id: "i2", name: "b1" } } } },
      { ok: true, body: { data: { create_item: { id: "i3", name: "c1" } } } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    await runFullMondayExportImport(
      "tok",
      multiGroupFixture,
      [{ fileColumn: "Status", mondayColumnId: "status" }],
      [],
      "board-1",
      BOARD_COLUMNS,
      SUBITEM_COLUMNS,
      { onRowUpdate: () => {}, onBatchComplete: () => {} },
    );

    // Verify create_group fired in REVERSE source order: C, then B, then A
    const createdInOrder: string[] = [];
    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse((call[1] as { body: string }).body);
      if (body.query.includes("create_group")) {
        createdInOrder.push(body.variables.groupName);
      }
    }
    expect(createdInOrder).toEqual(["GroupC", "GroupB", "GroupA"]);
  });

  it("skips the create_group call when the target board already has the group", async () => {
    // Sanity guard: don't burn a create_group call when the group is
    // already there. Only fetchBoardGroups → create_item × 1 → create_subitem × 2.
    const fetchMock = makeFetchResponses([
      {
        ok: true,
        body: { data: { boards: [{ groups: [{ id: "grp1", title: "New Request" }] }] } },
      },
      { ok: true, body: { data: { create_item: { id: "555", name: "Mollu (Test 3)" } } } },
      { ok: true, body: { data: { create_subitem: { id: "556", name: "Supplier Search" } } } },
      { ok: true, body: { data: { create_subitem: { id: "557", name: "Quote Review" } } } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await runFullMondayExportImport(
      "tok",
      fixture(),
      PARENT_MAPPINGS,
      SUBITEM_MAPPINGS,
      "board-1",
      BOARD_COLUMNS,
      SUBITEM_COLUMNS,
      { onRowUpdate: () => {}, onBatchComplete: () => {} },
    );

    expect(result.succeeded).toBe(3);
    // 4 fetches total: groups + create_item + 2 × create_subitem. No
    // create_group call. (We sized makeFetchResponses to exactly 4; any
    // surprise extra call would throw "Unexpected extra fetch() call".)
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("propagates a parent creation failure to its subitems (no orphan subitem calls)", async () => {
    // fetchBoardGroups OK, then create_item FAILS. create_item goes
    // through withRetry (4 attempts), so queue 4 error responses. The two
    // subitems should be marked 'parent was not created' WITHOUT any
    // create_subitem fetch firing.
    const err = { ok: true, body: { errors: [{ message: "create_item blew up" }] } };
    const fetchMock = makeFetchResponses([
      {
        ok: true,
        body: { data: { boards: [{ groups: [{ id: "grp1", title: "New Request" }] }] } },
      },
      err,
      err,
      err,
      err,
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await runFullMondayExportImport(
      "tok",
      fixture(),
      PARENT_MAPPINGS,
      SUBITEM_MAPPINGS,
      "board-1",
      BOARD_COLUMNS,
      SUBITEM_COLUMNS,
      { onRowUpdate: () => {}, onBatchComplete: () => {} },
    );

    expect(result.failed).toBe(3); // 1 parent + 2 subitems all fail
    expect(result.succeeded).toBe(0);
    const subRows = result.rows.filter((r) => r.kind === "subitem");
    expect(subRows.every((r) => /not created/i.test(r.error ?? ""))).toBe(true);
    // groups (1) + create_item 4 retry attempts (4) = 5 fetches; crucially
    // NO create_subitem attempts for the orphaned children.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  }, 30_000);
});
