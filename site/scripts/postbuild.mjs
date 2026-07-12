// Post-build: vite-react-ssg appends ".html" to route paths that already
// end in ".html" (our routes carry the suffix so the client router matches
// the legacy /page.html URLs). Rename "*.html.html" back to "*.html",
// overwriting the old static page it replaces.
import { readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const docs = resolve(dirname(fileURLToPath(import.meta.url)), "../../docs");

for (const f of readdirSync(docs)) {
  if (f.endsWith(".html.html")) {
    const target = join(docs, f.replace(/\.html\.html$/, ".html"));
    rmSync(target, { force: true });
    renameSync(join(docs, f), target);
    console.log(`renamed ${f} -> ${f.replace(/\.html\.html$/, ".html")}`);
  }
}

// The .vite build manifest isn't needed at runtime on GitHub Pages.
rmSync(join(docs, ".vite"), { recursive: true, force: true });

// Keep only the newest static-loader-data manifest (the app bundle fetches
// it by hashed name; older ones are orphans from previous builds).
const manifests = readdirSync(docs)
  .filter((f) => f.startsWith("static-loader-data-manifest-"))
  .map((f) => ({ f, mtime: statSync(join(docs, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);
for (const { f } of manifests.slice(1)) {
  rmSync(join(docs, f));
  console.log(`pruned stale ${f}`);
}
console.log("postbuild done");
