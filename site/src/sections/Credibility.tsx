import { motion } from "framer-motion";
import { revealUp, scaleIn, stagger, inView, useEntrance } from "@/lib/motion";

const stats = [
  { k: "Platinum", l: "monday.com Partner" },
  { k: "500+", l: "implementations delivered" },
  { k: "0", l: "servers see your data" },
  { k: "Free", l: "open source, forever" },
];

export default function Credibility() {
  const entrance = useEntrance();
  return (
    <section className="relative mx-auto max-w-6xl px-6 py-24">
      <motion.div
        initial={entrance({ opacity: 0, y: 30 })}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={inView}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-[28px] border border-hairline p-10 sm:p-14"
        style={{
          background:
            "radial-gradient(70% 120% at 20% 0%, #EEF6FF 0%, transparent 55%)," +
            "radial-gradient(60% 120% at 90% 100%, #F3EEFF 0%, transparent 55%), #FFFFFF",
        }}
      >
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-[clamp(1.75rem,3.5vw,2.6rem)] font-extrabold leading-tight tracking-tightest text-ink">
            Built by people who live in monday.com
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[1.02rem] leading-relaxed text-muted">
            Crafted by{" "}
            <a href="https://www.fruitionservices.io" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand">
              Fruition Services
            </a>{" "}
            — a Platinum monday.com Partner. Your API token never leaves your browser; nothing
            passes through a server we control.
          </p>
        </div>

        <motion.div
          variants={stagger(0.08)}
          initial={entrance("hidden")}
          whileInView="show"
          viewport={inView}
          className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4"
        >
          {stats.map((s) => (
            <motion.div
              key={s.l}
              variants={scaleIn}
              className="rounded-2xl border border-hairline bg-white/70 p-6 text-center backdrop-blur-sm"
            >
              <div
                className="font-display text-[1.9rem] font-extrabold tracking-tight"
                style={{
                  background: "linear-gradient(135deg,#3E7BFA,#6161FF)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {s.k}
              </div>
              <div className="mt-1 text-[12.5px] text-muted">{s.l}</div>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
