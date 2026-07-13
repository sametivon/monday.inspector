import { motion } from "framer-motion";
import { revealUp, stagger, inView, useEntrance } from "@/lib/motion";

const featuresRows: [string, boolean | string, boolean | string][] = [
  ["Import top-level items from CSV", true, true],
  ["Import subitems from CSV", false, true],
  ["Import parents + subitems together", false, true],
  ["Re-import a monday.com board export", "Partial", true],
  ["Bulk update items (any column)", "One at a time", true],
  ["Bulk update subitems", false, true],
  ["GraphQL query editor", false, true],
  ["Bulk-upload images from Excel", false, true],
  ["Row limits", "Plan limits", "None"],
  ["Cost", "Included in plan", "Free"],
];

function Cell({ v }: { v: boolean | string }) {
  if (v === true)
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-softmint text-emerald-600">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  if (v === false)
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-mist text-muted/70">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </span>
    );
  return <span className="text-[12.5px] font-medium text-muted">{v}</span>;
}

export default function Compare() {
  const entrance = useEntrance();
  return (
    <section id="compare" className="relative mx-auto max-w-4xl px-6 py-10">
      <motion.div
        variants={stagger(0.08)}
        initial={entrance("hidden")}
        whileInView="show"
        viewport={inView}
        className="mx-auto mb-8 max-w-2xl text-center"
      >
        <motion.span variants={revealUp} className="mb-4 inline-block rounded-full bg-white/70 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-brand">
          Compare
        </motion.span>
        <motion.h2 variants={revealUp} className="font-display text-[clamp(2rem,4vw,3rem)] font-extrabold leading-tight tracking-tightest text-ink">
          What you unlock
        </motion.h2>
      </motion.div>

      <motion.div
        initial={entrance({ opacity: 0, y: 30 })}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={inView}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="glass-panel overflow-hidden rounded-3xl"
      >
        <div className="grid grid-cols-[1fr_140px_140px] items-center border-b border-hairline bg-white/50 px-5 py-4 text-[11px] font-semibold uppercase tracking-wide text-muted sm:grid-cols-[1fr_160px_160px]">
          <span>Capability</span>
          <span className="text-center">Native</span>
          <span className="text-center text-brand">Inspector</span>
        </div>
        {featuresRows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_140px_140px] items-center border-b border-hairline px-5 py-3.5 text-[13.5px] text-ink last:border-0 transition-colors hover:bg-white/50 sm:grid-cols-[1fr_160px_160px]"
          >
            <span className="font-medium">{r[0]}</span>
            <span className="flex justify-center">
              <Cell v={r[1]} />
            </span>
            <span className="flex justify-center">
              <Cell v={r[2]} />
            </span>
          </div>
        ))}
      </motion.div>
    </section>
  );
}
