import { Head } from "vite-react-ssg";
import ArticleShell from "@/components/ArticleShell";

type Release = {
  v: string;
  date: string;
  latest?: boolean;
  tagline: string;
  body?: React.ReactNode;
};

const releases: Release[] = [
  {
    v: "1.6.4",
    date: "July 2026",
    latest: true,
    tagline: "Correct import dates — and import errors you can actually see.",
    body: (
      <>
        <h3>Dates now import on the right day</h3>
        <ul>
          <li>
            <strong>UK day/month is now the default for ambiguous dates.</strong> monday.com's
            Export to Excel writes dates as <code>D/M/YYYY</code>, so <code>03/04</code> imports
            as 3 April, not 4 March.
          </li>
          <li>
            <strong>Excel date serials import unambiguously</strong> — converted straight to ISO
            <code>YYYY-MM-DD</code>.
          </li>
        </ul>
        <h3>Import errors stay visible</h3>
        <ul>
          <li>The failure list is always on screen — live during the run and after — with a copy-all button.</li>
          <li>Rows with no message from monday now say so, instead of showing an empty cell.</li>
        </ul>
        <h3>Smarter export re-imports</h3>
        <ul>
          <li>
            <strong>Missing groups are auto-created</strong> on the target board (in source
            order), so items land in the right group instead of the default one.
          </li>
          <li>
            <strong>monday's 2026 export format is handled</strong> — the marketing cells monday
            now embeds in board/group rows no longer confuse the parser or collapse groups.
          </li>
        </ul>
      </>
    ),
  },
  {
    v: "1.6.3",
    date: "June 2026",
    tagline: "More reliable imports — the Importer focuses on native, column-level data.",
    body: (
      <p>
        Connection columns (Connect Boards / Dependency) and computed columns (mirror, formula,
        lookup) are excluded from import — their values point at items on other boards or are
        computed by monday, so they can't be reliably recreated on a fresh board.
      </p>
    ),
  },
  { v: "1.6.2", date: "May 2026", tagline: "Smart import error recovery — names failing columns and offers one-click skip & re-run." },
  { v: "1.6.0", date: "April 2026", tagline: "Excel Image Importer — bulk-upload images from an .xlsx into a File column." },
  { v: "1.5.x", date: "2026", tagline: "GraphQL Query Inspector, multi-level boards & more column types." },
];

export default function Changelog() {
  return (
    <>
      <Head>
        <title>Changelog & Release Notes — Monday.com Inspector</title>
        <meta name="description" content="What's new in Monday.com Inspector. v1.6.4 fixes import date handling and keeps the import error list always visible — plus the full version history." />
        <link rel="canonical" href="https://mondayinspector.eu/changelog.html" />
      </Head>
      <ArticleShell
        badge="Release notes"
        title="Changelog & release notes"
        lead="Every notable change to Monday.com Inspector — the free Chrome & Firefox extension for importing, bulk-updating and querying monday.com boards."
        meta={["Updated July 2026", "Sam @ shift-tab lab", "Current version: v1.6.5"]}
      >
        <div className="flex flex-col gap-4">
          {releases.map((r) => (
            <div
              key={r.v}
              className={`rounded-3xl border border-hairline p-7 ${
                r.latest ? "glass-panel" : "bg-white/75"
              }`}
            >
              <div className="mb-1 flex flex-wrap items-center gap-3">
                <h2 className="!mt-0 !mb-0 font-display text-[1.4rem] font-extrabold text-ink">v{r.v}</h2>
                {r.latest && (
                  <span className="rounded-full bg-softmint px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">
                    Latest
                  </span>
                )}
                <span className="text-[13px] text-muted">{r.date}</span>
              </div>
              <p className="mb-2 text-[1.02rem] font-semibold text-ink/90">{r.tagline}</p>
              {r.body && <div className="prose-calm">{r.body}</div>}
            </div>
          ))}
        </div>
      </ArticleShell>
    </>
  );
}
