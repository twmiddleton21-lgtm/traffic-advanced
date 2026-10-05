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
3. Every closure shows an honest diversion classification (A/B/D); any route drawn is official NH geometry, with
   HGV classification and restrictions checked against the user's vehicle.
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

Computed server-side in one module, returned in the API, rendered with this exact wording.

| Class | Rule | UI label | Map |
|---|---|---|---|
| **A** | The NH closure record **itself** contains closure-specific diversion information (named roads / symbol) in its official text. | **"Official diversion"**, then the NH text verbatim, "Source: National Highways, <timestamp>" | No line drawn (text has no geometry). Never auto-geocode or route the text. |
| **B** | An official NH diversion route (S4, `RecordState=Complete`) whose closure stretch matches the closure on **all** of: same road; same direction (per-direction split for "both directions"); **and** network match (closure links within the stretch between `SRNStartNode`/`SRNEndNode`, via S5) **or** geometric match (≥ 80% mutual overlap within 30 m); **and** no competing candidate with an equal score. | **"Official NH diversion — match based on available data"**, plus confidence (High = network match; Medium = geometry only) and the reasons ("Same road, same direction, closure covers M6 J41–J42 stretch"), plus "Pre-agreed emergency route. The signed route on the day may differ: follow signs." | Official route line + closed stretch |
| **C** | A route from our routing provider using the vehicle profile. **Not in V1.** Interface reserved. | **"Calculated HGV route — not an official diversion"** | Different colour + dashed + "Calculated" watermark |
| **D** | Anything else (no candidate, partial overlap, ambiguous, direction unknown, matched route is discontinued). | **"No reliable diversion available"**, plus the reason, plus "Follow signed diversions and official instructions." | Closure only |

Notes:
- A and B can both apply. Show the A text and the B map, each labelled. They are never merged into one claim.
- Partial overlaps are **D**, never "probably". Thresholds can only be loosened with new evidence and user sign-off.
- A user can still browse "Official NH emergency diversion routes on this road" as a **reference layer** that makes no claim
  about any closure. It's labelled exactly so.
- Abnormal loads: always show "Emergency diversion routes are not designed for abnormal loads" (GG 903).

## 6. Diversion screen

Separate map view showing: closed section (red), diversion line (B only), start/end markers, **signage symbol** (rendered
as the real solid/hollow ▲ ● ■ ◆ shape), restriction points with values, route length (miles), estimated time (NH value
where present), toll / clean-air-zone flags, NH `RouteClassification`, route `DiversionRouteID` and last-modified date, the
classification label and confidence, and the HGV compatibility panel (§7). Safety notice always visible.

## 7. HGV strategy (V1)

- **Vehicle profile** (stored on device): height, width, gross weight, length. Height accepted and shown in **m and ft-in**,
  weight in tonnes, width/length in m. Optional quick-fill presets that the user must confirm.
- Checks against a B route:
  - `RouteClassification` **2a/2b** shows a blocking banner: **"NOT FOR HGVs: National Highways classifies this diversion as unsuitable for HGVs."**
  - Route limit fields and `DiversionPoint` restrictions are compared with the profile. Any conflict shows a blocking banner
    naming the restriction, value and the vehicle's value (e.g. "Low bridge 4.4 m (14′5″) — your vehicle 4.9 m (16′1″)").
  - No profile set: show all restrictions, plus "Set your vehicle to check compatibility".
  - No restriction data recorded: "National Highways records no restrictions on this route. This does not guarantee there are none."
- Closure-level flags from S1 (`hasHeight/Width/WeightRestrictionFlag`, contraflow) are shown on the closure sheet.
- Routing layer: a `RoutingProvider` interface (`route(from, to, profile, avoid)`), unused in V1. The future C implementation
  must post-check every calculated route against NH restriction points and label it C. Full A-to-B routing is a later phase.

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
- Themes: system / light / dark; the map style follows.
- Touch targets ≥ 48 px; WCAG 2.2 AA; full keyboard/remote operation; information never by colour alone.
- Distinct visual language per source: NH closures, NH incidents, planned roadworks, live traffic, official diversion,
  calculated route (later). A legend is always one tap away.
- Location: optional "Near me" button, one-time request with an explanation first, works fully without it.
- **Safety notice** on first launch and on every diversion/export screen: "For planning only. Do not use while driving.
  Always follow road signs, police and National Highways instructions and temporary traffic management. If this app
  conflicts with signs on the road, the signs take priority."
- Attribution screen: National Highways (OGL v3.0), OpenStreetMap/OpenMapTiles/OpenFreeMap, TomTom (if enabled).

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
- **Offline:** precached app shell; API responses network-first with cached fallback (timestamps preserved); OpenFreeMap tiles
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
- Location: one-shot, opt-in, never stored or sent to our server (the map centres locally).
- No accounts, cookies or analytics. Favourites and the vehicle profile stay on the device.
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
| **P0 Data verification** | Get the NH key; capture S1 fixtures; verify link-ID join to S5/S4; measure payload size and Worker CPU; build and tune the matcher against real data; produce a match report | You review ~30 real matches/non-matches and sign off rules |
| **P1 Foundation** | Repo + CI, Worker + static assets skeleton, PWA shell, design system (`frontend-design`), themes, layout, splash, safety notice | Deployed shell installs on your iPhone |
| **P2 Ingest + API** | Adapters S1/S2/S4/S5/S6, normalisation, classification, R2 snapshots, last known good, meta/staleness, API contract | API serves classified closures with timestamps; failure tests pass |
| **P3 Map, closures, roads** | Map layers, Closures/Traffic selector, road selector + centring + My Roads, closure sheet | Find M6 and its closures in two taps on a phone |
| **P4 Diversions + HGV** | Diversion screen, symbols, restrictions, vehicle profile, compatibility warnings | Reviewed fixture set renders correctly |
| **P5 Traffic** | NH incidents + speed restrictions; optional TomTom overlay with quota guard | Sources visibly distinct; limit handled gracefully |
| **P6 Export** | GPX, share sheet, Garmin/TomTom guides, deep links | Imports verified on your devices |
| **P7 Hardening** | Offline/poor signal, iOS install, a11y audit, security headers, Lighthouse | All V1 success criteria pass |
| **P8 TV/dashboard** | Dashboard mode, D-pad focus | Works on your TV browser |
| Later | C routing (A-to-B HGV), OSM low-bridge layer (from HGV-Destinations-Pro ideas), offline England pack, Scotland/Wales/NI, NTIS | — |

## 14. Reuse from previous projects

- **HGV-Destinations-Pro:** reuse *ideas* only after review. The UK-bounded Photon search (for a later "Near place" search), the
  metres/feet-inches height parser (rewrite in TS with tests), the Overpass low-bridge query (later, labelled as community data),
  the TomTom deep-link attempt (replace with the documented `tomtomgo://x-callback-url` scheme). **Avoid:** raster tiles from
  `tile.openstreetmap.org` (usage policy), the OSRM demo (car-only), hard-coded admin credentials, very large single modules.
- **driver-timesheet-pro:** lessons only. Real offline support (it had none), no globals or inline handlers, no CDN Tailwind, honest security claims.
