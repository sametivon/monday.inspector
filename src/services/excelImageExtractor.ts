import JSZip from "jszip";

// Extract images embedded in an .xlsx file and map them to their anchored row.
//
// Why this exists:
//   monday.com has no native way to bulk-import images from Excel into File
//   columns — a long-standing community request. Excel users routinely paste
//   product photos, screenshots, signatures, etc. into rows alongside item
//   data. We extract those images plus their row anchor so the importer can
//   call `add_file_to_column` per matching monday item.
//
// How xlsx stores images (the parts we care about):
//
//   /xl/media/imageN.png|jpg|gif|jpeg              ← raw image bytes
//   /xl/drawings/drawingN.xml                      ← anchor positions
//   /xl/drawings/_rels/drawingN.xml.rels           ← drawing → media link
//   /xl/worksheets/_rels/sheetN.xml.rels           ← sheet → drawing link
//
// We only handle the *first sheet*, which is what every other path in this
// codebase parses too — keeps the UX consistent and the implementation
// tractable. The anchor row index is 0-based and corresponds to the SAME row
// numbering xlsx-library returns when reading cells, so the caller can use it
// directly to match data rows.

export interface ExtractedImage {
  /** 0-based row index where the image is anchored (top-left cell row) */
  rowIndex: number;
  /** Original filename from the xlsx package (e.g. "image1.png") */
  fileName: string;
  /** Raw image bytes — pass directly to a FormData blob for upload */
  data: Uint8Array;
  /** Detected MIME type from the file extension */
  mimeType: string;
}

export interface ImageExtractionResult {
  /** All extracted images flat-listed in document order */
  images: ExtractedImage[];
  /** Convenience map: row index → all images anchored to that row */
  byRow: Map<number, ExtractedImage[]>;
  /** Total bytes across all images (for the "this will upload N MB" UI hint) */
  totalBytes: number;
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * Parse a raw xlsx buffer and return every embedded image plus its row anchor.
 * Returns an empty result (no error) when the file has no images.
 */
export async function extractImagesFromXlsx(
  buffer: ArrayBuffer | Uint8Array,
): Promise<ImageExtractionResult> {
  const zip = await JSZip.loadAsync(buffer);
  const parser = new DOMParser();

  // ── 1. Find the first worksheet's drawing reference ───────────────────
  // Workbook → sheet1 → its _rels file → Target="../drawings/drawingN.xml"
  // The first worksheet is always xl/worksheets/sheet1.xml (we already
  // assume sheet-1-only elsewhere). Its rels file may or may not exist —
  // if it's missing, there are no drawings, hence no images.
  const sheetRelsPath = "xl/worksheets/_rels/sheet1.xml.rels";
  const sheetRelsFile = zip.file(sheetRelsPath);

  if (!sheetRelsFile) {
    return { images: [], byRow: new Map(), totalBytes: 0 };
  }

  const sheetRelsXml = await sheetRelsFile.async("text");
  const sheetRels = parser.parseFromString(sheetRelsXml, "application/xml");
  const drawingRel = Array.from(
    sheetRels.getElementsByTagName("Relationship"),
  ).find((r) =>
    (r.getAttribute("Type") ?? "").endsWith("/drawing"),
  );

  if (!drawingRel) {
    return { images: [], byRow: new Map(), totalBytes: 0 };
  }

  // Relationship Target is relative to xl/worksheets/, e.g. "../drawings/drawing1.xml".
  // Normalise to the zip-absolute path "xl/drawings/drawing1.xml".
  const drawingTarget = drawingRel.getAttribute("Target") ?? "";
  const drawingPath = resolveZipPath("xl/worksheets/", drawingTarget);
  const drawingFile = zip.file(drawingPath);

  if (!drawingFile) {
    return { images: [], byRow: new Map(), totalBytes: 0 };
  }

  // ── 2. Parse the drawing rels (rId → media path) ──────────────────────
  // Each <xdr:pic> in the drawing references an image by rId. The rels file
  // resolves rId → "../media/imageN.png".
  const drawingDir = drawingPath.replace(/[^/]+$/, "");
  const drawingRelsPath = `${drawingDir}_rels/${drawingPath.split("/").pop()}.rels`;
  const drawingRelsFile = zip.file(drawingRelsPath);
  const rIdToMediaPath = new Map<string, string>();

  if (drawingRelsFile) {
    const drawingRelsXml = await drawingRelsFile.async("text");
    const drawingRels = parser.parseFromString(drawingRelsXml, "application/xml");
    for (const rel of Array.from(
      drawingRels.getElementsByTagName("Relationship"),
    )) {
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target") ?? "";
      const type = rel.getAttribute("Type") ?? "";
      if (id && type.endsWith("/image")) {
        rIdToMediaPath.set(id, resolveZipPath(drawingDir, target));
      }
    }
  }

  // ── 3. Walk every anchor element in the drawing ───────────────────────
  // Excel ships three anchor flavours:
  //   <xdr:twoCellAnchor>  — pinned to a from/to cell range (the common one)
  //   <xdr:oneCellAnchor>  — pinned to a single from cell + size
  //   <xdr:absoluteAnchor> — pinned to absolute pixel coords (rare, ignore)
  // We treat oneCell + twoCell identically (we only care about the FROM row).
  const drawingXml = await drawingFile.async("text");
  const drawing = parser.parseFromString(drawingXml, "application/xml");

  const anchorTags = ["twoCellAnchor", "oneCellAnchor"];
  const images: ExtractedImage[] = [];
  let totalBytes = 0;

  for (const tag of anchorTags) {
    for (const anchor of Array.from(drawing.getElementsByTagName(`xdr:${tag}`))) {
      const fromEl = anchor.getElementsByTagName("xdr:from")[0];
      const rowEl = fromEl?.getElementsByTagName("xdr:row")[0];
      if (!fromEl || !rowEl?.textContent) continue;

      // xdr:row is 0-based in xlsx's drawing schema.
      const rowIndex = parseInt(rowEl.textContent, 10);
      if (!Number.isFinite(rowIndex)) continue;

      // The picture's blip references an image by rId. The xmlns prefix can
      // be `r:` (most common) or any other namespace-aliased prefix — we
      // fall back to scanning every attribute on every <a:blip> in the
      // anchor, which is namespace-prefix-agnostic.
      const blip = anchor.getElementsByTagName("a:blip")[0];
      if (!blip) continue;
      const rId = findEmbedAttribute(blip);
      if (!rId) continue;

      const mediaPath = rIdToMediaPath.get(rId);
      if (!mediaPath) continue;

      const mediaFile = zip.file(mediaPath);
      if (!mediaFile) continue;

      const data = await mediaFile.async("uint8array");
      const fileName = mediaPath.split("/").pop() ?? "image";

      const img: ExtractedImage = {
        rowIndex,
        fileName,
        data,
        mimeType: mimeFromName(fileName),
      };
      images.push(img);
      totalBytes += data.byteLength;
    }
  }

  const byRow = new Map<number, ExtractedImage[]>();
  for (const img of images) {
    const list = byRow.get(img.rowIndex) ?? [];
    list.push(img);
    byRow.set(img.rowIndex, list);
  }

  return { images, byRow, totalBytes };
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Resolve a relative zip path (e.g. "../media/image1.png") against a base
 * directory ("xl/worksheets/") to produce a zip-absolute path
 * ("xl/media/image1.png"). Zip paths use forward slashes regardless of OS.
 */
function resolveZipPath(baseDir: string, relativePath: string): string {
  // Strip any leading "./" — common in rels files.
  let rel = relativePath.replace(/^\.\//, "");
  // Allow callers to pass either "xl/worksheets" or "xl/worksheets/".
  let base = baseDir.endsWith("/") ? baseDir : `${baseDir}/`;

  while (rel.startsWith("../")) {
    rel = rel.slice(3);
    // Drop the last directory segment of base.
    base = base.replace(/[^/]+\/$/, "");
  }
  return `${base}${rel}`;
}

/**
 * Find the embed attribute on an <a:blip> element regardless of which XML
 * namespace prefix the document chose. Almost always `r:embed`, but xlsx
 * files have been seen using other prefixes after round-tripping through
 * 3rd-party libraries.
 */
function findEmbedAttribute(blip: Element): string | null {
  const direct = blip.getAttribute("r:embed");
  if (direct) return direct;

  for (let i = 0; i < blip.attributes.length; i++) {
    const attr = blip.attributes[i];
    if (attr.localName === "embed" || attr.name.endsWith(":embed")) {
      return attr.value;
    }
  }
  return null;
}
