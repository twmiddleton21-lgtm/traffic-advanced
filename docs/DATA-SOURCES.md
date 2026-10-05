# Data sources: evidence and confidence

Checked **2026-10-05** by direct requests to each service unless marked *unverified*. Re-verify anything older
than 3 months before relying on it. "SRN" = Strategic Road Network (England's motorways and major A-roads run by National Highways).

## Summary

| # | Source | Coords | Direction | Event ID | Diversion link | HGV restrictions | Key | Limit | Licence | Production use |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | NH Road & Lane Closures API v2.0 | ✅ WGS84 line | ✅ enum | ✅ situation + record id/version | ❌ none | ⚠ flags only | ✅ required | 10 calls/min/key | OGL v3.0 | ✅ primary (after P0 check) |
| S2 | NH Public Scheduled Road Closures (ArcGIS) | ✅ line | ⚠ in text only | ✅ event number | ❌ (text only) | ❌ | ❌ none | ArcGIS fair use | OGL v3.0 | ✅ fallback/cross-check |
| S3 | NH 7-day Road Closure Report (xlsx) | ❌ | ✅ column | ❌ | ❌ (text only) | ❌ | ❌ none | n/a | not stated on page | ⚠ cross-check only |
| S4 | NH Diversion Routes (ArcGIS) | ✅ lines/points | ✅ | ✅ route + stretch GUIDs | ⚠ to a *stretch*, not to an event | ✅ values + points | ❌ none | ArcGIS fair use, 1000/page | OGL v3.0 (portal) | ✅ diversion geometry |
| S5 | NH Network Model (ArcGIS) | ✅ | ✅ | ✅ link/node GUIDs | (join key) | ✅ 18 SRN restrictions | ❌ none | ArcGIS fair use | OGL v3.0 | ✅ road geometry + joins |
| S6 | NH Speed Managed Areas API | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (same portal) | 10/min | OGL v3.0 (assumed same portal, *verify*) | ✅ official congestion signal |
| S7 | NH Digital VMS API | ✅ points | ✅ | ✅ | ❌ | ❌ | ✅ | 10/min | *verify* | ⚠ has display-use conditions |
| S8 | NTIS DATEX II (speeds, journey times, events) | ✅ | ✅ | ✅ | *unverified* | *unverified* | subscription | *unverified* | *unverified* | ❓ access route unverified |
| S9 | TomTom Traffic flow/incident tiles | tiles | n/a | n/a | ❌ | ❌ | ✅ | **200K tiles/month** (pricing page) | TomTom T&Cs | ⚠ optional overlay only |
| S10 | OpenFreeMap base map | tiles | n/a | n/a | n/a | n/a | ❌ | none stated | OSM ODbL + attribution | ✅ (no SLA) |

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
- **Unverified until we have a key (P0):** real payload size, whether `linearElementIdentifier` equals Network Model
  `linkid`, which `linearElementReferenceModel` value is used, how often `generalPublicComment` contains diversion text.
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

## S5: Network Model (Public)

- `https://services-eu1.arcgis.com/mZXeBXkkZpekxjXT/arcgis/rest/services/Network_Model_Public_view2/FeatureServer`
  — Node (37,918), Link (43,025: `linkid`, `linkref`, `linkdesc`, `roadname`, `direction`, `startnode`, `endnode`, …),
  Vehicle_Restriction (18 SRN restrictions, e.g. "Vehicles Exceeding Height 4.9m Prohibited") + references, Junction, Road tables.
- Updated daily; OGL v3.0; no key. Use for: **road geometry per road number + direction** (road selector centring), junction
  labels, network joins between S1 and S4.

## S6–S8: other official NH services

- **Speed Managed Areas** (same portal/key): planned temporary and unplanned variable (advisory/mandatory) speed restrictions,
  including congestion-triggered ones. Official congestion signal for smart motorways. Candidate for the "Traffic" state.
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

Diversion text in the same closures (393 distinct carriageway closures): **71 (≈18%) name specific roads/symbols**
(e.g. "Diversion via A30 to Chard, A358 to rejoin A303 and vice versa"), 94 generic ("via National Highways network"),
191 none, 37 other.

**Conclusions**
1. **No free official source found links a closure/incident ID to a diversion route.** Classification A can only come from
   closure-specific *text* in the closure record itself (≈18%), with no route geometry.
2. Classification B is achievable for a minority of closures (≈10% strong geometric matches today; more once "both directions"
   closures are split and S1 link IDs are joined via S5). Everything else must be **D**, honestly.
3. Pre-agreed emergency routes are designed for unplanned closures. For planned works the route on the day may differ, so B wording must say so.
