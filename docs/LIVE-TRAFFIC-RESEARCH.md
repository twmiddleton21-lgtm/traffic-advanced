# Live traffic for the Routes map: research (2026-10-12)

Research, not evidence that any licence or terms have been approved. A TomTom integration was built and tested locally, then
**deferred from the first release**: it isn't shown, routed or configured (see "Implementation status"). No account, key,
secret, dependency or infrastructure was added.

**Labels:**
- **Verified:** read on the provider's own page or file on 2026-10-12 and quoted.
- **Unverified:** a secondary source, an inference, or not found.

Prices, allowances and terms change. Re-check them before any decision.

## Implementation status (2026-10-12): built locally, deferred from the first release

The owner asked for the full build with the legal review deferred. **TomTom's terms questions below are still open.** Its
"Permitted Solution" clause may not cover this app. Nothing below has been deployed or switched on.

**First release (owner's release decision, 2026-10-12): live TomTom traffic is deferred entirely.**
- The public app has no traffic switch, key, maintenance message, TomTom credit, TomTom source entry or TomTom privacy line. The
  Routes panel shows the approved note "Live traffic isn't connected yet. Road closures are in the Closures view."
- The browser-side traffic code is kept, working and tested, in `web/src/deferred/traffic/` (its README says how to bring it
  back). Nothing in the app imports it, so it isn't in the build.
- The Worker code stays in `worker/src/traffic/`, but `worker/src/index.ts` neither routes `/api/traffic/*` (it answers 404) nor
  exports `TrafficUsage`.
- `wrangler.jsonc` has no Durable Object binding or migration. Turning traffic on later needs deliberate changes to both files,
  plus a key secret and an R2 control object. `worker/src/deploy-config.test.ts` and `web/src/ui-safety.test.ts` enforce this.

**What was built (local; deferred as above):**
- **Worker** `GET /api/traffic/flow/{z}/{x}/{y}` (zoom 7–13) and `GET /api/traffic/status` (`worker/src/traffic/`):
  - It proxies TomTom Orbis vector flow tiles, with the key in the `TomTom-Api-Key` header, never in a URL or a log.
  - Responses are `private` and kept by the browser at most 5 minutes within TomTom's max-age; there's no shared cache.
  - **The gate fails closed**, in this order:
    1. the key secret and counter binding must both exist;
    2. the R2 control object must say on, and now must be inside its billing period;
    3. the counter must reserve the request.
  - Visitors only ever get `503 {"error":"traffic-unavailable"}`.
  - On 429 everyone backs off for at least 10 minutes (longer if Retry-After says so); on a refused key, 1 hour; on an outage,
    2 minutes.
- **Usage counter:** a Durable Object, `TrafficUsage` (`usage-object.ts`), with the logic in `usage-ledger.ts`.
  - Each upstream request is reserved before it's made, inside one synchronous `transactionSync`, so concurrent requests can't
    overshoot. The tests run 60 concurrent requests with 5 left under the cap: exactly 5 reach TomTom.
  - Limits: 150,000 a billing period, a log warning at 120,000, and 5,000 per UTC day to protect the Workers Free 100,000/day
    shared with `/api/closures`.
  - Every request is counted, including errors, because TomTom doesn't say which it bills.
- **Kill switch, no deployment:** the object `traffic/control.json` in the existing R2 bucket, read on every traffic request.
  Missing, invalid, `enabled: false` or outside its billing period all mean off.
- **Routes view (in `web/src/deferred/traffic/`, not shown):**
  - a "Live traffic" switch, off by default, for the map panel and Settings;
  - a congestion key whose four bands differ in colour and width, plus TomTom-reported closures as dashed lines;
  - the "Traffic © TomTom" bubble, shown only while traffic is drawn;
  - "Traffic fetched at HH:MM";
  - the maintenance message on any failure, after which traffic is hidden and not retried until switched off and on.
  - Tiles are fetched only while Routes shows traffic, from zoom 7 (stretched beyond 13), and refreshed every 10 minutes only
    while visible.
- **Settings:** a TomTom entry under Sources and licences in Routes, and a privacy line saying TomTom sees our server's requests,
  not the user's, were drafted and then removed for the first release. Their wording was never approved. No CSP change was
  needed: the browser would only call our own origin.

**Approvals and actions needed before it can run (a later release):**
1. **Durable Object binding (new infrastructure, Workers Free, no charge within its limits).**
   - **Local configuration: approved as Option A (`migrations`) on 2026-10-12 and tested, then removed from `wrangler.jsonc`
     for the first release** (owner's release decision, the same day). The configuration to add back:
     ```jsonc
     "durable_objects": { "bindings": [{ "name": "TRAFFIC_USAGE", "class_name": "TrafficUsage" }] },
     "migrations": [{ "tag": "v1", "new_sqlite_classes": ["TrafficUsage"] }]
     ```
     When it was configured, `worker/src/deploy-config.test.ts` asserted exactly this and `npm run worker:check` (a dry run;
     nothing uploaded) validated it. For the first release that test instead asserts there is no binding, migration or export.
   - **Production: NOT deployed.** No Durable Object namespace exists on Cloudflare yet. The next `wrangler deploy` would apply
     migration `v1` and create it. That deploy needs its own approval. Once applied, `v1` must never be edited; later changes
     go in new migrations with new tags.
   - The alternative considered: Cloudflare's migrations page (updated 2026-09-28) also describes a declarative `exports` form
     that replaces `migrations`. A Worker uses one or the other, and once it deploys with `exports` it can't go back. Both forms
     validated with Wrangler 4.147.0; the owner chose `migrations`.
2. **TomTom account and key** (owner): `npx wrangler secret put TOMTOM_API_KEY`. Restrict the key to the Traffic API.
3. **Control object** (owner, after reading the billing cycle in the TomTom dashboard):
   `{"enabled": true, "billingPeriod": {"start": "<cycle start, ISO>", "end": "<cycle end, ISO>"}}` at `traffic/control.json`
   in `traffic-advanced-snapshots`.
   - Update it each cycle; outside the period, traffic is off.
   - To stop traffic at once, set `"enabled": false` or delete the object.
4. **TomTom terms** (open):
   - production use without "Asset Management Functionality";
   - overlay on an OpenStreetMap base map (20.2.3);
   - the attribution text from the Copyright API (the bubble is provisional), and approval to use TomTom's name (17.3);
   - end-user terms (clause 12);
   - whether 11.6.9 (high-risk safety systems) applies.
5. **Wording for review:**
   - "From TomTom, not National Highways. Road closures are in the Closures view."
   - The band names: Free flowing, Slow, Heavy, Stationary or very slow, Closed (reported by TomTom).
   - The approved "Live traffic isn't connected yet…" note: shown in the first release; it would be retired when traffic ships.

### Local Durable Object validation (2026-10-12)

The real `TrafficUsage` class runs in the local Workers runtime (workerd, started through the installed Wrangler 4.147.0) in
`worker/src/traffic/usage-object.workerd.test.ts`, which is part of `npm test`.
- **Setup:** the test writes its own config to a temporary directory, with the binding and migration approved as Option A
  (no longer in `wrangler.jsonc`) plus the test-only class. That config binds only local simulations (Durable Object, R2). `wrangler.jsonc` is not used, and
  no Cloudflare account is involved.
- **The Worker under test** is `worker/src/traffic/workerd-harness.ts`. It's test-only: nothing imports it and it's never deployed.
  Its fake upstream counts calls, so TomTom is never contacted.
- **What it shows, with real SQLite storage, real `transactionSync` and real concurrent requests to one object:**
  - 1,000 reservations at once hand out every count from 1 to 1,000 exactly once.
  - With 60 left under the daily cap, 1,000 at once get exactly 60, and the next UTC day starts afresh.
  - With 5 left under the monthly cap, 60 at once get exactly 5. The warning fires once, and a new billing period starts at zero.
  - Back-off holds until its exact end and is never shortened.
  - Status reserves nothing, and malformed commands are refused.
  - A real storage error (the table dropped) fails closed, with no upstream request.
  - Counts survive a runtime restart.
  - Through the whole gate (local R2 control object, real counter), 60 tile requests with 5 left give 5 served and 5 upstream
    calls.
  - The UTC midnight and billing-period start/end boundaries hold, the kill switch works, and a 429 backs everyone off.
- **Seeding:** the cap tests start the count near the limit through a test-only subclass, `SeedableTrafficUsage`, which writes
  the same table. Its reservations run the unchanged `TrafficUsage` code.
- **Manual checks, outside the suite:**
  - 5,060 concurrent reservations on an unseeded object, from 11 Worker requests, gave exactly 5,000: the daily cap. Inside
    Vitest, bursts that large drop the local connection ("Network connection lost"), so the suite keeps bursts to about 1,000.
  - At the time, the entry `worker/src/index.ts` (which then routed traffic) was started locally with the binding, a fake key
    and a local control object.
    `GET /api/traffic/status` returned `{"available":true}`, and after the control object was set to `enabled: false` it
    returned 503. Only the status endpoint was called, since it never contacts TomTom.
- **Windows tooling limit:** the local runtime fails every Durable Object call with "internal error" when its SQLite file path is
  over 260 characters. The test uses a short temporary directory.

**Still not verified:**
- a real TomTom tile (no key);
- the object on Cloudflare itself: its placement, its documented one-instance-worldwide guarantee, and production latency
  against the gate's 2-second counter timeout;
- the binding and migration `v1` on a real deployment (not deployed, and not in the first release's configuration);
- `npm run worker:dev` with a traffic-enabled config (never run; a tile request with a real key would contact TomTom).

## Decision

Update (same day): a TomTom implementation was requested, stopped at the usage gate (see "Usage-gate feasibility" below), then
built locally once the owner approved a Durable Object counter, and finally deferred from the first release ("Implementation
status" above). The licence questions in this section are unchanged by that: none has been answered.


**No provider is verified enough to start an implementation task.** Each viable option has an open licence question that only
the provider can answer:

| Option | Blocking question |
|---|---|
| TomTom | Its terms licence production use only for a "Permitted Solution", defined as an app "which includes Asset Management Functionality" (tracking, routing, route optimisation of vehicles). They also ban caching "to serve multiple clients or users". |
| HERE | Payment card required. Each user must accept HERE end-user terms. Those terms must "prohibit use of the HERE Content with geographic data from competitors of HERE", and we don't know if OpenStreetMap/OpenFreeMap counts. |
| Mapbox | Traffic data is "internal evaluation purposes" only without an Order. |
| Azure Maps | Whether its traffic may be shown over a non-Microsoft map is unresolved. |
| Google | Excluded: its terms forbid use with non-Google maps. |

**Recommended next step:** send the questions below to TomTom and HERE (and the NH enquiry), then decide.

The only source with no third-party licence question is **National Highways' own unplanned events**, from the S1 feed already in
use. It shows official events, not congestion or speeds. It is limited by the separate NH licence query below.

## Comparison

| | TomTom | HERE | Mapbox | Azure Maps | Google | NH (S1 unplanned, S6) |
|---|---|---|---|---|---|---|
| Flow (speeds or congestion as road lines) | ✅ vector or raster flow tiles; flow segment data | ✅ vector or raster tiles; Traffic API v7 JSON (speed, free-flow, jam factor) | ✅ `mapbox-traffic-v1` (congestion low to severe) | ✅ Render 2024-04-01 traffic tilesets; Traffic v1 retires 31 Mar 2028 | Only inside a Google map | ❌ no flow or speed product |
| Incidents | ✅ incl. accidents, jams, road closed, roadworks | ✅ incl. construction, road closure, lane restriction | ❌ none found | ✅ incidents API and tiles | ❌ | ✅ closures and unplanned events (official); S6 speed limits |
| UK coverage | ✅ flow and incidents "detailed data" (by road class: not documented) | Unverified (coverage page not read) | Unverified | ✅ flow and incidents (page updated 2026-10-02) | — | England's strategic road network only |
| Stated freshness | "Real-time"; no interval documented (an older page said every minute: unverified) | Tiles "update around every minute" | "Approximately every 8 minutes" | Not checked | — | NH: "call the API as frequently as appropriate" |
| Free each month | 200K vector or raster tiles; 2.5K incident details; 20K flow segments | 30,000 vector tiles; 30,000 raster tiles; 5,000 Traffic API | 200,000 vector tile requests | 5,000 traffic-tile transactions (1 per 15 tiles); 1,000 traffic | — | Free; 10 calls/min/key |
| Card needed | ✅ No ("No credit card needed to get started") | Yes, Base plan | Unverified | Unverified | — | No |
| At the limit | ✅ Blocked until the next cycle, no charges | Billed ($0.120 per 1,000 tiles to 5M); no cap found | Billed ($0.25 per 1,000) | Not shown ("Contact us") | — | Rate limited |
| Public app on the free tier | ⚠ Unclear: needs "Asset Management Functionality" | Allowed, but needs end-user terms and each user's assent | ❌ Not without an Order | Unverified | — | ✅ |
| Over OpenFreeMap | No ban found; but no "Open Source/Copyleft" mixing (20.2.3) | Layering allowed (6.4(a)); ⚠ "competitors of HERE" clause | Only with Mapbox attribution; data clause blocks it anyway | ⚠ Older terms barred display on third-party maps (current terms not loaded) | ❌ | ✅ |
| Shared cache in Worker or R2 | ❌ Banned (11.4) | Up to 30 days and per cache headers; shared use ambiguous | ❌ No proxying or redistribution | Older terms: limited | ❌ | Our own cache (NH terms don't address caching) |
| Key in browser | Yes for direct tiles; domain restriction (CORS-based) | Optional (Worker can call it); "trusted domains" for API keys | Yes; URL restrictions are "best-effort" | SAS tokens, allowed origins | — | No: server-side only |

## Provider details

### TomTom (checked first)

**Products (verified):**
- Vector flow tiles: legacy v4 `/traffic/map/4/tile/flow/{type}/…pbf`, layer "Traffic flow"; Orbis v2 with `relative_speed`
  and `road_closure`.
- Raster flow tiles.
- Flow Segment Data: current and free-flow speed, `confidence`, `roadClosure`.
- Vector incident tiles: categories include Accident, Jam, Road Closed, Road Works.
- Incident Details: bbox up to 10,000 km².
- TomTom recommends Orbis APIs for new integrations. Its JS SDK renders through MapLibre, and the tiles are plain MVT, so they
  work in our MapLibre map without the SDK.

**Coverage (verified):** "United Kingdom | GB/GBR | ✔ | ✔" for incidents and flow, meaning "detailed data". Coverage by road
class isn't documented.

**Freshness:** no current page states an interval (unverified). Cache headers:
- v4 tiles use `ETag` and `Expires`;
- Orbis uses `Cache-Control: max-age` (value undocumented).

**Pricing (verified, docs.tomtom.com/pricing and its calculator data):**
- Free each month: 200K vector or raster tiles, 2.5K incident details, 20K flow segments. The allowance is shared across the
  whole account.
- Then 0.10 per 1,000 tiles. The currency shows as euros, but the calculator is based on USD.
- At the limit: "further requests are blocked until your next billing cycle begins… you won't be hit with surprise charges".
- Rate limit: the terms set a QPS limit, but its value isn't published.

**Terms (verified, TomTom Portal Terms & Conditions text):**
- "Permitted Solution" means "any desktop, mobile or web application licensed to end users and which includes Asset Management
  Functionality". That is "functionality which enables the management of mobile assets and which… includes tracking", routing
  and route optimisation.
- "Evaluation Use" means "internal evaluation and testing by you".
- Clause 2.1 grants the licence "In consideration of you paying the License Fees", in connection with your Permitted Solution.
- **Our Routes map has no asset management, so a public free deployment may not be licensed at all.**
- Caching (11.4): only in clients, per cache headers. "Nothing under Clause 11.4 entitles any form of caching for the purpose of
  scaling results to serve multiple clients or users."
- Other clauses:
  - no derived databases (11.6.1);
  - no use in high-risk systems critical to safety (11.6.9; whether this covers an HGV planning tool is unresolved);
  - no combining that subjects content to open-source or copyleft licences (20.2.3; our base map is ODbL);
  - end users must accept a EULA at least as restrictive as TomTom's (12);
  - logos and copyright notices must not be removed (17).
- **Security (verified):** keys can be limited to listed domains (relying on CORS) and to products, and rotated. Orbis prefers
  a header to the `key` query parameter.
- Unverified: whether a browser-visible key can be abused outside a browser to drain the shared quota.

### HERE

**Products (verified, docs.here.com):**
- Traffic API v7 flow:
  - `speed` (capped at the legal limit), `speedUncapped`, `freeFlow`, `confidence`, `traversability`;
  - jamFactor 0–10, where 10 means a closure.
- Incidents: `criticality`, `roadClosed`, `description`, times, `vehicleRestrictions`.
- Traffic vector tiles:
  - `traffic_flow` layer: `congestion`, `speed` in km/h, `kind` (free to stationary);
  - `traffic_incidents` layer: kinds include `construction`, `road_closure`, `lane_restriction`;
  - "traffic tiles should update around every minute".
- UK coverage: not verified.

**Pricing (verified, HERE pricing data behind here.com/get-started/pricing):**
- Traffic Vector Tile: "0 to 30,000 Free", then $0.120 per 1,000 to 5,000,000. Raster tiles are the same.
- Traffic API: 5,000 free a month.
- "The Base plan requires entering a payment method during the onboarding process" (April 2025 release notes). The Limited plan
  was retired on 31 August 2025.
- No spending cap was found.

**Terms (verified, HERE Platform Terms, September 2023):**
- 6.4(a): you may "layer Your Content and third-party content with HERE Content… for display purposes", if origins can be
  distinguished and "correct attribution can be provided".
- 6.4(j): no caching of Results "for more than 30 days".
- Exhibit 5 §3: you must give "End Users… conspicuous notice and access to, and cause each End User to assent to the End User
  terms", and those terms must "prohibit use of the HERE Content with geographic data from competitors of HERE".

**Keys (verified):** API key or OAuth. "Trusted domains work only with API keys." A Worker can call the JSON API with the secret
kept server-side.

### Mapbox

- Verified data: `congestion` and `closed`, "updated approximately every 8 minutes". 200,000 free vector tile requests a month,
  then $0.25 per 1,000. In MapLibre, every tile request is billed.
- **Blocker (verified, Mapbox Product Terms, 21 July 2026):**
  - §3.42 defines "Mapbox Traffic Data" as "Mapbox's dataset of estimated road speeds".
  - §2.12.2: "Unless Customer has an active Order for Mapbox Traffic Data… Customer shall only use Mapbox Traffic Data… for its
    internal evaluation purposes".
  - §2.8.1 forbids distribution "including from a cache, by proxying".
  - Attribution must include the Mapbox logo, © Mapbox, © OpenStreetMap and "Improve this map".

### Azure Maps

- Verified:
  - Traffic v1 flow tiles "will be retired on 3/31/28".
  - Render 2024-04-01 has traffic tilesets (relative, absolute, delay, incident).
  - UK flow and incidents are covered (coverage page updated 2026-10-02).
  - Free: 5,000 traffic-tile transactions, where "one transaction is created using increments of 15 tile requests" (about
    75,000 tiles, assuming that rule applies to traffic tiles), and 1,000 traffic transactions.
- Unresolved: older terms quoted in Microsoft answers said Results may not be displayed "on any third-party content or
  geographical map database". The current Product Terms page didn't load.

### Google Maps Platform

- Verified, Service Terms §3.2.3(e) "No Use With Non-Google Maps" (last modified 26 Aug 2026). The traffic layer exists only
  inside the Maps JS API. **Excluded.**

### Free official and open sources (England)

| Source | Finding |
|---|---|
| NH Developer Portal (S1, S6), already used | Verified: no flow or speed product. S1 carries closures, including unplanned events; S6 carries speed-managed areas. Free; 10 calls/min/key. |
| NH NTIS (DATEX II speeds, flows, journey times) | Unverified access route: the subscriber pages redirect to a 404. Ask National Highways. |
| Waze for Cities | Verified: for authorities and approved event organisers. Not for this app. |
| DfT Street Manager | Verified: England, OGL, account needed. Roadworks only. Whether a private app can register is unverified. |
| TfL Unified API | London only; disruptions, not speeds. |
| OpenStreetMap | A road network: no live traffic. |
| INRIX, Esri | Enterprise or paid; not researched further. |

## Integration options with the current setup (for later, once a provider is cleared)

1. **Browser tiles over the Routes map.** A MapLibre vector source with the provider's tiles in its own Routes layer, added to
   `routesLayers.ts`, its own switch in the Routes panel and Settings, and a credit.
   - The provider's key is visible in the browser, so it needs a domain-restricted key and a CSP change.
   - Matches TomTom and HERE tiles.
   - Cost scales with every user's tiles.
2. **Worker pass-through proxy.** The key stays server-side, but there's no shared caching (TomTom 11.4; Mapbox forbids
   proxying). It costs the same in requests as option 1, plus Worker invocations.
3. **Worker polls JSON, caches it and serves it from `/api`.** For example, HERE Traffic API or NH S1 unplanned events.
   - Cheapest in requests, and the key stays server-side.
   - Allowed only where shared caching is permitted: NH yes; HERE within 30 days and cache headers, shared use unconfirmed.
   - The 5,000 HERE calls a month cover one England-wide poll about every 9 minutes, if one call covers England (maximum request
     area unverified).

## Usage estimate (formulae; no traffic volumes assumed)

Assumptions: 512 px vector tiles, tiles loaded at the whole-number zoom, no pitch. The tile count per view is the same at any
zoom from 6 to 14.

| Viewport | Tiles per view, per layer |
|---|---|
| 1440×900 | 6–12 (about 10.5 on average) |
| 360×740 | 2–6 (about 4.2) |

**Monthly tile requests ≈ sessions × layers × (new tiles from pans and zooms + refreshes × tiles in view).**

Examples (assumptions, not forecasts): with flow and incidents (2 layers), one full desktop view is about 21 requests and one
phone view about 8.

| Provider | Free allowance | Full desktop views a month | Full phone views a month |
|---|---|---|---|
| TomTom | 200K tiles | about 9,500 | about 23,800 |
| HERE | 30K tiles | about 1,400 | about 3,600 |

A 10-minute session refreshing every 2 minutes is roughly 6 views. Under TomTom 11.4, a shared cache can't reduce these numbers.

## Security, attribution and licensing risks

- **Browser key:** domain restriction relies on CORS or Referer checks, which are best-effort. A copied key can drain a shared
  free quota, which then blocks every user (TomTom) or bills us (HERE). Our `Referrer-Policy` may defeat Mapbox URL restrictions.
- **CSP:** any provider adds a third-party host to `connect-src` and `img-src`. Requests reveal the areas users view to the
  provider, so the privacy notice must say so. **Approval needed.**
- **End-user terms:** TomTom (EULA) and HERE (assent before access) both need an end-user terms step in the app.
- **Attribution:** TomTom logo or copyright (exact text unverified); HERE "correct attribution"; Mapbox logo and links.
- **Safety:** commercial traffic is inferred, not official. It must stay visually distinct from NH closures (CLAUDE.md), be
  labelled with its provider, and never be shown as live when stale or blocked (quota exhausted).
- **Licence fit:** the TomTom asset-management definition, the HERE competitor clause, the Mapbox Order requirement and the Azure
  third-party-map terms are each unresolved and could rule the provider out.

## Usage-gate feasibility with the current Cloudflare setup (checked 2026-10-12)

**Result: the existing infrastructure can't enforce a shared monthly cap reliably, so TomTom traffic was not built.** The
Worker's only storage binding is the R2 bucket `SNAPSHOTS` (`wrangler.jsonc`). There's no KV, Durable Object, D1 or queue.
(As checked on that date. Later the same day the owner approved option 1 below; it was built and tested locally, then deferred
from the first release, with no binding in `wrangler.jsonc`. See "Implementation status".)

**Verified (developers.cloudflare.com):**
- **R2, one key:** "Maximum concurrent writes to the same object name (key): 1 per second". Higher rates "return HTTP 429"
  (R2 limits).
  - One map view asks for about 4–12 tiles at once (see "Usage estimate"), so a counter written once per tile would hit this at
    a single user's first view.
  - Spreading the counter over N keys raises the ceiling to about N writes a second. Bursts above that would still fail, and
    failing closed would leave random tiles missing.
- **R2, concurrent writes:** resolved as "the last writer to complete 'wins'" (R2 consistency model). Conditional `put()`
  "returns `null`" when its precondition fails (Workers API reference). Cloudflare **doesn't document** that the conditional check
  and the write are atomic under concurrency. Developers use it as compare-and-swap, but that's not an official guarantee.
- **Workers KV:** "eventually-consistent"; changes "may take up to 60 seconds or more to be visible"; "not ideal for
  applications where you need support for atomic operations". **Unsuitable.**
- **Workers Free plan:** "100,000/day" requests, then "Error 1027". Every traffic tile sent through the Worker counts towards
  this, and so does every refused request. A heavy traffic day could stop `/api/version` and `/api/closures`, breaking Closures.
  Whether static assets count isn't stated. CPU is limited to 10 ms per request; tile proxying is mostly waiting on the network,
  which isn't CPU time.
- **Durable Objects:** "available both on Workers Free and Workers Paid plans". On Free, only the SQLite storage backend is
  available, with limits of 100,000 requests a day and 100,000 rows written a day. This is Cloudflare's tool for per-key
  coordination; the KV docs point to Durable Objects for "higher writes per key rate limits".
  - **Not verified on the pricing page:** single-threaded execution and transactional storage, which make a counter exact.
    Check these in the Durable Objects docs before implementation.
  - **It's a new binding and migration, so it needs the owner's approval.**

**Other gate requirements:**
- **TomTom billing cycle:** "blocked until your next billing cycle begins". The cycle's start date isn't published, so the
  counter's reset date must be read from the TomTom account. Until then the gate must fail closed.
- **Which requests TomTom bills:** not documented for errors, 429s or 304 revalidations. Count every upstream request.
- **Kill switch without redeploying:** possible with the existing binding. A small control object in the R2 bucket, read on
  each traffic request, works for an on/off switch: it's rarely written, so the per-key write limit doesn't matter.
  - Changing a Worker variable or secret was not checked as a no-redeploy switch.
  - Writing to the production snapshot bucket is still a change to production storage use, so it needs approval.
- **Key handling:** a Worker proxy keeps the TomTom key as a Wrangler secret, never in the browser. Proxying is in line with
  TomTom's own "Use a proxy server" advice. Shared caching is banned (11.4), so responses must be `private` and never cached at
  Cloudflare's edge.

**Options for the owner:**
1. **Approve one Durable Object (SQLite, Workers Free) as the usage counter.**
   - It reserves one unit per upstream tile request and refuses at 150,000, warning at 120,000.
   - It fails closed if unreachable, and has a daily sub-cap well under the Workers 100,000/day limit to protect Closures.
   - Adds: one binding, one migration, and Durable Object request and row-write quotas.
2. **Move to Workers Paid.** Removes the daily request risk, but a counter still needs a Durable Object. This is a cost.
3. **Keep traffic off** until TomTom's eligibility answers arrive (the same blocker as before). No infrastructure change.

Recommendation: option 3 now, then option 1 once TomTom confirms eligibility, base-map use and attribution. Building the
counter first would add infrastructure for a provider that may not be allowed.

## TomTom attribution (checked 2026-10-12): provisional

**Verified:**
- **Terms, clause 17.3** (TomTom Portal Terms & Conditions):
  - "Your use of any trade names, logos, trademarks… of TomTom… is subject to TomTom's prior written approval."
  - Where a service "automatically generates a TomTom logo or copyright notice, you agree not to remove, obscure, mask or change"
    it.
  - "For all other Maps API services, you agree to implement to the TomTom Copyright API in order to generate the applicable
    copyright and logo attribution."
  - **No fixed wording is given.**
- **Traffic Incident Viewport** (`docs.tomtom.com/traffic-api/…/incident-viewport`): with `copyright=true` it returns "the full
  text of the copyright information that must be displayed with the tiles in the viewport". The sample value is
  `https://www.tomtom.com/en_gb/thirdpartyproductterms/`.
- **Map Display "copyrights" caption** (`docs.tomtom.com/map-display-api/…/tomtom-orbis-maps/copyrights`): the example is
  "©TomTom, ©OpenStreetMap". This covers map tiles; the page doesn't mention traffic.
- **Product attributions page** (`https://www.tomtom.com/en-gb/legal/product-attributions/`): an index of yearly PDFs (latest
  "Product Attributions (2026.09)") with no app attribution wording on the page.

**Built, deferred (not in the first release):** a Routes-only bubble, "Traffic © TomTom", linking to the product attributions
page (`web/src/deferred/traffic/TrafficAttribution.tsx`, text in `web/src/deferred/traffic/credits.ts`).
- It's marked **provisional**, and would appear only while TomTom traffic is drawn. Nothing in the app imports it, so it never
  appears in the first release.
- It sits at the bottom centre of the Routes map, under MapLibre's controls, so the open base-map credits cover it, never the
  reverse.
- The link opens in a new tab with `noopener noreferrer` and an accessible "opens in a new tab" label. Its tap area is 48 px.

**Before enabling:**
1. Generate the final text from the Copyright API or Incident Viewport `copyright=true` (or TomTom's written instruction).
2. Get TomTom's written approval for using its name.
3. Decide whether the product-attributions page, or the URL the API returns, is the right link.
4. Add TomTom to Settings → Sources and licences and the privacy notice, with approved wording. (A draft of both was built
   and then removed for the first release.)

## Questions for the providers (not sent; still open)

**TomTom:**
1. Does a free account count as a "Subscription Plan" allowing a public, free web app?
2. Must the app include "Asset Management Functionality"?
3. Is overlay on an OpenStreetMap/ODbL base map acceptable under 20.2.3?
4. What exact attribution is required, and is the Copyright API needed?
5. Is a pass-through proxy (no shared cache) acceptable?
6. What is the default QPS, and what status code is returned once the free allowance is used up?
7. What is the refresh interval and `max-age`?
8. Does 11.6.9 (high-risk safety systems) apply to an HGV planning app?

**HERE:**
1. Is OpenStreetMap/OpenFreeMap "geographic data from competitors of HERE"?
2. May a server cache tiles or JSON results within the cache headers and serve them to many users?
3. What is the maximum request area for Traffic API v7?
4. Is there a spending cap on the Base plan?
5. What is the UK coverage?

## National Highways licence follow-up (S1, S6)

**Evidence (verified 2026-10-12):**
- **The APIs' own metadata says OGL v3.0.** The portal's public API list
  (`https://developer.data.nationalhighways.co.uk/developer/apis?api-version=2022-04-01-preview`) gives
  `"license": {"name": "Open Government License (OGLv3.0)", "url": null}` for:
  - `road-and-lane-closures-v2` (S1);
  - `speed-managed-areas-v1` (S6);
  - VMS, Road Limits and Features, and the retired closures v1.

  The S1 OpenAPI export (`…/developer/apis/road-and-lane-closures-v2?export=true&format=openapi%2Bjson&api-version=2022-04-01-preview`)
  repeats it. Contact: digitallaboperations@nationalhighways.co.uk.
- **The portal terms are based on OGL v2.0.** They say "based on version 2.0 of the Open Government Licence with specific
  amendments for NH" (`/terms`, undated, "NH may at any time revise this Licence without notice"). These are the terms of the
  only product, "Production", which key holders subscribe to.
- **Attribution:** para 20(a) asks for "Powered by National Highways' Transport Data Feeds". The API metadata gives no
  attribution text or licence URL. NH branding guidelines (para 20(b)) weren't found.
- **Automated requests:** para 21(e) says the licence does not "permit You to use any automated system, software or process to
  extract content and/or data, including trawling, data mining and screen scraping, except where expressly permitted under a
  separate written licence agreement with NH". But NH's own material expects regular automated calls:
  - the S1 API description says "it is your responsibility to call the API as frequently as appropriate" and gives polling
    guidance ("set modifiedSinceDateTime to now() minus 15 minutes");
  - para 17 refers to "Your interface used to access the Information";
  - the FAQ sets a per-key rate limit.

  **Interpretation, not legal advice:** scheduled keyed calls within the rate limit look like the intended use, but no clause
  says so outright.

**Status:** still **unresolved**. Both licence statements are published, and NH doesn't say which governs, which attribution to
show, or whether 21(e) covers keyed polling. `docs/DATA-SOURCES.md` records the new evidence; the licence entries stay flagged.

**Draft enquiry (not sent).** To digitallaboperations@nationalhighways.co.uk:

> Subject: Licence and attribution for Road and Lane Closures v2 and Speed Managed Areas v1
>
> Hello,
>
> We run Traffic Advanced, a free public web app giving HGV drivers in England information about closures on the strategic
> road network. With a Developer Portal subscription key, we call Road and Lane Closures v2.0 and Speed Managed Areas v1.0 from
> our server about every five minutes, within the 10 calls per minute limit, and show the results to users. We keep the last
> good copy so users still see data if a refresh fails.
>
> Could you confirm:
> 1. Which licence applies to data from these APIs: the Open Government Licence v3.0 named in the APIs' metadata, or the portal
>    Terms & Conditions based on OGL v2.0 with NH amendments, or both?
> 2. The exact attribution you want shown. Is "Powered by National Highways' Transport Data Feeds" required, alongside or
>    instead of an OGL v3.0 statement? And where are NH's branding guidelines (paragraph 20(b))?
> 3. That scheduled requests like ours, within the rate limit, are normal API use and not "automated extraction" under
>    paragraph 21(e) needing a separate written licence.
> 4. Whether there are limits on caching or keeping a last known good copy of the data.
> 5. Whether the NTIS DATEX II service is open to new subscribers, and how to apply.
>
> Thank you.

## Sources (checked 2026-10-12)

**TomTom:**
- docs.tomtom.com/pricing and its FAQ and calculator data
- docs.tomtom.com/traffic-api/documentation/tomtom-maps/traffic-flow/vector-flow-tiles
- …/raster-flow-tiles
- …/flow-segment-data
- …/traffic-incidents/vector-incident-tiles
- …/incident-details
- …/v1/product-information/market-coverage
- …/v1/traffic-incidents/traffic-model-id
- …/tomtom-orbis-maps/v2/traffic-flow/vector-flow-tiles
- …/v2/traffic-incidents/vector-incident-tiles
- docs.tomtom.com/legal/terms-and-conditions (text read from the page's own script bundle)
- www.tomtom.com/en_gb/thirdpartyproductterms/
- docs.tomtom.com/platform/documentation/api-best-practices/api-key-management-best-practices
- docs.tomtom.com/maps-sdk-js/guides/map/about-maplibre

**HERE:**
- docs.here.com/traffic-api/docs/flow
- …/how-to-request-incident-data
- …/traffic-vector-tile-layers
- here.com/get-started/pricing (figures from pricing-calculator.here.com/api/contentfulData)
- here.com/learn/blog/april-2025-platform-release-notes
- …/august-2025-platform-release-notes
- here.com/en-gb/terms/here-platform-terms-september-2023
- here.com/developer/blog/trusted-domains-here-platform

**Mapbox:**
- docs.mapbox.com/data/tilesets/reference/mapbox-traffic-v1/
- mapbox.com/pricing
- docs.mapbox.com/help/dive-deeper/mapbox-in-maplibre
- docs.mapbox.com/accounts/guides/tokens/
- Mapbox Product Terms PDF (21 July 2026), from mapbox.com/legal/product-terms

**Azure:**
- learn.microsoft.com/en-us/azure/azure-maps/traffic-coverage
- learn.microsoft.com/en-us/rest/api/maps/traffic
- learn.microsoft.com/en-us/rest/api/maps/render/get-map-tile
- azure.microsoft.com/en-gb/pricing/details/azure-maps/

**Google:**
- cloud.google.com/maps-platform/terms
- developers.google.com/maps/documentation/javascript/trafficlayer

**Other:**
- waze.com/en/ccp
- gov.uk/guidance/find-and-use-roadworks-data
- findtransportdata.dft.gov.uk/dataset/roadworks-service-api-street-manager
- tfl.gov.uk/info-for/open-data-users/unified-api

**National Highways:**
- developer.data.nationalhighways.co.uk/terms, /faq, /developer/apis, /developer/products and the S1 and S6 OpenAPI exports
  (api-version 2022-04-01-preview)
- nationalhighways.co.uk/our-work/digital-lab/data-lab/
- nationalhighways.co.uk/about-us/our-responsibilities/terms-and-conditions/

**Did not load:**
- TomTom /legal (404)
- HERE developers.here.com/plans (SSL error)
- Microsoft MCA product terms (empty)
- nationalhighways.co.uk/services-info (404)
