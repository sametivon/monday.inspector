import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { revealUp, stagger, useEntrance } from "@/lib/motion";

/**
 * Shared header + container for long-form pages (changelog, guides, privacy).
 * The ambient background shows through; content sits on the calm paper.
 */
export default function ArticleShell({
  badge,
  title,
  lead,
  meta,
  children,
  width = "max-w-3xl",
}: {
  badge?: string;
  title: string;
  lead?: string;
  meta?: string[];
  children: ReactNode;
  width?: string;
}) {
  const entrance = useEntrance();
  return (
    <div className="px-6 pb-24 pt-36 sm:pt-40">
      <motion.header
        variants={stagger(0.08)}
        initial={entrance("hidden")}
        animate="show"
        className={`mx-auto ${width} text-center`}
      >
        {badge && (
          <motion.span
            variants={revealUp}
            className="mb-5 inline-block rounded-full bg-white/70 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-brand backdrop-blur"
          >
            {badge}
          </motion.span>
        )}
        <motion.h1
          variants={revealUp}
          className="font-display text-[clamp(2rem,4.5vw,3.25rem)] font-extrabold leading-[1.1] tracking-tightest text-ink"
        >
          {title}
        </motion.h1>
        {lead && (
          <motion.p variants={revealUp} className="mx-auto mt-5 max-w-2xl text-[1.05rem] leading-relaxed text-muted">
            {lead}
          </motion.p>
        )}
        {meta && (
          <motion.div variants={revealUp} className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13px] text-muted">
            {meta.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </motion.div>
        )}
      </motion.header>

      <motion.main
        initial={entrance({ opacity: 0, y: 24 })}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className={`mx-auto mt-14 ${width}`}
      >
        {children}
      </motion.main>
    </div>
  );
}
