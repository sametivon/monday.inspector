import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { revealUp, stagger, inView, useEntrance } from "@/lib/motion";

/* ─────────────────────────────────────────────────────────────────────
   "See it in action": a scripted, continuously-looping walkthrough —
     type a search → results filter → select a board → its JSON detail
     streams in → copy the id → export runs → success toast → repeat.
   The visitor should understand the product without reading anything.
   Reduced motion: frozen at the fully-populated state, no timers.
   ───────────────────────────────────────────────────────────────────── */

const QUERY = "market";
const BOARDS = [
  { name: "Marketing Plan", items: 183, match: true },
  { name: "Market Research", items: 58, match: true },
  { name: "Sales Pipeline", items: 421, match: false },
  { name: "Q1 Roadmap", items: 67, match: false },
  { name: "Design System", items: 112, match: false },
];

// phase: 0 idle · 1-6 typing · 7 filtered · 8 selected · 9 json · 10 copied · 11 export · 12 done
const LAST_PHASE = 13;

export default function ProductDemo() {
  const entrance = useEntrance();
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  // Run the loop only while the section is actually on screen.
  const onScreen = useInView(sectionRef, { amount: 0.2 });
  const [phase, setPhase] = useState(reduced ? 10 : 0);

  useEffect(() => {
    if (reduced || !onScreen) return;
    // Typing phases tick fast; inspect/export phases linger.
    const t = setInterval(() => setPhase((p) => (p + 1) % LAST_PHASE), 1150);
    return () => clearInterval(t);
  }, [reduced, onScreen]);

  const typed = reduced ? QUERY : QUERY.slice(0, Math.max(0, Math.min(phase, 6)));
  const filtered = reduced || phase >= 7;
  const selected = reduced || phase >= 8;
  const jsonVisible = reduced || phase >= 9;
  const copied = reduced || phase === 10 || phase === 11;
  const exporting = !reduced && phase === 11;
  const exportDone = !reduced && phase === 12;

  const rows = filtered ? BOARDS.filter((b) => b.match) : BOARDS;

  return (
    <section ref={sectionRef} id="demo" className="relative mx-auto max-w-6xl px-6 py-14">
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
          See it in action
        </motion.span>
        <motion.h2
          variants={revealUp}
          className="font-display text-[clamp(2rem,4vw,3rem)] font-extrabold leading-tight tracking-tightest text-ink"
        >
          Search. Inspect. Copy. Export.
        </motion.h2>
        <motion.p variants={revealUp} className="mt-4 text-[1.05rem] leading-relaxed text-muted">
          The whole workflow, right inside monday.com — watch it run.
        </motion.p>
      </motion.div>

      <motion.div
        initial={entrance({ opacity: 0, y: 40, scale: 0.98 })}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={inView}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="glass-panel relative mx-auto max-w-4xl overflow-hidden rounded-[22px]"
      >
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-hairline bg-white/60 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#FF6159]" />
          <span className="h-3 w-3 rounded-full bg-[#FFBD2E]" />
          <span className="h-3 w-3 rounded-full bg-[#28C840]" />
          <div className="ml-3 rounded-md bg-mist px-3 py-1 font-mono text-[11px] text-muted">
            monday.com › Inspector
          </div>
        </div>

        <div className="grid sm:grid-cols-[7fr_6fr]">
          {/* boards + search */}
          <div className="border-r border-hairline p-4">
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-hairline bg-white/70 px-3 py-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-muted">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.4" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
              <span className="font-mono text-[12.5px] text-ink">
                {typed}
                {!reduced && <span className="animate-pulse text-brand">▍</span>}
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border border-hairline">
              <div className="grid grid-cols-[1fr_56px] bg-mist px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                <span>Board</span>
                <span className="text-right">Items</span>
              </div>
              <AnimatePresence initial={false}>
                {rows.map((b) => {
                  const isSel = selected && b.name === "Marketing Plan";
                  return (
                    <motion.div
                      key={b.name}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{
                        opacity: 1,
                        height: "auto",
                        backgroundColor: isSel ? "rgba(221,238,255,.55)" : "rgba(255,255,255,0)",
                      }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className="grid grid-cols-[1fr_56px] items-center border-t border-hairline px-3 text-[12.5px]"
                    >
                      <span className={`py-2 font-medium ${isSel ? "text-brand" : "text-ink"}`}>
                        {b.name}
                        {isSel && (
                          <span className="ml-2 rounded-full bg-brand px-1.5 py-px text-[8.5px] font-bold text-white">
                            selected
                          </span>
                        )}
                      </span>
                      <span className="py-2 text-right font-mono text-[11px] text-muted">{b.items}</span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* JSON detail */}
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] font-semibold text-ink">Board detail</span>
              <motion.span
                className="ml-auto rounded-md px-2 py-0.5 font-mono text-[9.5px] font-semibold"
                animate={
                  copied
                    ? { backgroundColor: "rgba(234,248,242,1)", color: "#0f9e64" }
                    : { backgroundColor: "rgba(244,247,251,1)", color: "#66758A" }
                }
              >
                {copied ? "✓ id copied" : "copy id"}
              </motion.span>
            </div>
            <div className="min-h-[168px] rounded-xl border border-hairline bg-[#101725] p-3.5 font-mono text-[11px] leading-[1.75]">
              {jsonVisible ? (
                [
                  <span key="0"><span className="text-white/50">{"{"}</span></span>,
                  <span key="1" className="ml-3 block"><span className="text-sky-300">"id"</span><span className="text-white/50">: </span><span className="text-amber-300">5098431200</span><span className="text-white/50">,</span></span>,
                  <span key="2" className="ml-3 block"><span className="text-sky-300">"name"</span><span className="text-white/50">: </span><span className="text-emerald-300">"Marketing Plan"</span><span className="text-white/50">,</span></span>,
                  <span key="3" className="ml-3 block"><span className="text-sky-300">"groups"</span><span className="text-white/50">: [</span><span className="text-emerald-300">"Q1"</span><span className="text-white/50">, </span><span className="text-emerald-300">"Q2"</span><span className="text-white/50">, </span><span className="text-emerald-300">"Backlog"</span><span className="text-white/50">],</span></span>,
                  <span key="4" className="ml-3 block"><span className="text-sky-300">"columns"</span><span className="text-white/50">: </span><span className="text-violet-300">14</span><span className="text-white/50">,</span></span>,
                  <span key="5" className="ml-3 block"><span className="text-sky-300">"subitem_board"</span><span className="text-white/50">: </span><span className="text-amber-300">5098431217</span></span>,
                  <span key="6"><span className="text-white/50">{"}"}</span></span>,
                ].map((line, i) => (
                  <motion.div
                    key={i}
                    initial={reduced ? false : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: reduced ? 0 : i * 0.1 }}
                  >
                    {line}
                  </motion.div>
                ))
              ) : (
                <span className="text-white/30">// select a board to inspect…</span>
              )}
            </div>
          </div>
        </div>

        {/* export toast */}
        <AnimatePresence>
          {(exporting || exportDone) && (
            <motion.div
              key={exportDone ? "done" : "run"}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="glass absolute bottom-4 right-4 w-[230px] rounded-xl p-3"
            >
              {exportDone ? (
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-softmint text-emerald-600">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div>
                    <div className="text-[11.5px] font-semibold text-ink">Export complete</div>
                    <div className="font-mono text-[10px] text-muted">183 rows → CSV</div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-1.5 flex justify-between text-[10.5px]">
                    <span className="font-semibold text-ink">Exporting…</span>
                    <span className="font-mono text-muted">CSV</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-softblue">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: "linear-gradient(90deg,#3E7BFA,#6161FF)" }}
                      initial={{ width: "10%" }}
                      animate={{ width: "95%" }}
                      transition={{ duration: 1.1, ease: "easeInOut" }}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
