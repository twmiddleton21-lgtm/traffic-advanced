import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { localApi } from "./worker/dev/vite-api.ts";

// The web app lives in web/ (CLAUDE.md layout). Build output goes to web/dist (git-ignored).
// localApi() serves /api/* in dev and preview through the Worker handler (worker/), reading locally published snapshots.
export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss(), localApi()],
  // No source maps in production: web/dist is deployed as public static assets, and maps would publish the full source.
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  server: { port: 5173 },
});
