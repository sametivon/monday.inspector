// Builds the Firefox-targeted zip for AMO submission.
//
// Why this exists:
//   PowerShell's `Compress-Archive` writes Windows-style backslash
//   separators inside zip entries on Windows, which Mozilla's validator
//   rejects with: "Invalid file name in archive: assets\fileParser-…js".
//   .NET's ZipFile.CreateFromDirectory has the same bug on some builds.
//
// Fix: use the libarchive-based bsdtar that ships with modern Windows
// (C:\Windows\System32\tar.exe) which writes spec-compliant zip entries
// with forward slashes. On macOS / Linux just use the system `zip`.
//
// Run AFTER `npm run build:firefox` (which produces dist-firefox/).

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync, rmSync } from "node:fs";
import { resolve, dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const distDir = resolve(root, "dist-firefox");
const zipPath = resolve(root, `monday-inspector-firefox.zip`);

if (!existsSync(distDir)) {
  console.error("✗ dist-firefox/ not found. Run `npm run build:firefox` first.");
  process.exit(1);
}

if (existsSync(zipPath)) {
  rmSync(zipPath, { force: true });
}

// Build the file list with POSIX paths (forward slashes), no leading "./".
function walk(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const rel = prefix ? posix.join(prefix, entry) : entry;
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

const entries = walk(distDir);
console.log(`✓ Collected ${entries.length} entries`);

const isWindows = platform() === "win32";
const tarBin = isWindows ? "C:\\Windows\\System32\\tar.exe" : "tar";

try {
  // Pipe the entry list as a newline-separated stdin to tar -T -.
  // bsdtar/libarchive will write forward-slash entry names, which is
  // what AMO and the ZIP spec require.
  execFileSync(
    tarBin,
    ["--format=zip", "-cf", zipPath, "-C", distDir, "-T", "-"],
    {
      input: entries.join("\n") + "\n",
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
} catch (err) {
  console.error("✗ tar failed:", err.message);
  process.exit(1);
}

const size = statSync(zipPath).size;
console.log(`✓ ${zipPath}`);
console.log(`  ${(size / 1024).toFixed(1)} KB`);
console.log("");
console.log("Submit this zip to https://addons.mozilla.org/developers/");
