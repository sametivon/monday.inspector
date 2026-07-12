import { Head } from "vite-react-ssg";
import { motion } from "framer-motion";
import { revealUp, stagger, useEntrance } from "@/lib/motion";
import metaAll from "@/content/guides.meta.json";

// Legacy guide bodies, extracted verbatim (SEO text preserved) and rendered
// inside the new calm design. See site/scripts/extract-guides.mjs.
import importSubitems from "@/content/import-subitems-monday.html?raw";
import csvImport from "@/content/monday-csv-import-guide.html?raw";
import bulkUpdate from "@/content/monday-bulk-update.html?raw";
import graphql from "@/content/monday-graphql-query-guide.html?raw";
import excelImages from "@/content/monday-import-images-from-excel.html?raw";

const CONTENT: Record<string, string> = {
  "import-subitems-monday": importSubitems,
  "monday-csv-import-guide": csvImport,
  "monday-bulk-update": bulkUpdate,
  "monday-graphql-query-guide": graphql,
  "monday-import-images-from-excel": excelImages,
};

type Meta = {
  title: string;
  description: string;
  h1: string;
  lead: string;
  meta: string[];
  toc: { href: string; label: string }[];
  ldjson: string[];
};

export default function GuidePage({ slug }: { slug: string }) {
  const entrance = useEntrance();
  const m = (metaAll as Record<string, Meta>)[slug];
  const body = CONTENT[slug];

  // Fall back to deriving the TOC from the fragment's h2 anchors.
  const toc =
    m.toc.length > 0
      ? m.toc
      : [...body.matchAll(/<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)].map((x) => ({
          href: `#${x[1]}`,
          label: x[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
        }));

  return (
    <>
      <Head>
        <title>{m.title}</title>
        <meta name="description" content={m.description} />
        <link rel="canonical" href={`https://mondayinspector.eu/${slug}.html`} />
        <meta property="og:title" content={m.h1} />
        <meta property="og:description" content={m.description} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`https://mondayinspector.eu/${slug}.html`} />
        <meta property="og:image" content="https://mondayinspector.eu/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        {m.ldjson.map((s, i) => (
          <script key={i} type="application/ld+json">
            {s}
          </script>
        ))}
      </Head>

      <div className="px-6 pb-24 pt-36 sm:pt-40">
        <motion.header
          variants={stagger(0.08)}
          initial={entrance("hidden")}
          animate="show"
          className="mx-auto max-w-4xl"
        >
          <motion.div variants={revealUp} className="mb-5 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <a href="/" className="font-medium text-brand hover:underline">Home</a>
            <span>›</span>
            <span>Guides</span>
          </motion.div>
          <motion.span
            variants={revealUp}
            className="mb-4 inline-block rounded-full bg-white/70 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-brand backdrop-blur"
          >
            Guide
          </motion.span>
          <motion.h1
            variants={revealUp}
            className="font-display text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-[1.12] tracking-tightest text-ink"
          >
            {m.h1}
          </motion.h1>
          {m.lead && (
            <motion.p variants={revealUp} className="mt-5 max-w-2xl text-[1.05rem] leading-relaxed text-muted">
              {m.lead}
            </motion.p>
          )}
          {m.meta.length > 0 && (
            <motion.div variants={revealUp} className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
              {m.meta.map((x) => (
                <span key={x}>{x}</span>
              ))}
            </motion.div>
          )}
        </motion.header>

        <motion.div
          initial={entrance({ opacity: 0, y: 24 })}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mt-12 grid max-w-6xl items-start gap-10 lg:grid-cols-[minmax(0,1fr)_240px]"
        >
          <article className="prose-calm min-w-0 max-w-3xl" dangerouslySetInnerHTML={{ __html: body }} />

          {toc.length > 0 && (
            <aside className="hidden lg:block">
              <nav className="sticky top-28 rounded-2xl border border-hairline bg-white/70 p-5 backdrop-blur-sm">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted">On this page</div>
                <ol className="flex flex-col gap-2">
                  {toc.map((t, i) => (
                    <li key={t.href} className="flex items-start gap-2 text-[13px]">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-softlavender text-[10px] font-bold text-brand-indigo">
                        {i + 1}
                      </span>
                      <a href={t.href} className="text-muted transition-colors hover:text-ink">
                        {t.label}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>
          )}
        </motion.div>
      </div>
    </>
  );
}
