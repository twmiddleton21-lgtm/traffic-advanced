# Data sources: evidence and confidence

Checked **2026-10-05** by direct requests to each service unless marked *unverified*. Re-verify anything older
than 3 months before relying on it. "SRN" = Strategic Road Network (England's motorways and major A-roads run by National Highways).

## Summary

| # | Source | Coords | Direction | Event ID | Diversion link | HGV restrictions | Key | Limit | Licence | Production use |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | NH Road & Lane Closures API v2.0 | ✅ WGS84 line (lat lon order) | ✅ enum | ✅ situation (= S2 event no.) + record id/version | ❌ none | ⚠ flags only | ✅ required | 10 calls/min/key | OGL v3.0 | ✅ primary (verified 2026-10-05) |
| S2 | NH Public Scheduled Road Closures (ArcGIS) | ✅ line | ⚠ in text only | ✅ event number | ❌ (text only) | ❌ | ❌ none | ArcGIS fair use | OGL v3.0 | ✅ fallback/cross-check |
| S3 | NH 7-day Road Closure Report (xlsx) | ❌ | ✅ column | ❌ | ❌ (text only) | ❌ | ❌ none | n/a | not stated on page | ⚠ cross-check only |
| S4 | NH Diversion Routes (ArcGIS) | ✅ lines/points | ✅ | ✅ route + stretch GUIDs | ⚠ to a *stretch*, not to an event | ✅ values + points | ❌ none | ArcGIS fair use, 1000/page | OGL v3.0 + OS attribution (verified 2026-10-05) | ✅ diversion geometry |
| S5 | NH Network Model (ArcGIS) | ✅ | ✅ | ✅ link/node GUIDs | (join key) | ✅ 18 SRN restrictions | ❌ none | ArcGIS fair use | OGL v3.0 | ✅ road geometry + joins |
| S6 | NH Speed Managed Areas API | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (same portal) | 10/min | OGL v3.0 (verified 2026-10-05) | ✅ official congestion signal |
| S7 | NH Digital VMS API | ✅ points | ✅ | ✅ | ❌ | ❌ | ✅ | 10/min | *verify* | ⚠ has display-use conditions |
| S8 | NTIS DATEX II (speeds, journey times, events) | ✅ | ✅ | ✅ | *unverified* | *unverified* | subscription | *unverified* | *unverified* | ❓ access route unverified |
| S9 | TomTom Traffic flow/incident tiles | tiles | n/a | n/a | ❌ | ❌ | ✅ | **200K tiles/month** (pricing page) | TomTom T&Cs | ⚠ optional overlay only |
| S10 | OpenFreeMap base map | tiles | n/a | n/a | n/a | n/a | ❌ | none stated | OSM ODbL + attribution | ✅ (no SLA) |
| S11 | TfL open data: height restrictions; LEZ and ULEZ boundaries | ✅ WGS84 + BNG / encoded polylines | n/a | grid ref | n/a | ✅ heights (bands only), London | ❌ none | 500 calls/min/feed | TfL Transport Data Service licence (verified 2026-10-09; registration question open) | ✅ restriction layers (docs/RESTRICTIONS.md) |
| S12 | OpenStreetMap restriction tags (Overpass) | ✅ | n/a | element id + version | n/a | ✅ heights, weights (community) | ❌ none | Overpass usage policy | ODbL 1.0 (verified 2026-10-09) | ⏸ pipeline ready, **not in the 2026-10-09 build** (Overpass unavailable); labelled unverified when added |

## S1: Road and Lane Closures API v2.0

- Endpoint `GET https://api.data.nationalhighways.co.uk/roads/v2.0/closures`; key in header
  `Ocp-Apim-Subscription-Key`. Without a key: `401 {"message":"Invalid Subscription Key"}`.
- Parameters: `closureType` = `planned` (default) | `unplanned`; `startDateTime`, `endDateTime`,
  `modifiedSinceDateTime` (ISO 8601); `pageCursor` (from `X-Next` header); `X-Response-MediaType`
  `application/json` | `application/xml` (default XML).
- Payload: DATEX II v3.4 + NH extensions. Records are `RoadOrCarriagewayOrLaneManagement` only. Fields include
  situation `idG`/version time, record `idG`/`versionG`, creation/version times, `validityStatus`
  (`planned`/`active`/`suspended`), validity period, `cause.causeType` (+ detailed cause),
  `roadOrCarriagewayOrLaneManagementType` (e.g. `carriagewayClosures`, `laneClosures`, `roadClosed`,
  `overnightClosures`, `heightRestrictionInOperation`, `weightRestrictionInOperation`, `contraflow` …),
  `generalPublicComment[]` (free text), `locationReference` (GML `posList`, WGS84, 6 dp),
  `linearElementByCode` (`roadName`, `linearElementReferenceModel`, `linearElementIdentifier`), direction,
  carriageway/lane, `impact` (lanes restricted/operational), NH extension flags
  `hasHeightRestrictionFlag` / `hasWidthRestrictionFlag` / `hasWeightRestrictionFlag` / `hasContraFlow`.
- **No diversion / rerouting record type exists in the schema.** "rerouting" appears only as a `causeType` enum value.
- Documented behaviours: planned closures stay `planned` until confirmed started → `active`, or cancelled → `suspended`;
  completed closures remain `active` for up to 7 days after works end (**must filter by end time ourselves**);
  for unplanned closures send explicit start/end windows; planned geometry is per-link (not the whole closure).
- Refresh: "near real time" for planned and unplanned (portal FAQ says daily for planned in places; *measure in P0*).
- v1.0 retired 11 June 2025, so breaking changes have happened before. Pin to v2.0 and watch the changelog.
- **Verified 2026-10-05 with a real key** (details in `P0-REPORT.md`): planned window of 15 days = 16 pages / 59 MB /
  1,136 situations / 7,625 records. **Situations are split across pages** (union records by record id). `linearElementReferenceModel`
  = "The Network Model"; `linearElementIdentifier` = S5 `linkid` (98.9% resolve). `posList` is "lat lon" order. `generalPublicComment`
  is a short location line with **no diversion text** (0 / 7,625). Situation `idG` = S2 `formattedeventnumber` base (explicit S1↔S2 link).
  Unplanned records in this capture are signal-derived lane events with 15-min windows, with semantics unverified.
- **Input date-times are read as UTC** (verified 2026-10-05 by a narrow-window experiment; see `P0-REPORT.md`).
- **Record ids (`idG`) are not stable between fetches:** 113 of 577 were re-issued with new ids within ~40 minutes, with identical
  situation, window, location, version and creation time. Key records by situation + window + location.
- **S1 is not a complete list:** 148 S2 events in the same window had no S1 situation (the same 148 in a second capture 52 min later).
  Some appear in S1 under another situation id; some are absent. Some S3 closures appear in neither S1 nor S2.
- Record-id churn re-measured: 1,594 of 7,645 ids (21%) changed in 52 minutes with identical content.
- **Unplanned closures (verified twice 2026-10-05):** situation ids are roadside signal ids (`signs/<signal>`), source "Signs and Signals",
  15-minute windows, and every record reported 0 lanes restricted with all lanes "Open". No real unplanned closure observed yet.
- Sources: developer portal API catalogue (`/developer/apis?api-version=2022-04-01-preview`), schema export, FAQ, changelog.

## S2: Public Scheduled Road Closures (ArcGIS feature service)

- `https://services-eu1.arcgis.com/mZXeBXkkZpekxjXT/arcgis/rest/services/PublicScheduledRoadClosures/FeatureServer/0`
- Fields: `description`, `road_number`, `eventtype`, `natureofworks`, `formattedeventnumber`, `opendata`,
  `scheduledplannedstartdate`, `scheduledplannedenddate`, polyline geometry. 2,784 records on 2026-10-05.
- Updated daily (item description; `lastEditDate` 2026-10-05). No key, CORS `*`. OGL v3.0.
- **Direction is only in free text.** No status (planned vs active), no unplanned events.
- Diversion: free text only (see analysis below).

## S3: 7-day Road Closure Report

- `https://nationalhighways.co.uk/media/nglfh13o/7-day-closure-report.xlsx` (path may change; scrape the link from the page).
- One sheet per day: Road number, Direction, Location, Scheduled start, Scheduled end, "Closure details, including diversions".
- **No coordinates, no IDs.** Updated twice daily Mon–Fri (not weekends/bank holidays).
- Use only as a completeness cross-check of S1/S2. Not as a primary source.

## S4: Diversion Routes Public View (ArcGIS)

- `https://services-eu1.arcgis.com/mZXeBXkkZpekxjXT/arcgis/rest/services/Diversion_Route_Data_Service_(Production_View)/FeatureServer`
  — layer 1 `SRNClosureStretch` (2,862), layer 2 `DiversionRoute` (2,326), layer 3 `DiversionPoint` (176). No key, CORS `*`,
  native CRS EPSG:27700 (request `outSR=4326`), max 1,000 records/page. Data last edited 2026-09-30.
- `DiversionRoute` fields: `DiversionRouteID` (e.g. `M6/J41/J42/1`), `Description`, `RouteType`, `RouteClassification`,
  `RecordState`, `SignageSymbol`, `SignageSymbolLink`, `EstimatedTravelTime`, `RouteLengthMiles`, toll/charging-zone flags,
  `HeightLimitMetres`/`WidthLimitMetres`/`WeightLimitTonnes`/`LengthLimitMetres`, `SRNStartNode`/`SRNEndNode`,
  `JunctionFrom`/`JunctionTo`, `SRNClosureStretchGUID`, `Version`, created/modified/decommissioned dates.
- **What it is:** pre-agreed **emergency diversion routes for unplanned full closures** ("diversion routes shared at this time
  are limited to those implemented due to unplanned events"). `RouteType`: 2,324 Unplanned, 2 Planned.
  `RecordState`: 2,325 Complete, 1 Discontinued.
- **The relationship it provides:** route → `SRNClosureStretch` (a section that *would* trigger the diversion if closed).
  **It does not reference any closure/event/situation ID.** It cannot say a route is in use today.
- `RouteClassification` (DMRB GG 903 §E/2.15–2.18): **Class 1a** all vehicles, requirements met · **Class 1b** all vehicles,
  outstanding actions · **Class 2a** *not to be used by HGVs* · **Class 2b** *not to be used by HGVs*, outstanding actions.
  Counts: 1A 2,047 · 1B 252 · 2A 19 · 2B 8. GG 903 also: HGV-suitable routes should take 4.93 m height, 2.9 m width, 44 t;
  abnormal loads are excluded; real-time implementation is out of the standard's scope (so the route used on the day may differ).
- Restrictions: 141 routes have a limit field set; 130 routes have `DiversionPoint` records (87 height, 84 weight, 4 width, 1 length),
  e.g. `M56/J12/J14/1` height 4.4 m.
- `SRNStartNode`/`SRNEndNode` **are Network Model `nodeid`s** (verified: `M6/J41/J42/1` resolves to nodes "M6 J41" and "M6 J42").
- Many routes were last modified in 2024. Fine for pre-agreed routes, but show `LastmodifiedDatetime` to users.
- **Stretch GUIDs are not unique per row (verified 2026-10-05):** 2,862 rows but 2,433 GUIDs. 319 stretches are split across rows with identical
  attributes (geometry parts, e.g. a main carriageway part plus a closed exit slip), and 1 has rows with conflicting junction labels. Merge by GUID.
- `SRNStartNode`/`SRNEndNode` are where the *diversion* leaves and rejoins the SRN, which isn't always the stretch's labelled junction (e.g. `M54/J1/M6/J10A/2` starts at M54 J2).
- **Licence (verified 2026-10-05, item terms):** Open Government Licence. Required attribution: "Data derived from Ordnance Survey Highway
  Network, Subject to Crown copyright and database rights 2024. Ordnance Survey Licence: AC0000827444."
  - Re-read 2026-10-09 from the item's ArcGIS licence field (`licenseInfo`):
    - It says "The data is published under an Open Government Licence". The words "Open Government Licence" link to
      `https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/`, so the publisher identifies **OGL v3.0**.
    - The visible text alone gives no version, which an earlier reading on the same day relied on.
    - The restriction layers now say OGL v3.0 and keep NH's Ordnance Survey attribution verbatim.
- **`DiversionPoint` weights (checked 2026-10-09):**
  - Only `RestrictionType` "weight", `MeasureValue` and `MeasureUnit` "Tonnes". No direction, extent, vehicle class or exemptions.
  - One point per route and direction: 84 records at 75 places.
  - Of the 77 records at 7.5 t, 73 are on routes whose `WeightLimitTonnes` is also 7.5.
  - Some route descriptions say the route is for "Vehicles under 7.5t Only".
  - Shown as values of unrecorded type, never as lorry or all-vehicle limits (`docs/RESTRICTIONS.md`).
- **Classification is not enough for HGVs (verified 2026-10-05):** 46 Class 1A/1B routes have height limits < 4.95 m, 74 have weight limits
  < 44 t, and 5 are described "Non HGV" / "Cars only" while Class 1A. Route numbers mark sub-diversions, HGV vs non-HGV variants or side-road
  flows, not a consistent "primary" order.
- **Route geometry runs in the direction of travel (verified 2026-10-05, Day-1 capture):** of 2,022 routes with a single geometry part
  and resolvable, distinct start/end nodes, **all 2,022** start exactly (0 m) at `SRNStartNode` and end at `SRNEndNode`; none are reversed.
  (298 routes had a start/end node not found in S5, 4 had start = end, 2 are multi-part.) The start node is where the diversion leaves the SRN
  and the end node where it rejoins, so vertex order = direction of travel. The map draws direction arrows on that basis, for single-part
  routes only; multi-part routes have no proven part order. `scripts/dev/export-ui-snapshot.ts` re-checks every exported route (50 m tolerance).

## S5: Network Model (Public)

- `https://services-eu1.arcgis.com/mZXeBXkkZpekxjXT/arcgis/rest/services/Network_Model_Public_view2/FeatureServer`
  — Node (37,918), Link (43,025: `linkid`, `linkref`, `linkdesc`, `roadname`, `direction`, `startnode`, `endnode`, …),
  Vehicle_Restriction (18 SRN restrictions, e.g. "Vehicles Exceeding Height 4.9m Prohibited") + references, Junction, Road tables.
- Updated daily; OGL v3.0; no key. Use for: **road geometry per road number + direction** (road selector centring), junction
  labels, network joins between S1 and S4.
- **Junction numbers (verified 2026-10-05):** the Junction table names junctions in NH's own form ("M53 J4", "A1(M) J6", "M6 J10A",
  "M4 J8/9", "M6 TOLL T7"). Junction_Reference maps each junction to its Nodes, which carry point geometry (Node `junctionnumber1`/`2` hold
  the same names). 762 junction rows give 599 numbered names (M55 J2 is split across 4 rows) plus 160 named-only junctions ("Almondsbury
  Interchange"). The map labels 596 at the centre of their nodes; 3 are left off because their nodes spread > 2 km (A1(M) J57, M42 J8,
  A14 J41). See `scripts/dev/export-ui-junctions.ts`.
- **S1 can reference links missing from S5 (seen 2026-10-05, Day-1 captures 1140Z-open + 1208Z-nh-api):** 1 of 724 closure groups
  (A61 westbound, situation 522409, 9–10 Oct, class D) referenced one closed link absent from the S5 Link capture, so it has no map
  geometry. The API publisher quarantines such closures and logs each one by name (`scripts/publish/publish-snapshot.ts`); 723 were published.

## S6–S8: other official NH services

- **Speed Managed Areas** (same portal/key): planned temporary and unplanned variable (advisory/mandatory) speed restrictions,
  including congestion-triggered ones. Official congestion signal for smart motorways. Planned for the V1 "Traffic" state
  (SPECIFICATION §4). **Verified 2026-10-05:** endpoint `/sma/v1.0/speedManagedAreas`; record `sitSpeedManagement` with
  `temporarySpeedLimit` in **km/h** and `complianceOption` mandatory/advisory. Planned records come from roadworks; unplanned ones are
  per-signal (`signalIdentifier`) with 15-min windows. **0 km/h ↔ `suspended` exactly in two captures** (consistent with "no limit set";
  NH doesn't document it). **`active` records' windows had always already ended**, so in-force status comes from `validityStatus` plus fetch
  time, not the window. About 484 signals, stable ids, changing within minutes. **Licence: OGL v3.0** (verified 2026-10-05 from the S6 API's own
  OpenAPI export).
- **Digital VMS**: text of roadside signs. Instructional messages are excluded by NH; display conditions apply (300 m visibility
  window, clear when cleared). **Not in V1** (driver-display rules don't suit a planning app).
- **Road Limits and Features**: emergency areas, bus stops, phones. Not needed in V1.
- **NTIS** DATEX II (speeds, flows, journey times, events) runs under contract to 2032, but the public subscriber pages
  (`trafficengland.com/subscribers`) now 404. **Access route unverified**; ask NH (digitallaboperations@nationalhighways.co.uk).
- Website "current incidents" page and RSS feeds: no diversion information found; no documented feed endpoints found.

## S9: TomTom Traffic

- Pricing page (2026-10-05): Traffic Flow & Incidents raster/vector tiles **200K requests/month free**; incident details 2.5K/month;
  no credit card. Third-party sources report 50K tiles/day + 2.5K non-tile/day and blocking (not billing) at the limit:
  **conflicting, treat 200K/month as the planning figure until confirmed in the account dashboard.**
- Terms (reported, *verbatim text not yet retrieved*): caching only in clients per cache-control headers; caching "for the purpose
  of scaling results to serve multiple clients or users" prohibited. **So we must not cache TomTom tiles server-side for sharing.**
- Implication: a shared free key gives roughly 6,600 tiles/day. A single map session can use 50–300 tiles, so the overlay must be
  opt-in, zoom-limited and degrade gracefully at the limit. Production suitability: **adequate for a small user base only.**

## S10: OpenFreeMap

- Styles `liberty`, `bright`, `positron`, `dark`, `fiord` (all 200, CORS `*`). No key, no stated limits, commercial use allowed,
  attribution "OpenFreeMap © OpenMapTiles Data from OpenStreetMap". **No SLA.** Weekly planet MBTiles downloads permitted,
  so we can self-host an England extract (PMTiles on R2) if reliability or offline needs demand it.
- **Road numbers (verified 2026-10-05, TileJSON `/planet`):** OpenMapTiles schema. `transportation_name` has `ref` (e.g. "M53", "A41"),
  `ref_length`, `class` (UK motorways `motorway`, primary routes `trunk`, other A roads `primary`, B roads `secondary`) and `network`.
  **No junction layer or junction-number field** in any vector layer, so junction numbers come from S5. Fonts "Noto Sans Regular/Bold"
  are served from `tiles.openfreemap.org/fonts`. In the `dark` style a symbol layer (`water_name`) comes before buildings and roads.
- **Hosts, for the CSP (verified 2026-10-05):** the `positron` and `dark` styles reference only `https://tiles.openfreemap.org`
  (style, TileJSON `/planet`, vector tiles, `natural_earth/ne2sr` raster tiles, sprites `sprites/ofm_f384/ofm`, glyphs `fonts/…`).
  A probe worker served under the app's CSP (`web/public/_headers`) fetched a vector tile, a glyph range and the sprite, decoded the
  sprite and drew text on an OffscreenCanvas; only `data:` fetches and other hosts were blocked. MapLibre's worker makes no `data:`
  fetches (its `data:` strings are object keys).

## S11: TfL open data (restriction layers, checked 2026-10-09)

- **Licence:** [Transport Data Service licence](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service), "based on
  version 2.0 of the Open Government Licence with specific amendments for Transport for London".
  - **Allows:** copying, publishing, distributing, adapting, and commercial and non-commercial use.
  - **Requires** the attribution "Powered by TfL Open Data", "Contains OS data © Crown copyright and database rights 2016" and
    "Geomni UK Map data © and database rights [2019]".
  - **Forbids** suggesting official status or TfL endorsement, and more than 500 calls per minute per feed.
  - **Unresolved:** the terms mention information "You provide on registration". These files download from an open bucket
    without registration or a key, and whether registering is required for this use is unconfirmed (`docs/RESTRICTIONS.md`).
- **Files** (bucket `roads.data.tfl.gov.uk`, no key):
  - `BridgesRestrictions/height-restrictions-in-london.xlsx`: 90,944 bytes, last modified 2019-10-09. It has 877 structures
    with height **bands**, BNG and WGS84 coordinates, borough, road name and number, red route flag and comments. **No weights.**
    Its WGS84 coordinates match our OS-method conversion of its BNG coordinates to within 0.1 m for all 877.
  - `Boundaries/lez.json` (last modified 2023-07-20) and `Boundaries/ULEZ_Boundary_20230829.json` (2023-09-13): each is 22 Google
    encoded polylines, and the two files are **byte-identical** (SHA-256 `de14c05c…`).
    - The ULEZ shapefile zip is identical to the LEZ 2021 zip, and contains `LEZ.shp`.
    - TfL's LEZ page says the ULEZ "operates in the same zone".
- **Cross-check:** GLA London Datastore "London Wide Ultra Low Emission Zone 2023" (OGL v2.0, GeoJSON in EPSG:27700).
  - Publisher GLA, author TfL, update frequency "One off".
  - The dataset page (2026-10-09) says it was last updated "over 2 years ago". The downloaded file's HTTP `Last-Modified` is
    2025-10-21, which is not a data date.
  - Its 22 polygons are labelled `BOUNDARY: "Low Emission Zone"`.
  - Converted to WGS84 and compared with TfL's boundary:
    - GLA vertices to TfL's line: median 2.3 m, 99th percentile 10.6 m, maximum 41.7 m;
    - TfL vertices to the GLA's line: median 1.3 m, 99th percentile 9.6 m, maximum 110.7 m, on one stretch by the M25 near
      Heathrow. The cause is not verified.
- **Use:** see `docs/RESTRICTIONS.md`.

## S12: OpenStreetMap restriction tags (checked 2026-10-09)

- **Tags:** `maxheight`, `maxheight:physical`, `maxweight`, `maxweightrating`, `maxweightrating:hgv` and `maxweight:hgv`, plus
  `:conditional` forms, on roads used by motor vehicles and on nodes. The query is
  `scripts/restrictions/osm-england.overpassql`, run as 24 bounding-box tiles. Overpass doesn't clip them: the build keeps only
  elements inside England using the ONS boundary (below).
- **UK practice:**
  - `maxweightrating:hgv` is the lorry-symbol (environmental) limit, and the older `maxweight:hgv` means the same (about 1,500
    were being converted in 2025).
  - `maxweight` is an all-vehicle limit.
- **Values seen in a central London sample of 1,958 elements:**
  - `maxweightrating:hgv` was the most common (671), with exemptions `none @ delivery` (288) and `none @ destination` (234);
  - `maxheight` included `default` (189), `below_default` (84) and feet-inches (`15'3"` …);
  - one weight was in `KG`.
- **Licence:** ODbL 1.0. A filtered extract that is used publicly is a derivative database and must be offered under ODbL
  (`docs/RESTRICTIONS.md`).
- **Overpass:** the public instance announces a rate limit per IP (2 to 4 slots). It was overloaded for much of 2026-10-09 (HTTP
  504 "server is probably too busy"). The VK Maps instance (`maps.mail.ru`) also failed for part of that time.
  - Clipping to England on the server is the costly part: a large tile with a per-statement area clip ran for over 5 minutes, and
    one clip per tile for nearly 10.
  - Bounding-box queries for central London took about 15 s. So the tiles are bounding-box only, and the build clips to England
    with the ONS boundary (below).
- **England boundary for the clip:** ONS "Countries (December 2023) Boundaries UK BFE" (full resolution, extent of the realm),
  England (`E92000001`), simplified to 10 m by the ArcGIS service (`maxAllowableOffset=10`), British National Grid, 93 rings.
  - OGL v3.0, with "Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data ©
    Crown copyright and database right 2023."
  - Checked: inside England for London, Chester, Carlisle, Berwick, Penzance, the Isles of Scilly and seafront roads (Brighton,
    Blackpool, Dover docks, Liverpool Pier Head, Southend); outside for Cardiff, Wrexham, Chepstow, Gretna, Calais and the Isle
    of Man.
- **Completeness:** unknown. There is no official full list to compare against.
- **Not in the 2026-10-09 build:** Overpass stayed overloaded, so no complete England download was possible
  (`docs/RESTRICTIONS.md`).

## Routing services (for classification C, post-V1)

- openrouteservice `driving-hgv`: key required (401 without). Plan limits/commercial terms **unverified** (plans page needs login).
- Valhalla public instance (`valhalla1.openstreetmap.de`) is up with truck costing. Usage policy **unverified**; public demo
  servers aren't a production dependency.
- OSRM demo (used in HGV-Destinations-Pro): car only, so **not acceptable for HGV routes**.

## Closure → diversion matching: real-data trial (2026-10-05)

Input: S2 (2,784 records) against S4 stretches (2,862), local geometric test (25–30 m buffers, EPSG:27700),
same road number and same single direction parsed from the text.

| Outcome (400 distinct carriageway closures) | Count |
|---|---|
| Exactly one stretch, same road + direction, ≥80% mutual overlap | **39 (≈10%)** |
| Several stretches with the same extent | 3 |
| Partial overlap only (closure ≠ stretch extent) | 109 |
| No stretch on same road + direction | 65 |
| Direction "both"/several/unparseable (needs per-direction split) | 184 |

Diversion text in the same closures: **71 of 393 (≈18%) name specific roads/symbols** (e.g. "Diversion via A30 to Chard,
A358 to rejoin A303 and vice versa"), 94 generic ("via National Highways network"), 191 none, 37 other. (393 rather than
400 because this count removed duplicates by description alone; the geometric trial removed them by description + event
number.) The text categories came from a quick initial pattern match, not the final §5.3 rules.

**Conclusions**
1. **No free official source found links a closure/incident ID to a diversion route.** Classification A can only come from
   closure-specific *text* in the closure record itself, with no route geometry. The ≈18% above is an initial
   observation, **not an expected A rate**. P0 defines and validates the A recognition rules.
2. Initial real-data experiment: approximately 10% of tested planned closures produced a clean single diversion candidate
   using the initial matching approach (geometry + road + text-parsed direction, without network IDs). **This is neither a
   target nor a forecast.** P0 establishes the real B rate under the evidence rules in `SPECIFICATION.md` §5.2. Everything
   without sufficient evidence is **D**.
3. Pre-agreed emergency routes are designed for unplanned closures and carry no link to any closure record. A closure
   (planned or unplanned) does **not** by itself mean an emergency route is in use. For planned works the signed route may
   differ, so B claims only an evidence-based match, never an active route, and its wording must say so.

## Routes per stretch (2026-10-05)

Complete routes per `SRNClosureStretch`: 1 route for 2,112 stretches · 2 routes for 101 · 3 for 1 · 4 for 2 · **236 stretches
have no complete route**. 6 stretches have routes with differing classifications. Example: `M65/J1/J2/1` and `M65/J1/J2/2`
(both Class 1A). The meaning of the route number (primary vs contingency) is **unverified**; GG 903 mentions contingency routes
where the primary has restrictions. P0 confirms it.
