import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync } from "fs";

function copyCssFiles(): Plugin {
  return {
    name: "copy-css-files",
    writeBundle() {
      // Copy inject.css for the content script button styling
      const contentDir = resolve(__dirname, "dist/content");
      if (!existsSync(contentDir)) mkdirSync(contentDir, { recursive: true });
      copyFileSync(
        resolve(__dirname, "src/content/inject.css"),
        resolve(contentDir, "inject.css"),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), copyCssFiles()],
  publicDir: false, // Don't copy public/ into dist/content/
  base: "",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "dist/content",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/content/index.ts"),
      formats: ["iife"],
      name: "MondayInspector",
      fileName: () => "index.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: "[name][extname]",
      },
    },
    cssCodeSplit: false,
    minify: "esbuild",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
