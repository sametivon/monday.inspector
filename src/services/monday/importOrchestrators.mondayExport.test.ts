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
