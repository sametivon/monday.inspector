// @vitest-environment happy-dom
// xlsx parses synchronously and doesn't need a DOM, but the image
// extractor (called in one of the cross-format tests) uses DOMParser, so
// we run this file under happy-dom for consistency.
import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { parseSheetForImageImport, previewRawRows } from "./imageImportSheetParser";
import { extractImagesFromXlsx } from "./excelImageExtractor";

// Small helper — wraps a 2-D array into a real .xlsx Blob via the xlsx
// library, so the parser tests run against the same binary path users hit.
function buildXlsxFromRows(rows: string[][]): File {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const arrayBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new File([arrayBuffer], "test.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("parseSheetForImageImport — flat sheet", () => {
  it("treats row 0 as the header and row 1+ as items", async () => {
    const file = buildXlsxFromRows([
      ["Item Name", "SKU", "Notes"],
      ["Widget A", "W-001", "First"],
      ["Widget B", "W-002", "Second"],
      ["Widget C", "W-003", "Third"],
    ]);
    const parsed = await parseSheetForImageImport(file);

    expect(parsed.format).toBe("flat");
    expect(parsed.headers).toEqual(["Item Name", "SKU", "Notes"]);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0].xlsxRowIndex).toBe(1);
    expect(parsed.rows[1].xlsxRowIndex).toBe(2);
    expect(parsed.rows[2].xlsxRowIndex).toBe(3);
    expect(parsed.rows[0].values["Item Name"]).toBe("Widget A");
    expect(parsed.rows[1].values.SKU).toBe("W-002");
  });

  it("auto-detects header on row 3 when there's a title + blank above it", async () => {
    // Common real-world pattern: title cell, description, blank, then the
    // real header. We expect the parser to pick row 3 as the header
    // without any manual hint.
    const file = buildXlsxFromRows([
      ["My Product Catalogue 2026"], // row 0 — title (single cell)
      ["Updated by Sam on 5/15"], // row 1 — description (single cell)
      [], // row 2 — blank
      ["Item Name", "SKU", "Notes"], // row 3 — REAL header
      ["Widget A", "W-001", "First"],
      ["Widget B", "W-002", "Second"],
    ]);
    const parsed = await parseSheetForImageImport(file);
    expect(parsed.format).toBe("flat");
    expect(parsed.headers).toEqual(["Item Name", "SKU", "Notes"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].xlsxRowIndex).toBe(4);
    expect(parsed.rows[1].xlsxRowIndex).toBe(5);
  });

  it("respects headerRowOverride when the auto pick is wrong", async () => {
    const file = buildXlsxFromRows([
      ["A", "B", "C"], // looks like a header but the user knows it isn't
      ["Header1", "Header2", "Header3"],
      ["data1", "data2", "data3"],
    ]);
    const parsed = await parseSheetForImageImport(file, { headerRowOverride: 1 });
    expect(parsed.headers).toEqual(["Header1", "Header2", "Header3"]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].xlsxRowIndex).toBe(2);
    expect(parsed.rows[0].values.Header1).toBe("data1");
  });

  it("previewRawRows exposes the first N rows for a manual picker UI", async () => {
    const file = buildXlsxFromRows([
      ["title"],
      ["one", "two"],
      ["a", "b"],
    ]);
    const preview = await previewRawRows(file, 10);
    expect(preview.length).toBe(3);
    expect(preview[0][0]).toBe("title");
    expect(preview[1]).toEqual(["one", "two"]);
  });

  it("skips fully empty rows but preserves xlsx row numbering", async () => {
    const file = buildXlsxFromRows([
      ["Item Name", "SKU"],
      ["Widget A", "W-001"],
      ["", ""], // intentionally blank — common in spreadsheets
      ["Widget C", "W-003"],
    ]);
    const parsed = await parseSheetForImageImport(file);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].xlsxRowIndex).toBe(1);
    // The blank row at index 2 is skipped — but Widget C keeps its real
    // xlsx row index (3), which is what the image extractor will anchor to.
    expect(parsed.rows[1].xlsxRowIndex).toBe(3);
    expect(parsed.rows[1].values["Item Name"]).toBe("Widget C");
  });
});

describe("parseSheetForImageImport — monday.com classic export", () => {
  it("finds the right header row and skips the board/group preamble", async () => {
    const file = buildXlsxFromRows([
      ["Sourcing Tracker"], // row 0 — board name (A1 only)
      ["New Request"], // row 1 — group name (A2 only)
      ["Name", "Subitems", "Project Owner", "Status", "Files 1"], // row 2 — parent headers
      ["Mollu (Test 3)", "", "Mark J", "0%", ""], // row 3 — first parent item
      ["Subitems", "Name", "Owner", "Supplier Status"], // row 4 — subitem headers
      ["", "Supplier Search", "Sam", "In Progress"], // row 5 — subitem row (skip)
      ["", "Quote Review", "Sam", "Pending"], // row 6 — subitem row (skip)
      ["Acme Widget", "", "Jane D", "50%", ""], // row 7 — second parent item
    ]);
    const parsed = await parseSheetForImageImport(file);

    expect(parsed.format).toBe("monday_classic");
    expect(parsed.headers).toEqual(["Name", "Project Owner", "Status", "Files 1"]);
    expect(parsed.rows).toHaveLength(2);

    // First parent at xlsx row 3, second parent at xlsx row 7
    expect(parsed.rows[0].xlsxRowIndex).toBe(3);
    expect(parsed.rows[1].xlsxRowIndex).toBe(7);

    expect(parsed.rows[0].values.Name).toBe("Mollu (Test 3)");
    expect(parsed.rows[0].values["Project Owner"]).toBe("Mark J");
    expect(parsed.rows[1].values.Name).toBe("Acme Widget");
    expect(parsed.rows[1].values["Project Owner"]).toBe("Jane D");
  });

  it("does not include subitems in the rows list", async () => {
    const file = buildXlsxFromRows([
      ["Board Name"],
      ["Group A"],
      ["Name", "Subitems", "Status"],
      ["Parent 1", "", "Active"],
      ["Subitems", "Name", "Owner"],
      ["", "Sub A", "Alice"],
      ["", "Sub B", "Bob"],
    ]);
    const parsed = await parseSheetForImageImport(file);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].values.Name).toBe("Parent 1");
  });
});

// Cross-cuts: confirm the xlsx row indices the parser returns line up
// exactly with the xdr:row values our image extractor produces, so the
// orchestrator's byRow lookup hits the right row in both formats.
describe("parser + image extractor row-index alignment", () => {
  const PNG_1x1 = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x5f, 0xf5, 0xa8, 0x60, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  /**
   * Build an .xlsx where:
   *   • the cell data is whatever rows you pass in
   *   • an image is anchored at the given xlsxRowIndex (0-based)
   *
   * Returns a Uint8Array buffer the parser + extractor can consume.
   */
  async function buildXlsxWithImageAtRow(
    rows: string[][],
    anchorRowIndex: number,
  ): Promise<Uint8Array> {
    // Start from a real xlsx so we don't have to hand-roll the workbook
    // skeleton — just monkey-patch the drawing in afterwards.
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const xlsxBytes = new Uint8Array(
      XLSX.write(wb, { bookType: "xlsx", type: "array" }),
    );

    const zip = await JSZip.loadAsync(xlsxBytes);

    // 1) Patch the worksheet to declare a drawing relationship.
    const sheetPath = "xl/worksheets/sheet1.xml";
    let sheetXml = await zip.file(sheetPath)!.async("text");
    sheetXml = sheetXml.replace(
      "</worksheet>",
      `<drawing r:id="rId-img1"/></worksheet>`,
    );
    zip.file(sheetPath, sheetXml);

    // 2) Add the sheet → drawing rels file.
    zip.file(
      "xl/worksheets/_rels/sheet1.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId-img1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`,
    );

    // 3) Drawing with the requested row anchor.
    zip.file(
      "xl/drawings/drawing1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:oneCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchorRowIndex}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:ext cx="1219200" cy="1219200"/>
    <xdr:pic>
      <xdr:nvPicPr><xdr:cNvPr id="0" name="image1.png"/><xdr:cNvPicPr/></xdr:nvPicPr>
      <xdr:blipFill>
        <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/>
        <a:stretch><a:fillRect/></a:stretch>
      </xdr:blipFill>
      <xdr:spPr><a:prstGeom prst="rect"/></xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:oneCellAnchor>
</xdr:wsDr>`,
    );
    zip.file(
      "xl/drawings/_rels/drawing1.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`,
    );
    zip.file("xl/media/image1.png", PNG_1x1);

    return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
  }

  let flatBuffer: Uint8Array;
  let mondayBuffer: Uint8Array;
  let flatFile: File;
  let mondayFile: File;

  beforeAll(async () => {
    // Flat: header on row 0, data row "Widget B" on row 2, image anchored at row 2
    flatBuffer = await buildXlsxWithImageAtRow(
      [
        ["Name", "SKU"],
        ["Widget A", "W-001"],
        ["Widget B", "W-002"],
      ],
      2,
    );
    flatFile = new File([flatBuffer], "flat.xlsx");

    // Monday classic: image anchored at row 3 (first parent item row)
    mondayBuffer = await buildXlsxWithImageAtRow(
      [
        ["Board Name"],
        ["Group A"],
        ["Name", "Subitems", "Project Owner"],
        ["Mollu (Test 3)", "", "Mark J"],
        ["Subitems", "Name", "Owner"],
        ["", "Sub", "Sam"],
        ["Acme Widget", "", "Jane"],
      ],
      3,
    );
    mondayFile = new File([mondayBuffer], "monday.xlsx");
  });

  it("flat sheet — image row matches data row's xlsxRowIndex", async () => {
    const parsed = await parseSheetForImageImport(flatFile);
    const images = await extractImagesFromXlsx(flatBuffer);

    // Widget B is the second data row; xlsxRowIndex=2 (0-based)
    expect(parsed.rows[1].xlsxRowIndex).toBe(2);

    // Image anchor was set to row 2 → byRow lookup against parsed row's
    // own xlsxRowIndex returns the image, with no off-by-one fudge needed.
    expect(images.byRow.get(parsed.rows[1].xlsxRowIndex)).toHaveLength(1);
    expect(images.byRow.get(parsed.rows[0].xlsxRowIndex) ?? []).toHaveLength(0);
  });

  it("monday classic — image row matches first parent item's xlsxRowIndex", async () => {
    const parsed = await parseSheetForImageImport(mondayFile);
    const images = await extractImagesFromXlsx(mondayBuffer);

    expect(parsed.format).toBe("monday_classic");
    // First parent item ("Mollu (Test 3)") at xlsx row 3
    expect(parsed.rows[0].xlsxRowIndex).toBe(3);
    expect(parsed.rows[1].xlsxRowIndex).toBe(6);

    // Image at xdr:row=3 → byRow.get(3) hits Mollu, byRow.get(6) is empty
    expect(images.byRow.get(3)).toHaveLength(1);
    expect(images.byRow.get(6) ?? []).toHaveLength(0);
  });
});
