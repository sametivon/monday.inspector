import * as XLSX from "xlsx";
import { patchZip64Headers } from "./zip64Patcher";
import { isMondayExport, isMondayMultiLevelExport } from "./fileParser";

// Format-aware sheet parser purpose-built for the Image Importer.
//
// Why this exists:
//   monday.com's classic XLSX export puts the board name on row 1, the group
//   name on row 2, the parent-column headers on row 3, and items from row 4
//   onwards. A hand-rolled spreadsheet usually puts headers on row 1 and
//   items from row 2. Same .xlsx extension, completely different cell
//   geometry — and the Image Importer matches images to rows by xlsx row
//   index, so a wrong header row offset makes every image upload land on
//   the wrong item.
//
// What this returns:
//   • headers          — the column names from whatever row is the real
//                         header row
//   • rows             — one entry per *parent item* (subitem rows are
//                         dropped — image-to-subitem matching is out of
//                         scope for v1 and we don't have a sane UX for it
//                         yet)
//   • each row has an `xlsxRowIndex` — the 0-based row position in the
//     .xlsx file, which matches `xdr:row` in drawing anchors directly. The
//     orchestrator looks up `images.byRow.get(row.xlsxRowIndex)` and gets
//     exactly the images Excel anchored to that row.

export type SheetFormat = "monday_classic" | "flat";

export interface ParsedSheetRow {
  /** 0-based xlsx row position — matches xdr:row from drawing anchors */
  xlsxRowIndex: number;
  /** Column-header → cell value for this row */
  values: Record<string, string>;
}

export interface ParsedSheet {
  format: SheetFormat;
  headers: string[];
  rows: ParsedSheetRow[];
  /** First sheet name from the workbook — surfaced for the UI strip */
  sheetName: string;
}

export interface ParseOptions {
  /**
   * Force a specific header row (0-based xlsx row index). Bypasses auto
   * detection. Used when the user manually overrides the auto pick from
   * the UI. Ignored for monday classic exports — those have a fixed
   * structure and the override would just confuse things.
   */
  headerRowOverride?: number;
}

/**
 * Read the .xlsx, detect whether it's a monday classic export or a flat
 * sheet, and return rows with their xlsx row indices intact so the Image
 * Importer can join them to drawing-anchored images.
 *
 * Multi-level board exports are rejected outright — their hierarchy gets
 * lost in monday's export and we don't have a safe way to put the images
 * back on the right item.
 */
export async function parseSheetForImageImport(
  file: File,
  options: ParseOptions = {},
): Promise<ParsedSheet> {
  const raw = new Uint8Array(await file.arrayBuffer());

  // monday's exports use ZIP64 envelopes that the xlsx library mis-reads.
  // The image extractor goes through JSZip directly and handles ZIP64
  // natively, but the cell parser still needs the patched buffer.
  const buffer = patchZip64Headers(raw);
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel file contains no sheets");

  const sheet = workbook.Sheets[sheetName];
  const rawRows = sheetToArrayOfArrays(sheet);

  if (isMondayMultiLevelExport(rawRows)) {
    throw new Error(
      "This looks like a monday.com multi-level board export — monday strips " +
        "the parent–child hierarchy from those exports, so re-importing safely " +
        "is not possible. Re-export as a classic board or use a hand-built " +
        "flat sheet with one item per row.",
    );
  }

  // monday classic export — fixed structure, no need to guess header row
  if (isMondayExport(rawRows)) {
    return parseMondayClassic(rawRows, sheetName);
  }

  // Flat sheet — header could be on row 1 or buried under title/info rows.
  // Detect heuristically, but let the caller override.
  const headerRowIndex =
    typeof options.headerRowOverride === "number"
      ? options.headerRowOverride
      : detectHeaderRowIndex(rawRows);

  return parseFlat(rawRows, sheetName, headerRowIndex);
}

/**
 * Preview a sheet's raw rows without classifying them. Used by the UI to
 * surface a manual header-row picker — the user sees the first few rows
 * exactly as they appear in the xlsx and chooses which one is the header.
 */
export async function previewRawRows(file: File, maxRows = 12): Promise<string[][]> {
  const raw = new Uint8Array(await file.arrayBuffer());
  const buffer = patchZip64Headers(raw);
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  return sheetToArrayOfArrays(workbook.Sheets[sheetName]).slice(0, maxRows);
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Pull every cell out of a worksheet into a 2-D array. The xlsx library's
 * built-in sheet_to_json with header:1 stops at empty rows on some sheets,
 * so we iterate over the declared range explicitly and keep blank cells as
 * empty strings — the same shape fileParser.ts already uses.
 */
function sheetToArrayOfArrays(sheet: XLSX.WorkSheet): string[][] {
  const ref = sheet["!ref"];
  if (!ref) return [];

  const declared = XLSX.utils.decode_range(ref);
  let maxRow = declared.e.r;
  let maxCol = declared.e.c;

  for (const key of Object.keys(sheet)) {
    if (key.startsWith("!")) continue;
    const decoded = XLSX.utils.decode_cell(key);
    if (decoded.r > maxRow) maxRow = decoded.r;
    if (decoded.c > maxCol) maxCol = decoded.c;
  }

  const rows: string[][] = [];
  for (let r = declared.s.r; r <= maxRow; r++) {
    const row: string[] = [];
    for (let c = declared.s.c; c <= maxCol; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (!cell) {
        row.push("");
        continue;
      }
      // Excel serial dates surface as numeric cells in the 40000–60000 band.
      // Use the cell's pre-formatted text when available, then SSF.format,
      // then fall back to the raw value. Same logic as fileParser.ts.
      if (cell.t === "n" && typeof cell.v === "number" && cell.v > 40000 && cell.v < 60000) {
        if (cell.w) {
          row.push(String(cell.w));
        } else {
          const ssf = (XLSX as { SSF?: { format: (fmt: string, v: unknown) => string } }).SSF;
          row.push(ssf ? ssf.format("yyyy-mm-dd", cell.v) : String(cell.v));
        }
      } else {
        row.push(String(cell.v ?? ""));
      }
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Parse a monday.com classic export:
 *
 *   row 0: board name (single cell, A1 only)
 *   row 1: group name (single cell, A2 only)
 *   row 2: parent headers — "Name" | "Subitems" | …
 *   row 3+: items + interleaved subitem-header rows + subitem rows
 *
 * We keep parent items only. Subitems are skipped. New groups can appear
 * later in the sheet (single-cell row) and bring their own header rows;
 * the iterator handles that.
 */
function parseMondayClassic(rows: string[][], sheetName: string): ParsedSheet {
  let parentHeaders: string[] = [];
  const out: ParsedSheetRow[] = [];

  // Row classification is purely structural — we don't carry a "current
  // section" state, because monday's exports interleave subitem rows
  // between consecutive parent rows without re-emitting the parent-header
  // line. Tracking section state caused parents-after-subitems to get
  // misclassified as subitems. Classify by the row's own shape instead.

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const colA = row[0]?.trim() ?? "";
    const colB = row[1]?.trim() ?? "";
    const nonEmpty = row.filter((c) => c.trim() !== "").length;

    // Parent header row — captures the columns we'll project subsequent
    // parent items onto.
    if (colA === "Name" && colB === "Subitems") {
      parentHeaders = row.map((c) => c.trim());
      continue;
    }

    // Subitem header row — informational only; we never collect subitems.
    if (colA === "Subitems" && colB === "Name") continue;

    // Subitem data row — col A empty, real data elsewhere. monday writes
    // these between parent items, so we have to recognise them by shape.
    if (colA === "" && nonEmpty > 0) continue;

    // Empty row → group separator. Nothing to do.
    if (nonEmpty === 0) continue;

    // Single non-empty cell, no parent headers seen yet → board/group
    // name (top of sheet preamble). Skip silently.
    if (nonEmpty === 1 && parentHeaders.length === 0) continue;

    // Single non-empty cell once we've already seen parent headers → new
    // group name. Skip — the parent_headers row that follows handles the
    // schema.
    if (nonEmpty === 1) continue;

    // Anything else with col A populated is a parent item row.
    if (!parentHeaders.length || !colA) continue;

    const values: Record<string, string> = {};
    for (let c = 0; c < parentHeaders.length && c < row.length; c++) {
      const header = parentHeaders[c];
      if (!header || header === "Subitems") continue;
      values[header] = row[c]?.trim() ?? "";
    }

    out.push({ xlsxRowIndex: i, values });
  }

  return {
    format: "monday_classic",
    headers: parentHeaders.filter((h) => h && h !== "Subitems"),
    rows: out,
    sheetName,
  };
}

/**
 * Parse a hand-built flat spreadsheet given an explicit header row index.
 * Data rows are every non-empty row after the header. The header row index
 * is the *xlsx row* it lives at, so subsequent data rows keep their xlsx
 * row indices intact (no off-by-one with image anchors below).
 */
function parseFlat(
  rows: string[][],
  sheetName: string,
  headerRowIndex: number,
): ParsedSheet {
  if (headerRowIndex < 0 || headerRowIndex >= rows.length) {
    throw new Error(
      `Header row ${headerRowIndex} is out of range — file has ${rows.length} rows`,
    );
  }

  const headerRow = rows[headerRowIndex];
  // We trim() but preserve original casing — column names like "SKU" and
  // "Name" round-trip into monday matching exactly. Duplicate headers are
  // dropped silently (last value wins via Object.fromEntries semantics).
  const headers = headerRow
    .map((c) => c.trim())
    .filter((c) => c !== "");
  if (headers.length === 0) {
    throw new Error(`Row ${headerRowIndex + 1} has no header cells`);
  }

  const out: ParsedSheetRow[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const nonEmpty = row.filter((c) => c.trim() !== "").length;
    if (nonEmpty === 0) continue;

    const values: Record<string, string> = {};
    for (let c = 0; c < headerRow.length; c++) {
      const header = headerRow[c]?.trim();
      if (!header) continue;
      values[header] = row[c]?.trim() ?? "";
    }
    out.push({ xlsxRowIndex: i, values });
  }

  return {
    format: "flat",
    headers,
    rows: out,
    sheetName,
  };
}

/**
 * Heuristic to find the header row in a hand-built sheet.
 *
 * Real-world sheets often have a title row, a description, blank rows, or
 * filter widgets above the actual data. We pick the FIRST row in the
 * first 20 rows that:
 *
 *   1. Has at least 2 non-empty cells.
 *   2. Has more non-empty cells than any of the (up to 3) rows above it.
 *   3. Is followed by at least one row with similar (≥75%) cell density.
 *
 * If nothing matches (e.g. tiny sheets), fall back to row 0. Users can
 * always override via the UI when this gets it wrong.
 */
function detectHeaderRowIndex(rows: string[][]): number {
  if (rows.length === 0) return 0;

  const counts = rows.map(
    (row) => row.filter((c) => c.trim() !== "").length,
  );
  const scanLimit = Math.min(20, rows.length);

  for (let i = 0; i < scanLimit; i++) {
    const here = counts[i];
    if (here < 2) continue;

    // Look upward up to 3 rows — header should be a non-empty row that
    // breaks the previous "small / empty" pattern.
    let denserThanAbove = true;
    for (let j = Math.max(0, i - 3); j < i; j++) {
      if (counts[j] >= here) {
        denserThanAbove = false;
        break;
      }
    }
    if (!denserThanAbove) continue;

    // Look downward up to 5 rows — at least one data row should have a
    // similar cell density (75%+ of the header's).
    const minDataDensity = Math.max(2, Math.floor(here * 0.75));
    let hasDataBelow = false;
    for (let k = i + 1; k < Math.min(rows.length, i + 6); k++) {
      if (counts[k] >= minDataDensity) {
        hasDataBelow = true;
        break;
      }
    }
    if (!hasDataBelow) continue;

    return i;
  }

  return 0;
}
