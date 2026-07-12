import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import MagneticButton from "./MagneticButton";
import FloatingPanels from "./FloatingPanels";
import { maskLine, revealUp, stagger, spring, useEntrance } from "@/lib/motion";

const headline = ["Supercharge monday.com", "with the tools it's missing"];

export default function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const entrance = useEntrance();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  // gentle parallax as the hero leaves
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section ref={ref} className="relative overflow-hidden pt-36 pb-24 sm:pt-44">
      <motion.div style={{ y, opacity }} className="relative z-10 mx-auto max-w-5xl px-6 text-center">
        <motion.div
          initial={entrance({ opacity: 0, y: 12, filter: "blur(6px)" })}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ ...spring, delay: 0.3 }}
          className="mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-hairline bg-white/60 px-3.5 py-1.5 text-[12.5px] font-medium text-muted backdrop-blur"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          Free · Open source · v1.6.4
        </motion.div>

        <motion.h1
          variants={stagger(0.12, 0.35)}
          initial={entrance("hidden")}
          animate="show"
          className="font-display text-[clamp(2.5rem,6vw,4.5rem)] font-extrabold leading-[1.05] tracking-tightest text-ink"
        >
          {headline.map((line, i) => (
            <span key={i} className="block overflow-hidden pb-[0.06em]">
              <motion.span variants={maskLine} className="block">
                {i === 1 ? (
                  <>
                    with the tools <span className="text-gradient">it&apos;s missing</span>
                  </>
                ) : (
                  line
                )}
              </motion.span>
            </span>
          ))}
        </motion.h1>

        <motion.p
          variants={revealUp}
          initial={entrance("hidden")}
          animate="show"
          transition={{ delay: 0.9 }}
          className="mx-auto mt-6 max-w-xl text-[1.05rem] leading-relaxed text-muted"
        >
          Import subitems from CSV, bulk-update hundreds of items, run GraphQL queries and
          inspect board schemas — all in a calm inline panel inside monday.com.
        </motion.p>

        <motion.div
          initial={entrance({ opacity: 0, y: 16 })}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 1.05 }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <MagneticButton href="https://chromewebstore.google.com/detail/kmmmfnkjdcmemcmjipidodnipidadaeg">
            Add to Chrome — it&apos;s free
            <span aria-hidden>→</span>
          </MagneticButton>
          <MagneticButton variant="ghost" href="#features">
            See what it does
          </MagneticButton>
        </motion.div>

        <motion.div
          initial={entrance({ opacity: 0 })}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3, duration: 1 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-muted"
        >
          {["No row limits", "No account needed", "100% privacy-first", "Open source"].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-brand">
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t}
            </span>
          ))}
        </motion.div>
      </motion.div>

      <FloatingPanels />
    </section>
  );
}
