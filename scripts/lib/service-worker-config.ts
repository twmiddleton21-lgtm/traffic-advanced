import type { VitePWAOptions } from "vite-plugin-pwa";

/**
 * The service worker's one job is safe app updates (docs/APP-UPDATES.md). It precaches exactly one build of the app shell (HTML,
 * scripts, styles, fonts, icons), so a page that is open keeps working from the files it started with even after a deploy removes
 * them from the server, and a new build is downloaded in the background and offered, never forced:
 * - registerType "prompt", skipWaiting and clientsClaim off: a new version waits until the user presses Reload in the update notice.
 * - No runtime caching at all: /api/* (closure snapshots, with their own ETags and device cache, web/src/data), map tiles and
 *   restriction data always go to the network exactly as before. Navigations to /api/* are never answered from the cache.
 * - Restriction data files are excluded from the precache: they load only when a restriction layer is switched on.
 * - The previous build's files leave the precache when a new version takes over; cleanupOutdatedCaches also removes precaches of
 *   older Workbox versions. The device copy of the snapshots lives in its own cache (ta-snapshots-v1), which this worker never
 *   touches. Rollback, including to a build without this worker: docs/APP-UPDATES.md.
 * - No web app manifest (the app isn't offered for installation yet: web/src/brand.test.ts), and no inline registration script,
 *   so the CSP is unchanged: the worker is a same-origin script (worker-src 'self'), registered from the bundle.
 */
export const serviceWorkerOptions: Partial<VitePWAOptions> = {
  strategies: "generateSW",
  registerType: "prompt",
  injectRegister: false,
  manifest: false,
  includeManifestIcons: false,
  devOptions: { enabled: false },
  workbox: {
    globPatterns: ["**/*.{html,js,css,woff2,svg,png}"],
    globIgnores: ["**/restrictions/**", "**/_headers"],
    // The main bundle includes MapLibre (about 1.5 MB); the default 2 MiB limit would leave it out silently as it grows.
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    navigateFallback: "index.html",
    navigateFallbackDenylist: [/^\/api\//],
    cleanupOutdatedCaches: true,
    skipWaiting: false,
    clientsClaim: false,
    sourcemap: false,
    disableDevLogs: true,
  },
};
