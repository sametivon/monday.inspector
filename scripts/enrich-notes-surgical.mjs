// Surgically inject the client's Actions/Comments + Historical Actions
// content into the Notes column of the monday-shape import file, without
// round-tripping through the xlsx library.
//
// Why surgical: the previous xlsx-round-trip version (now deleted) silently
// turned every date cell from monday's text shape ("08/09/2025") into raw
// serial numbers (45908) because the library doesn't preserve cell types
// when writing. That broke the file's date columns AND caused subsequent
// import failures.
//
// This script preserves every byte of the original (2).xlsx except:
//   • appends new <si><t>…</t></si> entries to xl/sharedStrings.xml
//   • for each subitem row that has a matching note, inserts or replaces a
//     single <c r="HROW" s="10" t="s"><v>INDEX</v></c> cell in sheet1.xml
//     (Notes lives at column H on subitems; existing cells use style 10)
//
// Output:
//   C:/Users/Sam/Downloads/Untitled spreadsheet (2) - enriched v2.xlsx

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { platform, tmpdir } from "node:os";
import * as XLSX from "xlsx";

const CLIENT = "C:/Users/Sam/Downloads/Project Tracker.xlsx";
const SOURCE = "C:/Users/Sam/Downloads/Untitled spreadsheet (2).xlsx";
const OUTPUT =
  "C:/Users/Sam/Downloads/Untitled spreadsheet (2) - enriched v2.xlsx";
const WORK = join(tmpdir(), "upload-clean");

const isWindows = platform() === "win32";
const tarBin = isWindows ? "C:\\Windows\\System32\\tar.exe" : "tar";

if (!existsSync(CLIENT) || !existsSync(SOURCE)) {
  console.error("✗ Missing input files. Need both:");
  console.error(`   ${CLIENT}`);
  console.error(`   ${SOURCE}`);
  process.exit(1);
}

// ── Phase 1: Build the notes lookup map ────────────────────────────────
// Read-only — xlsx library round-trip doesn't matter here; we only consume
// values, never write back.
const pt = XLSX.read(readFileSync(CLIENT), { type: "buffer" });
const live = pt.Sheets["LiveProjects26"];
if (!live) {
  console.error("✗ LiveProjects26 tab not found in Project Tracker.xlsx");
  process.exit(1);
}
const liveRange = XLSX.utils.decode_range(live["!ref"]);
const COL_PRJCT = 1; // B
const COL_TASK = 5; // F
const COL_ACTIONS = 12; // M
const COL_HISTORICAL = 13; // N

const notesMap = new Map();
for (let r = 4; r <= liveRange.e.r; r++) {
  const prjctCell = live[XLSX.utils.encode_cell({ r, c: COL_PRJCT })];
  const taskCell = live[XLSX.utils.encode_cell({ r, c: COL_TASK })];
  const actionsCell = live[XLSX.utils.encode_cell({ r, c: COL_ACTIONS })];
  const historicalCell = live[XLSX.utils.encode_cell({ r, c: COL_HISTORICAL })];

  const prjct = String(prjctCell?.v ?? "").trim();
  const task = String(taskCell?.v ?? "").trim();
  if (!prjct || !task) continue;

  const actions = String(actionsCell?.w ?? actionsCell?.v ?? "").trim();
  const historical = String(
    historicalCell?.w ?? historicalCell?.v ?? "",
  ).trim();
  if (!actions && !historical) continue;

  const note = [actions, historical].filter(Boolean).join("\n\n");
  notesMap.set(`${prjct}|${task.toLowerCase()}`, note);
}
console.log(`✓ Built notes map: ${notesMap.size} entries from LiveProjects26`);

// ── Phase 2: Unzip the ORIGINAL (2).xlsx to a clean working dir ──────
if (existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
execFileSync(tarBin, ["-xf", SOURCE, "-C", WORK], {
  stdio: ["ignore", "inherit", "inherit"],
});

// ── Phase 3: Walk sheet1.xml row-by-row, mark subitem rows for note ──
// Note column on subitems lives at column H (verified by inspecting the
// subitem-header row 5 in the source: H5 references shared string 37
// "Notes"). Existing Notes cells use style s="10" (e.g. H35 in the
// source). New cells we add will use the same style for visual parity.
const sheetPath = join(WORK, "xl", "worksheets", "sheet1.xml");
let sheetXml = readFileSync(sheetPath, "utf8");

// Read existing sharedStrings to compute the next available index.
const ssPath = join(WORK, "xl", "sharedStrings.xml");
let ssXml = readFileSync(ssPath, "utf8");
const ssCountMatch = ssXml.match(/uniqueCount="(\d+)"/);
const ssTotalCountMatch = ssXml.match(/<sst[^>]*count="(\d+)"/);
let uniqueCount = parseInt(ssCountMatch?.[1] ?? "0", 10);
let totalCount = parseInt(ssTotalCountMatch?.[1] ?? "0", 10);
let nextSsIndex = uniqueCount;

const newSsEntries = []; // <si>…</si> chunks to append
const replacements = []; // { row, ssIndex }

function xmlEscape(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Iterate rows. Match each <row r="N">…</row> chunk so state stays in
// order regardless of nesting depth (rows never nest in OOXML).
const rowRe = /<row[^>]*\sr="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
let currentPrjctNum = "";
let inSubitems = false;
let m;
let candidates = 0;
let injected = 0;
let unmatched = 0;

while ((m = rowRe.exec(sheetXml)) !== null) {
  const rowNum = parseInt(m[1], 10);
  const cells = m[2];

  // Pluck col A and col B's shared-string values to identify the row.
  const aMatch = cells.match(/<c\s+r="A\d+"[^>]*t="s"[^>]*><v>(\d+)<\/v><\/c>/);
  const bMatch = cells.match(/<c\s+r="B\d+"[^>]*t="s"[^>]*><v>(\d+)<\/v><\/c>/);
  const aIdx = aMatch ? parseInt(aMatch[1], 10) : null;
  const bIdx = bMatch ? parseInt(bMatch[1], 10) : null;

  // Helper: pull the shared-string text at index i.
  function ssText(i) {
    if (i == null) return "";
    const r = new RegExp(
      `(?:<si[^>]*>(?:<t[^>]*>([^<]*)</t>|<r>[\\s\\S]*?</r>)+</si>\\s*){${i}}<si[^>]*><t[^>]*>([^<]*)</t></si>`,
    );
    // Simpler — pull the i-th <si> directly.
    let count = 0;
    const siRe = /<si[^>]*>([\s\S]*?)<\/si>/g;
    let sm;
    while ((sm = siRe.exec(ssXml)) !== null) {
      if (count === i) {
        const t = sm[1].match(/<t[^>]*>([\s\S]*?)<\/t>/);
        return t ? t[1] : "";
      }
      count++;
    }
    return "";
  }

  const colAText = aIdx != null ? ssText(aIdx) : "";
  const colBText = bIdx != null ? ssText(bIdx) : "";

  // Group row: col A matches "<digits> - <name>", col B empty
  if (/^\d{3,5}\s*-/.test(colAText.trim()) && !bMatch) {
    currentPrjctNum = colAText.trim().split(/\s*-\s*/)[0].trim();
    inSubitems = false;
    continue;
  }
  // Parent header row: A="Name", B="Subitems"
  if (colAText === "Name" && colBText === "Subitems") {
    inSubitems = false;
    continue;
  }
  // Subitem header row: A="Subitems", B="Name"
  if (colAText === "Subitems" && colBText === "Name") {
    inSubitems = true;
    continue;
  }

  // Subitem data row: col A absent (or empty), col B has the task name
  if (inSubitems && bMatch && !aMatch) {
    candidates++;
    const key = `${currentPrjctNum}|${colBText.trim().toLowerCase()}`;
    const note = notesMap.get(key);
    if (!note) {
      unmatched++;
      continue;
    }
    // Allocate a new shared-string index for this note.
    const ssIdx = nextSsIndex++;
    newSsEntries.push(
      `<si><t xml:space="preserve">${xmlEscape(note)}</t></si>`,
    );
    replacements.push({ row: rowNum, ssIndex: ssIdx });
    injected++;
  }
}

console.log(`✓ Walked sheet1.xml: ${candidates} subitem rows, ${injected} marked, ${unmatched} unmatched`);

// ── Phase 4: Append new <si> entries to sharedStrings.xml ─────────────
if (newSsEntries.length > 0) {
  ssXml = ssXml.replace(
    /<\/sst>\s*$/,
    `${newSsEntries.join("")}</sst>`,
  );
  ssXml = ssXml.replace(
    /<sst([^>]*?)\scount="\d+"/,
    `<sst$1 count="${totalCount + newSsEntries.length}"`,
  );
  ssXml = ssXml.replace(
    /uniqueCount="\d+"/,
    `uniqueCount="${uniqueCount + newSsEntries.length}"`,
  );
  writeFileSync(ssPath, ssXml, "utf8");
  console.log(`✓ Appended ${newSsEntries.length} <si> entries to sharedStrings.xml`);
}

// ── Phase 5: Patch sheet1.xml — for each marked row, insert or replace H ─
for (const { row, ssIndex } of replacements) {
  const newCell = `<c r="H${row}" s="10" t="s"><v>${ssIndex}</v></c>`;

  // Case A: an H cell already exists at this row — replace it.
  const existingHRe = new RegExp(
    `<c\\s+r="H${row}"[^/>]*(?:\\/>|>(?:[^<]*<\\/[^>]+>)*<\\/c>)`,
    "g",
  );
  if (existingHRe.test(sheetXml)) {
    sheetXml = sheetXml.replace(existingHRe, newCell);
    continue;
  }

  // Case B: no H cell — insert before </row> of this specific row.
  const rowCloseRe = new RegExp(
    `(<row[^>]*\\sr="${row}"[^>]*>[\\s\\S]*?)</row>`,
  );
  sheetXml = sheetXml.replace(rowCloseRe, `$1${newCell}</row>`);
}

writeFileSync(sheetPath, sheetXml, "utf8");
console.log(`✓ Patched sheet1.xml with ${replacements.length} Notes cells`);

// ── Phase 6: Re-zip with explicit top-level entries (root-relative) ──
if (existsSync(OUTPUT)) rmSync(OUTPUT, { force: true });
const topLevel = readdirSync(WORK);
execFileSync(
  tarBin,
  ["--format=zip", "-cf", OUTPUT, "-C", WORK, ...topLevel],
  { stdio: ["ignore", "inherit", "inherit"] },
);

console.log(`\n✓ Wrote ${OUTPUT}`);
console.log(`  ${injected} notes injected · dates preserved as monday's original text shape`);
console.log(`  Re-import this file via the extension on a fresh test board.`);
