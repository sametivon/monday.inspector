// Enriches the monday-export-shape Untitled spreadsheet (2).xlsx with the
// rich "Actions / Comments" + "Historical Actions / Comments" content from
// the client's source-of-truth Project Tracker.xlsx (LiveProjects26 tab),
// matched by project number + task name.
//
// What gets written:
//   • For every SUBITEM row in (2).xlsx, look up the matching client-sheet
//     row by (project number from the group name, subitem name from col B)
//     and replace the Notes column value with:
//
//       <Actions / Comments>
//
//       <Historical Actions / Comments>
//
//     Only rows where the client sheet has at least one of the two columns
//     populated are touched. Existing notes that don't match the client's
//     truth are overwritten.
//
// Output: `C:/Users/Sam/Downloads/Untitled spreadsheet (2) - with notes.xlsx`
//
// Re-import THAT file via the extension to get the accurate notes on monday.

import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

const PTRACKER = "C:/Users/Sam/Downloads/Project Tracker.xlsx";
const SOURCE = "C:/Users/Sam/Downloads/Untitled spreadsheet (2).xlsx";
const OUTPUT =
  "C:/Users/Sam/Downloads/Untitled spreadsheet (2) - with notes.xlsx";

// ── Phase 1: build (prjct_num, task_lowercase) → notes map ───────────
const pt = XLSX.read(readFileSync(PTRACKER), { type: "buffer" });
const live = pt.Sheets["LiveProjects26"];
if (!live) {
  console.error("✗ LiveProjects26 tab not found in Project Tracker.xlsx");
  process.exit(1);
}
const liveRange = XLSX.utils.decode_range(live["!ref"]);

// Column indices on the client sheet (0-based, A=0):
//   B(1) = Prjct Nmbr · F(5) = TASK · M(12) = Actions / Comments · N(13) = Historical
const COL_PRJCT = 1;
const COL_TASK = 5;
const COL_ACTIONS = 12;
const COL_HISTORICAL = 13;

const notesMap = new Map();
let scanned = 0;
let mapped = 0;
for (let r = 4; r <= liveRange.e.r; r++) {
  // Row 5 (1-indexed) is the first data row → r=4 0-indexed.
  scanned++;
  const prjctCell = live[XLSX.utils.encode_cell({ r, c: COL_PRJCT })];
  const taskCell = live[XLSX.utils.encode_cell({ r, c: COL_TASK })];
  const actionsCell = live[XLSX.utils.encode_cell({ r, c: COL_ACTIONS })];
  const historicalCell = live[XLSX.utils.encode_cell({ r, c: COL_HISTORICAL })];

  const prjct = String(prjctCell?.v ?? "").trim();
  const task = String(taskCell?.v ?? "").trim();
  if (!prjct || !task) continue;

  // Prefer the formatted text (.w) for rich strings; fall back to raw .v
  const actions = String(actionsCell?.w ?? actionsCell?.v ?? "").trim();
  const historical = String(
    historicalCell?.w ?? historicalCell?.v ?? "",
  ).trim();
  if (!actions && !historical) continue;

  const note = [actions, historical].filter(Boolean).join("\n\n");
  const key = `${prjct}|${task.toLowerCase()}`;
  notesMap.set(key, note);
  mapped++;
}
console.log(`✓ Built notes map: ${mapped} entries (scanned ${scanned} rows in LiveProjects26)`);

// ── Phase 2: walk (2).xlsx; for each subitem, inject the matched note ─
const src = XLSX.read(readFileSync(SOURCE), { type: "buffer" });
const sheetName = src.SheetNames[0];
const sheet = src.Sheets[sheetName];
const srange = XLSX.utils.decode_range(sheet["!ref"]);

// State machine. monday classic export shape:
//   row N:   group name (single cell, e.g. "1240 - Acumen Casework")
//   row N+1: parent header row: "Name" | "Subitems" | …
//   row N+2: parent item
//   row N+3: subitem header row: "Subitems" | "Name" | …
//   row N+4+: subitem rows (col A empty, col B = subitem name)
let currentPrjctNum = ""; // "1240" extracted from group name
let notesColIdx = -1;     // column index of "Notes" within the subitem section
let inSubitems = false;

let candidates = 0;
let injected = 0;
let unmatched = 0;

function readRow(rIdx) {
  const out = [];
  for (let c = srange.s.c; c <= srange.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: rIdx, c })];
    out.push(cell ? String(cell.w ?? cell.v ?? "") : "");
  }
  return out;
}

for (let i = srange.s.r; i <= srange.e.r; i++) {
  const row = readRow(i);
  const colA = (row[0] ?? "").trim();
  const colB = (row[1] ?? "").trim();

  // Group row: col A is "<digits> - <name>". col B empty (other cells may
  // have promo strings; we just key off col A's shape).
  if (/^\d{3,5}\s*-/.test(colA) && colB === "") {
    currentPrjctNum = colA.split(/\s*-\s*/)[0].trim();
    inSubitems = false;
    notesColIdx = -1;
    continue;
  }

  // Parent header — opens a new parent section, closes any subitem context.
  if (colA === "Name" && colB === "Subitems") {
    inSubitems = false;
    notesColIdx = -1;
    continue;
  }

  // Subitem header — record where the Notes column sits in THIS section.
  if (colA === "Subitems" && colB === "Name") {
    inSubitems = true;
    notesColIdx = row.findIndex((c) => c.trim() === "Notes");
    continue;
  }

  // Subitem data row — col A empty, col B has the task name.
  if (inSubitems && colA === "" && colB && notesColIdx > 0) {
    candidates++;
    const key = `${currentPrjctNum}|${colB.toLowerCase()}`;
    const note = notesMap.get(key);
    if (note) {
      const ref = XLSX.utils.encode_cell({ r: i, c: notesColIdx });
      sheet[ref] = { t: "s", v: note };
      injected++;
    } else {
      unmatched++;
    }
  }
}

console.log(
  `✓ Walked (2).xlsx: ${candidates} subitem rows, ${injected} notes injected, ${unmatched} unmatched`,
);

// ── Phase 3: write the enriched file ─────────────────────────────────
XLSX.writeFile(src, OUTPUT);
console.log(`\n✓ Wrote ${OUTPUT}`);
console.log(`  Re-import this file via the extension to get the accurate notes on monday.`);
