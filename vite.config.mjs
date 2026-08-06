import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const buildId = process.env.GITHUB_SHA || process.env.VITE_BUILD_ID || "local";

export default defineConfig({
  base: "./",
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  build: {
    outDir: "dist/client",
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
  plugins: [react()],
});
