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

  // Detect monday.com export by its characteristic pattern
  if (isMondayExport(rawRows)) {
    return parseMondayExport(rawRows, file.name, sheetName);
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
        // Format dates properly (Excel serial dates are numbers 40000–60000)
        if (cell.t === "n" && cell.v > 40000 && cell.v < 60000) {
          const date = XLSX.SSF.format("yyyy-mm-dd", cell.v);
          row.push(date);
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

  function classifyRow(
    row: RawRow,
    rowIndex: number,
  ): "board_name" | "group_name" | "parent_headers" | "parent_item" | "subitem_headers" | "subitem_row" | "empty" {
    const colA = row[0]?.trim() ?? "";
    const colB = row[1]?.trim() ?? "";
    const nonEmpty = row.filter((c) => c.trim() !== "").length;

    if (nonEmpty === 0) return "empty";
    if (rowIndex === 0 && nonEmpty === 1) return "board_name";
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

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const type = classifyRow(row, i);

    switch (type) {
      case "board_name":
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
