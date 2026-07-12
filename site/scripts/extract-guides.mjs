// One-time extraction: pull each legacy guide's <article class="prose"> body,
// head metadata and JSON-LD out of docs/*.html into site/src/content/ so the
// React GuidePage can render the exact same SEO content in the new design.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = resolve(root, "site/src/content");
mkdirSync(out, { recursive: true });

const guides = [
  "import-subitems-monday",
  "monday-csv-import-guide",
  "monday-bulk-update",
  "monday-graphql-query-guide",
  "monday-import-images-from-excel",
];

const meta = {};
const classCounts = {};

for (const slug of guides) {
  const html = readFileSync(resolve(root, "docs", `${slug}.html`), "utf8");

  // ── article body ──
  const m = html.match(/<article class="prose">([\s\S]*?)<\/article>/);
  if (!m) {
    console.error(`!! no <article class="prose"> in ${slug}`);
    continue;
  }
  let body = m[1];

  // strip scroll-reveal classes (inert in the new app) and inline styles
  body = body
    .replace(/\sclass="reveal( d\d)?"/g, "")
    .replace(/\sclass="([^"]*)\breveal\b( d\d)?([^"]*)"/g, (_, a, __, b) => ` class="${(a + b).trim()}"`)
    .replace(/\sstyle="[^"]*"/g, "");

  // inventory remaining classes so we know what CSS to provide
  for (const c of body.matchAll(/class="([^"]+)"/g)) {
    for (const cls of c[1].split(/\s+/)) classCounts[cls] = (classCounts[cls] || 0) + 1;
  }

  writeFileSync(resolve(out, `${slug}.html`), body.trim());

  // ── head metadata ──
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1].trim() ?? "";
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
  const ldjson = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((x) =>
    x[1].trim()
  );

  // hero bits
  const h1 = html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() ?? "";
  const lead = html.match(/<p class="lead">([\s\S]*?)<\/p>/)?.[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() ?? "";
  const metaLine = [...(html.match(/<div class="article-meta">([\s\S]*?)<\/div>/)?.[1] ?? "").matchAll(/<span>([\s\S]*?)<\/span>/g)]
    .map((x) => x[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // TOC entries
  const tocBlock = html.match(/<div class="article-toc"[\s\S]*?<\/div>/)?.[0] ?? "";
  const toc = [...tocBlock.matchAll(/<a href="(#[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((x) => ({
    href: x[1],
    label: x[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
  }));

  meta[slug] = { title, description, h1, lead, meta: metaLine, toc, ldjson };
  console.log(`ok ${slug}: body ${(body.length / 1024).toFixed(1)}KB, toc ${toc.length}, ld+json ${ldjson.length}`);
}

writeFileSync(resolve(out, "guides.meta.json"), JSON.stringify(meta, null, 2));
console.log("\nremaining classes in fragments:");
console.log(
  Object.entries(classCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join("  ")
);
