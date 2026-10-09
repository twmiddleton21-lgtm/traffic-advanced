# Traffic Advanced: V1 specification

Status: **draft for approval** (2026-10-05). Evidence for every data claim is in `DATA-SOURCES.md`.

## 1. Purpose and scope

A mobile-first, installable web app that helps **HGV drivers** check closures, official diversions and traffic on
the roads they use, before and between journeys (not while driving).

- **V1: England.** National Highways Strategic Road Network (motorways and major A-roads).
- The data layer is built from per-authority adapters so Scotland, Wales and Northern Ireland (and local-authority
  roadworks) can be added later **without rewriting the app**. None are built in V1.
- Not in V1: turn-by-turn navigation, A-to-B HGV route planning, user accounts, local-authority roads.

### Success criteria (V1)
1. Installs to an iPhone home screen (and Android/desktop), opens, and works, including with no signal (last known data, clearly marked).
2. All current and upcoming NH closures and incidents load onto the map, with "Last updated" always visible.
3. Every closure shows an honest diversion classification: A, B or D (C is reserved and not implemented in V1). Any
   route drawn is official NH geometry, with HGV classification and restrictions checked against the user's vehicle.
4. Usable on phone, tablet, desktop, large touchscreen; TV/dashboard mode works with a remote (bonus).

## 2. Users and context

Professional HGV drivers: often on a phone, in a cab, at night or in bright sun, with patchy signal, sometimes
wearing gloves, short on time. They need fast answers: *is my road shut, when, which way, and can my lorry take the diversion?*

## 3. Core experience

1. **Launch.** The app shell opens instantly from cache. A short splash shows refresh progress (Closures · Diversions · Traffic)
   and **never blocks more than ~3 s**. On a slow/no network it opens with cached data and a "Data may be delayed" banner.
2. **Main screen.** Full-screen map with two separate controls:
   - **Layer selector**, a two-state segmented control: **Closures | Traffic** (one state at a time; no duplicate controls).
   - **Road selector**: search/pick a road (e.g. M6, A14), optional direction, My Roads shortcuts.
   - A status chip, "Last updated 14:05", turns amber/red when delayed/stale.
   - A **Settings** button (header) opens a panel over the map (the map, its view and selection are kept):
     - Appearance: theme System / Light / Dark, and the map style (Standard; no satellite until a free, licensed provider is approved);
     - Road restrictions: layer switches (§7.1);
     - App status: version, updates and current problems;
     - Data status and help: the data's version and times, where it came from, sources and licences, limitations, privacy and
       the safety notice;
     - Contact (reserved).
3. **Select a road**, and the map fits to that road (Network Model geometry), the list filters to its closures, ordered along the road.
4. **Select a closure** to open a bottom sheet (side panel on wide screens) with: road, direction, location/junctions, type, reason,
   start, expected end, status, source, last updated, diversion availability (classification badge), and a prominent
   **View Diversion** button (disabled with an explanation when the classification is D).
5. **Diversion screen** (separate map view, see §6).
6. **Export/share** the diversion (see §8).

## 4. Data and freshness

| Layer | Source (V1) | Refresh by us | Shown as |
|---|---|---|---|
| NH planned closures | S1 (fallback S2, cross-check S3) | every 5 min (S1); daily (S2/S3) | "Planned roadworks — National Highways" |
| NH unplanned closures/incidents | S1 `closureType=unplanned` | every 2–5 min | "Incident — National Highways" |
| Official diversion routes | S4 | daily (dataset changes rarely) | per classification (§5) |
| Road geometry / junctions | S5 | weekly | road selector |
| Official speed restrictions | S6 Speed Managed Areas | every 5 min | "Variable speed limit — National Highways" (Traffic state) |
| Live congestion | S9 TomTom flow tiles (optional) | client-side, per TomTom cache headers | "Live traffic — TomTom" (Traffic state, opt-in) |
| Base map | S10 OpenFreeMap | n/a | light/dark style |

Freshness rules (shown everywhere data appears):
- **Fresh** (closures/incidents < 15 min old since last *successful* fetch): "Last updated 14:05".
- **Delayed** (15–60 min): amber, "Data may be delayed. Last updated 13:40".
- **Stale** (> 60 min, or offline with cached data): red, "Offline/stale: showing data from 12:10. Check official sources."
- Planned closures that NH still marks `active` after their end time are **hidden as ended** (NH keeps them `active` for 7 days).
- Each record shows its source and the source's own timestamps where provided.

## 5. Diversion classification (the core accuracy rule)

Computed server-side in one deterministic module (`shared/`), returned in the API with its evidence, and rendered
with this exact wording.

**Objective:** maximise useful matches while keeping the false-positive rate extremely low. The objective is **not**
to maximise the share of B matches. A closure without sufficient evidence stays **D**.

### 5.1 Classes

| Class | Meaning | UI label | Map |
|---|---|---|---|
| **A** | The NH closure record **itself** contains closure-specific diversion information in its official text (§5.3). | **"Official diversion"**, then the NH text verbatim, "Source: National Highways, <timestamp>" | No line drawn: the text has no geometry. Never geocode or route the text. |
| **B** | An official NH diversion route (S4) whose closure stretch is matched to the closure by the **required evidence set** in §5.2. | **"Official NH diversion — match based on available data"**, plus confidence, plus the evidence list, plus "Pre-agreed emergency diversion route. The signed route on the day may differ: follow road signs." | Official route line + closed stretch |
| **C** | A route from our routing provider using the vehicle profile. **Not in V1.** Interface reserved. | **"Calculated HGV route — not an official diversion"** | Different colour, dashed, "Calculated" label |
| **D** | Anything that doesn't meet A or B. | **"No reliable diversion available"**, plus the specific reason, plus "Follow signed diversions and official instructions." | Closure only |

A and B can both apply to one closure. They're shown as two separate, labelled items, never merged into one claim.

### 5.2 Evidence required for B

"Same road + same direction" is **never** sufficient on its own. B requires **every** item below. If any item fails,
cannot be evaluated, or is ambiguous, the result is D, with that item named as the reason.

| # | Evidence | Rule | Why it's required |
|---|---|---|---|
| E1 | Eligible closure type | Closure is a full carriageway closure (`carriagewayClosures` / `roadClosed` or equivalent) with main-carriageway links at zero operational lanes. Lane-only and slip-road-only closures are not eligible. **Text gate (approved decision D4):** at least one contributing NH comment must state a carriageway/road closure, and any contributing comment describing slip-road, layby, access-road, depot, services, traffic-light, lane-only, hard-shoulder, link or narrow-lane work disqualifies it. NH text can only disqualify, never qualify on its own. | NH diversion routes exist for full closures; a lane closure leaves the road open, so offering a diversion would mislead. P0 found layby, slip-road, access-road and traffic-light works encoded with the main carriageway "closed". |
| E2 | Current record | Closure is current or upcoming (not past its end time, not `suspended`). Diversion route `RecordState = Complete` and not decommissioned. | Avoids matching to cancelled works or retired routes. |
| E3 | Road identity | Normalised road number of closure = stretch `RoadName` (e.g. `A1(M)` ≡ `A1M`). | Basic identity. Necessary, not sufficient. |
| E4 | Direction / carriageway | One explicit direction for the closure (a "both directions" closure is split and each direction evaluated separately) = stretch `Direction`, on the same carriageway. Unknown or unparseable direction fails. | Each emergency route serves one carriageway. The opposite carriageway's route is a dangerous false match. |
| E5 | Network position | The closure's affected Network Model links (S1 `linearElementIdentifier` → S5 `Link`) lie on the SRN path between the route's `SRNStartNode` and `SRNEndNode`, on that carriageway. | Strongest structural evidence. Uses NH's own network identifiers rather than map proximity. |
| E6 | Junction extent | Evaluated over the **whole closure** (all records of the situation for that direction and occurrence). The junction nodes bounding the closure (last junction before it, first after it, along the network) are the stretch's start and end nodes. A closure spanning more than one stretch fails. **A closure shorter than the stretch fails** (approved decision D2) unless separate evidence supports that specific shorter closure. **Position-precise** (approved decision D9): closure ends are taken from S1 `fromPoint`/`toPoint` `distanceAlong` against the link's geometric length (not `SHAPE__Length`); a closed section within the measured 10 m tolerance of a link end counts as reaching that end's node. | Ensures the diversion leaves and rejoins at the right junctions. A closure across J40–J42 isn't answered by the J41–J42 route, and the official route for a whole stretch may not be the signed diversion for a shorter closure inside it. |
| E7 | Spatial corroboration | Closure geometry lies within the stretch geometry's buffer to at least the P0-agreed threshold. | Independent cross-check that catches identifier or data errors in E5/E6. |
| E8 | Uniqueness | Exactly one stretch satisfies E3–E7. Any competing candidate means D. | Ambiguity must never be resolved by guessing. |

**Stretch eligibility (approved decision D7):** a stretch can establish B only if its own S4 labels (`JunctionNumberFrom/To`)
reconcile with the S5 junctions at the ends of its traced route path. Labels that disagree, or that aren't a road + junction number
(e.g. "A4130"), mean that stretch can't establish B. Labels are never inferred or repaired. This adds no way to qualify, leaves the S4 data
untouched, and doesn't affect A. S4 rows sharing one stretch GUID are merged when they agree; if they disagree, that stretch can't establish B.

**Geometry-only matching** (E5 unavailable, e.g. a closure from the fallback source S2, which has no link IDs) is **not
allowed for B by default**. It may be enabled only if P0 shows a measured false-positive rate that you accept, and then
only with confidence shown as "Medium — location match only".

**Several official routes for one stretch:** 104 stretches have 2–4 complete routes (e.g. `M65/J1/J2/1` and `/2`).
Choosing the stretch (E1–E8) and listing its routes are separate steps. When the stretch matches, all its complete
routes are shown, each labelled with its route number and NH classification, with HGV-unsuitable (2a/2b) routes flagged
as such. The app never claims which one is in use. P0 confirms what the route number signifies.

**Confidence shown to users:** "High — matched by National Highways network position (E1–E8)". The API returns the
evaluated evidence list so the UI can show the reasons in plain English.

### 5.3 Evidence required for A

Approved decision D1 (2026-10-05). P0 found that S1 closure records carry no diversion text. The official text is in S2,
which is joined to S1 by National Highways' own shared event identifier (S1 situation `idG` = S2 `formattedeventnumber` base).

A requires **both**:
1. **Explicit link:** the S2 record is joined to the S1 closure's situation by that shared identifier (and agrees on road).
   No other joining (text, location, time similarity) may produce A.
2. **Specific text:** the S2 description contains a diversion statement naming at least one specific road, place, junction or
   signage symbol (e.g. "Diversion via A30 to Chard, A358 to rejoin A303"). Generic statements ("Diversion via National Highways
   network") are **not** A. They're shown verbatim as an NH note, and the classification stays D.

Label: **"Official diversion information for this roadworks event"**, followed by the NH text verbatim. When the event contains
more than one closure, the UI must not imply the text applies uniquely to the selected closure (e.g. "This roadworks event includes
N closures"). Recognition rules are deterministic and tested against captured real text, including near-misses.

**S2-only closures** (approved decision D3, 2026-10-05). P0 found closures listed in S2 with no S1 situation. They are shown as
official NH closure records, marked with their source (`nh-s2`) in the data model. For them:
- A is allowed only when the S2 record's **own** text contains a specific diversion statement (rule 2 above). Rule 1 is not needed
  because the text belongs to the closure's own official record. The same label and multi-closure caveat apply.
- **B is never allowed:** S2 records lack the S1 Network Model link evidence that E5/E6 require.
- Otherwise the result is D.

**S3-only closures** (approved decision D8, 2026-10-05). Closures that appear only in the 7-day closure report (S3) have no coordinates
and no reliable event or network join. They are **not shown on the map**, can **never** establish A or B, and are D for diversion
classification. S3 remains a cross-check and a source of textual closure information only.

### 5.4 Other rules
- **A closure, planned or unplanned, does not by itself mean that a pre-agreed emergency diversion route is in use.**
  NH's routes (S4) are designed for unplanned full closures and aren't linked to any closure record. Planned works may be
  signed with a different diversion. B therefore claims only an evidence-based match to an official route, never that
  the route is active, and always carries the "signed route on the day may differ" caveat.
- Partial overlaps, adjacent-junction candidates and opposite-direction candidates are **D**, never "probably".
- Thresholds and evidence rules can change only with new fixture evidence and your sign-off.
- A user can still browse "Official NH emergency diversion routes on this road" as a **reference layer** that makes no
  claim about any closure. It's labelled exactly so.
- Abnormal loads: always show "Emergency diversion routes are not designed for abnormal loads" (GG 903).

### 5.5 Initial experiment (context, not a target)

Initial real-data experiment (2026-10-05): approximately 10% of tested planned closures produced a clean single
diversion candidate using the initial matching approach (geometry, road and direction only, without network IDs).
This is not a target or a forecast. P0 establishes the real figure under the §5.2 evidence rules.

## 6. Diversion screen

Separate map view showing: closed section (red), diversion line (B only), start/end markers, **signage symbol** (rendered
as the real solid/hollow ▲ ● ■ ◆ shape), restriction points with values, route length (miles), estimated time (NH value
where present), toll / clean-air-zone flags, NH `RouteClassification`, route `DiversionRouteID` and last-modified date, the
classification label and confidence, and the HGV compatibility panel (§7). Safety notice always visible.

## 7. HGV strategy (V1)

- **Vehicle profile** (stored on device): height, width, gross weight, length. Height accepted and shown in **m and ft-in**,
  weight in tonnes, width/length in m. Optional quick-fill presets that the user must confirm.
- **HGV status of every official route** (approved decision D5): exactly one of `not-suitable`, `check-vehicle` or
  `no-restrictions-recorded`. **There is no "suitable" status, and the app never outputs "HGV suitable".**
  - `not-suitable`: Class 2a/2b, no recognised classification, or NH's description says not for HGVs ("Non HGV", "Cars only", …).
    That text overrides a Class 1a/1b classification (P0 found 5 such conflicts).
  - `check-vehicle`: NH records restrictions (route limit fields and restriction points). All are listed and checked against the profile.
    P0 found 46 Class 1A/1B routes with height limits under 4.95 m.
  - `no-restrictions-recorded`: always shown with "This does not guarantee there are none."
- Checks against a B route:
  - `RouteClassification` **2a/2b** shows a blocking banner: **"NOT FOR HGVs: National Highways classifies this diversion as unsuitable for HGVs."**
  - Route limit fields and `DiversionPoint` restrictions are compared with the profile. Any conflict shows a blocking banner
    naming the restriction, value and the vehicle's value (e.g. "Low bridge 4.4 m (14′5″) — your vehicle 4.9 m (16′1″)").
  - No profile set: show all restrictions, plus "Set your vehicle to check compatibility".
  - No restriction data recorded: "National Highways records no restrictions on this route. This does not guarantee there are none."
- Closure-level flags from S1 (`hasHeight/Width/WeightRestrictionFlag`, contraflow) are shown on the closure sheet.
- Routing layer: a `RoutingProvider` interface (`route(from, to, profile, avoid)`), unused in V1. The future C implementation
  must post-check every calculated route against NH restriction points and label it C. Full A-to-B routing is a later phase.

### 7.1 Restriction layers (information only)

Map overlays, each switched on separately in Settings, all **off by default**; choices are remembered on the device.

| Layer | Sources | Shown as |
|---|---|---|
| Height restrictions | NH S4 diversion points and S5 vehicle restrictions (official), TfL low bridges, tunnels and barriers (official, London, height bands), OpenStreetMap (community, unverified; when a build includes it, docs/RESTRICTIONS.md) | Sign-style value markers from zoom 12 |
| Weight restrictions | NH S4 (official): weight values recorded on emergency diversion routes, with type, scope and exemptions not recorded, so never shown as lorry or all-vehicle limits. OpenStreetMap (community, when included): lorry limits such as 7.5 t kept distinct from all-vehicle (structural) limits | Sign-style value markers from zoom 12: grey border for NH values of unrecorded type, a lorry or bridge glyph for OSM kinds. The key lists only kinds that are loaded |
| London LEZ | TfL boundary (official) | Dashed green boundary, labelled |
| London ULEZ | TfL boundary (official; the same boundary as the LEZ since August 2023, with different rules) | Solid blue boundary, labelled |

- **Details.** Selecting a marker (or an item in the keyboard-accessible "Restrictions in this view" list) shows:
  - the type and recorded value (height in m and ft-in, bands kept as bands);
  - the location;
  - the source and whether it is official or community (unverified);
  - dates, conditions and exemptions, verbatim;
  - limitations.
- **Wording.** Shown wherever restriction data is shown, verbatim: "Restrictions data is incomplete. Community-sourced records
  are unverified. No marker does not mean no restriction. Always follow road signs. This map is not a route check."
- **What the layers never do.** They don't check a vehicle or a route, never imply a road is clear, and never change closures,
  diversions or classifications.
- **Data.** Versioned static files, validated, downloaded only when a layer is switched on. Sources, licences, coverage gaps and
  the update procedure are in `docs/RESTRICTIONS.md`.

## 8. Export / satnav strategy (what is realistic)

| Target | Mechanism | Reliability | V1 |
|---|---|---|---|
| Any device | **GPX 1.1 file** (B routes only): `<trk>` (exact geometry) + `<rte>` (shaping points) + metadata (source, class, date, warnings) | High (open format) | ✅ |
| iOS / Android | **Web Share API with file** so the user picks the receiving app; falls back to download | High where supported; fallback otherwise | ✅ |
| Garmin (Drive app / dēzl, RV) | Share GPX → "Garmin Drive" app → device Trip Planner; or USB copy to `GPX/` folder | Documented by Garmin for RV/Camper models; **dēzl to be tested on your device** | ✅ via share + guide |
| TomTom GO app | Deep link `tomtomgo://x-callback-url/navigate?destination=lat,lon` gives the **destination only**; the app computes its own route | Works where the app is installed; **does not follow our diversion** | ✅ labelled "Destination only" |
| TomTom (track) | Upload GPX at plan.tomtom.com (MyDrive) → "sync as track" to app/devices | Works, needs a TomTom account and manual steps | ✅ guided steps + link |
| Google / Apple Maps / Waze | Destination deep link | Car routing only | ✅ labelled "Car navigation, ignores HGV restrictions" |
| Direct push to a TomTom/Garmin device | No public consumer API found | n/a | ❌ not promised |

Every export repeats the classification and "Your satnav may recalculate the route. Follow road signs." Class A (text only)
and D have no route to export.

## 9. UI requirements

- Mobile-first; layouts for phone (bottom sheet), tablet (side panel), desktop/large touchscreen (panel + map),
  **TV/dashboard mode** (`?mode=dashboard`: large type, auto-cycling My Roads, auto-refresh, D-pad focus navigation).
  It's the same app with a responsive mode, not a separate one.
- Themes: system / light / dark (chosen in Settings; System follows the device live); the map style follows.
- Touch targets ≥ 48 px; WCAG 2.2 AA; full keyboard/remote operation; information never by colour alone.
- Distinct visual language per source: NH closures, NH incidents, planned roadworks, live traffic, official diversion,
  calculated route (later). A legend is always one tap away.
- Location: optional, works fully without it. On launch the app asks the browser once (not when location is already blocked) and,
  if allowed, centres the map on the user at about a 10-mile radius as the initial view only; the location button asks again.
- **Safety notice** on first launch and on every diversion/export screen: "For planning only. Do not use while driving.
  Always follow road signs, police and National Highways instructions and temporary traffic management. If this app
  conflicts with signs on the road, the signs take priority."
- Attribution screen (Settings → Sources and licences): National Highways (OGL v3.0), OpenStreetMap/OpenMapTiles/OpenFreeMap, every
  restriction source (docs/RESTRICTIONS.md), TomTom (if enabled).
- App updates (docs/APP-UPDATES.md): a new build is offered only once it is downloaded, with an explicit Reload. The app never
  reloads itself while in use. The app's version (commit and build time) is separate from the traffic data's version.

## 10. Architecture

```
GitHub Actions (scheduled, no CPU limit)            Cloudflare Worker (free plan; static assets + API)
  weekly: S5 roads → simplified road index ─┐         cron */5: S1 planned+unplanned, S6 → validate → normalise
  daily:  S4 routes/stretches → index ──────┼──R2──▶  → classify (uses prebuilt indexes) → write versioned snapshot
          S2/S3 cross-check report ─────────┘         → update meta (lastSuccess, lastAttempt, error, counts)
                                                     GET /api/meta  /api/closures  /api/closures/:id
                                                         /api/diversions/:id  /api/roads  /api/roads/:ref
                                                     static: the React PWA (SPA mode)
Browser: React + MapLibre + TanStack Query + service worker
  base tiles ← OpenFreeMap (direct) · TomTom flow tiles ← direct with a restricted key (opt-in) or via a non-caching proxy
```

- **Hosting:** Cloudflare **Workers Static Assets** (Cloudflare now recommends this over Pages for new projects) serving the SPA
  and `/api/*` from one origin, ideally on a custom domain (the Cache API doesn't work on `workers.dev`).
- **Why the split:** the Workers free plan allows **10 ms CPU per invocation** and **1,000 KV writes/day**. Heavy geometry work
  (S4/S5 processing, indexes) runs in GitHub Actions and is uploaded to R2. The Worker cron does light work using those indexes.
  P0 measures whether S1 ingest + classification fits in 10 ms. If not, **Workers Paid ($5/month)** is the fallback (decision for you).
- **Storage:** R2 for snapshots and indexes (versioned keys, plus a `current` pointer); KV not required. Last known good is kept:
  a refresh that fails validation or drops record counts abnormally is rejected and logged in `meta`.
- **Frontend:** Vite 8, React 19, TypeScript 6.0 (typescript-eslint doesn't support 7 yet), Tailwind 4, MapLibre GL JS 6,
  TanStack Query 5, vite-plugin-pwa 2, Zod 4. No other runtime dependencies without justification.
- **Offline:** precached app shell (the service worker, docs/APP-UPDATES.md: one build at a time, updates offered with Reload, never
  forced); API responses network-first with cached fallback (timestamps preserved); OpenFreeMap tiles
  you've viewed cached with a size cap (allowed by its terms). TomTom tiles are not cached beyond their headers. **No complete
  offline England map in V1.** A self-hosted England PMTiles overview pack is a later option.
- **Future UK coverage:** adapters keyed by authority (`nh-england`, later `traffic-scotland`, `traffic-wales`, `ni`); the normalised
  model includes `authority`, `region`, `sourceAttribution`; diversion classification is per-authority evidence.

## 11. Security and privacy

- Keys only in Wrangler secrets / GitHub Actions secrets; `.dev.vars` git-ignored; nothing secret in the bundle. TomTom: restrict the
  key to our domains if TomTom supports it (*verify*); otherwise route through a non-caching Worker proxy with per-IP rate limits.
- Worker: read-only GETs, Zod-validated params, rate limiting, CORS limited to our origin, strict CSP (map/tile hosts allow-listed),
  security headers, no stack traces in responses.
- Upstream text is rendered as text only. Outbound links come from an allow-listed scheme/host builder.
- Location: opt-in through the browser's permission prompt, never stored or sent to our server (the map centres locally).
- No accounts, cookies or analytics. Favourites, the vehicle profile and Settings (theme, restriction layers) stay on the device.
- Supply chain: lockfile, `npm audit` + Dependabot, minimal dependencies, GitHub secret scanning and push protection, pinned Actions.
- ISO-conscious practices (least privilege, documented data flows, refresh audit log, secret rotation), without claiming certification.

## 12. Testing strategy

**Data:** recorded real fixtures (S1 after P0, S2, S3, S4, S5), trimmed and key-free; parser tests per adapter; normalisation
snapshot tests; road/direction parsing ("both directions", "anti-clockwise", "J32A"); **matching tests on real closures with
expected class, reviewed by you**; **false-match tests** (adjacent junction stretches, opposite direction, partial overlap, slip roads,
discontinued routes, parallel A-road near a motorway); HGV checks (2a/2b, each limit type, unit conversion, no-profile, no-data);
staleness thresholds; ended-but-`active` closures; upstream failure (timeout, 401, 429, 5xx, malformed payload, empty result),
where last known good must be kept.

**UI:** Vitest + Testing Library for components; Playwright at 390×844, 820×1180, 1440×900 and 1920×1080, touch emulation,
keyboard-only and D-pad (arrow keys) navigation, light/dark, offline mode, axe accessibility checks. Real-device checks on iPhone
(home-screen install, share sheet, location prompt) and Android, plus your TV in P8.

**Production gate:** `npm run check` (typecheck, lint, unit tests, build) in CI on every PR; e2e on PR; `npm audit`; Lighthouse PWA/a11y;
Worker contract tests (`@cloudflare/vitest-pool-workers`); header/CORS tests; manual HTTPS and install check before release.

## 13. Phases

| Phase | Scope | Exit criteria |
|---|---|---|
| **P0 Data verification** | Capture real data, verify S1 against the network data, establish and validate the §5.2/§5.3 rules, measure feasibility. No UI. | All criteria in §13.1 met and signed off by you |
| **P1 Foundation** | Repo + CI, Worker + static assets skeleton, PWA shell, design system (`frontend-design`), themes, layout, splash, safety notice | Deployed shell installs on your iPhone |
| **P2 Ingest + API** | Adapters S1/S2/S4/S5/S6, normalisation, classification, R2 snapshots, last known good, meta/staleness, API contract | API serves classified closures with timestamps; failure tests pass |
| **P3 Map, closures, roads** | Map layers, Closures/Traffic selector, road selector + centring + My Roads, closure sheet | Find M6 and its closures in two taps on a phone |
| **P4 Diversions + HGV** | Diversion screen, symbols, restrictions, vehicle profile, compatibility warnings | Reviewed fixture set renders correctly |
| **P5 Traffic** | NH incidents + speed restrictions; optional TomTom overlay with quota guard | Sources visibly distinct; limit handled gracefully |
| **P6 Export** | GPX, share sheet, Garmin/TomTom guides, deep links | Imports verified on your devices |
| **P7 Hardening** | Offline/poor signal, iOS install, a11y audit, security headers, Lighthouse | All V1 success criteria pass |
| **P8 TV/dashboard** | Dashboard mode, D-pad focus | Works on your TV browser |
| Later | C routing (A-to-B HGV), an official national restriction source (OS RAMI or D-TRO, once licensed), width/length layers, offline England pack, Scotland/Wales/NI, NTIS | — |

### 13.1 P0 acceptance criteria

P0 is the first development phase. It is **data verification only**, with the minimum tooling needed (TypeScript,
Vitest, Zod, plus any geometry library justified in the report).

- **P0 may create:** capture scripts (`scripts/`), trimmed real-data fixtures (`fixtures/`), schemas and types, pure
  matching/classification logic (`shared/`), tests, and `docs/P0-REPORT.md` with updates to these docs.
- **P0 must not create:** React or any other UI, map UI, production Worker code, deployment configuration or deployments,
  or any application feature. Capture scripts run locally. The NH key lives only in a git-ignored local env file.

**Data capture and verification**
1. S1 planned **and** unplanned closures captured as JSON on at least **3 separate days**, including at least one weekend
   day, together with same-day snapshots of S2, S4, S5 and S6. Fixtures are trimmed, contain no keys, and the capture is repeatable (`scripts/`).
2. Every S1 and S6 field the design relies on is confirmed in real payloads, and the licence of each source (including S4)
   is confirmed from its own published terms. All of it is recorded in `DATA-SOURCES.md` with the date. Anything still
   unverified is listed explicitly.
3. **Link-ID join measured:** the `linearElementReferenceModel` value is documented, and the percentage of S1 records whose
   `linearElementIdentifier` resolves to an S5 `Link` is reported. If the join doesn't work, E5 is recorded as unavailable
   and the B consequences are stated.
4. Feasibility measured: S1 payload sizes and paging, how often records change, CPU time to parse + classify (to decide
   between the Workers free plan and Workers Paid), and S1 timeliness compared with S2/S3 for the same events.

**Algorithm established and documented (in `docs/P0-REPORT.md` and §5.2)**
5. Network-node matching (path from `SRNStartNode` to `SRNEndNode` on one carriageway).
6. Direction handling: compass, clockwise/anti-clockwise, "both directions" splitting, unknown direction meaning D.
7. Junction matching: numbered junctions including suffixes (J4A), unnumbered and named junctions, closures spanning several stretches.
8. Carriageway handling: main carriageway vs slip roads vs link roads, and closure-type eligibility (E1).
9. Overlap threshold for E7, with the measured distribution that justifies it.
10. Competing-candidate handling (E8), and the meaning of multiple routes per stretch (route numbers).
11. Class A text recognition rules (§5.3).

**Validation (evidence the rules are safe)**
12. Two labelled sets: a **development set** (used to design rules) and a **held-out set** from a different capture day.
    Rules and thresholds are frozen before the held-out set is evaluated.
13. Held-out set: at least **100 eligible closure-directions** with human-reviewed ground truth (correct stretch, or "no
    correct stretch"), including every closure the matcher classifies as B. Reviewed by me against NH descriptions,
    junctions and maps, with a sample, including every disputed case, reviewed by you.
14. **False positives: zero** B classifications pointing to a wrong stretch or route on the held-out set. The statistical
    bound is reported (with 0 errors in N reviewed, the 95% upper bound is about 3/N).
15. **False negatives** (human says a correct stretch exists, matcher says D) are measured and reported with reasons. There's
    no target: they're the safe failure mode.
16. **Final percentage** of closures that can safely receive B under the frozen rules is reported, broken down by road type
    and closure type. No target.
17. Class A recognition: **zero** generic statements classified as A on the reviewed sample; recall reported.
18. Real-fixture **false-match test suite** passes, with at least one case for each: adjacent junction, opposite carriageway,
    partial overlap, slip-road-only closure, closure spanning two stretches, parallel road near a motorway, discontinued
    route, closure past its end time, lane-only closure.

**Engineering**
19. Matcher and classifier are pure TypeScript in `shared/` with unit tests. Typecheck, lint and tests pass. No secrets in
    the repo (secret scan clean). Every dependency is justified in the report.
20. `DATA-SOURCES.md` and §5 are updated with the findings. Decisions needed from you are listed.

**Exit**
21. You sign off the rules, thresholds and results. **If zero false positives can't be achieved on the held-out set, B is
    disabled for V1** (A + D only) and P1 proceeds on that basis.

## 14. Reuse from previous projects

- **HGV-Destinations-Pro:** reuse *ideas* only after review. The UK-bounded Photon search (for a later "Near place" search), the
  metres/feet-inches height parser (rewrite in TS with tests), the Overpass low-bridge query (later, labelled as community data),
  the TomTom deep-link attempt (replace with the documented `tomtomgo://x-callback-url` scheme). **Avoid:** raster tiles from
  `tile.openstreetmap.org` (usage policy), the OSRM demo (car-only), hard-coded admin credentials, very large single modules.
- No other previous project is a source of requirements or architecture for Traffic Advanced.
