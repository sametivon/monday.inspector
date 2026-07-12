import { useEffect } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

/**
 * Two glass "inspector" panels that drift around the hero headline and
 * respond to the pointer with gentle depth parallax. Decorative — hidden
 * on small screens and from assistive tech.
 */
export default function FloatingPanels() {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18 });
  const sy = useSpring(my, { stiffness: 60, damping: 18 });
  const reduced = useReducedMotion();

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mx.set((e.clientX / window.innerWidth - 0.5) * 2);
      my.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [mx, my]);

  // different parallax depths
  const lx = useTransform(sx, (v) => v * -22);
  const ly = useTransform(sy, (v) => v * -16);
  const rx = useTransform(sx, (v) => v * 30);
  const ry = useTransform(sy, (v) => v * 20);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 hidden lg:block">
      {/* Left — import progress */}
      <motion.div
        style={{ x: lx, y: ly }}
        initial={reduced ? { opacity: 1 } : { opacity: 0, y: 40 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: [0, -12, 0] }}
        transition={{
          opacity: { duration: 1, delay: 0.7 },
          y: { duration: 9, repeat: Infinity, ease: "easeInOut" },
        }}
        className="absolute left-[3%] top-[34%] w-[280px] rotate-[-6deg]"
      >
        <div className="glass-panel rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[12.5px] font-semibold text-ink">monday_export.xlsx</div>
              <div className="text-[10.5px] text-muted">142 rows · subitems detected</div>
            </div>
            <span className="rounded-full bg-surface px-2 py-0.5 text-[9.5px] font-semibold text-brand">
              Monday export
            </span>
          </div>
          {[
            ["Status", "matched"],
            ["Assignee → People", "matched"],
            ["Due date → Timeline", "matched"],
          ].map(([a], i) => (
            <div key={i} className="flex items-center gap-2 border-t border-hairline py-1.5 text-[11px]">
              <span className="flex-1 text-muted">{a}</span>
              <span className="rounded-full bg-softmint px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600">
                matched
              </span>
            </div>
          ))}
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[10.5px]">
              <span className="font-semibold text-brand">73%</span>
              <span className="text-muted">104 / 142</span>
            </div>
            <div className="h-1.5 rounded-full bg-softblue">
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg,#3E7BFA,#6161FF)" }}
                initial={{ width: "12%" }}
                animate={{ width: ["12%", "73%", "73%"] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Right — query result */}
      <motion.div
        style={{ x: rx, y: ry }}
        initial={reduced ? { opacity: 1 } : { opacity: 0, y: 40 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: [0, 14, 0] }}
        transition={{
          opacity: { duration: 1, delay: 0.9 },
          y: { duration: 11, repeat: Infinity, ease: "easeInOut" },
        }}
        className="absolute right-[3%] top-[40%] w-[300px] rotate-[5deg]"
      >
        <div className="glass-panel rounded-2xl p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-md bg-brand px-2 py-1 text-[10px] font-semibold text-white">▶ Run</span>
            <span className="text-[10.5px] text-muted">query ListBoards</span>
            <span className="ml-auto rounded-full bg-softmint px-2 py-0.5 text-[9px] font-semibold text-emerald-600">
              88 ms
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-hairline font-mono text-[10px]">
            <div className="grid grid-cols-[52px_1fr_54px] bg-mist px-2 py-1 font-semibold uppercase tracking-wide text-muted">
              <span>id</span><span>name</span><span>items</span>
            </div>
            {[
              ["1234", "Marketing Plan", "183"],
              ["1235", "Sales Pipeline", "421"],
              ["1236", "Q1 Roadmap", "67"],
            ].map((r, i) => (
              <motion.div
                key={i}
                className="grid grid-cols-[52px_1fr_54px] border-t border-hairline px-2 py-1 text-ink"
                animate={{ backgroundColor: ["rgba(255,255,255,0)", "rgba(221,238,255,.5)", "rgba(255,255,255,0)"] }}
                transition={{ duration: 3, repeat: Infinity, delay: i * 0.6 }}
              >
                <span>{r[0]}</span><span>{r[1]}</span><span>{r[2]}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
