import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { webPublicAssets } from "./scripts/build-public-assets.mjs";
import { probePreviewConfig } from './scripts/probe-preview-config.mjs';

const buildId = process.env.GITHUB_SHA || process.env.VITE_BUILD_ID || "local";

let briefingEnabled = false;
export default defineConfig({
  base: "./",
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  build: {
    outDir: "dist/client",
    copyPublicDir: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          "ui-vendor": [
            "react",
            "react-dom",
            "@astryxdesign/core",
            "@astryxdesign/theme-neutral",
            "lucide-react",
          ],
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), webPublicAssets(), probePreviewConfig(), {
    name: "optional-briefing-entry",
    configResolved(config) {
      briefingEnabled = config.command === "serve" && ['briefing','briefing-probe'].includes(config.mode)
        || config.env.VITE_GPT_BRIEFING_ENABLED === "true";
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        // OFF never puts optional modules in Rollup's graph, preserving vendor aliases too.
        return briefingEnabled ? html.replace('src="/src/main.jsx"', 'src="/src/briefing-main.jsx"') : html;
      },
    },
  }],
});
