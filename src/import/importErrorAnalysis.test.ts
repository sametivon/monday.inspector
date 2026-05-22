import { describe, it, expect } from "vitest";
import { analyzeImportErrors } from "./importErrorAnalysis";
import type { ColumnMapping, MondayColumn } from "../utils/types";

const BOARD_COLUMNS: MondayColumn[] = [
  { id: "name", title: "Name", type: "text", settings_str: "{}" },
  { id: "status", title: "Status", type: "status", settings_str: "{}" },
  {
    id: "connect_pb",
    title: "Project Board",
    type: "board_relation",
    settings_str: "{}",
  },
  { id: "dep_col", title: "Blocked By", type: "dependency", settings_str: "{}" },
];

const SUBITEM_COLUMNS: MondayColumn[] = [
  { id: "sub_owner", title: "Owner", type: "people", settings_str: "{}" },
];

function mapping(mondayColumnId: string, fileColumn = mondayColumnId): ColumnMapping {
  return { fileColumn, mondayColumnId };
}

describe("analyzeImportErrors", () => {
  it("identifies the top error and its count", () => {
    const result = analyzeImportErrors(
      [
        { error: "Boom A" },
        { error: "Boom A" },
        { error: "Boom B" },
      ],
      [],
      [],
      BOARD_COLUMNS,
      SUBITEM_COLUMNS,
    );
    expect(result.totalFailed).toBe(3);
    expect(result.topError).toBe("Boom A");
    expect(result.topErrorCount).toBe(2);
  });

  it("extracts a quoted column title and resolves it to a mapped column id", () => {
    const result = analyzeImportErrors(
      [
        {
          error:
            'Column resolution failed: Connect Boards column "Project Board" has no linked board configured...',
        },
      ],
      [mapping("connect_pb", "Project Board")],
      [],
      BOARD_COLUMNS,
      SUBITEM_COLUMNS,
    );
    expect(result.suspectColumns).toEqual([
      { id: "connect_pb", title: "Project Board" },
    ]);
  });

  it("flags ALL mapped board_relation + dependency columns on a 'cannot read the linked board' error", () => {
    const result = analyzeImportErrors(
      [
        {
          error:
            "Column resolution failed: Connect Boards: cannot read the linked board(s) [9999]...",
        },
      ],
      [mapping("connect_pb"), mapping("dep_col"), mapping("status")],
      [],
      BOARD_COLUMNS,
      SUBITEM_COLUMNS,
    );
    const ids = result.suspectColumns.map((c) => c.id).sort();
    expect(ids).toEqual(["connect_pb", "dep_col"]);
  });

  it("does NOT flag a column that isn't in the active mappings", () => {
    // Error names "Project Board" but the user never mapped it → not a
    // suspect (skipping it would be a no-op).
    const result = analyzeImportErrors(
      [{ error: 'column "Project Board" rejected' }],
      [mapping("status")],
      [],
      BOARD_COLUMNS,
      SUBITEM_COLUMNS,
    );
    expect(result.suspectColumns).toEqual([]);
  });

  it("matches a mapped column title appearing in a ColumnValueException", () => {
    const result = analyzeImportErrors(
      [{ error: "ColumnValueException: invalid value for Status" }],
      [mapping("status", "Status")],
      [],
      BOARD_COLUMNS,
      SUBITEM_COLUMNS,
    );
    expect(result.suspectColumns.map((c) => c.id)).toContain("status");
  });

  it("de-dupes suspects reported via multiple rows", () => {
    const result = analyzeImportErrors(
      [
        { error: 'Connect Boards column "Project Board" failed' },
        { error: 'Connect Boards column "Project Board" failed' },
      ],
      [mapping("connect_pb", "Project Board")],
      [],
      BOARD_COLUMNS,
      SUBITEM_COLUMNS,
    );
    expect(result.suspectColumns).toHaveLength(1);
  });

  it("looks at subitem mappings too", () => {
    const result = analyzeImportErrors(
      [{ error: 'column "Owner" rejected' }],
      [],
      [mapping("sub_owner", "Owner")],
      BOARD_COLUMNS,
      SUBITEM_COLUMNS,
    );
    expect(result.suspectColumns.map((c) => c.id)).toContain("sub_owner");
  });

  it("returns no suspects when errors are unrelated to columns", () => {
    const result = analyzeImportErrors(
      [{ error: "Rate limited by monday.com API" }],
      [mapping("status")],
      [],
      BOARD_COLUMNS,
      SUBITEM_COLUMNS,
    );
    expect(result.suspectColumns).toEqual([]);
    expect(result.topError).toBe("Rate limited by monday.com API");
  });
});
