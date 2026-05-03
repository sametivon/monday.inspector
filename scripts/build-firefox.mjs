// Produces a Firefox-targeted build at dist-firefox/ from the existing
// Chrome dist/. Same JS/CSS/HTML output — only the manifest differs.
//
// Run AFTER `npm run build` (which produces dist/).
//
// Why a post-build copy instead of a separate Vite config?
// The bundles are identical between Chrome and Firefox. The only
// browser-specific bit is the manifest's `browser_specific_settings`
// block (Firefox requires a stable id) and `strict_min_version`. Doing
// a full second Vite build just to swap one JSON file is wasteful, so
// we copy + overwrite the manifest in a separate target directory.

import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
// (rmSync is also used for stray-file cleanup below)
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = resolve(root, "dist");
const dest = resolve(root, "dist-firefox");
const firefoxManifest = resolve(root, "public", "manifest.firefox.json");

if (!existsSync(src)) {
  console.error(
    "✗ dist/ not found. Run `npm run build` first to produce the Chrome build.",
  );
  process.exit(1);
}
if (!existsSync(firefoxManifest)) {
  console.error(`✗ ${firefoxManifest} not found.`);
  process.exit(1);
}

if (existsSync(dest)) {
  rmSync(dest, { recursive: true, force: true });
}
mkdirSync(dest, { recursive: true });

cpSync(src, dest, { recursive: true });
copyFileSync(firefoxManifest, resolve(dest, "manifest.json"));

// Vite's `public/` copy also drags manifest.firefox.json into dist/ as a
// raw asset. Remove it from the Firefox build — Mozilla's validator
// flags any unexpected manifest-shaped file inside the zip.
const stray = resolve(dest, "manifest.firefox.json");
if (existsSync(stray)) {
  rmSync(stray, { force: true });
}

console.log("✓ Firefox build ready at dist-firefox/");
console.log("  Manifest swapped from public/manifest.firefox.json");
console.log("  Submit this directory (zip first) to https://addons.mozilla.org/");
