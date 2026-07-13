import { motion } from "framer-motion";
import { revealUp, scaleIn, stagger, inView, useEntrance } from "@/lib/motion";

const steps = [
  { n: "01", t: "Install & open your board", d: "Add the extension, open any monday.com board, and launch the inspector panel — right where you work." },
  { n: "02", t: "Drop your CSV or Excel", d: "Board exports are auto-detected and parsed — groups, parents and indented subitems included." },
  { n: "03", t: "Map columns in a glance", d: "Smart matching lines file headers up to board columns. Nudge anything that doesn't fit." },
  { n: "04", t: "Import & watch it flow", d: "A live progress view with ETA and per-row status. Any failures stay visible so nothing hides." },
];

export default function HowItWorks() {
  const entrance = useEntrance();
  return (
    <section id="how" className="relative mx-auto max-w-6xl px-6 py-14">
      <motion.div
        variants={stagger(0.08)}
        initial={entrance("hidden")}
        whileInView="show"
        viewport={inView}
        className="mx-auto mb-10 max-w-2xl text-center"
      >
        <motion.span variants={revealUp} className="mb-4 inline-block rounded-full bg-white/70 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-brand">
          How it works
        </motion.span>
        <motion.h2 variants={revealUp} className="font-display text-[clamp(2rem,4vw,3rem)] font-extrabold leading-tight tracking-tightest text-ink">
          From spreadsheet to subitems in four gentle steps
        </motion.h2>
      </motion.div>

      <motion.div
        variants={stagger(0.1)}
        initial={entrance("hidden")}
        whileInView="show"
        viewport={inView}
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
      >
        {steps.map((s) => (
          <motion.div
            key={s.n}
            variants={scaleIn}
            whileHover={{ y: -6 }}
            transition={{ type: "spring", stiffness: 220, damping: 20 }}
            className="rounded-3xl border border-hairline bg-white/70 p-6 shadow-soft"
          >
            <div
              className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl text-[15px] font-bold text-white"
              style={{ background: "linear-gradient(135deg,#3E7BFA,#6161FF)" }}
            >
              {s.n}
            </div>
            <h3 className="font-display text-[1.02rem] font-bold text-ink">{s.t}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{s.d}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
