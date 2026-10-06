# Production log

Public URL: https://traffic-advanced.twmiddleton21.workers.dev (Cloudflare Workers, workers.dev). R2 bucket: `traffic-advanced-snapshots`
(location hint weur). Worker version `eca30767-3f8f-46be-93b2-7df80858422b`, deployed 2026-10-06 19:28:09 UTC from `main`
`c6f5c2e39babd5cdbe43d2d300973c1c7e54a258` (all deployments: see "Worker deployments" below).

## Current state (recorded 2026-10-06 19:35 UTC, after the PR #5 deployment)

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
