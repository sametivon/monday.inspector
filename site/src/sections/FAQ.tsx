import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { revealUp, stagger, inView, useEntrance } from "@/lib/motion";

const faqs = [
  ["Can monday.com import subitems natively?", "No — monday.com's built-in CSV import only creates top-level items. Monday.com Inspector was built specifically to import parents and subitems together from one file."],
  ["Is it really free? Any row limits?", "Completely free, open source, no account, no row limits. Your API token stays in your browser — nothing routes through a server we control."],
  ["Does it work with monday.com board exports?", "Yes. It auto-detects monday's native XLSX export and preserves the full hierarchy: groups, parent items, subitems and all column values."],
  ["What column types can I import?", "All 18 writable column types — text, status, people, date, timeline, dropdown and more. Computed and connection columns (mirror, formula, Connect Boards) are filtered out because their values can't be reliably recreated."],
  ["Can I run GraphQL queries?", "Yes — the Query Inspector is a full-page GraphQL workspace with 14 templates, a saved-query library, table + JSON results and a complexity meter. No coding required."],
];

function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      variants={revealUp}
      className="overflow-hidden rounded-2xl border border-hairline bg-white/70 backdrop-blur-sm"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="font-display text-[15px] font-semibold text-ink">{q}</span>
        <motion.span animate={{ rotate: open ? 45 : 0 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} className="text-xl leading-none text-brand">
          +
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="px-6 pb-5 text-[14px] leading-relaxed text-muted">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function FAQ() {
  const entrance = useEntrance();
  return (
    <section id="faq" className="relative mx-auto max-w-3xl px-6 py-24">
      <motion.div
        variants={stagger(0.08)}
        initial={entrance("hidden")}
        whileInView="show"
        viewport={inView}
        className="mb-12 text-center"
      >
        <motion.span variants={revealUp} className="mb-4 inline-block rounded-full bg-white/70 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-brand backdrop-blur">
          FAQ
        </motion.span>
        <motion.h2 variants={revealUp} className="font-display text-[clamp(2rem,4vw,3rem)] font-extrabold leading-tight tracking-tightest text-ink">
          Questions, answered
        </motion.h2>
      </motion.div>

      <motion.div
        variants={stagger(0.06)}
        initial={entrance("hidden")}
        whileInView="show"
        viewport={inView}
        className="flex flex-col gap-3"
      >
        {faqs.map(([q, a]) => (
          <Item key={q} q={q} a={a} />
        ))}
      </motion.div>
    </section>
  );
}
