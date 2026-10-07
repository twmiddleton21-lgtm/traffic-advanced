# Production log

Public URL: https://traffic-advanced.twmiddleton21.workers.dev (Cloudflare Workers, workers.dev). R2 bucket: `traffic-advanced-snapshots`
(location hint weur). Worker version `160046f5-c009-44a2-a497-927c89c2bc33`, deployed 2026-10-07 23:24:55 UTC from `main`
`068936c17d8562e77e3d271c1a4b781a65b4b6e7` (all deployments: see "Worker deployments" below).

## Current state (recorded 2026-10-07 23:28 UTC, after the PR #9 deployment)

| | Live |
|---|---|
| Worker version | `160046f5-c009-44a2-a497-927c89c2bc33` (100%), deployed 2026-10-07 23:24:55 UTC |
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
