import type { Variants, Transition } from "framer-motion";
import { useReducedMotion } from "framer-motion";

/**
 * Returns the `initial` prop to use for an entrance animation. Under
 * reduced motion we pass `false`, which renders the element directly at
 * its `animate`/`show` target — visible, no movement. Otherwise we use
 * the given hidden state so the reveal plays.
 */
export function useEntrance() {
  const reduced = useReducedMotion();
  return (hidden: unknown) => (reduced ? false : (hidden as never));
}

// Shared spring — organic, weighty, never abrupt.
export const spring: Transition = {
  type: "spring",
  stiffness: 120,
  damping: 20,
  mass: 0.9,
};

export const softSpring: Transition = {
  type: "spring",
  stiffness: 80,
  damping: 18,
  mass: 1,
};

// Reveal: fade upward with a soft blur reduction. The signature entrance.
export const revealUp: Variants = {
  hidden: { opacity: 0, y: 26, filter: "blur(10px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
  },
};

// Stagger container for headline lines / lists.
export const stagger = (staggerChildren = 0.09, delayChildren = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren, delayChildren } },
});

// A single masked line that rises into view.
export const maskLine: Variants = {
  hidden: { y: "110%" },
  show: {
    y: "0%",
    transition: { duration: 1, ease: [0.16, 1, 0.3, 1] },
  },
};

// Scale-in for cards / panels.
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 18 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
  },
};

// Standard viewport config so sections animate once, a touch before entry.
export const inView = {
  once: true,
  amount: 0.25,
  margin: "0px 0px -12% 0px",
} as const;
