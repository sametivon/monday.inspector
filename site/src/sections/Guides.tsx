import { motion } from "framer-motion";
import { revealUp, scaleIn, stagger, inView, useEntrance } from "@/lib/motion";

const guides = [
  { icon: "📥", t: "Import Subitems in monday.com", d: "The complete guide — CSV format, mapping, multi-level boards, live progress.", href: "/import-subitems-monday" },
  { icon: "📄", t: "monday.com CSV Import Guide", d: "How to format your CSV and the 18 supported column types.", href: "/monday-csv-import-guide" },
  { icon: "⚡", t: "Bulk Update Items", d: "Update hundreds of items at once — statuses, assignees, dates.", href: "/monday-bulk-update" },
  { icon: "🔍", t: "GraphQL API + 14 Templates", d: "Run real queries without code — multi-level boards, complexity budget.", href: "/monday-graphql-query-guide" },
  { icon: "🖼️", t: "Import Images from Excel", d: "Drop an .xlsx, get every embedded image into a File column.", href: "/monday-import-images-from-excel" },
  { icon: "🗒️", t: "Changelog & release notes", d: "Everything new — newest releases first.", href: "/changelog" },
];

export default function Guides() {
  const entrance = useEntrance();
  return (
    <section id="guides" className="relative mx-auto max-w-6xl px-6 py-24">
      <motion.div
        variants={stagger(0.08)}
        initial={entrance("hidden")}
        whileInView="show"
        viewport={inView}
        className="mx-auto mb-14 max-w-2xl text-center"
      >
        <motion.span variants={revealUp} className="mb-4 inline-block rounded-full bg-white/70 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-brand backdrop-blur">
          Guides
        </motion.span>
        <motion.h2 variants={revealUp} className="font-display text-[clamp(2rem,4vw,3rem)] font-extrabold leading-tight tracking-tightest text-ink">
          Learn every feature
        </motion.h2>
      </motion.div>

      <motion.div
        variants={stagger(0.07)}
        initial={entrance("hidden")}
        whileInView="show"
        viewport={inView}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {guides.map((g) => (
          <motion.a
            key={g.t}
            href={g.href}
            variants={scaleIn}
            whileHover={{ y: -6 }}
            transition={{ type: "spring", stiffness: 220, damping: 20 }}
            className="group flex items-start gap-4 rounded-3xl border border-hairline bg-white/70 p-6 shadow-soft backdrop-blur-sm"
          >
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface text-xl transition-transform group-hover:scale-110">
              {g.icon}
            </span>
            <span>
              <span className="font-display text-[15px] font-bold text-ink">{g.t}</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-muted">{g.d}</span>
              <span className="mt-2 inline-block text-[12.5px] font-semibold text-brand">
                Read guide →
              </span>
            </span>
          </motion.a>
        ))}
      </motion.div>
    </section>
  );
}
