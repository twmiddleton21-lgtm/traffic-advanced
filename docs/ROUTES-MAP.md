# Routes map (initial phase, 2026-10-12)

Status: built locally, not deployed. The Routes scope and no-traffic wording was approved by the owner on 2026-10-12 (CLAUDE.md: safety wording must not change silently).

## What it is

A second view beside Closures, chosen with the Closures / Routes switch in the header. It is a clean map for route awareness:
the base map (OpenFreeMap), motorway and primary-route emphasis, road numbers, and National Highways junction numbers. It does
**not** plan routes, check vehicle suitability, give directions or show live traffic.

- **One map, two views.** The same MapLibre map serves both. Switching shows each view's own layers (`web/src/map/viewLayers.ts`)
  and puts the map back where that view last was (`web/src/routemap/view.ts`). Nothing is created or destroyed on a switch.
- **State.** The view is in the URL (`?view=routes`; Closures, the default, is never written), like `?closure=`. No new storage.
  Closures' day, filters, search, selection, drawer and restriction settings live in `App` and are untouched by a switch.
- **Routes' own controls.** At the top left of the map, a square "Layers" map button (layers icon and label) that opens a panel
  under it, independent of the map key (bottom left, as in Closures), with its own switch for junction numbers (on by
  default, for the visit), the data's loading/error/empty states, coverage, source, a no-live-traffic note and the scope text.
  The restrictions panel, closures list, date bar, road search and closure details are not shown in Routes.
- **Attribution.** Base map: OpenStreetMap/OpenMapTiles/OpenFreeMap credits, unchanged. Junction numbers: National Highways, OGL
  v3.0, already in the map credits ("Closures, diversions and junctions: National Highways, Open Government Licence v3.0") and in
  the panel.

- **Settings are per view** (2026-10-12). Settings shows the shown view's own section:
  - Closures: Road restrictions.
  - Routes: Route map. This has the same junction switch as the map panel, its data's loading and error states with Try again,
    and the scope and no-traffic notes.

  Appearance (theme) is shared. In Routes, Settings hides the restriction sources and restriction problems.

**Wording approved by the owner (2026-10-12):**
- "Routes is for route awareness only. It doesn't plan routes, check whether roads suit your vehicle, or give directions. Always
  follow road signs."
- "Live traffic isn't connected yet. Road closures are in the Closures view."

## Junction numbers: verified coverage

Source: the existing junctions snapshot (`/api/junctions`, `shared/api/junctions.ts`), built from the NH Network Model (S5 in
DATA-SOURCES.md: Junction + Junction_Reference + Node tables, OGL v3.0). Nothing new was downloaded or rebuilt.

Checked against the development export `web/src/data/dev-junctions.json` (Network Model capture 2026-10-05):
- **596 labels:** 456 motorway, 51 A(M), and 89 on four NH-run A roads (A12 25, A14 57, A42 4, A55 3).
- **In England:** 595, tested against the ONS England boundary already in `data/raw/restrictions/2026-10-09T091212Z/`.
  1 is in Wales: M48 J2, on the Severn crossing. A55 J38–J40 are near Chester, in England.
- **How labels are placed:** NH's own junction name, verbatim, at the centre of that junction's Network Model nodes. The builder
  (`scripts/lib/snapshot-builder.ts`) leaves out named-only junctions (no number) and 3 junctions whose nodes spread more than
  2 km (A1(M) J57, M42 J8, A14 J41).
- **Routes' own check** (`web/src/routemap/junctionLabels.ts`): a label is drawn only if its name parses to the record's own road
  and number, and no other record has the same name. Anything else is left out and named. With the real data, none are left out.

**Gaps:**
- Only roads National Highways runs. Most A roads (local authority roads, including many primary routes) have **no junction
  numbers** here.
- No junction names. Named-only junctions and the 3 spread junctions aren't labelled.
- England only. Scotland, Wales and Northern Ireland roads aren't covered, apart from the one M48 label.
- The production snapshot is built the same way, but its count can differ from the development export.

Other sources were not used:
- OpenStreetMap `motorway_junction` refs aren't in the OpenMapTiles vector schema the base map uses (DATA-SOURCES.md S10).
- Adding them would need a new download and an approved pipeline.

## Live traffic: research (accessed 2026-10-12; deferred from the first release)

Superseded by the fuller research in `docs/LIVE-TRAFFIC-RESEARCH.md` (same date), which has the decision and the sources. A TomTom
layer was later built and tested locally, then deferred from the first release: the Routes view doesn't show it (that document's
"Implementation status").

"Verified" means read on the official page on 2026-10-12. Prices and quotas change, so re-check before any decision.

| Source | Data | Access and cost | Fit |
|---|---|---|---|
| NH Developer Portal (already used, keyed server-side) | Verified products: Road & Lane Closures v2, Digital VMS v1, Speed Managed Areas v1, Road Limits & Features v1. **No flow, speed or journey-time product.** | Free key. Verified limit: 10 calls per key per minute. | Good. Same pull and Worker pattern as today. |
| NH NTIS DATEX II | Journey times, loop speeds and flows, events, VMS (older NH pages; SRN only) | Register and be approved. **Current access route unverified:** the subscriber portal refused connection, and NH subscriber pages return 404. | Poor as documented. Push-only SOAP to a subscriber endpoint; whether a Worker can receive it is unverified. |
| NH WebTRIS | Historic loop counts | Open, no key | **Not live.** |
| OpenStreetMap | Road network only | — | No traffic data. |
| TomTom Traffic | Flow and incident tiles, flow segment data | Verified free tier: 200K tile requests/month, no card. **Key in browser tile URLs.** | MapLibre overlay possible. Caching for multiple users is reportedly prohibited (unverified). |
| Mapbox Traffic v1 | Congestion levels on Mapbox Streets geometry, about every 8 min (verified) | 200K vector-tile requests/month free, then $0.25 per 1,000 (verified). **Token in browser URLs.** | Works in MapLibre. Product Terms not read. |
| HERE Traffic v7 | Flow (speed, jam factor) and incidents, JSON; traffic vector tiles | Superseded: see `LIVE-TRAFFIC-RESEARCH.md` (30,000 free vector tiles and 5,000 Traffic API calls a month; card required) | See `LIVE-TRAFFIC-RESEARCH.md`. |
| Google | Traffic layer inside Google Maps JS only | — | **Excluded:** terms restrict use with non-Google maps. |
| Azure Maps | Incidents API; flow as Render 2024-04-01 traffic tilesets (Traffic v1 retires 31 Mar 2028) | See `LIVE-TRAFFIC-RESEARCH.md` | Third-party-map terms unresolved. |
| INRIX | Segment speeds and incidents | Enterprise quote | Not for this phase. |
| TfL Unified API | London road status and disruptions (not speeds) | Registration for keys (verified) | London only. |

**Recommendation:**
1. **No new provider, smallest step:** NH Speed Managed Areas and unplanned closures from the portal we already use.
   - It's official, server-side and cached in our own storage.
   - It must be labelled as official NH events, never as live congestion.
2. **NTIS**, the best official speed and flow data, only if NH confirms a current subscription route that a Worker can use.
3. **TomTom flow tiles** as an opt-in overlay, labelled "Traffic (TomTom), not official". This needs approval for a key visible in
   the browser, a new CSP host and an account.

**Open questions:**
- The NH portal T&Cs describe "OGL v2.0 with NH amendments". DATA-SOURCES.md records the portal feeds under OGL v3.0. This is
  recorded as unresolved in DATA-SOURCES.md, "Developer Portal licence", with the evidence.
- Do the portal terms limit caching?
- Is NTIS still open to new subscribers?
- TomTom and Mapbox terms on caching and on use over a non-TomTom/non-Mapbox base map.

Sources:
- https://developer.data.nationalhighways.co.uk/ (/faq, /terms)
- https://webtris.nationalhighways.co.uk/api/swagger/ui/index
- https://github.com/ntisservices
- https://wiki.openstreetmap.org/wiki/Key:highway
- https://docs.tomtom.com/pricing
- https://docs.mapbox.com/data/tilesets/reference/mapbox-traffic-v1/
- https://www.mapbox.com/pricing
- https://docs.here.com/traffic-api/docs/introduction-to-here-traffic-api-v7
- https://cloud.google.com/maps-platform/terms/maps-service-terms
- https://learn.microsoft.com/en-us/rest/api/maps/traffic
- https://tfl.gov.uk/info-for/open-data-users/unified-api

## Adding a traffic layer later

- Add its layers to `web/src/map/routesLayers.ts` (`ROUTES_LAYER_IDS`) with their own source and credit.
- Add a switch to `RoutesMapControls`, and its loading, error and stale states.
- Keep it visually distinct from closures (CLAUDE.md UI rules).
- Never show static or cached data as live.
