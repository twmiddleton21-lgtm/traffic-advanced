import { execFileSync } from "node:child_process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { readBuildInfo } from "./scripts/lib/build-info.ts";
import { localApi } from "./worker/dev/vite-api.ts";
import { serviceWorkerOptions } from "./scripts/lib/service-worker-config.ts";

// The build's commit and time, shown in Settings (web/src/app/version.ts). Identifies the build only; updates are detected by the
// service worker, never by comparing these values.
const build = readBuildInfo((args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));

// The web app lives in web/ (CLAUDE.md layout). Build output goes to web/dist (git-ignored).
// localApi() serves /api/* in dev and preview through the Worker handler (worker/), reading locally published snapshots.
export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss(), localApi(), VitePWA(serviceWorkerOptions)],
  define: { __TA_BUILD__: JSON.stringify(build) },
  // No source maps in production: web/dist is deployed as public static assets, and maps would publish the full source.
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  server: { port: 5173 },
});
