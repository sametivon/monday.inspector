import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

/* ─────────────────────────────────────────────────────────────────────
   Hero product showcase: three floating "DevTools" panels running a
   continuous, subtle demonstration loop —
     GraphQL runs → response streams in → schema row highlights →
     column id copied → export progresses → success toast → repeat.
   Pointer adds gentle depth parallax. Under reduced motion the loop is
   frozen at a fully-populated state (no timers, everything visible).
   ───────────────────────────────────────────────────────────────────── */

const PHASES = 8;
const STEP_MS = 1400;

export default function DevHeroPanels() {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  // Pause the loop (and its re-renders) whenever the hero is off-screen.
  const onScreen = useInView(rootRef, { amount: 0.15 });
  // Reduced motion: park on a “everything visible” phase and never tick.
  const [phase, setPhase] = useState(reduced ? 5 : 0);

  useEffect(() => {
    if (reduced || !onScreen) return;
    const t = setInterval(() => setPhase((p) => (p + 1) % PHASES), STEP_MS);
    return () => clearInterval(t);
  }, [reduced, onScreen]);

  // pointer parallax
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 55, damping: 18 });
  const sy = useSpring(my, { stiffness: 55, damping: 18 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mx.set((e.clientX / window.innerWidth - 0.5) * 2);
      my.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [mx, my]);
  const lx = useTransform(sx, (v) => v * -20);
  const ly = useTransform(sy, (v) => v * -14);
  const rx = useTransform(sx, (v) => v * 26);
  const ry = useTransform(sy, (v) => v * 18);

  const responseVisible = reduced || phase >= 1;
  const highlightRow = phase >= 2 ? (phase >= 5 ? 1 : 2) : -1;
  const copied = reduced || phase === 3 || phase === 4;
  const exporting = !reduced && (phase === 5 || phase === 6);
  const exported = reduced || phase === 7;

  return (
    <div ref={rootRef} aria-hidden className="pointer-events-none absolute inset-0 z-0 hidden lg:block">
      {/* ── Left: Board / schema explorer ─────────────────────────── */}
      <motion.div
        style={{ x: lx, y: ly }}
        initial={reduced ? { opacity: 1 } : { opacity: 0, y: 40 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: [0, -10, 0] }}
        transition={{
          opacity: { duration: 1, delay: 0.7 },
          y: { duration: 9, repeat: Infinity, ease: "easeInOut" },
        }}
        className="absolute left-[2.5%] top-[30%] w-[292px] rotate-[-5deg]"
      >
        <div className="glass-panel overflow-hidden rounded-2xl">
          <div className="flex items-center gap-2 border-b border-hairline bg-white/60 px-3.5 py-2.5">
            <span className="h-2 w-2 rounded-full bg-brand" />
            <span className="text-[11px] font-semibold text-ink">Board Explorer</span>
            <span className="ml-auto rounded-full bg-mist px-2 py-0.5 font-mono text-[9px] text-muted">
              board 5098431200
            </span>
          </div>
          <div className="p-3 font-mono text-[10.5px] leading-relaxed">
            <div className="text-muted">▾ Marketing Plan</div>
            {[
              ["status", "status", "color"],
              ["person", "people", "multiple-person"],
              ["date4", "date", "date"],
              ["timeline", "timerange", "timeline"],
            ].map(([id, type], i) => (
              <motion.div
                key={id}
                className="ml-3 flex items-center gap-2 rounded-md px-1.5 py-[3px]"
                animate={{
                  backgroundColor:
                    highlightRow === i ? "rgba(221,238,255,.65)" : "rgba(255,255,255,0)",
                }}
                transition={{ duration: 0.35 }}
              >
                <span className="text-brand-indigo">{id}</span>
                <span className="text-muted/70">·</span>
                <span className="text-muted">{type}</span>
                {i === 1 && (
                  <motion.span
                    className="ml-auto rounded px-1.5 py-px text-[9px] font-semibold"
                    animate={
                      copied
                        ? { backgroundColor: "rgba(234,248,242,1)", color: "#0f9e64" }
                        : { backgroundColor: "rgba(244,247,251,1)", color: "#66758A" }
                    }
                    transition={{ duration: 0.3 }}
                  >
                    {copied ? "✓ copied" : "copy id"}
                  </motion.span>
                )}
              </motion.div>
            ))}
            <div className="ml-3 text-muted/60">▸ subitems (4 columns)</div>
          </div>
        </div>
      </motion.div>

      {/* ── Right: GraphQL explorer ───────────────────────────────── */}
      <motion.div
        style={{ x: rx, y: ry }}
        initial={reduced ? { opacity: 1 } : { opacity: 0, y: 40 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: [0, 12, 0] }}
        transition={{
          opacity: { duration: 1, delay: 0.9 },
          y: { duration: 11, repeat: Infinity, ease: "easeInOut" },
        }}
        className="absolute right-[2.5%] top-[26%] w-[318px] rotate-[4.5deg]"
      >
        <div className="glass-panel overflow-hidden rounded-2xl">
          <div className="flex items-center gap-2 border-b border-hairline bg-white/60 px-3.5 py-2.5">
            <motion.span
              className="rounded-md px-2 py-0.5 text-[10px] font-semibold text-white"
              style={{ background: "linear-gradient(120deg,#3E7BFA,#6161FF)" }}
              animate={!reduced && phase === 0 ? { scale: [1, 0.94, 1] } : { scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              ▶ Run
            </motion.span>
            <span className="text-[11px] font-semibold text-ink">GraphQL Explorer</span>
            <AnimatePresence>
              {responseVisible && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="ml-auto rounded-full bg-softmint px-2 py-0.5 text-[9px] font-semibold text-emerald-600"
                >
                  200 · 88 ms
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="border-b border-hairline p-3 font-mono text-[10.5px] leading-relaxed">
            <div>
              <span className="text-brand-indigo">query</span>{" "}
              <span className="text-ink">Board</span>
              <span className="text-muted">(</span>
              <span className="text-amber-600">$id</span>
              <span className="text-muted">: ID!) {"{"}</span>
            </div>
            <div className="ml-3">
              <span className="text-brand">boards</span>
              <span className="text-muted">(ids: [</span>
              <span className="text-amber-600">$id</span>
              <span className="text-muted">]) {"{"}</span>
            </div>
            <div className="ml-6 text-brand">
              id name <span className="text-brand">items_count</span>
            </div>
            <div className="ml-6">
              <span className="text-brand">columns</span>
              <span className="text-muted"> {"{"} </span>
              <span className="text-brand">id type</span>
              <span className="text-muted"> {"}"}</span>
            </div>
            <div className="ml-3 text-muted">{"}"}</div>
            <div className="text-muted">{"}"}</div>
          </div>
          <div className="bg-white/40 p-3 font-mono text-[10.5px] leading-relaxed">
            {[
              <>
                <span className="text-muted">{"{"} </span>
                <span className="text-brand">"name"</span>
                <span className="text-muted">: </span>
                <span className="text-emerald-600">"Marketing Plan"</span>
                <span className="text-muted">,</span>
              </>,
              <>
                <span className="ml-3 text-brand">"items_count"</span>
                <span className="text-muted">: </span>
                <span className="text-amber-600">183</span>
                <span className="text-muted">,</span>
              </>,
              <>
                <span className="ml-3 text-brand">"columns"</span>
                <span className="text-muted">: [ </span>
                <span className="text-emerald-600">…14 items</span>
                <span className="text-muted"> ] {"}"}</span>
              </>,
            ].map((line, i) => (
              <motion.div
                key={i}
                initial={false}
                animate={
                  responseVisible
                    ? { opacity: 1, x: 0 }
                    : { opacity: 0, x: -6 }
                }
                transition={{ duration: 0.35, delay: reduced ? 0 : i * 0.16 }}
              >
                {line}
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Bottom: export toast ──────────────────────────────────── */}
      <div className="absolute bottom-[6%] right-[13%] w-[240px]">
        <AnimatePresence mode="wait">
          {(exporting || exported) && (
            <motion.div
              key={exported ? "done" : "run"}
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="glass-panel rounded-xl p-3"
            >
              {exported ? (
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-softmint text-emerald-600">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div>
                    <div className="text-[11.5px] font-semibold text-ink">Export complete</div>
                    <div className="font-mono text-[10px] text-muted">421 rows → board-export.csv</div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-1.5 flex justify-between text-[10.5px]">
                    <span className="font-semibold text-ink">Exporting board…</span>
                    <span className="font-mono text-muted">CSV</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-softblue">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: "linear-gradient(90deg,#3E7BFA,#6161FF)" }}
                      initial={{ width: "8%" }}
                      animate={{ width: "96%" }}
                      transition={{ duration: STEP_MS * 2 / 1000, ease: "easeInOut" }}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
