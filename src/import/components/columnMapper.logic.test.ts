import { describe, expect, it } from "vitest";
import { READ_ONLY_COLUMN_TYPES } from "../../services/columnValueFormatters";
import type { MondayColumn } from "../../utils/types";

// Pure-logic tests for the file-header filtering used by the Importer's
// ColumnMapper. The component is React + heavy on UI, but the actual
// "should this file column show up in the mapping?" decision is small
// enough to lock in independently.
//
// Captured from a real export (sam_test_1777671781.xlsx) where the user's
// board has mirror columns at the parent level (Timeline - Start /
// Timeline - End) and a Creation log auto-field. Those used to bloat the
// mapping table even though there was nothing useful to map them to.

function pickVisibleHeaders(
  fileHeaders: string[],
  boardColumns: MondayColumn[],
): { visible: string[]; dropped: string[] } {
  const typeByTitle = new Map(
    boardColumns.map((c) => [c.title.toLowerCase(), c.type]),
  );
  const visible: string[] = [];
  const dropped: string[] = [];
  for (const h of fileHeaders) {
    const t = typeByTitle.get(h.toLowerCase());
    if (t != null && READ_ONLY_COLUMN_TYPES.has(t)) {
      dropped.push(h);
    } else {
      visible.push(h);
    }
  }
  return { visible, dropped };
}

describe("ColumnMapper file-header filtering (sam_test scenario)", () => {
  // Real parent header row from sam_test_1777671781.xlsx, minus the
  // sentinel "Name" + "Subitems" columns that the Importer always
  // strips up front.
  const parentFileHeaders = [
    "People",
    "Test Stage Type",
    "System / Equipment",
    "Level / Area",
    "Timeline",
    "Priority",
    "Status",
    "Blocker / Comment",
    "Timeline - Start",
    "Timeline - End",
    "Creation log",
    "link to sam test",
  ];

  // Plausible reproduction of what the API would return for the same
  // board's columns: the three "computed" columns are typed as mirror /
  // creation_log on the board side, and the "link to sam test" is a
  // writable Connect Boards column.
  const boardColumns: MondayColumn[] = [
    { id: "people0", title: "People", type: "people" },
    { id: "dropdown0", title: "Test Stage Type", type: "dropdown" },
    { id: "dropdown1", title: "System / Equipment", type: "dropdown" },
    { id: "dropdown2", title: "Level / Area", type: "dropdown" },
    { id: "timeline0", title: "Timeline", type: "timeline" },
    { id: "status0", title: "Priority", type: "status" },
    { id: "status1", title: "Status", type: "status" },
    { id: "long_text0", title: "Blocker / Comment", type: "long_text" },
    { id: "mirror0", title: "Timeline - Start", type: "mirror" },
    { id: "mirror1", title: "Timeline - End", type: "mirror" },
    { id: "creation0", title: "Creation log", type: "creation_log" },
    { id: "relation0", title: "link to sam test", type: "board_relation" },
  ];

  it("drops mirror + creation_log file headers from the parent mapping", () => {
    const { visible, dropped } = pickVisibleHeaders(
      parentFileHeaders,
      boardColumns,
    );
    expect(dropped).toEqual([
      "Timeline - Start",
      "Timeline - End",
      "Creation log",
    ]);
    expect(visible).toEqual([
      "People",
      "Test Stage Type",
      "System / Equipment",
      "Level / Area",
      "Timeline",
      "Priority",
      "Status",
      "Blocker / Comment",
      "link to sam test", // Connect Boards stays — board_relation is writable
    ]);
  });

  it("keeps Connect Boards columns in the visible mapping list", () => {
    const { visible } = pickVisibleHeaders(
      ["link to sam test"],
      [{ id: "rel", title: "link to sam test", type: "board_relation" }],
    );
    expect(visible).toEqual(["link to sam test"]);
  });

  it("is case-insensitive when matching file headers to board columns", () => {
    const { dropped } = pickVisibleHeaders(
      ["TIMELINE - START"],
      [{ id: "m", title: "Timeline - Start", type: "mirror" }],
    );
    expect(dropped).toEqual(["TIMELINE - START"]);
  });

  it("keeps file headers that have no board column counterpart (user can decide)", () => {
    const { visible, dropped } = pickVisibleHeaders(
      ["Random Custom Field"],
      [],
    );
    expect(visible).toEqual(["Random Custom Field"]);
    expect(dropped).toEqual([]);
  });
});
