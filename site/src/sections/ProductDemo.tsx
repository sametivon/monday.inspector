import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { revealUp, stagger, inView, useEntrance } from "@/lib/motion";

const tabs = ["Schema", "Items", "Import", "Query"];

const rows = [
  ["Marketing Plan", "Working on it", "183", "#DDEEFF"],
  ["Sales Pipeline", "Done", "421", "#EAF8F2"],
  ["Q1 Roadmap", "Stuck", "67", "#FFF2EA"],
  ["Design System", "Working on it", "112", "#DDEEFF"],
  ["Customer Research", "Done", "58", "#EAF8F2"],
];

const statusColor: Record<string, string> = {
  "Working on it": "#3E7BFA",
  Done: "#12B76A",
  Stuck: "#F04438",
};

export default function ProductDemo() {
  const entrance = useEntrance();
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [row, setRow] = useState(-1);

  // gently cycle the active tab and highlight rows, looping forever
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setActive((a) => (a + 1) % tabs.length), 3600);
    const r = setInterval(() => setRow((x) => (x + 1) % rows.length), 1100);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [reduced]);

  return (
    <section id="demo" className="relative mx-auto max-w-6xl px-6 py-24">
      <motion.div
        variants={stagger(0.08)}
        initial={entrance("hidden")}
        whileInView="show"
        viewport={inView}
        className="mx-auto mb-14 max-w-2xl text-center"
      >
        <motion.span
          variants={revealUp}
          className="mb-4 inline-block rounded-full bg-white/70 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-brand backdrop-blur"
        >
          See it in action
        </motion.span>
        <motion.h2
          variants={revealUp}
          className="font-display text-[clamp(2rem,4vw,3rem)] font-extrabold leading-tight tracking-tightest text-ink"
        >
          A calm workspace inside your board
        </motion.h2>
        <motion.p variants={revealUp} className="mt-4 text-[1.05rem] leading-relaxed text-muted">
          No new app to learn. The inspector opens right where you work — read schemas, run
          queries and import in a few gentle clicks.
        </motion.p>
      </motion.div>

      <motion.div
        initial={entrance({ opacity: 0, y: 40, scale: 0.98 })}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={inView}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="glass-panel mx-auto max-w-4xl overflow-hidden rounded-[22px]"
      >
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-hairline bg-white/60 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#FF6159]" />
          <span className="h-3 w-3 rounded-full bg-[#FFBD2E]" />
          <span className="h-3 w-3 rounded-full bg-[#28C840]" />
          <div className="ml-3 rounded-md bg-mist px-3 py-1 text-[11px] text-muted">
            monday.com / Marketing · Inspector
          </div>
        </div>

        <div className="grid grid-cols-[150px_1fr] sm:grid-cols-[180px_1fr]">
          {/* rail */}
          <div className="border-r border-hairline bg-white/40 p-3">
            {tabs.map((t, i) => (
              <button
                key={t}
                onClick={() => setActive(i)}
                className="relative mb-1 flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors"
                style={{ color: active === i ? "#17212D" : "#66758A" }}
              >
                {active === i && (
                  <motion.span
                    layoutId="demo-tab"
                    className="absolute inset-0 -z-10 rounded-lg bg-surface"
                    transition={{ type: "spring", stiffness: 300, damping: 26 }}
                  />
                )}
                {t}
              </button>
            ))}
            <div className="mt-4 rounded-lg bg-softmint/60 p-2 text-[10.5px] leading-snug text-emerald-700">
              ● Connected · 6 boards
            </div>
          </div>

          {/* table */}
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <div className="rounded-md bg-brand px-2 py-1 text-[10.5px] font-semibold text-white">
                ▶ Run
              </div>
              <span className="text-[11px] text-muted">query boards · limit 50</span>
              <span className="ml-auto rounded-full bg-softmint px-2 py-0.5 text-[9.5px] font-semibold text-emerald-600">
                88 ms
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border border-hairline">
              <div className="grid grid-cols-[1fr_120px_64px] bg-mist px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                <span>Board</span>
                <span>Status</span>
                <span>Items</span>
              </div>
              {rows.map((r, i) => (
                <motion.div
                  key={r[0]}
                  className="grid grid-cols-[1fr_120px_64px] items-center border-t border-hairline px-3 py-2.5 text-[12.5px] text-ink"
                  animate={{
                    backgroundColor: row === i ? "rgba(221,238,255,.45)" : "rgba(255,255,255,0)",
                  }}
                  transition={{ duration: 0.4 }}
                >
                  <span className="font-medium">{r[0]}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: statusColor[r[1]] }} />
                    <span className="text-muted">{r[1]}</span>
                  </span>
                  <span className="text-muted">{r[2]}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
