import Papa from "papaparse";
import * as XLSX from "xlsx";
import type {
  ParsedFile,
  ParsedFileFlat,
  ParsedFileMondayExport,
  MondayExportGroup,
  MondayExportItem,
  FlatSubitemRow,
} from "../utils/types";
import { patchZip64Headers } from "./zip64Patcher";

// ── Public entry point ────────────────────────────────────────────────

/**
 * Detect file type, parse it, and auto-detect whether it's a flat file
 * or a monday.com hierarchical export.
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv" || ext === "tsv") {
    return parseFlatCSV(file);
  }
  if (ext === "xlsx" || ext === "xls") {
    return parseXLSX(file);
  }

  throw new Error(`Unsupported file type: .${ext}. Use .csv, .tsv, or .xlsx`);
}

// ── CSV / TSV → always flat ───────────────────────────────────────────

function parseFlatCSV(file: File): Promise<ParsedFileFlat> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        // Filter out empty/blank headers that can break column mapping
        const headers = (results.meta.fields ?? []).filter((h) => h.trim() !== "");
        if (!headers.length) {
          reject(new Error("CSV file has no headers"));
          return;
        }
        resolve({
          kind: "flat",
          headers,
          rows: results.data,
          fileName: file.name,
          rowCount: results.data.length,
        });
      },
      error(err: Error) {
        reject(new Error(`CSV parse error: ${err.message}`));
      },
    });
  });
}

// ── XLSX → detect monday export vs flat ───────────────────────────────

async function parseXLSX(file: File): Promise<ParsedFile> {
  // Use FileReader + Uint8Array to avoid "Array buffer allocation failed"
  // in Chrome extension contexts where arrayBuffer() can fail.
  const raw = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });

  // Monday.com exports use ZIP64 format which the xlsx library (0.18.5) cannot
  // handle — it reads 0xFFFFFFFF sentinel sizes and tries to allocate 4GB strings.
  // Fix: patch the ZIP64 headers in-place with real sizes from the extra fields.
  const buffer = patchZip64Headers(raw);

  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("Excel file contains no sheets");
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = getRawRows(sheet);

  if (rawRows.length === 0) {
    throw new Error("Excel sheet is empty");
  }

  // Detect monday.com classic export (parent + indented subitem sections).
  if (isMondayExport(rawRows)) {
    return parseMondayExport(rawRows, file.name, sheetName);
  }

  // Detect monday.com multi-level board export. These have a single
  // ["Name","Subitems",...] header row but NO repeated subitem-header
  // sections — every row is a leaf in monday's flattened tree (the
  // hierarchy is sadly stripped on export).
  if (isMondayMultiLevelExport(rawRows)) {
    return parseMondayMultiLevelExport(rawRows, file.name, sheetName);
  }

  // Otherwise treat as flat XLSX
  return parseFlatXLSX(rawRows, file.name);
}

// ── Raw row extraction ────────────────────────────────────────────────

type RawRow = string[];

function getRawRows(sheet: XLSX.WorkSheet): RawRow[] {
  const ref = sheet["!ref"];
  if (!ref) return [];

  // The sheet's !ref can be wrong (truncated) in monday.com ZIP64 exports.
  // Compute the TRUE range by scanning all actual cell keys in the sheet.
  const declaredRange = XLSX.utils.decode_range(ref);
  let maxRow = declaredRange.e.r;
  let maxCol = declaredRange.e.c;

  const cellKeys = Object.keys(sheet).filter((k) => !k.startsWith("!"));
  for (const key of cellKeys) {
    const decoded = XLSX.utils.decode_cell(key);
    if (decoded.r > maxRow) maxRow = decoded.r;
    if (decoded.c > maxCol) maxCol = decoded.c;
  }

  const rows: RawRow[] = [];

  for (let r = declaredRange.s.r; r <= maxRow; r++) {
    const row: string[] = [];
    for (let c = declaredRange.s.c; c <= maxCol; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (cell) {
        // Format dates properly (Excel serial dates are numbers 40000–60000).
        // Prefer the cell's pre-formatted text (cell.w) which is what monday
        // ships in its exports; fall back to SSF.format if available; final
        // fallback is the raw numeric value as a string.
        if (cell.t === "n" && cell.v > 40000 && cell.v < 60000) {
          if (cell.w) {
            row.push(String(cell.w));
          } else if ((XLSX as { SSF?: { format: (fmt: string, v: unknown) => string } }).SSF?.format) {
            row.push(
              (XLSX as { SSF: { format: (fmt: string, v: unknown) => string } }).SSF.format(
                "yyyy-mm-dd",
                cell.v,
              ),
            );
          } else {
            row.push(String(cell.v));
          }
        } else {
          row.push(String(cell.v ?? ""));
        }
      } else {
        row.push("");
      }
    }
    rows.push(row);
  }

  return rows;
}

// ── Monday.com export detection ───────────────────────────────────────

export function isMondayExport(rows: RawRow[]): boolean {
  let hasParentHeaderRow = false;
  let hasSubitemHeaderRow = false;

  for (const row of rows) {
    const colA = row[0]?.trim() ?? "";
    const colB = row[1]?.trim() ?? "";

    // Parent header row: col A = "Name", col B = "Subitems"
    if (colA === "Name" && colB === "Subitems") {
      hasParentHeaderRow = true;
    }
    // Subitem header row: col A = "Subitems", col B = "Name"
    if (colA === "Subitems" && colB === "Name") {
      hasSubitemHeaderRow = true;
    }

    if (hasParentHeaderRow && hasSubitemHeaderRow) return true;
  }

  return hasParentHeaderRow && hasSubitemHeaderRow;
}

/**
 * Detect a multi-level board export. Multi-level exports look like:
 *
 *   R0: BoardName
 *   R1: GroupName (often the same as the board name)
 *   R2: Name | Subitems | <columns…>     ← single header row
 *   R3+: items (every row has its name in col A, no indentation, no
 *        repeated subitem-header section)
 *   Rlast: aggregate footer row (col A empty, contains rolled-up values)
 *
 * The presence of a `["Name","Subitems",...]` header WITHOUT any
 * `["Subitems","Name",...]` row is the disambiguator.
 */
export function isMondayMultiLevelExport(rows: RawRow[]): boolean {
  let hasParentHeaderRow = false;
  let hasSubitemHeaderRow = false;

  for (const row of rows) {
    const colA = row[0]?.trim() ?? "";
    const colB = row[1]?.trim() ?? "";
    if (colA === "Name" && colB === "Subitems") hasParentHeaderRow = true;
    if (colA === "Subitems" && colB === "Name") hasSubitemHeaderRow = true;
  }

  return hasParentHeaderRow && !hasSubitemHeaderRow;
}

/**
 * Parse a monday.com multi-level board export into a flat ParsedFileFlat.
 *
 * Monday's export strips the parent/child hierarchy, so we don't pretend
 * to reconstruct it — every leaf becomes a top-level item. The
 * `mondayMultiLevel` flag on the returned ParsedFileFlat tells the
 * importer UI to show a clear warning so the user isn't surprised.
 */
export function parseMondayMultiLevelExport(
  rows: RawRow[],
  fileName: string,
  fallbackBoardName: string,
): ParsedFileFlat {
  // Locate the header row.
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if ((r[0]?.trim() ?? "") === "Name" && (r[1]?.trim() ?? "") === "Subitems") {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    // Shouldn't happen if isMondayMultiLevelExport returned true, but fall
    // back to the standard flat parser to avoid hard-failing.
    return parseFlatXLSX(rows, fileName);
  }

  // Board name from R0; group name from the row immediately above the
  // header (typical layout). Both are best-effort and only used for UI
  // breadcrumbs.
  const boardName = rows[0]?.[0]?.trim() || fallbackBoardName;
  const groupName = headerIdx >= 1 ? rows[headerIdx - 1]?.[0]?.trim() || boardName : boardName;

  // Headers minus the "Subitems" sentinel column (always empty in multi-level
  // — it's a relic of the classic format).
  const rawHeaders = rows[headerIdx].map((c) => c.trim());
  const usefulHeaders = rawHeaders.filter((h) => h && h !== "Subitems");

  // Map header label → column index (using rawHeaders since we kept the
  // Subitems column for indexing).
  const headerIndex = new Map<string, number>();
  rawHeaders.forEach((h, i) => {
    if (h && !headerIndex.has(h)) headerIndex.set(h, i);
  });

  const dataRows: Record<string, string>[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    // Skip rows where col A is empty — those are the aggregate / footer
    // rows monday appends at the end.
    if (!row[0] || row[0].trim() === "") continue;

    const obj: Record<string, string> = {};
    for (const h of usefulHeaders) {
      const idx = headerIndex.get(h);
      obj[h] = idx != null ? row[idx]?.trim() ?? "" : "";
    }
    dataRows.push(obj);
  }

  return {
    kind: "flat",
    headers: usefulHeaders,
    rows: dataRows,
    fileName,
    rowCount: dataRows.length,
    mondayMultiLevel: { boardName, groupName },
  };
}

// ── Monday.com export parser ──────────────────────────────────────────

/**
 * Parses monday.com's hierarchical XLSX export format:
 *
 * ```
 * R0:  "BoardName"                          ← board name (single cell)
 * R1:  "Group 1"                            ← group name (single cell)
 * R2:  "Name" | "Subitems" | "Person" | …   ← parent column headers
 * R3:  "Item 1" | "" | "john" | …           ← parent item row
 * R4:  "Subitems" | "Name" | "Owner" | …    ← subitem column headers
 * R5:  "" | "Subitem A" | "" | …            ← subitem data row (col A empty)
 * R6:  "Item 2" | "" | …                    ← next parent item
 * ...
 * Rn:  "Group 2"                            ← next group
 * Rn+1: headers repeat …
 * ```
 */
export function parseMondayExport(
  rows: RawRow[],
  fileName: string,
  boardName: string,
): ParsedFileMondayExport {
  const groups: MondayExportGroup[] = [];
  let parentHeaders: string[] = [];
  let subitemHeaders: string[] = [];

  let currentGroup: MondayExportGroup | null = null;
  let currentParentItem: MondayExportItem | null = null;
  let currentSubitemHeaders: string[] = [];
  /** True after we see a parent-header row; reset when a new group starts */
  let insideParentSection = false;

  // Detect board name from first row (single non-empty cell)
  const detectedBoardName = rows[0]?.[0]?.trim() || boardName;

  // Track whether we've ever seen a parent-headers row. Description rows
  // sometimes appear immediately after the board name (e.g. R1 of the
  // Financial Tracking export), and they have the same single-cell shape
  // as a group name. We treat single-cell rows that occur BEFORE the
  // first parent-headers row AND before the first real group has begun
  // as a description, not a group name — but only the first such row.
  // Anything after that we let the existing classifier handle.
  let seenAnyParentHeader = false;

  function classifyRow(
    row: RawRow,
    rowIndex: number,
  ):
    | "board_name"
    | "description"
    | "group_name"
    | "parent_headers"
    | "parent_item"
    | "subitem_headers"
    | "subitem_row"
    | "empty" {
    const colA = row[0]?.trim() ?? "";
    const colB = row[1]?.trim() ?? "";
    const nonEmpty = row.filter((c) => c.trim() !== "").length;

    if (nonEmpty === 0) return "empty";
    if (rowIndex === 0 && nonEmpty === 1) return "board_name";
    // Single-cell row at rowIndex 1 (right after the board name), with no
    // parent header seen yet, and the very next non-empty row is NOT a
    // parent-headers row → description.
    if (
      rowIndex === 1 &&
      nonEmpty === 1 &&
      !seenAnyParentHeader &&
      !nextNonEmptyIsParentHeader(rowIndex)
    ) {
      return "description";
    }
    if (colA === "Name" && colB === "Subitems") return "parent_headers";
    if (colA === "Subitems" && colB === "Name") return "subitem_headers";

    // Subitem data row: col A empty, col B has data, we're inside subitem headers
    if (colA === "" && colB !== "" && currentSubitemHeaders.length > 0) {
      return "subitem_row";
    }

    // Subitem data with only non-Name columns filled
    if (colA === "" && currentSubitemHeaders.length > 0) {
      return "subitem_row";
    }

    // Single non-empty cell disambiguation:
    // If we're inside a parent section (after header row), it's a parent item.
    // If we're NOT inside a parent section, it's a group name.
    if (nonEmpty === 1 && colA !== "" && colA !== "Name" && colA !== "Subitems") {
      return insideParentSection ? "parent_item" : "group_name";
    }

    // Parent item: col A has data, not a keyword
    if (colA !== "" && colA !== "Name" && colA !== "Subitems") {
      return "parent_item";
    }

    return "empty";
  }

  /** Look ahead past empty rows for a Name|Subitems header. */
  function nextNonEmptyIsParentHeader(fromRow: number): boolean {
    for (let j = fromRow + 1; j < rows.length; j++) {
      const r = rows[j];
      const nonEmpty = r.filter((c) => c.trim() !== "").length;
      if (nonEmpty === 0) continue;
      const a = r[0]?.trim() ?? "";
      const b = r[1]?.trim() ?? "";
      return a === "Name" && b === "Subitems";
    }
    return false;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const type = classifyRow(row, i);

    switch (type) {
      case "board_name":
        break;

      case "description":
        // Skip — board-level description doesn't carry items.
        break;

      case "group_name": {
        // Flush previous items
        if (currentParentItem && currentGroup) {
          currentGroup.items.push(currentParentItem);
          currentParentItem = null;
        }
        if (currentGroup) groups.push(currentGroup);
        currentGroup = { groupName: row[0].trim(), items: [] };
        currentSubitemHeaders = [];
        insideParentSection = false;
        break;
      }

      case "parent_headers": {
        parentHeaders = row.map((c) => c.trim()).filter((c) => c !== "");
        insideParentSection = true;
        seenAnyParentHeader = true;
        break;
      }

      case "parent_item": {
        // Flush previous parent
        if (currentParentItem && currentGroup) {
          currentGroup.items.push(currentParentItem);
        }
        if (!currentGroup) {
          currentGroup = { groupName: "(No Group)", items: [] };
        }

        const values: Record<string, string> = {};
        for (let c = 0; c < parentHeaders.length && c < row.length; c++) {
          const header = parentHeaders[c];
          if (header && header !== "Name" && header !== "Subitems") {
            values[header] = row[c]?.trim() ?? "";
          }
        }

        currentParentItem = { name: row[0].trim(), values, subitems: [] };
        currentSubitemHeaders = [];
        break;
      }

      case "subitem_headers": {
        // "Subitems" | "Name" | "Owner" | "Status" | "Date"
        currentSubitemHeaders = row.slice(1).map((c) => c.trim());
        // Keep the widest set of subitem headers across all groups
        const filtered = currentSubitemHeaders.filter((h) => h !== "");
        if (filtered.length > subitemHeaders.length) {
          subitemHeaders = filtered;
        }
        break;
      }

      case "subitem_row": {
        if (!currentParentItem) break;
        const subCells = row.slice(1);
        const subValues: Record<string, string> = {};
        let subName = "";

        for (let c = 0; c < currentSubitemHeaders.length && c < subCells.length; c++) {
          const header = currentSubitemHeaders[c];
          const val = subCells[c]?.trim() ?? "";
          if (c === 0 || header === "Name") {
            subName = val;
          } else if (header) {
            subValues[header] = val;
          }
        }

        if (subName) {
          currentParentItem.subitems.push({ name: subName, values: subValues });
        }
        break;
      }

      case "empty": {
        // Empty rows separate groups — flush current parent and reset context
        if (currentParentItem && currentGroup) {
          currentGroup.items.push(currentParentItem);
          currentParentItem = null;
        }
        currentSubitemHeaders = [];
        insideParentSection = false;
        break;
      }
    }
  }

  // Flush remaining
  if (currentParentItem && currentGroup) {
    currentGroup.items.push(currentParentItem);
  }
  if (currentGroup) groups.push(currentGroup);

  const flatSubitems = flattenSubitems(groups);

  return {
    kind: "monday_export",
    boardName: detectedBoardName,
    fileName,
    parentHeaders: parentHeaders.filter((h) => h !== "Subitems"),
    subitemHeaders,
    groups,
    flatSubitems,
    rowCount: flatSubitems.length,
  };
}

// ── Flatten subitems for import pipeline ──────────────────────────────

function flattenSubitems(groups: MondayExportGroup[]): FlatSubitemRow[] {
  const rows: FlatSubitemRow[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      for (const sub of item.subitems) {
        rows.push({
          groupName: group.groupName,
          parentItemName: item.name,
          subitemName: sub.name,
          values: sub.values,
        });
      }
    }
  }
  return rows;
}

// ── Flat XLSX fallback ────────────────────────────────────────────────

function parseFlatXLSX(rows: RawRow[], fileName: string): ParsedFileFlat {
  if (rows.length < 2) {
    throw new Error("Excel file must have a header row and at least one data row");
  }

  const headers = rows[0].map((c) => c.trim()).filter((c) => c !== "");
  const dataRows = rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c]?.trim() ?? "";
    }
    return obj;
  });

  return {
    kind: "flat",
    headers,
    rows: dataRows,
    fileName,
    rowCount: dataRows.length,
  };
}
