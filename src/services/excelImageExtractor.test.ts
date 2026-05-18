// @vitest-environment happy-dom
// DOMParser is a browser API; production runs in the extension context where
// it exists natively. For node-based test runs we lean on happy-dom to
// provide an identical-enough implementation.
import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";
import { extractImagesFromXlsx } from "./excelImageExtractor";

// Builds a synthetic .xlsx archive in memory with two embedded images
// anchored at known rows, then asserts the extractor returns both with the
// right row anchors. Cheaper than checking in a binary fixture, and self-
// documents the xlsx parts we depend on.

const PNG_1x1_RED = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x03, 0x00, 0x01, 0x5f, 0xf5, 0xa8, 0x60, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const PNG_1x1_BLUE = new Uint8Array(PNG_1x1_RED);
// Tweak one CRC byte so the second image isn't byte-identical to the first.
// We don't decode the PNG, we just check the bytes survived the zip round-trip.
PNG_1x1_BLUE[PNG_1x1_BLUE.length - 5] = 0x42;

async function buildXlsxWithImages(
  anchors: { rowIndex: number; data: Uint8Array; ext: string }[],
): Promise<ArrayBuffer> {
  const zip = new JSZip();

  // Minimum viable xlsx package — content types, root rels, workbook rels,
  // workbook, single empty sheet, then drawings + rels for the images.
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  );

  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
  );

  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
  );

  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetData/>
  <drawing r:id="rId1"/>
</worksheet>`,
  );

  zip.file(
    "xl/worksheets/_rels/sheet1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`,
  );

  // Anchors + drawing rels
  const drawingAnchors = anchors
    .map(
      (a, i) =>
        `<xdr:twoCellAnchor editAs="oneCell">
          <xdr:from>
            <xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff>
            <xdr:row>${a.rowIndex}</xdr:row><xdr:rowOff>0</xdr:rowOff>
          </xdr:from>
          <xdr:to>
            <xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff>
            <xdr:row>${a.rowIndex + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff>
          </xdr:to>
          <xdr:pic>
            <xdr:nvPicPr><xdr:cNvPr id="${i + 1}" name="Picture ${i + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr>
            <xdr:blipFill>
              <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId${i + 1}"/>
              <a:stretch><a:fillRect/></a:stretch>
            </xdr:blipFill>
            <xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm><a:prstGeom prst="rect"/></xdr:spPr>
          </xdr:pic>
          <xdr:clientData/>
        </xdr:twoCellAnchor>`,
    )
    .join("");

  zip.file(
    "xl/drawings/drawing1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  ${drawingAnchors}
</xdr:wsDr>`,
  );

  const drawingRels = anchors
    .map(
      (a, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${i + 1}.${a.ext}"/>`,
    )
    .join("");

  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${drawingRels}
</Relationships>`,
  );

  for (let i = 0; i < anchors.length; i++) {
    zip.file(`xl/media/image${i + 1}.${anchors[i].ext}`, anchors[i].data);
  }

  return await zip.generateAsync({ type: "arraybuffer" });
}

describe("excelImageExtractor", () => {
  let twoImageXlsx: ArrayBuffer;
  let emptyXlsx: ArrayBuffer;

  beforeAll(async () => {
    twoImageXlsx = await buildXlsxWithImages([
      { rowIndex: 1, data: PNG_1x1_RED, ext: "png" },
      { rowIndex: 5, data: PNG_1x1_BLUE, ext: "png" },
    ]);

    // xlsx with no drawing rel at all (the most common no-images case)
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`);
    zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?><worksheet/>`);
    emptyXlsx = await zip.generateAsync({ type: "arraybuffer" });
  });

  it("returns empty result for an xlsx with no images", async () => {
    const result = await extractImagesFromXlsx(emptyXlsx);
    expect(result.images).toHaveLength(0);
    expect(result.byRow.size).toBe(0);
    expect(result.totalBytes).toBe(0);
  });

  it("extracts each anchored image with the right row index", async () => {
    const result = await extractImagesFromXlsx(twoImageXlsx);

    expect(result.images).toHaveLength(2);
    expect(result.images[0].rowIndex).toBe(1);
    expect(result.images[1].rowIndex).toBe(5);
    expect(result.images[0].mimeType).toBe("image/png");
    expect(result.images[1].mimeType).toBe("image/png");
    expect(result.totalBytes).toBe(PNG_1x1_RED.byteLength + PNG_1x1_BLUE.byteLength);
  });

  it("preserves the raw image bytes byte-for-byte through the zip round-trip", async () => {
    const result = await extractImagesFromXlsx(twoImageXlsx);
    expect(Array.from(result.images[0].data)).toEqual(Array.from(PNG_1x1_RED));
    expect(Array.from(result.images[1].data)).toEqual(Array.from(PNG_1x1_BLUE));
  });

  it("builds a byRow lookup that matches the flat images list", async () => {
    const result = await extractImagesFromXlsx(twoImageXlsx);
    expect(result.byRow.get(1)).toHaveLength(1);
    expect(result.byRow.get(5)).toHaveLength(1);
    expect(result.byRow.get(99)).toBeUndefined();
  });
});
