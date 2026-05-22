import type { ColumnMapping, MondayColumn } from "../utils/types";

// Post-import error analysis. After a run finishes with failures, we want
// to tell the user — in plain language — which column(s) are the likely
// cause and offer a one-click "skip those columns and re-run".
//
// Everything here is pure (no React, no network) so it's trivially
// unit-testable and reused identically by the CSV importer and any future
// surface that needs the same recovery UX.

export interface SuspectColumn {
  /** monday column id (what we un-map to skip it) */
  id: string;
  /** human title shown in the banner */
  title: string;
}

export interface ImportErrorAnalysis {
  totalFailed: number;
  /** The most frequent error message across the failed rows */
  topError: string;
  /** How many failed rows share that top error */
  topErrorCount: number;
  /** Mapped columns we believe are causing the failures, de-duped */
  suspectColumns: SuspectColumn[];
}

interface FailedRowLike {
  error?: string;
}

// Error-text fingerprints that point at a Connect Boards / Dependency
// column even when the message doesn't quote a specific column title.
const CONNECT_BOARD_HINTS = [
  "cannot read the linked board",
  "no linked board configured",
  "board_relation",
  "connect boards",
];

// monday's API surfaces invalid column writes under these exception names.
const COLUMN_VALUE_EXCEPTIONS = [
  "columnvalueexception",
  "invalidcolumnvalueexception",
  "columnvalue",
];

/**
 * Analyse the failed rows of a finished import and surface the likely
 * culprit columns. Only columns that are actually in the active mappings
 * are ever returned as suspects — so "skip & re-run" always changes
 * something.
 */
export function analyzeImportErrors(
  failedRows: FailedRowLike[],
  activeParentMappings: ColumnMapping[],
  activeSubitemMappings: ColumnMapping[],
  boardColumns: MondayColumn[],
  subitemColumns: MondayColumn[],
): ImportErrorAnalysis {
  const totalFailed = failedRows.length;

  // ── Most common error message ─────────────────────────────────────────
  const counts = new Map<string, number>();
  for (const r of failedRows) {
    const msg = (r.error ?? "").trim();
    if (!msg) continue;
    counts.set(msg, (counts.get(msg) ?? 0) + 1);
  }
  let topError = "";
  let topErrorCount = 0;
  for (const [msg, n] of counts) {
    if (n > topErrorCount) {
      topError = msg;
      topErrorCount = n;
    }
  }

  // ── Build lookup tables of mapped columns (id + title + type) ──────────
  // We can only suggest skipping a column the user actually mapped, so we
  // restrict the candidate set to the active mappings on both sides.
  const mappedIds = new Set<string>([
    ...activeParentMappings.map((m) => m.mondayColumnId),
    ...activeSubitemMappings.map((m) => m.mondayColumnId),
  ]);

  const colById = new Map<string, MondayColumn>();
  for (const c of [...boardColumns, ...subitemColumns]) {
    colById.set(c.id, c);
  }
  // Title (lowercased) → id, restricted to mapped columns for fast lookup
  // when an error quotes a column by its human title.
  const mappedTitleToId = new Map<string, string>();
  for (const id of mappedIds) {
    const col = colById.get(id);
    if (col) mappedTitleToId.set(col.title.trim().toLowerCase(), id);
  }

  const suspectIds = new Set<string>();

  const allErrorsText = failedRows
    .map((r) => (r.error ?? "").toLowerCase())
    .join("\n");

  // 1) Quoted column titles, e.g. Connect Boards column "Project Board" ...
  //    Match both straight and smart quotes.
  for (const r of failedRows) {
    const msg = r.error ?? "";
    const re = /column\s+["'“”]([^"'“”]+)["'“”]/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(msg)) !== null) {
      const title = m[1].trim().toLowerCase();
      const id = mappedTitleToId.get(title);
      if (id) suspectIds.add(id);
    }
  }

  // 2) Connect Boards / Dependency fingerprints → all mapped board_relation
  //    + dependency columns are suspects.
  if (CONNECT_BOARD_HINTS.some((h) => allErrorsText.includes(h))) {
    for (const id of mappedIds) {
      const col = colById.get(id);
      if (col && (col.type === "board_relation" || col.type === "dependency")) {
        suspectIds.add(id);
      }
    }
  }

  // 3) ColumnValueException — try to match any mapped column title that
  //    literally appears in the error text. Conservative: only flags a
  //    column whose title is a distinctive token in the message.
  if (COLUMN_VALUE_EXCEPTIONS.some((h) => allErrorsText.includes(h))) {
    for (const [title, id] of mappedTitleToId) {
      if (title.length >= 3 && allErrorsText.includes(title)) {
        suspectIds.add(id);
      }
    }
  }

  const suspectColumns: SuspectColumn[] = [...suspectIds].map((id) => ({
    id,
    title: colById.get(id)?.title ?? id,
  }));

  return { totalFailed, topError, topErrorCount, suspectColumns };
}
