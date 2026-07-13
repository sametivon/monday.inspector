import { useEffect } from "react";

/**
 * Buttery smooth scrolling via Lenis. Lenis is dynamically imported so it
 * stays out of the SSG/Node bundle. Disabled under reduced motion.
 */
export default function SmoothScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let destroy = () => {};

    import("lenis").then(({ default: Lenis }) => {
      const lenis = new Lenis({
        duration: 0.85,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        touchMultiplier: 1.5,
      });

      const loop = (time: number) => {
        lenis.raf(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      const onClick = (e: MouseEvent) => {
        const a = (e.target as HTMLElement)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
        const id = a?.getAttribute("href");
        if (!id || id === "#") return;
        const el = document.querySelector(id);
        if (el) {
          e.preventDefault();
          lenis.scrollTo(el as HTMLElement, { offset: -90, duration: 1.3 });
        }
      };
      document.addEventListener("click", onClick);

      destroy = () => {
        cancelAnimationFrame(raf);
        document.removeEventListener("click", onClick);
        lenis.destroy();
      };
    });

    return () => destroy();
  }, []);

  return null;
}
