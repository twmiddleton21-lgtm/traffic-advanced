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

## OpenStreetMap layers (stage 1, built locally 2026-10-12; not deployed, data not published)

Approved by the owner on 2026-10-12 as the first stage of the Routes layers plan: OpenStreetMap camera and road-restriction layers
for the **Routes view only**, each switched on and off on its own in the Layers panel. The Closures view, its restriction layers and
files, National Highways data and the existing Routes wording are unchanged.

**Layers.** A new visitor starts with every layer **off** and junction numbers on. Closing the panel keeps the switches.

**Remembering the switches** (added 2026-10-12):
- The switches are remembered on this device only, in `localStorage` under the versioned key `ta-routes-layers-v1`
  (`settings/preferences.ts`).
- Only the eight true/false switches are stored: never the map position, a selected marker, a search or filters.
- A missing, damaged or partly invalid value falls back to the defaults switch by switch, and unknown fields are dropped.
- A layer switched on in an earlier visit is downloaded again when the app opens, and only then.

| Layer | What is shown | England records (data to 2026-10-11) |
|---|---|---|
| Speed cameras | `highway=speed_camera` nodes, and the device nodes of enforcement relations for speed (`enforcement=maxspeed` / `average_speed`) | 3,159 |
| Average speed checks | `enforcement=average_speed` relations whose `section` ways join into one unbroken line passing through the relation's single `from` and `to` points; drawn from start to end with direction arrows | 20 of 78 mapped |
| Red-light cameras | device nodes of `enforcement=traffic_signals` relations | 33 |
| Height limits | `maxheight`, `maxheight:physical` (+ `:conditional`); the lower is shown when both are mapped | 10,763 |
| Weight limits | lorry limits (`maxweightrating:hgv`, `maxweight:hgv`) and all-vehicle limits (`maxweight`, `maxweightrating`), kept apart, with `:conditional` exemptions | 33,707 |
| Width and length limits | `maxwidth`, `maxwidth:physical` (on roads only), `maxlength` | 4,898 |
| Lorry access restrictions | `hgv=no`, `destination`, `delivery`, `discouraged` (advisory), and `hgv:conditional` | 8,000 |

**Interpretation rules** (`shared/sources/osm/routes-layers.ts`, tested on real elements in `fixtures/routes-layers/`):
- Nothing is guessed. An element or tag that can't be read reliably is left out and counted by reason in the build report. A road
  with no record is never treated as unrestricted, and the UI says so.
- Height and weight values use the Closures view's own parsers unchanged (`shared/sources/osm/restrictions.ts`). `default`, `none`
  and other no-limit words never become a value.
- Conditions and exemptions are kept verbatim and never evaluated. A value mapped only in a `:conditional` tag is marked
  "applies only under the conditions mapped", never shown as a general rule. Markers with conditions carry `*`.
- Camera speed limits: shown only when mapped as `<n> mph` and all mapped values agree. A bare number (km/h by OSM's rules) is never
  converted. Always labelled the road's mapped limit, not a lorry limit. **No HGV limit is inferred from car limits.**
- Camera direction: only the bearing from an enforcement relation's `from` point to its `to` point (OSM's documented roles), and the
  camera's `direction` tag verbatim with a note that its meaning varies. Nothing else.
- Red-light cameras only from `enforcement=traffic_signals` relations. `enforcement=red_light_camera` and `enforcement` tags on
  nodes are documented mistakes and are left out (5 and 78 in England).
- Restrictions only on roads for motor vehicles (`highway=` motorway … service, living_street, road, busway; not footway,
  cycleway, path, pedestrian or track). `maxwidth:physical` on a lone node (usually a path barrier) is left out.
- Average speed checks are left out unless the section and direction are certain: 12 have no section ways, 39 lack exactly one
  `from` and one `to`, 1 doesn't join into one line, and 6 have a `from` or `to` point off the section.
- Records are kept only inside England, using the ONS England boundary already used by the Closures pipeline.

**In the app:**
- Layers panel (`components/RoutesMapControls.tsx`): a "Community map data" group under the junction switch, with Cameras and Road
  limits sub-groups, the community-data caveat, the source, licence and data date, and each layer's loading, error (with Try again)
  and record count. Loading and errors also show outside the fold. The scope text and the no-traffic note are unchanged and stay
  last.
- Caveat (shown in the panel, the map key and every record's details): "Community data from OpenStreetMap: incomplete and may be
  wrong or out of date. No marker does not mean no camera or restriction."
- Map: each layer has its own GeoJSON source (`map/routesOverlayLayers.ts`).
  - **No groups or clusters** (changed 2026-10-12). Every marker is one record, and each layer appears only once the map is zoomed in
    far enough to read its records on their own (`ROUTES_LAYER_MIN_ZOOM`). The map stays clean at England and regional views:

    | Zoom (about) | What is drawn |
    |---|---|
    | below 9 (England, a region) | nothing |
    | 9 (a county) | average speed sections; arrows from 11, names from 12 |
    | 11 (a city) | speed and red-light cameras |
    | 12 (a town) | height, width and length limits |
    | 13 (streets) | weight limits and lorry access, the densest layers |

    No record is ever hidden by a collision once its layer is drawn. A layer that is on but not drawn at the current zoom says so:
    "Zoom in on the map to see them" on its panel row, and "Zoom in to see: …" in the map key. Each row also says which level it
    appears from. The keyboard list lists only layers drawn at the current zoom.
  - They draw under the junction labels and never hide them (`*-ignore-placement`).
  - Each kind differs by **shape**, not colour alone, and every image has a white edge, so it reads on both the light and the dark
    base map:
    - speed camera: a dark **square** sign with a camera and a flash;
    - red-light camera: a **tall** signal housing with three lights over a small camera;
    - average speed check: a dashed line with direction arrows and its name written along it ("Average speed check 50 mph");
    - restrictions: sign-style plates with a dashed border (community data), each with its own glyph and value:
      - height: arrows up and down;
      - lorry weight: a lorry;
      - all-vehicle weight: a bridge;
      - width: inward arrows between uprights;
      - length: a lorry over a measuring line;
      - lorry access: a red prohibition roundel;
- Layout: the Layers panel stays at the top left and the map key at the bottom left.
  - The panel's bottom edge follows the key's measured height (a `ResizeObserver` in `App.tsx`), so the open panel always ends
    above the key, folded or open, at every screen size, and the two never overlap.
  - Opened in Routes, the key takes at most 45% of the map and scrolls beyond that, so the panel keeps the rest.
  - The panel is opaque.
  - Scrolling (changed 2026-10-12): the Layers button is a fixed control and never scrolls. Opened, only the panel's own bordered box
    scrolls, inside its border, like the Closures list and the map key. The box is capped as a shrinking flex item of `<details>`,
    and also at its container's height less the button (`100cqh`), for browsers where `<details>` ignores flex.
- Map key (`components/MapKey.tsx`, changed 2026-10-12): a **permanent legend**.
  - It always has the same seven rows, one per layer this build has, each a symbol and a short name.
  - A layer that is off is muted and marked "Off". It is never hidden, so the key doesn't change shape as layers are switched.
  - While a layer is on it also shows:
    - the weight road colours (7.5 t or less, above 7.5 t);
    - what a highlighted or faint road and "*" mean;
    - which layers need more zoom;
    - the community-data caveat, once;
    - the data date, and a stale warning after 120 days.
  - A keyboard list of records in view is hidden until it has keyboard focus.
- Layers and the map key are **never open together** (Routes): opening one folds the other, through shared state in `App.tsx`.
  - The Routes key has its own open state, so the Closures key is unaffected.
  - Layers starts open where there's room and the key folded.
- **Road highlighting** (restriction layers, added 2026-10-12): while Height, Weight, Width and length, or Lorry access is on, the
  roads its records were mapped on are drawn as a translucent line under the markers, from one zoom level before the markers.
  - Each layer has its own colour **and line pattern**: weight solid, height dashed, width and length dotted, access dash-dot.
  - Weight limits of 7.5 t or less are red, higher limits amber.
  - Roads whose record has conditions or exemptions are drawn fainter.
  - The lines come only from the layer's own records and the same extract (`shared/sources/osm/routes-highlights.ts`). One line is
    drawn per record mapped on a road; a record from a single point keeps its marker only. Nothing is inferred, and an
    unhighlighted road is not a clear road.
  - Separate files, `<layer>-roads.json`, are loaded only while the layer is on, and are optional: if they are missing, the markers
    still show.

  | Layer | Roads | Point-only records | Gzipped size |
  |---|---|---|---|
  | Height | 7,913 | 2,849 | 243 KB |
  | Weight | 33,141 | 564 | 1.88 MB |
  | Width and length | 3,948 | 950 | 294 KB |
  | Access | 7,852 | 148 | 497 KB |

- **Visual hierarchy:** markers start smaller and softer at the zoom their layer appears (70–75% size and opacity), and reach full
  size two levels later. There are no groups or clusters.
- Details (`components/RoutesFeatureDialog.tsx`): the value (heights and widths in m and ft-in), the tags exactly as mapped,
  conditions verbatim, direction as mapped, the location, the last edit, links to each OpenStreetMap element, the source, the caveat
  and the scope text.
- Data loading (`routemap/useRoutesLayerData.ts`): a layer's file is fetched only once it is switched on. It is then kept for the
  visit, so switching off and on, or opening and closing the panel, downloads nothing. A failed load affects only its own row.
  Files are static, content-hashed assets from our own origin, through `trafficService.ts`. They never run Worker code
  (`run_worker_first: ["/api/*"]`), so they add no Worker requests or CPU.

**Source, licence and attribution:**
- **Source:** one dated Geofabrik extract, `https://download.geofabrik.de/europe/united-kingdom/england-261011.osm.pbf`
  (1,703,180,189 bytes). Geofabrik's MD5 was checked on download, and our SHA-256 is
  `16959e0317e09e187a21ba5118d30045884dd4187e6f3a189d4a07565215e966`. Its replication timestamp, the date the OSM data runs to, is
  2026-10-11T20:21:06Z. No public Overpass endpoint is used.
- **Reader check:** the extract read through our PBF reader gives 3,142 `highway=speed_camera` nodes and 622 `type=enforcement`
  relations in England, the same as taginfo for England on the same data date (checked 2026-10-12).
- **Licence:** ODbL 1.0. The layer files are a derivative database and are offered under the ODbL. Each file states the licence,
  the attribution and the extract it came from. The files are the ones the app downloads, and the method that makes them is
  `scripts/routes-layers/` (ODbL 4.6).
- **Attribution:** "© OpenStreetMap contributors", linked to https://www.openstreetmap.org/copyright. It appears in the Layers
  panel, the map key, each record's details, and the map credits while a layer is on (the source's `attribution`).

**Sizes:**

| File | Raw | Gzip | Brotli |
|---|---|---|---|
| speed-cameras | 1.4 MB | 102 KB | 77 KB |
| red-light-cameras | 17 KB | 2 KB | 2 KB |
| average-speed | 29 KB | 7 KB | 5 KB |
| height | 4.7 MB | 403 KB | 288 KB |
| weight | 17.8 MB | 1.28 MB | 0.90 MB |
| width-length | 2.2 MB | 189 KB | 132 KB |
| access | 3.5 MB | 298 KB | 209 KB |

On a desktop the weight file parses in about 100 ms and validates in about 120 ms. A phone will be slower; the row shows "Loading…"
meanwhile.

**Update procedure** (nothing is uploaded or deployed by these steps):
1. `node scripts/routes-layers/fetch-osm.ts`: downloads today's dated England extract into `data/raw/routes-layers/<stamp>/`
   (git-ignored), checks Geofabrik's MD5 and records the URL, size, SHA-256 and Last-Modified.
2. `node --max-old-space-size=8192 scripts/routes-layers/extract-osm.ts data/raw/routes-layers/<stamp>`: three passes (about 9
   minutes), writing `routes-extract.json` beside the extract.
3. `node scripts/routes-layers/build-routes-layers.ts --osm data/raw/routes-layers/<stamp> --boundary <folder with ons-england-bfe.json>`:
   writes `web/src/routemap/data/` and a build report beside the extract. Review the report's counts and reasons before using the
   files.
4. `node --max-old-space-size=6144 scripts/routes-layers/build-highlights.ts --osm data/raw/routes-layers/<stamp>`: writes the road
   highlighting files beside the marker files. It refuses marker files from a different extract.
5. Optionally, `node scripts/routes-layers/capture-fixtures.ts data/raw/routes-layers/<stamp>` refreshes the test fixture.

### Generated data: recommended production approach (a recommendation; nothing changed yet)

**Today:** the generated files sit uncommitted in `web/src/routemap/data/` (about 30 MB raw). They are bundled by `npm run build` as
content-hashed static assets.

**Facts this rests on (verified 2026-10-12):**
- **Workers Static Assets:** "Individual file size | 25 MiB | 25 MiB" and "Files per Worker version | 20,000 | 100,000"
  (Free | Paid, developers.cloudflare.com/workers/platform/limits). The largest file, weight, is 17.8 MB raw.
- **No Worker work:** static assets never run Worker code (`run_worker_first: ["/api/*"]`).
- **CI:** `.github/workflows/ci.yml` runs `npm run build` on every push and PR, with no secrets.
- **One extract:** a Geofabrik England extract is 1.7 GB, takes about 9 minutes to extract, and is updated about daily.

**Recommendation, in order:**
1. **Keep the repo to schemas, parsers, scripts, fixtures and docs.**
   - Add `web/src/routemap/data/*.json` to `.gitignore`.
   - Load the catalogue through `import.meta.glob` (as the data files already are), so a build without data simply offers no OSM
     layers. CI, development builds and tests then work without the data; tests use `fixtures/routes-layers/`.
2. **Build the data in a separate, manually run job, not on every CI run.** A `workflow_dispatch` GitHub Actions workflow with no
   secrets would:
   1. run fetch-osm → extract-osm → build-routes-layers;
   2. check the build report against agreed limits (each file under 20 MiB, record counts within an expected range of the last
      build);
   3. publish the files, the build report and the provenance (extract URL, SHA-256, data date) as a dated, versioned GitHub
      Release asset, e.g. `routes-layers-2026-10-11`.

   Monthly, or on demand. The app warns after 120 days. One Geofabrik download per build, never per CI run.
3. **Deploy pins a data release.** The deploy step downloads the named release into `web/src/routemap/data/` before
   `npm run build` and `wrangler deploy`. The files are then ordinary content-hashed Workers Static Assets, exactly as now: no R2,
   no new binding, no Worker code or CPU.
   - A deploy without a pinned release ships no OSM layers rather than stale or mixed data.
   - The release asset is also the ODbL "offer" of the derivative database, beside the scripts in this repo.
4. **Size guard:** the build fails if a file exceeds 20 MiB, leaving headroom under the 25 MiB limit. If weight grows near it,
   split it by kind (lorry and all-vehicle limits) rather than drop records.

**Considered and not recommended:**
- committing the data: about 30 MB per refresh in git history;
- generating it in every CI run: slow, and repeated 1.7 GB downloads;
- serving it from R2 through the Worker: new routes, Worker requests and CPU per file, for files that are static anyway.

**Splash (2026-10-12):** the splash has its own stylesheet, `web/src/splash.css`, linked in `index.html`'s `<head>`.
- A stylesheet `<link>` blocks the first paint, so the banner is drawn at its final size and ratio from the first frame. Before,
  until the app's CSS arrived, the image showed at its 1186 px intrinsic width; in development, Vite injects CSS from JavaScript after
  the first paint.
- The banner's box keeps the 1186:400 ratio before the image loads, and the text's line box is fixed for the web-font swap.
- Its colours repeat the theme tokens, and a test checks they match.

**Not in this stage:** speed limits (too large for a static marker file; see `docs/SPEED-LIMIT-TILES-PROPOSAL.md`), OS RAMI,
TomTom incidents and truck routing, and turn restrictions.

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
