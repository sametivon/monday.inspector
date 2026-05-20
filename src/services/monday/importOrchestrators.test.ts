import { describe, it, expect, beforeEach, vi } from "vitest";
import { runImport } from "./importOrchestrators";
import { clearLinkedBoardItemsCache } from "./queries";
import type {
  ColumnMapping,
  MondayColumn,
  ParentIdentifier,
  ParsedFileFlat,
} from "../../utils/types";

// Integration coverage that locks in the v1.6.1 diagnostic behaviour:
//   • A BoardRelationResolveError thrown inside buildColumnValues must
//     reach the per-row error column WITH the "Column resolution failed:"
//     prefix (so users can distinguish it from create_item failures).
//   • create_subitem must NOT be called when column resolution fails —
//     we don't want orphan API calls or noisy retries on rows we already
//     know can't be written.

function makeFetchResponses(responses: Array<{ ok: boolean; body: unknown }>) {
  const queue = [...responses];
  return vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error("Unexpected extra fetch() call");
    return {
      ok: next.ok,
      status: next.ok ? 200 : 401,
      statusText: next.ok ? "OK" : "Unauthorized",
      text: async () => JSON.stringify(next.body),
      json: async () => next.body,
    } as Response;
  });
}

const SUBITEM_COLUMNS: MondayColumn[] = [
  { id: "name", title: "Name", type: "text", settings_str: "{}" },
  {
    id: "connect_col",
    title: "Project Board",
    type: "board_relation",
    // Empty boardIds → resolveBoardRelationValue throws when names appear
    settings_str: JSON.stringify({ boardIds: [] }),
  },
];

const FILE: ParsedFileFlat = {
  kind: "flat",
  fileName: "test.csv",
  headers: ["Name", "Parent", "Project Board"],
  rows: [
    { Name: "Sub 1", Parent: "Parent Item", "Project Board": "Some Project" },
  ],
  rowCount: 1,
};

const PARENT_ID: ParentIdentifier = {
  type: "item_name",
  fileColumn: "Parent",
};

const MAPPINGS: ColumnMapping[] = [
  { fileColumn: "Project Board", mondayColumnId: "connect_col" },
];

describe("runImport — Connect Boards error handling", () => {
  beforeEach(() => {
    clearLinkedBoardItemsCache();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("surfaces a BoardRelationResolveError as 'Column resolution failed: ...' on the failed row, no create_subitem call", async () => {
    // Sequence: fetchBoardItems(parent board) → returns the parent so
    // parent resolution succeeds, then resolveBoardRelationValue throws
    // because the board_relation column has no linked board configured.
    // Only ONE fetch should fire — no create_subitem attempt.
    const fetchMock = makeFetchResponses([
      {
        ok: true,
        body: {
          data: {
            boards: [
              {
                items_page: {
                  cursor: null,
                  items: [{ id: "999", name: "Parent Item" }],
                },
              },
            ],
          },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const callbacks = {
      onRowUpdate: vi.fn(),
      onBatchComplete: vi.fn(),
    };

    const result = await runImport(
      "tok",
      FILE,
      PARENT_ID,
      "Name",
      MAPPINGS,
      "test-board",
      SUBITEM_COLUMNS,
      callbacks,
    );

    expect(result.total).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.rows[0].status).toBe("error");
    expect(result.rows[0].error).toMatch(/^Column resolution failed:/);
    expect(result.rows[0].error).toMatch(/no linked board configured/);
    // Exactly ONE fetch (fetchBoardItems for parents). The resolver
    // throws before hitting the linked-board API, so no other fetches.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("succeeds normally when Connect Boards mapping is removed (skip-toggle scenario)", async () => {
    // Same file, but the user's mapper-side filter has dropped the
    // board_relation mapping. We should now resolve the parent + create
    // the subitem with no column values, no errors. Verifies the skip
    // path doesn't leave any rough edges in the orchestrator.
    const fetchMock = makeFetchResponses([
      // fetchBoardItems for the parent board
      {
        ok: true,
        body: {
          data: {
            boards: [
              {
                items_page: {
                  cursor: null,
                  items: [{ id: "999", name: "Parent Item" }],
                },
              },
            ],
          },
        },
      },
      // create_subitem mutation response
      {
        ok: true,
        body: { data: { create_subitem: { id: "12345", name: "Sub 1" } } },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await runImport(
      "tok",
      FILE,
      PARENT_ID,
      "Name",
      [], // empty mappings — equivalent to "skip Connect Boards" stripping
      "test-board",
      SUBITEM_COLUMNS,
      { onRowUpdate: () => {}, onBatchComplete: () => {} },
    );

    expect(result.failed).toBe(0);
    expect(result.succeeded).toBe(1);
    expect(result.rows[0].createdSubitemId).toBe("12345");
  });
});
