import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// The prerendered output lands in ../docs so GitHub Pages serves it exactly
// like the current static site (CNAME + assets live in ./public).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  build: {
    outDir: resolve(__dirname, "../docs"),
    emptyOutDir: false, // keep hand-authored files we copy in via public/
  },
  ssr: {
    // three / R3F ship ESM that must be transformed for the SSG (Node) pass
    noExternal: ["three", "@react-three/fiber", "@react-three/drei", "lenis", "gsap"],
  },
});
