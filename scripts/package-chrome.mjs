// Builds the Chrome Web Store zip from dist/.
//
// Why this exists — two upload errors we hit packaging by hand:
//   1. "No manifest found in package" — caused by zipping `-C dist .`,
//      which prefixes every entry with "./" (so the manifest reads as
//      "./manifest.json", not at the root). Fix: archive the top-level
//      entries explicitly so paths are root-relative.
//   2. "description too long" — Chrome caps manifest.description at 132
//      chars. We assert it here so a too-long description fails the
//      package step locally instead of at upload time.
//
// Also strips the Firefox manifest that Vite copies from public/ — the
// Chrome package must not contain a second manifest-shaped file.
//
// Run AFTER `npm run build`.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const distDir = resolve(root, "dist");

if (!existsSync(distDir)) {
  console.error("✗ dist/ not found. Run `npm run build` first.");
  process.exit(1);
}

// ── Read version + validate description length ─────────────────────────
const manifestPath = resolve(distDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const version = manifest.version;
const DESC_LIMIT = 132;

if (!manifest.description || manifest.description.length > DESC_LIMIT) {
  console.error(
    `✗ manifest.description is ${manifest.description?.length ?? 0} chars — ` +
      `Chrome's limit is ${DESC_LIMIT}. Shorten it in public/manifest.json.`,
  );
  process.exit(1);
}

// ── Strip the stray Firefox manifest Vite copies from public/ ──────────
const strayFirefox = resolve(distDir, "manifest.firefox.json");
if (existsSync(strayFirefox)) rmSync(strayFirefox, { force: true });

// ── Zip the top-level entries explicitly (root-relative paths) ─────────
const zipPath = resolve(root, `monday-inspector-v${version}.zip`);
if (existsSync(zipPath)) rmSync(zipPath, { force: true });

// Fixed list of the directories/files we ship. Explicit (not ".") so the
// archive has no "./" prefix and manifest.json sits at the root.
const ENTRIES = ["manifest.json", "assets", "background", "content", "icons", "src"];
for (const e of ENTRIES) {
  if (!existsSync(resolve(distDir, e))) {
    console.error(`✗ Expected dist/${e} but it's missing — did the build run?`);
    process.exit(1);
  }
}

const isWindows = platform() === "win32";
const tarBin = isWindows ? "C:\\Windows\\System32\\tar.exe" : "tar";

try {
  execFileSync(tarBin, ["--format=zip", "-cf", zipPath, "-C", distDir, ...ENTRIES], {
    stdio: ["ignore", "inherit", "inherit"],
  });
} catch (err) {
  console.error("✗ zip failed:", err.message);
  process.exit(1);
}

// ── Verify manifest.json is at the literal root of the archive ─────────
const listing = execFileSync(tarBin, ["-tf", zipPath], { encoding: "utf8" });
if (!listing.split(/\r?\n/).includes("manifest.json")) {
  console.error("✗ manifest.json is NOT at the archive root — aborting.");
  process.exit(1);
}

const kb = (statSync(zipPath).size / 1024).toFixed(1);
console.log(`✓ ${zipPath}`);
console.log(`  ${kb} KB · version ${version} · description ${manifest.description.length}/${DESC_LIMIT} chars`);
console.log("  manifest.json verified at archive root.");
console.log("");
console.log("Upload at https://chrome.google.com/webstore/devconsole");
