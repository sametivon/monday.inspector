import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync } from "fs";

function copyContentCss(): Plugin {
  return {
    name: "copy-content-css",
    writeBundle() {
      const outDir = resolve(__dirname, "dist/content");
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      copyFileSync(
        resolve(__dirname, "src/content/inject.css"),
        resolve(outDir, "inject.css"),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), copyContentCss()],
  base: "",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        panel: resolve(__dirname, "src/panel/index.html"),
        background: resolve(__dirname, "src/background/index.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") {
            return "[name]/index.js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  server: {
    port: 5173,
    open: "/src/panel/index.html",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
