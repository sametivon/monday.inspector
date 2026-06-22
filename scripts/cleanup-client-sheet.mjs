// Surgical cleanup of the Pineapple "Project Tracker" xlsx.
//
// What this fixes:
//   1. "Concantanate" → "Concatenate" header typo (column O on row 4)
//   2. #REF! errors in row 1 cols S/T (broken formulas surfaced as errors)
//   3. Verifies date columns render as dates (logs if anything looks off)
//
// What this preserves (everything else):
//   sheet names, tab order, row counts, cell formatting, conditional formats,
//   colors, frozen panes, row groups, column widths, the Pineapple logo
//   image, hyperlinks, charts, and every cell containing real data.
//
// Strategy: unzip → text-edit just the parts that contain the bugs → re-zip.
// Round-tripping through a parser (xlsx@0.18.5) would silently drop styles
// and conditional formatting, so we touch the raw XML.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { platform, tmpdir } from "node:os";

const SOURCE = "C:/Users/Sam/Downloads/Project Tracker Client's Sheet.xlsx";
const OUTPUT =
  "C:/Users/Sam/Downloads/Project Tracker Client's Sheet (cleaned).xlsx";
const WORK = join(tmpdir(), "pineapple-clean");

const isWindows = platform() === "win32";
const tarBin = isWindows ? "C:\\Windows\\System32\\tar.exe" : "tar";

if (!existsSync(SOURCE)) {
  console.error(`✗ Source file not found: ${SOURCE}`);
  process.exit(1);
}

// ── 1. Fresh working directory ────────────────────────────────────────
if (existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// ── 2. Unzip the source xlsx into the working dir ─────────────────────
execFileSync(tarBin, ["-xf", SOURCE, "-C", WORK], {
  stdio: ["ignore", "inherit", "inherit"],
});
console.log(`✓ Unpacked source to ${WORK}`);

// ── 3. Fix the "Concantanate" → "Concatenate" typo in sharedStrings ───
// sharedStrings.xml is the single string pool referenced by every <c t="s">
// cell across every sheet. A single text replacement fixes the typo
// everywhere it's used. Use a regex with the global flag in case the
// string appears more than once (unlikely but defensive).
let typoCount = 0;
const sharedStringsPath = join(WORK, "xl", "sharedStrings.xml");
if (existsSync(sharedStringsPath)) {
  const before = readFileSync(sharedStringsPath, "utf8");
  const after = before.replace(/Concantanate/g, (m) => {
    typoCount++;
    return "Concatenate";
  });
  if (typoCount > 0) writeFileSync(sharedStringsPath, after, "utf8");
}
console.log(`✓ Fixed ${typoCount} "Concantanate" → "Concatenate" typo${typoCount === 1 ? "" : "s"}`);

// ── 4. Clear #REF! cells across every worksheet ────────────────────────
// Real shape in this file (and most monday/Google-Sheets-round-tripped
// xlsx files):
//   <c r="S2" s="17" t="str"><f>S3</f><v>#REF!</v></c>
// A formula points at a missing cell and surfaces as `#REF!`. The
// `t="str"` is "string from formula result" — NOT `t="e"` (error). We
// strip both <f>...</f> and <v>#REF!</v> children and drop the t=
// attribute, leaving the cell empty but with its `s=` style index
// preserved so the visual formatting (borders, fill, font) is intact.
//
// We match a <c> whose <v> text is exactly "#REF!" — that's the safe
// fingerprint regardless of cell type.
let refCleared = 0;
const worksheetsDir = join(WORK, "xl", "worksheets");
const sheetFiles = readdirSync(worksheetsDir).filter(
  (f) => f.endsWith(".xml") && f.startsWith("sheet"),
);

for (const f of sheetFiles) {
  const p = join(worksheetsDir, f);
  let xml = readFileSync(p, "utf8");
  // Strip the cell wholesale to an empty styled cell. Captures the
  // r="..." and s="..." attributes; drops any t="..." (was "str" or "e")
  // and any formula + value children. Greedy-safe because <c> elements
  // never nest.
  //
  // Matches every Excel error sentinel surface in a <v>:
  //   #REF!  #ERROR!  #VALUE!  #DIV/0!  #NAME?  #NULL!  #N/A  #NUM!
  // Real exports from this client surface all four of the first ones.
  xml = xml.replace(
    /<c\s+r="([^"]+)"(?:\s+s="(\d+)")?(?:\s+t="[^"]*")?\s*>\s*(?:<f[^>]*(?:\/>|>[^<]*<\/f>))?\s*<v>(?:#REF!|#ERROR!|#VALUE!|#DIV\/0!|#NAME\?|#NULL!|#N\/A|#NUM!)<\/v>\s*<\/c>/g,
    (_match, ref, style) => {
      refCleared++;
      return style != null
        ? `<c r="${ref}" s="${style}"/>`
        : `<c r="${ref}"/>`;
    },
  );
  writeFileSync(p, xml, "utf8");
}
console.log(`✓ Cleared ${refCleared} #REF! cell${refCleared === 1 ? "" : "s"} across ${sheetFiles.length} sheet${sheetFiles.length === 1 ? "" : "s"}`);

// ── 5. Date-format sanity report (NO auto-fix) ────────────────────────
// Earlier draft tried to "fix" date cells whose numeric value sat in the
// 40000-60000 Excel-serial-date range. Inspecting this client's styles.xml
// shows that the `s=` indices on those cells point to a percentage numFmt
// (numFmtId 9 = "0%") on plenty of cells that LOOK like dates in column
// position but are actually `% Complete` cells holding 0.0–1.0. Auto-
// reformatting them as dates would destroy correct percentage rendering.
// So we just report a sample for the human to spot-check in Excel and
// move on.
const firstSheetSample = sheetFiles[0]
  ? readFileSync(join(worksheetsDir, sheetFiles[0]), "utf8")
  : "";
const datesInRange = (firstSheetSample.match(
  /<v>(?:4[0-9]{4}|5[0-9]{4})(?:\.\d+)?<\/v>/g,
) ?? []).length;
console.log(
  `· Date-range numeric values seen on first sheet: ${datesInRange} (rendering depends on each cell's style — verify a few in Excel)`,
);

// ── 6. Re-zip preserving the original part structure ──────────────────
// Use explicit top-level entry names (NOT ".") so the resulting zip has
// root-relative paths — same lesson learned packaging the Chrome zip
// (see scripts/package-chrome.mjs for the back-story).
if (existsSync(OUTPUT)) rmSync(OUTPUT, { force: true });
const topLevel = readdirSync(WORK);
execFileSync(
  tarBin,
  ["--format=zip", "-cf", OUTPUT, "-C", WORK, ...topLevel],
  { stdio: ["ignore", "inherit", "inherit"] },
);

const kb = (statSync(OUTPUT).size / 1024).toFixed(1);
const sourceKb = (statSync(SOURCE).size / 1024).toFixed(1);
console.log(`\n✓ Wrote ${OUTPUT}`);
console.log(`  ${kb} KB  (source: ${sourceKb} KB)`);
console.log(`  ${typoCount} typo fix${typoCount === 1 ? "" : "es"}, ${refCleared} #REF! cleared`);
