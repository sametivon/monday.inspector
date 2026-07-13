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
    <section className="relative mx-auto max-w-6xl px-6 py-14">
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
              className="rounded-2xl border border-hairline bg-white/70 p-6 text-center"
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

        {/* Trust grid — the facts a developer checks before installing.
            All statements mirror the store listing & manifest exactly. */}
        <motion.div
          variants={stagger(0.06)}
          initial={entrance("hidden")}
          whileInView="show"
          viewport={inView}
          className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {[
            ["Scoped to monday.com", "Runs only on monday.com pages — nowhere else. Host permission: *.monday.com."],
            ["Your token stays local", "Stored in your browser's extension storage; sent only to api.monday.com over HTTPS."],
            ["Minimal permissions", "storage and activeTab. No tabs, no history, no <all_urls>."],
            ["Local-first processing", "CSV / Excel parsing happens in-browser. No servers of ours in the path."],
            ["Official API only", "Every call is a standard monday.com GraphQL request you could make yourself."],
            ["Open source (MIT)", "The full source is on GitHub — audit exactly what runs."],
          ].map(([t, d]) => (
            <motion.div
              key={t}
              variants={scaleIn}
              className="flex items-start gap-3 rounded-2xl border border-hairline bg-white/70 p-5"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface text-brand">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="text-[13px] leading-snug">
                <strong className="block font-semibold text-ink">{t}</strong>
                <span className="text-muted">{d}</span>
              </span>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
