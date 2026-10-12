# Production log

Public URL: https://traffic-advanced.twmiddleton21.workers.dev (Cloudflare Workers, workers.dev). R2 bucket: `traffic-advanced-snapshots`
(location hint weur). Worker version `d5dae9fe-0916-4a47-9f33-d9df9f890484`, deployed 2026-10-08 22:02:34 UTC from `main`
`bb29aec656e21fe8a05282dd86ce0e19afedd38b` (all deployments: see "Worker deployments" below).

## Current state (recorded 2026-10-08 22:08 UTC, after the PR #13 deployment)

| | Live |
|---|---|
| Worker version | `d5dae9fe-0916-4a47-9f33-d9df9f890484` (100%), deployed 2026-10-08 22:02:34 UTC |
| Snapshot version | `20261008T175408Z-f810b6a76409` (published by scheduled Ingest run #13, see "Scheduled ingestion") |
| NH data captured | 2026-10-08 17:54:08 UTC |
| `publishedAt` in pointer | 2026-10-08 17:56:58 UTC |
| Closures | 739 (A 148, B 4, D 587) |
| Junctions | 596 |
| closures.json SHA-256 | `0130a8dc73bdc22fa2daf7d88cfcc8ea904b97e85fed71c87ed6be919dbf2e7e` |
| junctions.json SHA-256 | `95e19070a286fcf88459d2ba744a6d54e7e1b2a10b448b072dbaa086adf26652` |
| provenance.json SHA-256 | `0e5480d72e05501f9c5323bf6f9a2675837bce446686fd0f2f951213b8ceea70` |
| `current.json` pointer SHA-256 | `e39c4c4a5cd85c68bb7a0e4d12077576b417c41b5377284fcf6de083dd1f62c8` |
| Rules-freeze hash | `f42c7e22e47b5642…` (unchanged) |
| Captures | `2026-10-08T1752Z-open`, `2026-10-08T1754Z-nh-api` |
| Provenance kind | `development-snapshot` (still not labelled live, by design; docs/INGESTION.md) |

Read from the R2 `current.json` pointer (read-only) and the live `/api/version`, `/api/closures` and `/api/junctions` around the deployment.

## State after the PR #9 deployment (recorded 2026-10-07 23:28 UTC; Worker updated 2026-10-08 00:09 UTC by the PR #11 deployment, data unchanged)

| | Live |
|---|---|
| Worker version | `665cb5d4-3885-447e-9fb6-231b9326fa7f` (100%), deployed 2026-10-08 00:09:07 UTC |
| Snapshot version | `20261007T230604Z-1d901c092718` (published by scheduled Ingest run #10, see "Scheduled ingestion") |
| NH data captured | 2026-10-07 23:06:04 UTC |
| `publishedAt` in pointer | 2026-10-07 23:08:58 UTC |
| Closures | 796 (A 162, B 5, D 629) |
| Junctions | 596 |
| closures.json SHA-256 | `fcc8551bfb4c81cf72638aff489e3f70c1f1c70f936ed2c395e7c8ad04f3cbac` |
| junctions.json SHA-256 | `0bcf38dabd69c9720d339da4fb4963d002f96ac59f9fbc54423f3e905ea60df3` |
| provenance.json SHA-256 | `d05a15c43a44e2ab5a6deccfa6028b17f86d1038a1db2f60da62a577dde01fd3` |
| `current.json` pointer SHA-256 | `89e5cad2c7176fe8c573d998f757c5d963883a138cd7db546f7bf3b8fcc9cb01` |
| Rules-freeze hash | `f42c7e22e47b5642…` (unchanged) |
| Captures | `2026-10-07T2304Z-open`, `2026-10-07T2306Z-nh-api` |
| Provenance kind | `development-snapshot` (still not labelled live, by design; docs/INGESTION.md) |

Read from the R2 `current.json` pointer (read-only) and the live `/api/version`, `/api/closures` and `/api/junctions` after the deployment.

## State after the PR #7 deployment (recorded 2026-10-07 21:32 UTC)

| | Live |
|---|---|
| Worker version | `dcdd6680-f66d-451d-9c52-d135a169b5ce` (100%), deployed 2026-10-07 21:28:47 UTC |
| Snapshot version | `20261007T172717Z-6fe1508b16c2` (published by scheduled Ingest run #9, see "Scheduled ingestion") |
| NH data captured | 2026-10-07 17:27:17 UTC |
| `publishedAt` in pointer | 2026-10-07 17:30:09 UTC |
| Closures | 738 (A 146, B 4, D 588) |
| closures.json SHA-256 | `40c8f051df1278b924dba84acac1a05e743ef2ba8c2c6872c40419450e06bfd3` |
| junctions.json SHA-256 | `ac9cf1b20123d49bf22e3c97673edbf4547fa0aa8d4aaab0c2fad0adec756c27` |
| provenance.json SHA-256 | `425ec7474f81c5036ad12695b0c5f592b8fa45d49d87fe2234c0172d8b2f5431` |
| `current.json` pointer SHA-256 | `51dda7f553f3545a9f58a0793ef44f1cda9e075ddd019577e811a3f0b6fa92b7` |
| Rules-freeze hash | `f42c7e22e47b5642…` (unchanged) |
| Captures | `2026-10-07T1726Z-open`, `2026-10-07T1727Z-nh-api` |
| Provenance kind | `development-snapshot` (still not labelled live, by design; docs/INGESTION.md) |

Read from the R2 `current.json` pointer (read-only) and the live `/api/version` and `/api/closures` at 21:32 UTC.

## State after the PR #5 deployment (recorded 2026-10-06 19:35 UTC)

| | Live |
|---|---|
| Worker version | `eca30767-3f8f-46be-93b2-7df80858422b` (100%), deployed 2026-10-06 19:28:09 UTC |
| Snapshot version | `20261006T182255Z-41d107fdb363` (published by scheduled Ingest run #5, see "Scheduled ingestion") |
| NH data captured | 2026-10-06 18:22:55 UTC |
| `publishedAt` in pointer | 2026-10-06 18:25:47 UTC |
| Closures | 742 (A 141, B 6, D 595) |
| Junctions | 596 |
| closures.json SHA-256 | `c081359f0f7b1a3aa0eaab87ef1c7adf6ce7bee7421befb15809f9f48db7f337` |
| junctions.json SHA-256 | `140a954c4a8ce8717d73b75858e65f410e1cc941589e0fad59f42556c3ae10bc` |
| provenance.json SHA-256 | `f7fb12d9d87461a20247b37bb46eff952189740e62eed2dc49c8037a93862855` |
| Rules-freeze hash | `f42c7e22e47b5642…` (unchanged) |
| Captures | `2026-10-06T1821Z-open`, `2026-10-06T1822Z-nh-api` |
| Provenance kind | `development-snapshot` (still not labelled live, by design; docs/INGESTION.md) |

Read from the R2 `current.json` pointer (read-only) and the live `/api/version`, `/api/closures` and `/api/junctions` at 19:35 UTC.

## Worker deployments

Manual `npx wrangler deploy` from a clean `main` checkout (Wrangler OAuth login; no NH key, R2 keys or GitHub secrets involved). A Worker
deployment uploads the Worker and the static app only: it never changes R2 data or the snapshot pointer. **Worker rollback** to an earlier
version: `npx wrangler rollback <version-id>`. Only on the owner's instruction.

| Worker version | Deployed (UTC) | From `main` | Contents |
|---|---|---|---|
| `ec447b2d-6e50-413c-a652-aafbb1b67115` | 2026-10-06 06:41:33 | | First controlled production deployment: Day-1 snapshot |
| `66b05e74-768f-463b-872b-be4dbfea3d1d` | 2026-10-06 16:46:13 | `67ea1cf` | Map location control (PR #1), CI workflow (PR #2), sharp override for GHSA-wq5f-xc86-pv6w (PR #3) |
| `eca30767-3f8f-46be-93b2-7df80858422b` | 2026-10-06 19:28:09 | `c6f5c2e` | Premium responsive UI (PR #5) |
| `dcdd6680-f66d-451d-9c52-d135a169b5ce` | 2026-10-07 21:28:47 | `a516cd2` | Data-status banner and official source link (PR #7) |
| `160046f5-c009-44a2-a497-927c89c2bc33` | 2026-10-07 23:24:55 | `068936c` | Closures date selector (PR #9) |
| `665cb5d4-3885-447e-9fb6-231b9326fa7f` | 2026-10-08 00:09:07 | `6dfe9eb` | Date selector can go back to yesterday (PR #11) |
| `d5dae9fe-0916-4a47-9f33-d9df9f890484` | 2026-10-08 22:02:34 | `bb29aec` | Traffic Advanced brand identity (PR #13) |
| `f7a9a816-42d6-4588-8723-c16d28d63d9a` | 2026-10-09 03:23:32 | not recorded | Not recorded at the time; found afterwards (see below) |
| `4d03b164-0dc7-4e01-b496-314a9a37abe9` | 2026-10-12 16:43:34 | `82020c7` | Routes view, settings, app updates (service worker), restriction layers (PR #16); live traffic deferred |
| `42808e9d-7954-49c9-bae6-93c898205a99` | 2026-10-12 17:41:04 | `0df5aff` | Compact map keys and the Routes Layers button (PR #18) |

### 2026-10-06 16:46 UTC: map location control

- Before deploying, on `main` `67ea1cf`: `npm ci`, `npm run check` (332 tests), `npx vitest run shared/diversion/rules-freeze.test.ts`
  (15/15) and `npm run worker:check` (dry run; bindings `SNAPSHOTS` and `ASSETS` only) all passed.
- Wrangler uploaded 3 changed static files (`index.html`, the JS and CSS bundles). The live bundle was byte-identical to a local build of
  `67ea1cf`; before the deployment the site was serving the build of `4fb67e4` (no location feature).
- Checked live: `/api/version` and `/api/closures` 200 (snapshot `20261006T091355Z-8f96890859a7`, 736 closures), security headers present,
  the "Find my location" control present and its follow notice working. Location permission was not granted during the check.

### 2026-10-06 19:28 UTC: premium responsive UI (PR #5)

PR #5 merged 2026-10-06 19:25:31 UTC as merge commit `c6f5c2e39babd5cdbe43d2d300973c1c7e54a258` (parents `32b7a9e` and `985a867`).
Branded splash, phone/tablet layout with a closures drawer and details sheet, red closure lines on a dark casing, page zoom kept available
for accessibility, and new app icons. Web UI only: no matcher, ingestion, R2, scheduler or data changes.

- Before deploying, on `main` `c6f5c2e`: `npm ci`, typecheck, lint, `npm test` (342/342), build, `npm audit` (0 vulnerabilities), the
  rules-freeze test (15/15), `npm run check` and `npm run worker:check` all passed. PR #5's CI run (37518215385) passed.
- Wrangler uploaded 6 changed static files (`index.html`, the JS and CSS bundles, `banner.jpg`, `favicon-32.png`, `apple-touch-icon.png`).
  The R2 `current.json` pointer was byte-identical before and after (SHA-256 `dd69f2e9…`), and `/api/version` was unchanged.
- Checked live: `/api/version` 200; `/api/closures` 200 with 742 closures; security headers present on the app and the API; splash,
  desktop sidebar, closure selection and details, closure line styling, wheel zoom, map controls (including location), favicon and Apple
  touch icon, and no horizontal overflow. At phone size (400 px window): splash gone within about 0.9 s of load (the readiness path, not
  the 8 s backstop), and the closures drawer opened and closed with focus moving in and back, Escape closing it and the background inert.
  Location permission was not requested or granted.
- **Not yet checked on real devices** (not production failures; the checks above ran in desktop Chrome): touch pinch and pan, page zoom on
  iOS and Android, safe-area insets on a notched phone, browser toolbar show/hide, live rotation, and a screen-reader pass.

### 2026-10-07 21:28 UTC: data-status banner (PR #7)

PR #7 merged 2026-10-07 21:24:34 UTC with a normal merge commit, `a516cd2dc0cb8c9ab8730feccd5d670171108bb5` (parents `9aaee3c` and
`787074a`). The not-live banner's "Development snapshot, not live" became "Data last updated: …" (the snapshot's capture time), "Data is not live. Updated hourly."
and a "Check official source →" link to the National Highways Road Closure Report
(`https://nationalhighways.co.uk/roads-and-travel/live-travel-updates/road-closure-report/`, new tab, `rel="noopener noreferrer"`, 48px tap
target). The closure details' "Data status" uses the same not-live wording. Web UI only: no matcher, ingestion, R2, scheduler, API or
security-header changes.

- Before deploying, on `main` `a516cd2`: `npm ci`, `npm run check` (346/346 tests), the rules-freeze test (15/15), `npm audit`
  (0 vulnerabilities) and `npm run worker:check` (bindings `SNAPSHOTS` and `ASSETS` only) all passed. CI passed on PR #7 (run 37687791932)
  and on the merge commit (run 37689185130).
- Wrangler uploaded 3 changed static files (`index.html`, `index-UT09Ak2Z.js`, `index-XtUQv51Z.css`); the live page, script and stylesheet
  were byte-identical to the local build. The R2 `current.json` pointer was byte-identical before and after (SHA-256 `51dda7f5…`), the
  live snapshot stayed `20261007T172717Z-6fe1508b16c2` (738 closures), and no ingestion run was triggered.
- Checked live (desktop Chrome, 1440px, dark theme): the banner shows the three lines above; the link goes exactly to the Road Closure
  Report, opens in a new tab and isn't shown as a raw URL; its tap target is 48px tall; "Development snapshot" no longer appears; no
  horizontal overflow; the search box isn't squeezed. The data was over an hour old, so the banner correctly showed the stale state
  ("Offline/stale. Check official sources.", in the stale colour). CSP, `X-Frame-Options` and HSTS were still sent.
- Phone and tablet widths were measured before merging, on a local dev server from the same source: at 360, 768, 1024 and 1280px the link
  kept a 48px tap target and there was no horizontal overflow. (At 1024px the search box is narrow in the stale state, as it already was
  before PR #7.) The same check on the live site wasn't possible: the production page can't be framed (`X-Frame-Options: DENY`) and no
  phone-sized browser window could be opened in this session.
- **Not yet checked on a real device:** the banner and the link's tap target on a phone and a tablet.

### 2026-10-07 23:24 UTC: closures date selector (PR #9)

PR #9 merged 2026-10-07 23:20:49 UTC with a normal merge commit, `068936c17d8562e77e3d271c1a4b781a65b4b6e7` (parents `bea9ac6` and
`47dab60`). A date selector under the header picks one UK calendar day (Europe/London), defaulting to today; the map, closures list,
count and filter chips then show only the closures whose `[start, end)` window overlaps that day, so an overnight closure appears on both
days it covers. The days offered run from today to the latest closure **start** date in the loaded snapshot (not the latest end, which
long-running works stretch into 2027), held as the range's two ends so no list of every day is ever built. Seven dates from 768px up, three
on phones. Changing the day filters the snapshot already loaded: no new API request, no download. Web UI only: no matcher, ingestion, R2,
scheduler, snapshot, API or cache changes.

- Deployed 2026-10-07 23:24:55 UTC (Wrangler's timestamp; 00:24 UK time on 8 October).
- Before deploying, on `main` `068936c`: `npm ci`, typecheck, lint, `npm test` (383/383),
  build, `npm audit` (0 vulnerabilities), the rules-freeze test (15/15), `git diff --check` and `npm run worker:check` (bindings
  `SNAPSHOTS` and `ASSETS` only) all passed. Since the previous deployment (`a516cd2`) only `docs/PRODUCTION-LOG.md` and the date-selector
  files under `web/src` had changed. CI passed on PR #9 (run 37698746785) and on the merge commit (run 37701744633).
- Wrangler uploaded 3 changed static files (`index.html`, `index-D0_feQO8.js`, `index-CU-IF0PP.css`); the live page, script and stylesheet
  were byte-identical to the local build. The R2 `current.json` pointer was byte-identical before and after (SHA-256 `89e5cad2…cb01`), the
  live snapshot stayed `20261007T230604Z-1d901c092718` (796 closures), and no ingestion run was triggered. That snapshot was published by
  scheduled Ingest run #10 before the deployment, not by the deployment.
- Checked live: `/`, `/api/version`, `/api/closures` and `/api/junctions` 200; conditional requests with the `ETag` returned 304 on all
  three APIs; CSP, `X-Frame-Options`, HSTS, `nosniff`, `Referrer-Policy` and `Permissions-Policy` still sent; no 5xx, 1102 or CPU-limit
  errors.
- Checked live (desktop Chrome, 1440px, dark theme): the selector opened on "Today, Thursday 8 October 2026" (the UK date); 7 dates shown;
  date buttons and arrows 48px; the range ran 8 to 21 October with the previous arrow disabled on today and the next arrow on 21 October;
  each day's count matched its list (for example 149, 145, 83, 29); the map showed visibly fewer closures on Sunday 11 October (29) than
  on Tuesday 20 October (128); no API request while changing days; no horizontal overflow. The data-status banner, the official National
  Highways link and the location control were unchanged.
- Phone widths weren't checked on the live site: the production page can't be framed (`X-Frame-Options: DENY`) and phone-width frames of a
  local build wouldn't load in this session's browser. During PR #9, a local dev server showed 3 dates with 48px targets and no overflow at
  360, 390 and 414px (before its last commit, which changed only how the dates are worked out, not the layout).
- The empty-day message ("No closures scheduled for this day") is covered by automated tests but wasn't seen live: every day in the
  current range has closures.
- **Not yet checked on a real device:** the date selector on a phone and a tablet.

### 2026-10-08 00:09 UTC: date selector reaches yesterday (PR #11)

PR #11 merged 2026-10-08 00:05:17 UTC with a normal merge commit, `6dfe9eb49f34f3c1ab0eeee4ce4ff9c665f14cba` (parents `66e1273` and
`4a13754`). The days on offer now start at **yesterday** (Europe/London) instead of today, because closures that start yesterday evening
often run into this morning; **today** stays the default. The last day, the `[start, end)` filtering and the two-ends range are unchanged.
Web UI only (4 files under `web/src`): no matcher, ingestion, R2, scheduler, snapshot, API or cache changes.

- Deployed 2026-10-08 00:09:07 UTC (Wrangler's timestamp; 01:09 UK time).
- Before deploying, on `main` `6dfe9eb`: `npm ci`, typecheck, lint, `npm test` (387/387), build, `npm audit` (0 vulnerabilities), the
  rules-freeze test (15/15), `git diff --check` and `npm run worker:check` (bindings `SNAPSHOTS` and `ASSETS` only) all passed. Since the
  previous deployment (`068936c`) only `docs/PRODUCTION-LOG.md` and the four PR #11 files had changed. CI passed on PR #11 (run
  37705186530) and on the merge commit (run 37705857461).
- Wrangler uploaded 2 changed static files; the live script (`index-BfGsEVyK.js`) was byte-identical to the local build. The R2
  `current.json` pointer was byte-identical before and after (SHA-256 `89e5cad2…cb01`), the live snapshot stayed
  `20261007T230604Z-1d901c092718` (796 closures), and no ingestion run was triggered (the latest was still scheduled run #10).
- Checked live: `/`, `/api/version`, `/api/closures` and `/api/junctions` 200; conditional requests with the `ETag` returned 304 on all
  three APIs; the security headers still sent on the app and the API; no 5xx, 1102 or CPU-limit errors.
- Checked live (desktop Chrome, 1440px): the selector opened on "Today, Thursday 8 October 2026" (the UK date) with Wednesday 7 October
  to its left. Selecting 7 October worked (the count and list changed from 149 to 79) and disabled the previous-day arrow; the next-day
  arrow went back to today (149), and stepping back from today reached 7 October. Buttons and arrows 48px; no horizontal overflow; no API
  request while changing days.
- Yesterday shows the closures still in force when the snapshot was captured (ingestion drops closures that had already ended), such as
  last night's closures that ran into this morning, not every closure that ran yesterday.
- **Not yet checked:** phone widths on the live site, and real devices.

### 2026-10-08 22:02 UTC: brand identity (PR #13)

PR #13 merged 2026-10-08 21:56:06 UTC with a normal merge commit, `bb29aec656e21fe8a05282dd86ce0e19afedd38b` (parents `729718f` and
`fed78a6`). The truck-and-bridge branding was replaced by the approved navy, gold and white motorway badge: an SVG favicon with 16 and
32px PNG fallbacks, a new Apple touch icon, an inline header logo (badge alone below 360px; the heading is named "Traffic Advanced" for
screen readers at every width) and an SVG splash banner. The masters are in `web/brand` (README there). No web app manifest was added, so
the app isn't installable. Web UI and static assets only (27 files under `web/`): no matcher, ingestion, R2, scheduler, snapshot, API,
Worker configuration, security-header or theme-colour changes.

- Deployed 2026-10-08 22:02:34 UTC (Wrangler's timestamp; 23:02 UK time).
- Before deploying, on `main` `bb29aec` (clean working tree, level with `origin/main`): `npm ci`, `npm run check` (typecheck, lint,
  397/397 tests, build), `npm audit` (0 vulnerabilities), the rules-freeze test (15/15), `git diff --check` and the Wrangler dry run
  (bindings `SNAPSHOTS` and `ASSETS` only) all passed. CI passed on PR #13 (run 37849118982) and on the merge commit (CI run #27).
- Wrangler uploaded 8 changed static files and kept the existing `SNAPSHOTS` and `ASSETS` bindings. The live `index.html`, script
  (`index-B3RrpR_f.js`) and stylesheet (`index-1ubtVtAU.css`) were byte-identical to the local build. The R2 `current.json` pointer was
  byte-identical before and after (SHA-256 `e39c4c4a…62c8`), the live snapshot stayed `20261008T175408Z-f810b6a76409` (739 closures;
  `/api/version` unchanged), and no ingestion run was triggered (the latest was still scheduled run #13).
- Checked live on `https://trafficadvanced.uk`: `/`, `/api/version`, `/api/closures` (739 closures) and `/api/junctions` (596) 200;
  conditional requests with the `ETag` returned 304 on all three APIs; the security headers unchanged on the app and the API (the CSP's
  script hash still matches `web/public/_headers`). `favicon.svg` and `banner.svg` were served as `image/svg+xml`, `favicon-16x16.png`,
  `favicon-32x32.png` and `apple-touch-icon.png` as `image/png`, all 200 and byte-identical to the build. The removed `/banner.jpg` and
  `/favicon-32.png` now get the app page (200, `text/html`), as any unknown path does; nothing references them.
- Checked live (desktop Chrome, 1440px, dark and light themes): the badge 40px and the wordmark 217×40px ("ADVANCED" gold in dark, navy
  in light); every header item on one row, the header 70px tall, no horizontal overflow; Chrome used the SVG favicon and the splash loaded
  `banner.svg`. No failed browser requests or console errors. No 5xx, 1102, Worker exception or CPU-limit errors during the checks (the
  Worker log captured part of them: 4 requests, all 200).
- Phone widths were checked against the local production build, not on the live page (it can't be framed, `X-Frame-Options: DENY`, and
  no phone-sized browser window could be opened). The live files are byte-identical to that build. In it, at 320, 359, 360, 390 and 414px
  in both themes: badge only below 360px, the 173.6×32px wordmark from 360px, the theme button on the logo row and no horizontal
  overflow. The splash banner measured 256×86px at 320×568, 312×105px at 390×844 and 420×142px at 1024×768 and 844×390, with nothing
  cropped.
- The banner showed "Offline/stale. Check official sources." because the snapshot was captured at 17:54 UTC, over four hours earlier (see
  "Scheduled ingestion"). That is the existing data's age, not a problem with this deployment.
- **Not yet checked:** real Safari (iOS and macOS), the Apple touch icon via "Add to Home Screen", and real phones and tablets.

### 2026-10-09 03:23 UTC: unrecorded deployment (found 2026-10-12)

This deployment wasn't logged when it was made. It was found on 2026-10-12 by a read-only review of Cloudflare's deployment history
(`npx wrangler deployments status`, `deployments list` and `versions view`, all with `--name traffic-advanced`; nothing was changed).

- **Verified from Cloudflare:** Worker version `f7a9a816-42d6-4588-8723-c16d28d63d9a`, created 2026-10-09 03:23:32 UTC and deployed
  03:23:33 UTC (Wrangler's timestamps; 04:23 UK time), uploaded with Wrangler and with no deployment message. On 2026-10-12 it was the
  current deployment, serving 100% of traffic. Handler `fetch`, compatibility date 2026-10-01, bindings `ASSETS` and `SNAPSHOTS`
  (R2 bucket `traffic-advanced-snapshots`) only. It has **no** `TRAFFIC_USAGE` Durable Object binding, and neither has any earlier
  deployed version (all 8 listed by `deployments list`).
- **Not verified: which commit was deployed.** The deployment has no message. PR #15 (branch `fix/map-location-attribution-ux`) was merged
  as `9e243b4` at 2026-10-09 03:18:09 UTC, five minutes before, so `9e243b4` is a possible match on timing alone. That hasn't been
  confirmed, for example by comparing the live files with a build of that commit.
- **Not recorded:** the checks run before deploying, the files uploaded, and any live checks afterwards.
- **Not established:** whether a Durable Object migration has ever been applied to this Worker, or whether a `TrafficUsage` namespace
  exists. Wrangler's version details don't show migrations, and Wrangler 4.147.0 has no read-only command that lists Durable Object
  namespaces.
- On 2026-10-12, the live `GET /api/traffic/status` returned 404 (the traffic routes aren't deployed), and `/api/version` served snapshot
  `20261012T091216Z-ea6ca93a797f` (726 closures).

### 2026-10-12 16:43 UTC: Routes view, settings, updates and restriction layers (PR #16)

PR #16 merged 2026-10-12 16:40:30 UTC with a normal merge commit, `82020c70d5cad19932c9a8fecf5831103fe3f396` (parents `9e243b4`
and `2c39f8c`), after the owner approved merging and deploying it with licensing, attribution, wording and device review deferred
("Open review items" below). Contents: the Closures / Routes switch with 596 NH junction numbers, Settings, app versions and
updates with the first service worker (`docs/APP-UPDATES.md`), the height, weight, LEZ and ULEZ restriction layers, and the
removal of TfL website rule text from the zone files. Live TomTom traffic is deferred: not routed, not shown, no binding.

- Deployed 2026-10-12 16:43:34 UTC (Wrangler's timestamp; 17:43 UK time) as Worker version
  `4d03b164-0dc7-4e01-b496-314a9a37abe9`, from a clean worktree of `main` `82020c7`, with the message "Deploy main 82020c7: Routes
  view and restriction layers (PR #16); live traffic deferred". Bindings `ASSETS` and `SNAPSHOTS` only, compatibility date
  2026-10-01. Wrangler uploaded 10 changed static files (including `/sw.js`, `/workbox-*.js` and the four restriction files).
- Before deploying, on `82020c7` in the clean worktree: `npm ci`, `npm run check` (typecheck, lint, 699/699 tests in 58 files,
  build), the rules-freeze test (15/15), `npm audit` (0 vulnerabilities) and `npm run worker:check` (bindings `SNAPSHOTS` and
  `ASSETS` only) all passed. The build identity reads commit `82020c70d5ca`, `dirty: false`. CI passed on the PR head
  (`2c39f8c`).
- Before the deploy the live version was `f7a9a816`; `/sw.js` returned the app page (no service worker had been deployed).
- The R2 `current.json` pointer was byte-identical before and after (SHA-256 `661a7657…`); the live snapshot stayed
  `20261012T091216Z-ea6ca93a797f` (726 closures). No ingestion run, capture or upload was triggered by the release.
- Checked live on `https://trafficadvanced.uk` and the workers.dev URL (plain and conditional GET requests):
  - `/` 200 with the security headers; `index.html`, the app script and stylesheet, `/sw.js` (`text/javascript`,
    `max-age=0, must-revalidate`, with the CSP), the Workbox files and the four restriction files were all byte-identical to the
    release build;
  - `/api/version`, `/api/closures` (726) and `/api/junctions` (596) 200, the closures and junctions SHA-256 matching
    `/api/version`, and 304 on conditional requests; `/api/traffic/status` 404;
  - both zone files have no `rules` field.
- Checked live in desktop Chrome: the service worker installed and activated with 14 precache entries (no restriction files) and
  the `ta-snapshots-v1` device copy; Closures, the restrictions key and list (height and LEZ layers), the LEZ details' TfL note and
  link, and the Routes view (596 junction labels, one switch, the scope and not-connected notes, no TomTom text). No console errors.
  The test browser's layer settings were restored afterwards.
- Worker log during the checks (`wrangler tail`): 20 API requests, all `ok`, no exceptions or error logs, CPU at most 7 ms.
- **Observed, not investigated:** the live data was captured at 09:12 UTC and was about 7.5 hours old at the time of the checks,
  so the banner showed the stale state. The release didn't touch ingestion; see "Scheduled ingestion".
- **Rollback:** this is the first deploy with the service worker. Don't use `wrangler rollback` to `f7a9a816` or any earlier
  version; follow `docs/APP-UPDATES.md`, "Rollback".
- **Not yet checked:** real phones and tablets, Safari and Firefox, and the update prompt on the next deploy (open follow-ups).

### 2026-10-12 17:41 UTC: compact map keys and the Routes Layers button (PR #18)

PR #18 merged 2026-10-12 17:38:51 UTC with a normal merge commit, `0df5affc37ecfd2e4accc246d5eda92a96293da4` (parents `82020c7`
and `697e101`), approved by the owner. Web UI only (11 files: components, App, tests, docs): one map key per view, folding to a 48 px
line; in Closures it carries the restriction key and disclaimer (behaviour unchanged: hidden visually but described when folded,
on the page once); in Routes a 56 px square "Layers" button at the top left and the map key at the bottom left. No Worker, Wrangler,
data, ingestion, schedule, matcher or security-header change.

- Deployed 2026-10-12 17:41:04 UTC (Wrangler's timestamp; 18:41 UK time) as Worker version `42808e9d-7954-49c9-bae6-93c898205a99`,
  from a clean worktree of `main` `0df5aff`. Bindings `ASSETS` and `SNAPSHOTS` only, compatibility date 2026-10-01. Wrangler
  uploaded 4 changed static files (`/sw.js`, `/index.html`, the app script and stylesheet).
- Before deploying, on `0df5aff` in the clean worktree: `npm ci`, `npm run check` (703/703 tests in 58 files), the rules-freeze test
  (15/15), `npm audit` (0 vulnerabilities) and `npm run worker:check` all passed; the build identity reads `0df5affc37ec`, not dirty.
  CI passed on the PR head (`697e101`).
- The R2 `current.json` pointer was byte-identical before and after (SHA-256 `661a7657…`); the live snapshot stayed
  `20261012T091216Z-ea6ca93a797f` (726 closures). No ingestion run, capture or upload was triggered by the release.
- Checked live on both hosts (plain and conditional GET requests): `/`, `/sw.js`, the Workbox files, app script and stylesheet and the
  four restriction files byte-identical to the release build, with the security headers; `/api/version`, `/api/closures` (726) and
  `/api/junctions` (596) 200 with matching SHA-256 and 304 on conditional requests; `/api/traffic/status` 404; zone files without
  `rules`.
- Checked live in desktop Chrome (2560 px wide): Routes showed the 56x56 Layers button at the top left and the map key at the bottom
  left; Layers and the key opened and closed independently, and the Layers panel kept the junction switch and both notes. Closures
  with height, weight and LEZ on: the combined key with the restriction section and the disclaimer once (hidden visually and
  described when folded), the Restrictions list (51 in view, with the disclaimer) and the LEZ details' TfL note and link. No console
  errors after load. The test browser's layer setting was restored afterwards.
- **Not checked live:** narrow screens. The browser window couldn't be resized and the production page can't be framed
  (`X-Frame-Options: DENY`); phone portrait and landscape were checked on the local preview of the same source before merging.
- Worker log during the checks (`wrangler tail`): 20 API requests, all `ok`, no exceptions or error logs; CPU at most 10 ms (one
  request at the Workers Free limit, none over it). Worth watching.
- The live data was still the 09:12 UTC capture (stale banner), as before this release; not investigated.

## Scheduled ingestion

The hourly schedule (`17 * * * *` UTC, `.github/workflows/ingest.yml`) reached `main` at 2026-10-06 11:39:22 UTC (`4fb67e4`), but GitHub
created **no scheduled run** for the 12:17, 13:17, 14:17, 15:17 or 16:17 slots (the workflow was active, GitHub Status showed no Actions
incident). Meanwhile the live data went stale and the app labelled it so.

- **Recovery:** manual Ingest run #4 (`target = remote`, run 37500050778, `main` `67ea1cf`) at 16:59 UTC published
  `20261006T170125Z-3de7e6b43674` (742 closures) and switched the pointer.
- **Re-registration:** PR #4 made a comment-only change to `ingest.yml` (cron, inputs, steps, secrets and concurrency unchanged) so GitHub
  would read the schedule again; merged 2026-10-06 17:14:09 UTC as `32b7a9e`. No scheduled run appeared for the 17:17 slot.
- **First scheduled run:** Ingest run #5 (event `schedule`, run 37510604015, `main` `32b7a9e`) started 18:20:55 UTC for the 18:17 slot,
  succeeded, and published `20261006T182255Z-41d107fdb363` (the current snapshot above).
- **To watch (not a confirmed failure):** as of 19:35 UTC no run had appeared yet for the 19:17 slot (still none when rechecked at
  19:40 UTC). GitHub can delay scheduled runs, so this may still start late. If slots keep being missed, disabling and re-enabling the
  workflow in the Actions UI is the next step (a settings change, owner's decision).
- **Update (recorded 2026-10-07 21:32 UTC):** no run appeared for the 2026-10-06 19:17 slot. Scheduled runs since then, all successful on
  `main` `9aaee3c`: #6 started 2026-10-06 23:03:07, #7 2026-10-07 02:22:28, #8 10:14:14, #9 17:25:58 (UTC). Run #9 published the current
  snapshot. So the schedule runs, but GitHub creates runs for only some hourly slots (none since 17:25 UTC at the time of recording), even
  though the banner says "Updated hourly". No manual run since #4.
- **Update (recorded 2026-10-07 23:28 UTC):** scheduled Ingest run #10 (run 37700098112, `main` `bea9ac6`) started 23:04:23 UTC,
  succeeded, and published `20261007T230604Z-1d901c092718` (796 closures), the current snapshot. No further run had appeared by 23:28 UTC.
- **Update (recorded 2026-10-08 22:08 UTC):** scheduled runs since then, all successful on `main` `729718f`: #11 (run 37719123270)
  started 2026-10-08 02:41:43, #12 (run 37764214130) 10:33:09, #13 (run 37819900027) 17:52:21 (UTC). Run #13 published
  `20261008T175408Z-f810b6a76409` (739 closures), the current snapshot. No further run had appeared by 22:08 UTC, so the data was over
  four hours old at the PR #13 deployment.

## First live state (recorded 2026-10-06, post-live review)

| | Live | Rollback (previous known-good) |
|---|---|---|
| Version | `20261006T065331Z-0a7fda8a1d6c` | `20261005T120826Z-0852572cf098` |
| NH data captured | 2026-10-06 06:53:31 UTC (first real live capture) | 2026-10-05 12:08:26 UTC (Day-1) |
| `publishedAt` in pointer | 2026-10-06 06:52:36 UTC (run start: see "publishedAt" below) | 2026-10-06 06:45:04 UTC |
| Closures | 738 (A 141, B 6, D 591) | 723 (A 122, B 6, D 595) |
| Junctions | 596 | 596 |
| closures.json SHA-256 | `04e4e3bf45842299c352142673b646415c962a8cb7f59fffa58d8c31d6c331ec` | `09849f7c4c5b01a97c2e77fe00517e99eadb8caf5725609f2e385c584b5b5892` |
| junctions.json SHA-256 | `e06263a3f2a7de9a137f76f96aaa2eb8cfbb3e5ed7ee5f88ee590bdde9d18643` | `12656c556c61edc89716a4233165713b813947831acbc42895f8e1982d216356` |
| provenance.json SHA-256 | `b0969643d74100cc9a48a248291d7e1368190462f10606ecca0866f255dbccaf` | `918e3fdcdd7274ce5bf2ded8d011560aeb597aead54995d2b250aaba3b75d516` |
| Rules-freeze hash | `f42c7e22e47b5642…` (both) | |
| Captures | `2026-10-06T0652Z-open`, `2026-10-06T0653Z-nh-api` | `2026-10-05T1140Z-open`, `2026-10-05T1208Z-nh-api` |

Both versions' objects are in R2 under `snapshots/<version>/`. Local copies of both pointers: `.wrangler/rollback/current-live-20261006T065331Z.json`
and `.wrangler/rollback/current-before-first-live.json` (git-ignored). **Rollback** is a deliberate manual pointer swap (the upload tool
refuses older data by design): `npx wrangler r2 object put traffic-advanced-snapshots/current.json --file .wrangler/rollback/current-before-first-live.json --content-type application/json --remote`.
Only on the owner's instruction.

## Open review items

### M57 southbound, situation 521358: B candidate pending owner review

Status: **P0 candidate pending owner review. Not a confirmed production match.** Shown as B with that note. Not suppressed or changed.

- Closure: `521358|southBound|2026-10-06T20:00:00.00Z|2026-10-07T04:00:00.00Z` (Tue 6 Oct 21:00 to Wed 7 Oct 05:00 UK time).
- NH text (verbatim): "M57 southbound Jct 6 to 4 carriageway closure".
- Closed main-carriageway links NH references in that record (all `operationalLanes: 0`): 5 Network Model links, resolved as
  "M57 southbound between J5 and J4" (3) and "M57 southbound within J4" (2). **No link between J6 and J5.**
- Other records NH filed in the same situation: J6 **entry slip** closure; J4 **exit slip** closure; lanes 2 and 3 closed at
  MP 17/0 to 16/1 and lane 3 closed at MP 13/3 to 12/4 (lane closures, not full closures).
- Matched: stretch `M57 southBound M57 J5 to M57 J4` (`d25c4d21-b8af-41ad-b9d6-79b24f2cc2fd`), route `M57/J5/J4/1`, "M57 southbound
  closure: junction 5 to 4", Class 1A, hollow triangle, 2.79 miles, no restrictions recorded. E1 to E8 all pass.
- **Why unresolved:** NH's text says the carriageway is closed from J6, but NH's own network references close the main carriageway
  only from J5 (with the J6 entry slip closed and lane closures north of J5). If the main carriageway is in fact closed J6 to J5,
  traffic can't reach J5 and a J5 to J4 diversion would not be usable. The data can't prove which reading is right.
- The red line north of J5 on the map near M58 is a different closure (situation 523136, "Switch Island to Jct 6", from 9 Oct, D).

### publishedAt preceded capturedAt (fixed for future publications; live pointer unchanged)

Cause: `scripts/lib/ingest.ts` took one timestamp at the start of the run and passed it to `publishSnapshot` as the publication time.
Fix (2026-10-06): the publication time is taken immediately before publishing, and `publishSnapshot` refuses a publication time
earlier than the capture time. Snapshot contents, version, matcher, capture and safeguards are unchanged (tested). The live pointer
keeps its old value until the next publication.

Update (2026-10-06): later publications carry `publishedAt` after `capturedAt`: run #4 captured 17:01:25, published 17:04:10; run #5
captured 18:22:55, published 18:25:47 (UTC).

Related, **not changed**: the snapshot files' own `generatedAt` is also the run start (it's inside the published files, so changing it
alters their bytes). Proposal pending approval.

### Deferred from the first release (PR #16): licensing, attribution, wording and device review

Status: **open follow-up work, not resolved and not legally cleared.** The owner approved merging and deploying PR #16 on
2026-10-12 with these items deferred to a later update. Nothing below is a legal determination.

- **Licensing and permissions:**
  - TfL: whether registration is required before redistributing TfL open data (the Transport Data Service licence refers to
    information "You provide on registration"; the files download without a key). See `docs/RESTRICTIONS.md`.
  - National Highways S1 and S6: the APIs' metadata says OGL v3.0, but the Developer Portal terms are "based on version 2.0 of
    the OGL with specific amendments for NH". Paragraphs 20(b), 21(c) and 21(e) are unresolved, and the enquiry is drafted but
    not sent. See `docs/DATA-SOURCES.md`, "Developer Portal licence".
- **Attribution and third-party rights:**
  - NH paragraph 20(a) asks for "Powered by National Highways' Transport Data Feeds", which the app doesn't show. Adding it is
    a wording change for the owner.
  - Ordnance Survey rights behind the NH diversion points rely on NH's own OGL statement and are not independently verified
    (the owner accepted this risk for release on 2026-10-12).
- **TfL LEZ wording in Settings** (`web/src/components/settings/RestrictionsSection.tsx`): the LEZ description summarises one
  TfL rule in original wording ("TfL says lorries over 3.5 tonnes…"), while a zone's details say "This app doesn't show the
  rules". Review the wording and its consistency.
- **Safety wording and devices:** review the route-card sentence "National Highways records no restrictions on this route. This
  does not guarantee there are none.", the TfL zone note and the folded restrictions disclaimer; and test the Routes view on
  real phones and tablets (only desktop Chrome and emulated widths were checked).
- **Earlier history and served builds:**
  - The repository is public (checked 2026-10-12). Five sentences of tfl.gov.uk website text that earlier commits stored
    (removed from the files in `434aca9`) remain visible in its Git history, which has not been rewritten. Whether that needs
    action is open.
  - No deployed build served the zone files: the live build before this release (`f7a9a816`) references no restriction files,
    and the earlier deployments are `main` commits from before restriction layers existed (table above).
- **Live traffic (TomTom):** deferred and not shipped; its terms, attribution, name use and privacy wording are unresolved
  (`docs/LIVE-TRAFFIC-RESEARCH.md`).
