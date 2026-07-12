import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

type Props = {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "ghost";
  className?: string;
  strength?: number;
};

/**
 * Magnetic hover button — the element (and its label) drift gently toward
 * the cursor, then spring back on leave. Premium click feedback via scale.
 */
export default function MagneticButton({
  children,
  href = "#",
  variant = "primary",
  className = "",
  strength = 0.35,
}: Props) {
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 200, damping: 15, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 200, damping: 15, mass: 0.5 });

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  const base =
    "relative inline-flex items-center justify-center gap-2 rounded-full font-semibold select-none px-6 py-3 text-[15px] transition-colors";
  const styles =
    variant === "primary"
      ? "text-white shadow-[0_10px_30px_rgba(62,123,250,.35)]"
      : "text-ink glass hover:bg-white/80";

  return (
    <motion.a
      ref={ref}
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{ x: sx, y: sy }}
      whileTap={{ scale: 0.96 }}
      className={`${base} ${styles} ${className}`}
    >
      {variant === "primary" && (
        <span
          className="absolute inset-0 rounded-full -z-10"
          style={{
            background: "linear-gradient(120deg, #3E7BFA 0%, #6161FF 100%)",
          }}
        />
      )}
      {children}
    </motion.a>
  );
}
