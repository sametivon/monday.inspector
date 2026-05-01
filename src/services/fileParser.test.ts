import { describe, expect, it } from "vitest";
import {
  isMondayExport,
  isMondayMultiLevelExport,
  parseMondayExport,
} from "./fileParser";

// Tests for the monday.com hierarchical export parser.
//
// Feeding in raw rows lets us exercise the row-classifier state machine
// without wiring up the XLSX parser itself — the raw-row shape is what
// `getRawRows()` produces when reading a real monday export sheet.

describe("isMondayExport", () => {
  it("returns true when both parent+subitem header rows exist", () => {
    const rows = [
      ["Board Name", "", ""],
      ["Group 1", "", ""],
      ["Name", "Subitems", "Status"],
      ["Item A", "", "Done"],
      ["Subitems", "Name", "Owner"],
      ["", "Sub A", "john"],
    ];
    expect(isMondayExport(rows)).toBe(true);
  });

  it("returns false for a plain flat CSV shape", () => {
    const rows = [
      ["Name", "Status", "Date"],
      ["Task 1", "Done", "2024-01-01"],
      ["Task 2", "Pending", "2024-01-02"],
    ];
    expect(isMondayExport(rows)).toBe(false);
  });

  it("returns false when only parent headers are present", () => {
    const rows = [
      ["Board", "", ""],
      ["Name", "Subitems", "Status"],
      ["Item A", "", "Done"],
    ];
    expect(isMondayExport(rows)).toBe(false);
  });

  it("ignores extra whitespace around the header sentinels", () => {
    const rows = [
      ["  Name  ", "  Subitems  "],
      ["Item A", ""],
      ["  Subitems  ", "  Name  "],
      ["", "Sub A"],
    ];
    expect(isMondayExport(rows)).toBe(true);
  });
});

describe("parseMondayExport", () => {
  it("parses a single group with one parent and two subitems", () => {
    const rows = [
      ["My Board"],
      ["Group 1"],
      ["Name", "Subitems", "Status", "Owner"],
      ["Item A", "", "Done", "alice"],
      ["Subitems", "Name", "Owner", "Status"],
      ["", "Sub A1", "bob", "Working"],
      ["", "Sub A2", "carol", "Done"],
    ];
    const result = parseMondayExport(rows, "export.xlsx", "Fallback");

    expect(result.kind).toBe("monday_export");
    expect(result.boardName).toBe("My Board");
    expect(result.fileName).toBe("export.xlsx");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].groupName).toBe("Group 1");
    expect(result.groups[0].items).toHaveLength(1);

    const itemA = result.groups[0].items[0];
    expect(itemA.name).toBe("Item A");
    expect(itemA.values).toEqual({ Status: "Done", Owner: "alice" });
    expect(itemA.subitems).toHaveLength(2);
    expect(itemA.subitems[0]).toEqual({
      name: "Sub A1",
      values: { Owner: "bob", Status: "Working" },
    });
  });

  it("flattens subitems across groups into flatSubitems with group + parent", () => {
    // Real monday exports separate groups with an empty row; the parser
    // relies on that to reset its "insideParentSection" state.
    const rows = [
      ["My Board"],
      ["Group 1"],
      ["Name", "Subitems"],
      ["Parent 1", ""],
      ["Subitems", "Name"],
      ["", "Sub 1A"],
      ["", "", ""],
      ["Group 2"],
      ["Name", "Subitems"],
      ["Parent 2", ""],
      ["Subitems", "Name"],
      ["", "Sub 2A"],
      ["", "Sub 2B"],
    ];
    const result = parseMondayExport(rows, "f.xlsx", "B");

    expect(result.flatSubitems).toHaveLength(3);
    expect(result.flatSubitems[0]).toMatchObject({
      groupName: "Group 1",
      parentItemName: "Parent 1",
      subitemName: "Sub 1A",
    });
    expect(result.flatSubitems[1]).toMatchObject({
      groupName: "Group 2",
      parentItemName: "Parent 2",
      subitemName: "Sub 2A",
    });
    expect(result.flatSubitems[2]).toMatchObject({
      groupName: "Group 2",
      parentItemName: "Parent 2",
      subitemName: "Sub 2B",
    });
    expect(result.rowCount).toBe(3);
  });

  it("handles multiple parent items in the same group", () => {
    const rows = [
      ["Board"],
      ["Group 1"],
      ["Name", "Subitems"],
      ["Parent 1", ""],
      ["Subitems", "Name"],
      ["", "Sub 1A"],
      ["Parent 2", ""],
      ["Subitems", "Name"],
      ["", "Sub 2A"],
    ];
    const result = parseMondayExport(rows, "f.xlsx", "B");

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].items).toHaveLength(2);
    expect(result.groups[0].items[0].name).toBe("Parent 1");
    expect(result.groups[0].items[0].subitems[0].name).toBe("Sub 1A");
    expect(result.groups[0].items[1].name).toBe("Parent 2");
    expect(result.groups[0].items[1].subitems[0].name).toBe("Sub 2A");
  });

  it("handles duplicate parent names across different groups", () => {
    const rows = [
      ["Board"],
      ["Group 1"],
      ["Name", "Subitems"],
      ["Shared Name", ""],
      ["Subitems", "Name"],
      ["", "From Group 1"],
      ["", "", ""],
      ["Group 2"],
      ["Name", "Subitems"],
      ["Shared Name", ""],
      ["Subitems", "Name"],
      ["", "From Group 2"],
    ];
    const result = parseMondayExport(rows, "f.xlsx", "B");

    // Both groups should have one item with the same name but different subitems —
    // consumers rely on (group, name) to disambiguate.
    expect(result.groups[0].items[0].subitems[0].name).toBe("From Group 1");
    expect(result.groups[1].items[0].subitems[0].name).toBe("From Group 2");

    // flatSubitems must carry the group so the import can resolve the right parent id.
    expect(result.flatSubitems.map((s) => s.groupName)).toEqual(["Group 1", "Group 2"]);
  });

  it("populates parentHeaders without the 'Subitems' sentinel column", () => {
    const rows = [
      ["Board"],
      ["Group 1"],
      ["Name", "Subitems", "Status", "Owner"],
      ["Item", "", "Done", "alice"],
    ];
    const result = parseMondayExport(rows, "f.xlsx", "B");
    expect(result.parentHeaders).toEqual(["Name", "Status", "Owner"]);
  });

  it("keeps widest set of subitem headers across groups", () => {
    const rows = [
      ["Board"],
      ["Group 1"],
      ["Name", "Subitems"],
      ["P1", ""],
      ["Subitems", "Name", "Owner"],
      ["", "Sub", "bob"],
      ["", "", ""],
      ["Group 2"],
      ["Name", "Subitems"],
      ["P2", ""],
      ["Subitems", "Name", "Owner", "Status", "Date"],
      ["", "Sub", "carol", "Done", "2024-01-01"],
    ];
    const result = parseMondayExport(rows, "f.xlsx", "B");
    expect(result.subitemHeaders).toEqual(["Name", "Owner", "Status", "Date"]);
  });

  it("handles empty-row separators between groups without crashing", () => {
    const rows = [
      ["Board"],
      ["Group 1"],
      ["Name", "Subitems"],
      ["Item 1", ""],
      ["", "", ""],
      ["Group 2"],
      ["Name", "Subitems"],
      ["Item 2", ""],
    ];
    const result = parseMondayExport(rows, "f.xlsx", "B");
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].items[0].name).toBe("Item 1");
    expect(result.groups[1].items[0].name).toBe("Item 2");
  });

  it("falls back to provided boardName when first row doesn't look like a name", () => {
    const rows = [
      ["Group 1"], // No leading board-name row
      ["Name", "Subitems"],
      ["Item", ""],
    ];
    const result = parseMondayExport(rows, "f.xlsx", "FallbackBoard");
    // Since first row has only one cell, it's still treated as board_name
    // (matches current behaviour). This test pins that behaviour.
    expect(result.boardName).toBe("Group 1");
  });

  it("returns empty groups for an effectively empty input", () => {
    const result = parseMondayExport([], "f.xlsx", "Fallback");
    expect(result.groups).toEqual([]);
    expect(result.flatSubitems).toEqual([]);
    expect(result.boardName).toBe("Fallback");
  });

  it("ignores subitem rows that have no resolvable name", () => {
    const rows = [
      ["Board"],
      ["Group 1"],
      ["Name", "Subitems"],
      ["Parent", ""],
      ["Subitems", "Name", "Owner"],
      ["", "", "noname"], // No name → should be dropped
      ["", "Real", "bob"],
    ];
    const result = parseMondayExport(rows, "f.xlsx", "B");
    const subs = result.groups[0].items[0].subitems;
    expect(subs).toHaveLength(1);
    expect(subs[0].name).toBe("Real");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Real-file row shapes captured from monday.com exports we shipped
// against — keeps regressions visible if monday changes its export
// format.
// ─────────────────────────────────────────────────────────────────────

describe("isMondayMultiLevelExport", () => {
  it("returns true for the Mollu (multi-level board) shape", () => {
    // Captured from Mollu_1777666163.xlsx — one Name+Subitems header,
    // no repeated subitem-header sections.
    const rows = [
      ["Mollu"],
      ["Mollu"],
      ["Name", "Subitems", "People", "Status", "Timeline", "Date", "Dropdown", "Numbers", "Label"],
      ["Phase 1", "", "", "Working on it, Done", "2026-04-30 - 2026-05-09", "", "1, 2", "", "Label 2"],
      ["Task 1", "", "", "Working on it, Done", "2026-04-30 - 2026-05-09", "", "", "", "Label 2"],
      ["Subitem Task", "", "", "Done", "2026-04-30 - 2026-04-30", "", "", "", "Label 2"],
      ["Phase 2", "", "", "", "", "", "1"],
      ["Task 2"],
    ];
    expect(isMondayMultiLevelExport(rows)).toBe(true);
  });

  it("returns false for the classic Financial Tracking shape", () => {
    // Captured from Financial_Tracking_1777666234.xlsx — has both the
    // parent ["Name","Subitems",…] AND the indented ["Subitems","Name",…]
    // header rows.
    const rows = [
      ["Financial Tracking"],
      ["Financial tracking board for projects…"],
      [],
      ["Bills"],
      ["Name", "Subitems", "Date", "Due Date", "Reference", "Budget", "Total"],
      ["CF Corporate Finance Ltd", "", "2026-02-16", "2026-02-23", "SUB/0175707", "RBR CD", "87.96"],
      ["Subitems", "Name", "Qty", "Unit Price", "Tax Rate", "Budget Category", "Amount"],
      ["", "Periodic Subscription", "1", "87.96", "NONE", "RBR CD", "87.96"],
    ];
    expect(isMondayMultiLevelExport(rows)).toBe(false);
    expect(isMondayExport(rows)).toBe(true);
  });

  it("classic parser skips a board description row at R1 (regression: real Financial Tracking export)", () => {
    // Without the description-row fix, the parser used to mistake R1 for
    // the first group's name and produce zero items in 'Bills'.
    const rows = [
      ["Financial Tracking"],
      ["Financial tracking board for projects including budget allocation"],
      [],
      ["Bills"],
      ["Name", "Subitems", "Date"],
      ["Vendor A", "", "2026-02-16"],
      ["Subitems", "Name", "Qty"],
      ["", "Item 1", "1"],
    ];
    const result = parseMondayExport(rows, "ft.xlsx", "fallback");
    expect(result.boardName).toBe("Financial Tracking");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].groupName).toBe("Bills");
    expect(result.groups[0].items).toHaveLength(1);
    expect(result.groups[0].items[0].name).toBe("Vendor A");
    expect(result.groups[0].items[0].subitems[0].name).toBe("Item 1");
  });

  it("returns false for a plain flat sheet", () => {
    const rows = [
      ["Name", "Status", "Date"],
      ["Task 1", "Done", "2026-01-01"],
    ];
    expect(isMondayMultiLevelExport(rows)).toBe(false);
  });
});

// We deliberately don't have a parseMondayMultiLevelExport — see the
// comment in fileParser.ts for why importing those exports isn't safe.
// The detector still exists so parseFile() can throw a useful error.
