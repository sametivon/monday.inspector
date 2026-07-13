import { motion } from "framer-motion";
import { revealUp, scaleIn, stagger, inView, useEntrance } from "@/lib/motion";

/* Developer workflows — how real teams use the tool. Each card reads like a
   short, precise runbook rather than marketing copy. */

const workflows = [
  {
    tag: "Migration",
    title: "Move a workspace in",
    steps: [
      "Export the source tool to CSV / Excel",
      "Drop it on the Importer — subitems included",
      "Auto-map 18+ column types, fix the stragglers",
      "Watch per-row progress; failures stay visible",
    ],
    mono: "142/142 rows ✓ · 0 dropped",
  },
  {
    tag: "Integration",
    title: "Debug an API workflow",
    steps: [
      "Open the GraphQL Explorer on the live board",
      "Run a template or paste your integration's query",
      "Inspect the exact response monday returns",
      "Copy column ids & types straight into your code",
    ],
    mono: "200 OK · 88 ms · complexity 4 820",
  },
  {
    tag: "Administration",
    title: "Audit & bulk-fix boards",
    steps: [
      "X-ray the schema — every column, id and setting",
      "Find misconfigured columns across groups",
      "Bulk-update hundreds of items in one action",
      "Export the board as CSV / JSON for the record",
    ],
    mono: "board 5098431200 → audit.csv",
  },
];

export default function Workflows() {
  const entrance = useEntrance();
  return (
    <section id="workflows" className="relative mx-auto max-w-6xl px-6 py-14">
      <motion.div
        variants={stagger(0.08)}
        initial={entrance("hidden")}
        whileInView="show"
        viewport={inView}
        className="mx-auto mb-10 max-w-2xl text-center"
      >
        <motion.span
          variants={revealUp}
          className="mb-4 inline-block rounded-full bg-white/70 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-brand"
        >
          Developer workflows
        </motion.span>
        <motion.h2
          variants={revealUp}
          className="font-display text-[clamp(2rem,4vw,3rem)] font-extrabold leading-tight tracking-tightest text-ink"
        >
          How teams use Inspector
        </motion.h2>
        <motion.p variants={revealUp} className="mt-4 text-[1.05rem] leading-relaxed text-muted">
          Consultants, admins and developers — the same three jobs, done in minutes.
        </motion.p>
      </motion.div>

      <motion.div
        variants={stagger(0.1)}
        initial={entrance("hidden")}
        whileInView="show"
        viewport={inView}
        className="grid gap-5 lg:grid-cols-3"
      >
        {workflows.map((w) => (
          <motion.div
            key={w.title}
            variants={scaleIn}
            whileHover={{ y: -6 }}
            transition={{ type: "spring", stiffness: 220, damping: 20 }}
            className="flex flex-col rounded-3xl border border-hairline bg-white/70 p-6 shadow-soft"
          >
            <span className="mb-3 inline-flex w-fit rounded-full bg-softlavender px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-brand-indigo">
              {w.tag}
            </span>
            <h3 className="font-display text-[1.1rem] font-bold text-ink">{w.title}</h3>
            <ol className="mt-4 flex flex-col gap-2.5">
              {w.steps.map((s, i) => (
                <li key={s} className="flex items-start gap-2.5 text-[13.5px] leading-snug text-muted">
                  <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface font-mono text-[10px] font-bold text-brand">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
            <div className="mt-5 rounded-lg border border-hairline bg-mist/80 px-3 py-2 font-mono text-[11px] text-muted">
              {w.mono}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
