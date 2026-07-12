import { motion } from "framer-motion";
import MagneticButton from "@/components/MagneticButton";
import { inView, useEntrance } from "@/lib/motion";

/* Honest pricing: the product is free and open source. No invented tiers. */

const included = [
  "Every feature — importer, GraphQL, bulk update, exports",
  "No row limits, no seats, no accounts",
  "Open source (MIT) — audit the code yourself",
  "Your API token never leaves your browser",
];

export default function Pricing() {
  const entrance = useEntrance();
  return (
    <section id="pricing" className="relative mx-auto max-w-3xl px-6 py-24">
      <motion.div
        initial={entrance({ opacity: 0, y: 30 })}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={inView}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="glass-panel relative overflow-hidden rounded-[28px] p-10 text-center sm:p-12"
      >
        <span className="mb-4 inline-block rounded-full bg-softmint px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-emerald-600">
          Pricing
        </span>
        <div className="font-display text-[clamp(3rem,8vw,4.5rem)] font-extrabold leading-none tracking-tightest text-ink">
          Free
        </div>
        <p className="mx-auto mt-3 max-w-md text-[1.02rem] leading-relaxed text-muted">
          No tiers. No trials. No credit card. Built by a monday.com Platinum Partner and
          given to the community.
        </p>
        <ul className="mx-auto mt-7 flex max-w-md flex-col gap-2.5 text-left">
          {included.map((x) => (
            <li key={x} className="flex items-start gap-2.5 text-[14px] text-muted">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-softmint text-emerald-600">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              {x}
            </li>
          ))}
        </ul>
        <div className="mt-9 flex justify-center">
          <MagneticButton href="https://chromewebstore.google.com/detail/kmmmfnkjdcmemcmjipidodnipidadaeg">
            Add to Chrome — free forever <span aria-hidden>→</span>
          </MagneticButton>
        </div>
      </motion.div>
    </section>
  );
}
