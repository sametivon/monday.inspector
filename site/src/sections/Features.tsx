import { motion } from "framer-motion";
import TiltCard from "@/components/TiltCard";
import { revealUp, scaleIn, stagger, inView, useEntrance } from "@/lib/motion";

const features = [
  {
    icon: "📥",
    tint: "bg-softblue",
    title: "Importer",
    body: "Full-page CSV / Excel importer with a 4-step flow. Parses monday classic exports natively — groups, parents and indented subitems — with smart error recovery.",
  },
  {
    icon: "🖼️",
    tint: "bg-softpeach",
    title: "Image Importer",
    body: "Drop an .xlsx with images pasted into cells — every image is extracted, anchored to its row and uploaded to a File column. The feature monday never built.",
  },
  {
    icon: "⚡",
    tint: "bg-softlavender",
    title: "Bulk Update",
    body: "Select hundreds of items, pick any column, push a value to all at once. Works across parent items and subitems alike.",
  },
  {
    icon: "🔍",
    tint: "bg-surface",
    title: "Query Inspector",
    body: "A full-page GraphQL workspace: 14 templates, a saved-query library, table + JSON results and a complexity meter.",
  },
  {
    icon: "🗂",
    tint: "bg-softmint",
    title: "Schema Inspector",
    body: "Explore every column — type, id, settings — for parents and subitems. Auto-detects classic vs multi-level boards.",
  },
  {
    icon: "📤",
    tint: "bg-softblue",
    title: "Export & Backup",
    body: "Export any board to CSV or JSON in one click — items, subitems, all column values and group structure.",
  },
];

export default function Features() {
  const entrance = useEntrance();
  return (
    <section id="features" className="relative mx-auto max-w-6xl px-6 py-28">
      <motion.div
        variants={stagger(0.08)}
        initial={entrance("hidden")}
        whileInView="show"
        viewport={inView}
        className="mx-auto mb-16 max-w-2xl text-center"
      >
        <motion.span
          variants={revealUp}
          className="mb-4 inline-block rounded-full bg-white/70 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-brand backdrop-blur"
        >
          Features
        </motion.span>
        <motion.h2
          variants={revealUp}
          className="font-display text-[clamp(2rem,4vw,3rem)] font-extrabold leading-tight tracking-tightest text-ink"
        >
          Everything monday.com is missing
        </motion.h2>
        <motion.p variants={revealUp} className="mt-4 text-[1.05rem] leading-relaxed text-muted">
          Six calm, powerful capabilities that unlock your boards — in one inline panel.
        </motion.p>
      </motion.div>

      <motion.div
        variants={stagger(0.07)}
        initial={entrance("hidden")}
        whileInView="show"
        viewport={inView}
        className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        {features.map((f) => (
          <motion.div key={f.title} variants={scaleIn}>
            <TiltCard>
              <div
                className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${f.tint} text-xl shadow-[inset_0_1px_0_rgba(255,255,255,.7)] transition-transform duration-300 group-hover:scale-110`}
              >
                {f.icon}
              </div>
              <h3 className="font-display text-[1.05rem] font-bold text-ink">{f.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{f.body}</p>
            </TiltCard>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
