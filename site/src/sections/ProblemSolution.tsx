import { motion } from "framer-motion";
import { revealUp, scaleIn, stagger, inView, useEntrance } from "@/lib/motion";

/* Problem → Solution narrative. The "problem" side deliberately looks like
   raw, awkward reality (mono, flat, cramped); the "solution" side looks like
   the product (structured, calm, precise). */

const problems = [
  "Native import silently drops every subitem",
  "No way to see column ids & types without the API",
  "Bulk edits mean hundreds of hand-clicks",
  "Debugging an integration = blind cURL requests",
  "Dates flip between D/M and M/D on the way in",
];

const solutions = [
  ["Schema X-ray", "every column, id, type & setting — one click to copy"],
  ["Real GraphQL workspace", "templates, saved queries, table + JSON results"],
  ["Bulk import & update", "items and subitems together, no row limits"],
  ["Deterministic data handling", "ISO dates, visible per-row errors, retries"],
];

export default function ProblemSolution() {
  const entrance = useEntrance();
  return (
    <section className="relative mx-auto max-w-6xl px-6 py-24">
      <motion.div
        variants={stagger(0.08)}
        initial={entrance("hidden")}
        whileInView="show"
        viewport={inView}
        className="mx-auto mb-14 max-w-2xl text-center"
      >
        <motion.h2
          variants={revealUp}
          className="font-display text-[clamp(2rem,4vw,3rem)] font-extrabold leading-tight tracking-tightest text-ink"
        >
          monday.com hides its internals.
          <br />
          <span className="text-gradient">Your work lives in them.</span>
        </motion.h2>
        <motion.p variants={revealUp} className="mt-4 text-[1.05rem] leading-relaxed text-muted">
          Admins, consultants and developers spend hours fighting the UI for things the
          platform knows perfectly well. Inspector surfaces them.
        </motion.p>
      </motion.div>

      <motion.div
        variants={stagger(0.12)}
        initial={entrance("hidden")}
        whileInView="show"
        viewport={inView}
        className="grid items-stretch gap-5 lg:grid-cols-2"
      >
        {/* problem */}
        <motion.div
          variants={scaleIn}
          className="rounded-3xl border border-hairline bg-mist/70 p-7 backdrop-blur-sm"
        >
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Without Inspector
            </span>
          </div>
          <ul className="flex flex-col gap-3 font-mono text-[13px] leading-relaxed text-muted">
            {problems.map((p) => (
              <li key={p} className="flex items-start gap-2.5">
                <span className="mt-[3px] text-red-400">✕</span>
                {p}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* solution */}
        <motion.div
          variants={scaleIn}
          className="glass-panel rounded-3xl p-7"
        >
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-brand">
              With Inspector
            </span>
          </div>
          <ul className="flex flex-col gap-3.5">
            {solutions.map(([t, d]) => (
              <li key={t} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-softmint text-emerald-600">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="text-[14px] leading-snug">
                  <strong className="font-semibold text-ink">{t}</strong>
                  <span className="text-muted"> — {d}</span>
                </span>
              </li>
            ))}
          </ul>
        </motion.div>
      </motion.div>
    </section>
  );
}
