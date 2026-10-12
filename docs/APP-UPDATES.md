# App versions and updates

How Traffic Advanced identifies a build, finds a new one, and offers it without disrupting someone using the map.

## Build identity

- Every build stamps its **Git commit** (12 characters), whether the working tree had **uncommitted changes**, and its **build
  time** into the bundle (`vite.config.ts` `define` → `__TA_BUILD__`, read by `web/src/app/version.ts`;
  `scripts/lib/build-info.ts`). Settings → App status shows them.
- This is the **app's** version. The traffic data has its own, separate version (the snapshot publication version from
  `/api/version`), shown under Settings → Data status.
- `package.json` stays at `0.0.0`: there is no release workflow that assigns semantic versions, so none is invented. The commit
  identifies the build exactly.
- The build identity is **never** used to decide that an update exists.

## Finding and offering updates

A service worker (`vite-plugin-pwa` 2.0.0 with Workbox 7.4.1, configured in `scripts/lib/service-worker-config.ts`) handles
updates. It does only that: it holds exactly one build of the app shell.

1. **Precache.** On install, the worker downloads the build's `index.html`, scripts, styles, `.woff2` fonts and icons (14 files,
   about 2.2 MB, mostly MapLibre). Each hashed asset is stored once; `index.html` and the icons carry content revisions.
2. **Finding a new build.** The browser checks `/sw.js` on each visit. While the app is open, it is asked again every hour, when
   the tab comes back into view (at most every 10 minutes), and when the user presses "Check for a new version" in Settings.
3. **"Update ready" means downloaded.** A new build counts as available only once its worker has **installed** (all of its files
   downloaded and stored) and is **waiting**. Only then does the app show "A new version of Traffic Advanced is ready" (a polite
   status notice under the header, and in Settings).
4. **Never forced.** `skipWaiting` and `clientsClaim` are off (`registerType: "prompt"`). The new build takes over only after the
   user presses **Reload to update**: the app tells the waiting worker to activate and then reloads. "Later" hides the notice for
   the visit. Nothing reloads by itself.
5. **Other tabs.** If the update is applied in another tab, this tab is told ("updated in another tab") and offered Reload. It is
   not reloaded (`onNeedReload` is always handled; the library's own automatic reload never runs).

## Caching rules

| Request | Service worker | Behaviour |
|---|---|---|
| App shell (HTML, JS, CSS, fonts, icons) | Precached, one build at a time | Served from the cache, so an open page keeps working with the files it started with, even after a deploy deletes them from the server |
| Navigations (e.g. `/?closure=…`) | `index.html` from the precache | The current build's page; deep links keep working |
| `/api/*` (version, closures, junctions) | **Not handled** (navigation denylist, no runtime caching) | Network exactly as before: ETags, `no-cache`, and the app's own device copy in Cache Storage (`ta-snapshots-v1`, `web/src/data/snapshotCache.ts`) |
| Map tiles, styles, glyphs (OpenFreeMap) | Not handled | Network as before |
| Restriction data files (`/assets/*.json`) | Not handled, not precached | Fetched only when a layer is switched on; content-hashed names, so a new build never mixes with old data |

- **Old caches.** When a new build activates, Workbox removes the previous build's files from the precache. The browser check
  confirmed the old script was gone after Reload. `cleanupOutdatedCaches` additionally deletes precaches left by older Workbox
  versions. The snapshot device copy (`ta-snapshots-v1`) is a different cache and is never touched by this worker.
- **Stale HTML and deleted assets.** A page always uses the HTML and assets of a single build, from the precache. After a deploy,
  Cloudflare no longer serves the old hashed files, but the open page doesn't need them: they are in its precache. The new
  build's files are downloaded completely before the update is offered.
  - **Why this matters here (verified 2026-10-09):** with `not_found_handling: "single-page-application"`, a request for a
    deleted `/assets/*.js` gets `index.html` (HTTP 200, `text/html`) in production, under `wrangler dev`, and in `vite preview`,
    not a 404.
  - Without the service worker, a page that loads a file after a deploy (for example, a font subset used for the first time)
    gets HTML instead.
  - Excluding `/assets/*` from the SPA fallback would make such failures explicit, but that is a Worker configuration change and
    is left for a separate decision.
  - **Remaining edge case:** a second tab still running the old build, after another tab applied the update. It can't fetch old
    files that were never loaded, such as a font subset used for the first time. It is told to reload.
- **First visit.** There is no worker yet, so the page loads from the network as before. The worker installs in the background
  and controls the next visit.
- **Development.** No service worker in `vite dev` (`devOptions.enabled: false`). Settings says update checks run in production
  builds only.

## Security headers and CSP

- **Unchanged.** The worker is a same-origin script (`/sw.js`, plus `/workbox-*.js` loaded with `importScripts`), allowed by
  `script-src 'self'` and `worker-src 'self'`.
- Registration runs from the bundle (`injectRegister: false`), so there is no new inline script and the CSP hash is unchanged.
- There is no web app manifest (`manifest: false`). Offering installation is a separate decision (`web/src/brand.test.ts`).
- `/sw.js` gets the same headers as every static file (`web/public/_headers`, `/*`). Browsers revalidate service worker scripts
  with the server on every update check, regardless of HTTP caching, so no extra cache rule is needed.

## Rollback

**What has been tested (2026-10-09): local only, never in production.**
- Chrome, with `vite preview` standing in for Cloudflare's asset handling, on one origin (`http://localhost:4173`).
- The script is `check-real-rollback.mjs`, run in the session scratchpad; it isn't in the repository.
- Sequence: this feature's build is served and its worker installed. Then the **real pre-feature build** is served in its
  place: base commit `9e243b4`, from `git archive`. Then the same pre-feature commit is served with the kill switch below added as
  `web/public/sw.js`.
- Both variants passed 14 of 14 checks: kill switch found by an explicit update check, and by a plain revisit.
- Results are listed under each step below.

**Not tested:**
- production or a staging deploy, and a real `wrangler rollback`;
- Safari, Firefox and mobile browsers;
- the plugin's `selfDestroying` option (read in its source only);
- rolling back to an *older* build that also has the worker.

Repeat these checks on staging before relying on them in production.

### Rolling back to another build that has the service worker

`wrangler rollback`, or a redeploy of an earlier commit that includes this feature, serves that build's own `sw.js`. Browsers see a
different worker script and install it as a new version. Users are offered Reload, as for any update (the update flow is tested,
but not with an older build). Until they press it, open pages keep the build they started with.

### Rolling back to a build from before the service worker: don't use `wrangler rollback`

A build from before this feature has no `sw.js`. With the single-page-application fallback, a request for `/sw.js` then returns
`index.html` (HTTP 200, `text/html`). Production does exactly this today: checked 2026-10-09, before this feature is deployed.

What happens without a kill switch (all seen in the local test):
- The browser rejects the HTML as a worker script ("The script has an unsupported MIME type ('text/html')"), and the
  installed worker stays registered.
- Users who already have the worker keep getting the **rolled-back-from** app from its precache, visit after visit. `/api/*`
  still goes to the network, so they see current closures, but in the app version you meant to remove.
- Users without the worker (first visit, or another browser) get the old build. The two groups stay split until the worker is
  removed.

**Safe procedure: serve the old app with a kill switch.** Choose one option:

1. **Kill-switch file (recommended; works with any older commit, no new dependency).**
   - Check out the commit to return to on a `fix/` branch.
   - Add `web/public/sw.js` with exactly the contents below. Vite copies `web/public` to the site root unchanged.
   - Build, test and deploy as usual.

   ```js
   // Kill switch for the Traffic Advanced update service worker (docs/APP-UPDATES.md): removes the app-shell precache and
   // unregisters. Leaves every other cache, including the snapshot device copy (ta-snapshots-v1), and reloads nothing.
   self.addEventListener("install", () => self.skipWaiting());
   self.addEventListener("activate", (event) => {
     event.waitUntil(
       (async () => {
         const names = await caches.keys();
         await Promise.all(names.filter((n) => n.startsWith("workbox-precache")).map((n) => caches.delete(n)));
         await self.registration.unregister();
       })(),
     );
   });
   ```

   What happens (seen in the local test unless marked otherwise):
   - **Pickup:** the stuck browser picks it up on its next visit (the browser's own update check on navigation), or on the
     stuck build's own hourly or visibility check (not timed in the test).
   - **Caches:** it activates at once, deletes the app-shell precache, keeps `ta-snapshots-v1`, and unregisters. It has no
     fetch handler, so requests go to the network.
   - **Open pages** are not reloaded and show no update notice. They keep running the code they loaded until the user reloads
     or navigates. If one was already showing "A new version … is ready", Reload now reloads the page even though nothing is
     waiting any more (`web/src/app/updates.ts`; unit-tested, not seen in the browser).
   - **Next visit:** it loads the rolled-back build from the network. Nothing registers again, because the old build registers
     no worker.
   - **How long to keep it:** keep `web/public/sw.js` in every deploy until the service worker is deliberately reintroduced. A
     browser that hasn't visited since still has the old worker, and recovers only by fetching this file. Remove the kill switch
     and that browser is stuck again.
   - **Reintroducing the worker:** delete `web/public/sw.js` in the same change, so the plugin's generated `sw.js` is the only
     one. `web/src/app/updates.test.ts` fails while both exist.

2. **The plugin's own option (`selfDestroying: true` in `scripts/lib/service-worker-config.ts`).** Only on a commit that already
   has this feature. Read in `node_modules/vite-plugin-pwa/dist/index.js` (2.0.0), it differs from the kill switch:
   - it **deletes every cache on the origin, including the snapshot device copy** (`ta-snapshots-v1`). That copy is fetched again
     on the next successful `/api` request, but anyone offline at that moment loses it;
   - it **reloads every open tab** (`client.navigate`), without asking.

   Use it only if those side effects are acceptable for that incident.

**If a pre-feature rollback has already happened:** deploy option 1 straight away, on top of the rolled-back commit. The
affected browsers recover as they next fetch `/sw.js`.

**Never** deploy a build without a `sw.js` (the plugin's, or the kill switch) once this feature has been in production.
Browsers keep running the last worker they installed until it is replaced or unregistered.

## Tests

- **Update logic** (`web/src/app/updates.test.ts`):
  - ready only when waiting;
  - Reload applies, then reloads;
  - no reload without the user, and none in other tabs;
  - failed and overlapping checks;
  - unsupported browsers;
  - the configuration (prompt mode, no runtime caching, `/api` denylist, no JSON precache, outdated-cache cleanup, no
    manifest).
- **UI** (`web/src/settings/settings-ui.test.ts`): the notice appears only when an update is ready, Reload is explicit, and
  nothing claims "up to date" without a finished check.
- **Browser** (production build; visible Chrome with a separate profile, driven over the DevTools protocol):
  - **`vite preview`:**
    - install and control;
    - precache contents (no restriction data);
    - `/api/*` never answered by the worker;
    - a rebuild announced only once downloaded, with no reload;
    - the old page still served its deleted script from the precache;
    - a second tab kept the active build;
    - Reload loaded the new build and removed the old files;
    - the snapshot cache kept;
    - the other tab told rather than reloaded;
    - rollback to the real pre-feature build, then the kill switch (see "Rollback").
  - **`wrangler dev`:** `index.html` precached as a plain response despite the 307 to `/`, with its CSP; a deep-link navigation
    answered by the worker with the CSP still enforced.
