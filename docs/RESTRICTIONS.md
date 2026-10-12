# Road restriction layers

Height restrictions, weight restrictions and the London LEZ/ULEZ boundaries, shown on the map when switched on in Settings.
Every layer is **off by default**.

**What these layers are not.** They are not a complete list of restrictions, not a route check, and not HGV navigation. The app
says so wherever restriction data is shown:

> Restrictions data is incomplete. Community-sourced records are unverified. No marker does not mean no restriction. Always follow
> road signs. This map is not a route check.

## This build (2026-10-09)

**Official sources only.** OpenStreetMap is **not included**: both public Overpass instances were overloaded for the whole working
session on 2026-10-09 (HTTP 504 "server is probably too busy", and queries hitting the server's 10-minute limit), so no complete
England download could be made.

The OSM pipeline is built and tested (parser, categories, England clip, ODbL metadata, against real OSM records in
`fixtures/restrictions/osm-elements.json`). To add OSM, run the download and the build with `--osm` once Overpass is responsive,
then review the report.

The shipped files were regenerated on 2026-10-09 (`generatedAt` 2026-10-09T13:45:33.000Z) with the current build script, from the
same downloads as before: TfL `data/raw/restrictions/2026-10-09T081333Z` and the NH open capture `2026-10-06T0652Z`. Records and
geometry are unchanged. Only source notes, the NH diversion-point licence name and the ULEZ rules changed (see "Reproducing the
files" below).

On 2026-10-12 `lez.json` and `ulez.json` were regenerated offline from the same downloads, with the same `generatedAt`, after the
zones' `rules` field was removed (see "Rules" under LEZ and ULEZ below). `height.json`, `weight.json` and `manifest.json` came out
byte-identical, and the two zone files differ from before only by the removed field.

| Layer | Records | Sources |
|---|---|---|
| Height | 972 records at 943 places | NH diversion points 77 (48 places), NH network 18, TfL 877 (London, bands) |
| Weight | 84 records at 75 places | NH diversion points only: weight **values** recorded on emergency diversion routes, with type, scope and exemptions not recorded. 77 at 7.5 t (69 places, 52 routes), 3 at 18 t, 2 at 5 t, 2 at 2 t |
| LEZ | 1 zone | TfL |
| ULEZ | 1 zone | TfL |

So outside London, height coverage is National Highways' network and diversion routes only. Weight coverage is diversion
routes only. A first OSM build would add both. All records are in England (see "Coverage gaps").

**On the map** (2026-10-12): from zoom 6 to 11, nearby height or weight markers are grouped into a ring with a count (red for
heights, grey for weights; selecting one zooms in until it splits), and a marker with no near neighbour keeps its plate. From zoom
12 every marker is separate. Below zoom 6 none is drawn. There is no separate "Restrictions" button or list popup (owner decision,
2026-10-12). Loading and error states show in a small box at the top right while a layer loads or fails. Once a layer has loaded,
its key rows (loaded layers only), the zoom message and the full disclaimer are a "Restrictions" section of the map's one key
(`web/src/components/MapKey.tsx`, bottom left); until then the disclaimer is shown with the loading and error states, so it is on
screen whenever any layer is on. The map key folds to one "Map key" line that looks the same whatever is switched on; the
restriction symbols and meanings are in the opened key (open on desktop, folded on phones and tablets at first; the choice holds
while layers and views are switched). Owner decision, 2026-10-12: folded, the disclaimer is hidden visually only. It stays in the
page word for word as the folded control's description for screen readers, shows again when the key is opened, and is always
shown in a restriction's details. Loading and error states are never folded.

**Details and the keyboard route.** Tapping a marker opens that restriction's full details. In the opened key, each loaded zone has
a 48 px "LEZ/ULEZ details and TfL's page" button that opens the zone's details (source, the TfL note, the source notes including
the ULEZ boundary-accuracy caveat, and the link to TfL's page). Map markers are pointer targets only, so the opened key also holds
the keyboard and screen-reader route to every restriction: a list of the restrictions in view (from zoom 6, nearest the centre
first), hidden visually until it has keyboard focus, whose buttons open the same details. An out-of-date data warning shows in the
key and in the details.

**What the weight values are, and aren't.**
- Each NH `DiversionPoint` weight record has only a type ("weight"), a value and a unit ("Tonnes"). There's no direction, extent,
  vehicle class, exemption or sign wording.
- NH records one point per diversion route and direction, so one place can appear several times: the 84 weight records are 75
  places, and the 77 NH heights are 48 places.
  - The map and the key's keyboard list show each place once (`web/src/restrictions/group.ts`). Its details list
    every diversion route it was recorded on, with "Recorded N times at this place (once per diversion route), shown once".
  - Records are merged only when everything describing the restriction is identical: source, kind, value, wording,
    conditions and exact position. Only the record id and the route may differ. Checked on the shipped data: the 26 merged
    groups differ in nothing else.
  - The data files are unchanged and keep every record.
- Why so many are 7.5 t:
  - 73 of the 77 records sit on routes whose own `WeightLimitTonnes` is also 7.5; the other 4 routes are missing from the routes
    layer.
  - Some route descriptions tie the value to the route's purpose rather than to a sign, for example "M56 westbound J10 to J9
    (Vehicles under 7.5t Only). See M56-W-10-109 (ALT) for diversion route for vehicles over 7.5t".
- The layer also has unit errors elsewhere (width values in "Tonnes"), so the values themselves aren't guaranteed.
- So the app never shows these as lorry limits, structural limits or limits for all vehicles:
  - the map key reads "Weight value on a National Highways diversion route. Type, scope and exemptions not recorded.";
  - the details say what the value doesn't record;
  - the lorry and all-vehicle key rows appear only when records of those kinds are loaded (none in this build).

## Sources (checked 2026-10-09)

| Source | Kind | Used for | Licence and attribution | Date of the data used |
|---|---|---|---|---|
| **National Highways, Diversion Routes Public View, layer 3 (DiversionPoint)** | Official | Heights (metres) and weights (tonnes) recorded along NH emergency diversion routes | **OGL v3.0**: the item's licence field (re-read 2026-10-09) says "The data is published under an Open Government Licence", with those words linking to the OGL v3.0 page (`nationalarchives.gov.uk/doc/open-government-licence/version/3/`). Attribution (verbatim): "Data derived from Ordnance Survey Highway Network, Subject to Crown copyright and database rights 2024. Ordnance Survey Licence: AC0000827444. The data is published under an Open Government Licence." ([item](https://www.arcgis.com/home/item.html?id=dcf7f6b642924f00a5410acbbb56b15b)) | Existing open-data capture 2026-10-06T0652Z; source last edited 2026-09-30 |
| **National Highways, Network Model (Public), layer 3 (Vehicle_Restriction)** | Official | Height restrictions on NH's own network (18 records) | OGL v3.0: "Contains public sector information licensed under the Open Government Licence v3.0." ([item](https://www.arcgis.com/home/item.html?id=4b64217e40dc48ebb38315a9a95c96e5)) | Same capture; source last edited 2026-10-06 |
| **Transport for London, "Bridges, tunnels, road barriers: height restrictions"** (`height-restrictions-in-london.xlsx`) | Official | 877 low bridges, tunnels and barriers within Greater London and the M25 | [TfL Transport Data Service licence](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service), based on OGL v2.0. Allows copying, publishing, adapting and commercial use. Required attribution: "Powered by TfL Open Data", "Contains OS data © Crown copyright and database rights 2016", "Geomni UK Map data © and database rights [2019]". Must not suggest TfL endorsement. | File last modified **2019-10-09**: the dataset says it is updated annually, but hasn't been since 2019 |
| **TfL LEZ boundary** (`Boundaries/lez.json`) | Official | LEZ outline | TfL Transport Data Service licence (as above) | Last modified 2023-07-20 |
| **TfL ULEZ boundary** (`Boundaries/ULEZ_Boundary_20230829.json`) | Official | ULEZ outline (London-wide since 29 August 2023) | TfL Transport Data Service licence (as above) | Last modified 2023-09-13 |
| GLA, "London Wide Ultra Low Emission Zone 2023" (GeoJSON, EPSG:27700) | Official (authored by TfL) | **Check only**: the ULEZ boundary is compared with it; not shipped | OGL v2.0 ([dataset](https://data.london.gov.uk/dataset/london-wide-ultra-low-emission-zone-2023-vd455)); publisher GLA, author TfL. The check's figures (in the ULEZ note) are credited in Settings → Sources and licences: "Contains public sector information licensed under the Open Government Licence v2.0." | The dataset page (2026-10-09) says it was last updated "over 2 years ago" and is a one-off. The downloaded file's HTTP `Last-Modified` is 2025-10-21, probably a re-upload: it can't be read as a data date. |
| **OpenStreetMap** (`maxheight`, `maxheight:physical`, `maxweight`, `maxweightrating`, `maxweightrating:hgv`, `maxweight:hgv`, and their `:conditional` forms) | **Community, unverified** | Heights and weights across England | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Attribution "© OpenStreetMap contributors" | One Overpass download; date in the data file |
| ONS "Countries (December 2023) Boundaries UK BFE", England, simplified to 10 m by the service | Official | **Filter only**: keeps OSM records that lie in England. Extent of the realm, so seafront and harbour roads stay in. Not shipped. | OGL v3.0: "Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2023." ([licences](https://www.ons.gov.uk/methodology/geography/licences)) | Downloaded with the OSM tiles |

### Facts verified about the sources

**TfL heights**
- The file holds **bands only**: "Up to 3.0", "Between 3.1 and 3.5", "Between 3.6 and 4.0", "Between 4.1 and 4.5" and "Between
  4.6 and 5.1", with imperial equivalents. There are no exact clearances, and the app shows the band, never a single value.
- Every record gives both grid (easting/northing) and WGS84 coordinates. All 877 agree to within 0.1 m with our OS-method
  conversion (`shared/geo/osgb.ts`).
- The dataset contains **heights only**: no weight limits.

**LEZ and ULEZ boundaries**
- TfL's 2023 ULEZ files are **byte-identical** to its LEZ files: the same SHA-256, and the ULEZ shapefile zip contains `LEZ.shp`
  dated 2021-10-25.
- The GLA's "London Wide ULEZ 2023" GeoJSON labels its polygons `BOUNDARY: "Low Emission Zone"`.
- TfL's LEZ page says the ULEZ "operates in the same zone".
- So since August 2023 the two zones share one boundary, with **different rules**. The app shows them as separate layers, each
  linking to its own TfL page for the rules (below), never as one zone.
- TfL's boundary (encoded polylines, about 1 m precision) against the GLA's (converted from British National Grid):
  - 22 rings in each;
  - **GLA → TfL** (24,857 GLA vertices; this direction is the build's pass/fail check): median 2.3 m, 99% within 10.6 m, all
    within 41.7 m;
  - **TfL → GLA** (14,265 TfL vertices): median 1.3 m, 99% within 9.6 m, and one short stretch of TfL's line beside the M25 near
    Heathrow (about −0.494, 51.475) up to 110.7 m from the GLA's;
  - 4 of 4,320 grid sample points fall inside one copy and outside the other.
  - The cause of the Heathrow stretch is **not verified**: TfL's line is rounded and simplified, and TfL says the ULEZ "does not
    include the M25", which the two copies may draw differently there.

  **What the app says about boundary accuracy (checked against the code 2026-10-12).** It never calls a boundary
  "approximate".
  - **ULEZ:** its source note, shown in the zone's details (opened from the map key) and in Settings → Sources and
    licences, reads: "Checked against the Greater London Authority's copy of the 2023 ULEZ boundary (Open Government Licence
    v2.0): 99% of its points are within 11 m of TfL's boundary. The two copies differ by up to about 111 m in places. Near the
    boundary, follow the zone signs."
  - **LEZ:** shows **no** boundary-accuracy note, although its geometry is identical to the ULEZ's. Adding one is a wording
    change for the owner to approve, and needs a data rebuild (the notes are in the data files).
  - Wherever restriction layers are shown, including on the map, the disclaimer ends "Always follow road signs. This map is not a
    route check."
- **Rules: not stored or shown (since 2026-10-12).** Earlier builds copied a few sentences from TfL's LEZ and ULEZ web pages
  (read 2026-10-09). That is tfl.gov.uk website text, which TfL's website terms allow for personal non-commercial use only, and
  not TfL open data (see "Unresolved licence questions"). The app stopped showing it, and the data was then minimised: the zone
  schema (`shared/api/restrictions.ts`) and the build script no longer have a `rules` field, so `lez.json`/`ulez.json` carry
  only the outline, the sources and the link to TfL's page. The zone's details say: "Transport for London sets this
  zone's rules and can change them. This app doesn't show the rules and isn't a check of your vehicle or route. TfL's page has
  the rules.", followed by the link to TfL's LEZ or ULEZ page. The Settings layer descriptions (`RestrictionsSection.tsx`)
  are original wording (2026-10-12; the ULEZ one previously reproduced TfL's vehicle list almost word for word):
  - LEZ: "TfL's boundary. TfL says lorries over 3.5 tonnes that don't meet the LEZ emissions standard need to pay the LEZ
    charge." (a summary of TfL's ULEZ page, not a quotation);
  - ULEZ: "TfL's boundary, the same as the LEZ's, but the ULEZ has different rules, set by TfL. This app doesn't check your
    vehicle against them: check with TfL."
- **Schema version stays 1.** The app and its data files ship together, and each build loads its own content-hashed zone files,
  so an app can't meet a zone file from another build. Validation strips unknown fields, so a file from before 2026-10-12, which
  still has `rules`, validates and loses the field (checked 2026-10-12).

**National Highways S4 (DiversionPoint)**
- 176 records: 77 height in metres, 10 height in "feet", 84 weight in tonnes, 2 width in metres, 2 width in "Tonnes", and 1
  length with no unit.
- The "feet" values are decimals (14.3, 15.9 …), so it's unclear whether 14.3 means 14.3 ft or 14 ft 3 in. They are **left out**.
- Width and length are not shown (no layer for them).
- NH doesn't record whether a weight value is a structural or a goods-vehicle limit, which vehicles it applies to, its extent or
  exemptions. These records are shown as "Weight value on a National Highways diversion route: type, scope and exemptions not
  recorded" (see "What the weight values are, and aren't").

**National Highways S5 (Vehicle_Restriction)**
- 18 records, all `MH` (maximum height), with NH's own description, e.g. "Vehicles Exceeding Height 14ft 6ins Prohibited". The
  description is shown verbatim.
- **Imperial wording vs NH's metres.** 8 of the 18 descriptions give feet and inches, and NH's `measure` for them is a lower
  metric figure:
  - 14ft 0ins → 4.2 m, 13ft 6ins → 4.1 m (twice), 15ft 0ins → 4.5 m, 15ft 9ins → 4.8 m, 15ft 8ins → 4.7 m (twice), 14ft 6ins →
    4.4 m.
  - Converting the metric value back gives a different imperial figure than the wording (4.2 m → 13′9″, where the wording says
    14ft 0ins).
  - So for these records the app shows the wording's feet and inches, never a conversion, e.g. "14′0″ in the wording, recorded
    as 4.2 m".
  - The details lead with the wording, verbatim ("Wording recorded by National Highways: …"), and explain that the feet and
    inches come from it.
  - If a metric value were ever higher than its wording, the app would say to use the lower figure. None is in this data.
  - Heights recorded only in metres, or worded in metres ("4.9m"), keep the usual conversion, rounded down.

**OpenStreetMap tagging**
- `maxweightrating:hgv` is the current UK tag for the lorry-symbol weight limit, such as 7.5 t
  ([2025 discussion](https://community.openstreetmap.org/t/proposed-automated-edit-replace-uk-occurrences-of-maxweight-hgv-with-maxweightrating-hgv/135024)).
  The older `maxweight:hgv` means the same.
- `maxweight` and `maxweightrating` are limits for all vehicles.
- `hgv=destination` and other access tags carry **no value**, and never create a weight restriction. A test proves this.
- Exemptions such as `maxweightrating:hgv:conditional=none @ delivery` are shown verbatim, never interpreted.
- `maxheight:signed=no` and `maxheight:physical` are shown as clearances, not signed limits.
- Values that are `default`, `none` or `below_default`, use other units (`kg`, `st`, `lbs`), are out of range or can't be read
  are skipped. Each skip is counted in the build report.

## Coverage gaps

**Where the shipped records are (checked 2026-10-12).** Every record was tested against the ONS England boundary (extent of the
realm) from the 2026-10-09 download, with `inEngland` (`shared/sources/ons/england.ts`):

| Area | Height records | Weight records |
|---|---|---|
| England | 972: TfL 877 (London only), NH diversion points 77 (48 places), NH network 18 | 84 at 75 places, NH diversion points only |
| Wales | 0 | 0 |
| Scotland | 0 | 0 |
| Northern Ireland | 0 | 0 |

- Outside London, England has 95 height records and 84 weight records, all on National Highways' network or its emergency
  diversion routes. Local roads outside London have **none**.
- Nothing in the app limits markers to London or any area: the map layers filter only by grouping, and the list by the view.
  Weight markers looked missing because they were drawn only from zoom 12 and are few and far apart; since 2026-10-12 they are
  grouped or shown individually from zoom 6 (`web/src/map/restrictionLayers.ts`).
- **Not UK-wide.** Covering Wales, Scotland and Northern Ireland, and local roads in England, needs new sources, none of which
  is verified for this app yet:
  - OpenStreetMap (community, unverified): the pipeline exists; the build clips to England, so other nations need that changed;
  - OS MasterMap Highways Network RAMI (Great Britain, not Northern Ireland; paid for commercial use, see below);
  - national and local road authorities for each nation (their datasets, licences and access are **not checked**).

- **No official national dataset is used.**
  - OS MasterMap Highways Network RAMI has GB-wide height, width and weight restrictions, but costs money to use commercially
    (free only to the public sector).
  - DfT D-TRO (digital traffic regulation orders) is incomplete until councils must publish (expected 2027), and its licence
    for reuse is unresolved.
- **Official coverage:**
  - National Highways records cover only its network and diversion routes.
  - TfL's heights cover only London, as bands, from 2019.
  - The zones are London only.
- **OpenStreetMap** completeness is unknown and varies by area. Records may be missing, outdated, mis-tagged (a lorry limit
  mapped as an all-vehicle limit, or the reverse) or mapped along a stretch of road rather than at the sign.
- **Not covered:**
  - width and length limits;
  - turning and access restrictions;
  - the London Lorry Control Scheme;
  - the Direct Vision Standard / HGV Safety Permit;
  - Clean Air Zones outside London;
  - bridge weight limits recorded only by councils.

## Files and publication

`scripts/restrictions/build-restrictions.ts` writes the files into `web/src/restrictions/data/`. They are versioned static
files: Vite gives each a content hash (`/assets/height-<hash>.json`), so a new build never mixes with an old one.

| File | Contents |
|---|---|
| `manifest.json` | Bundled with the app (a few KB): which layers have data, and every source's metadata and attribution. A layer without data has no switch. |
| `height.json`, `weight.json` | Restriction points with source, kind, recorded value and range, conditions, position, road, source wording and dates. OSM records also keep element id, version and relevant tags. |
| `lez.json`, `ulez.json` | One zone each: polygons (WGS84), the link to TfL's page for the zone's rules (no rule text), sources. |

Every file:
- has `schemaVersion` and `generatedAt`, plus each source's licence, attribution, dataset date and download time;
- is validated with `shared/api/restrictions.ts` when built and again when the app loads it;
- is downloaded only when its layer is switched on, as a whole file, so no request reveals the area being viewed;
- is not precached by the service worker.

No R2 or API is used, and nothing is published until a reviewed build is deployed.

### ODbL compliance (OpenStreetMap)

**This applies only once a build includes OpenStreetMap data. The current files contain no OSM records** (see the top of this
file), so nothing in them is offered under the ODbL yet.

- With OSM included, `height.json` and `weight.json` contain a **derivative database** of OpenStreetMap: a filtered, converted subset.
- They are publicly used, so they are offered under the **ODbL 1.0**. Each file states the licence and attribution in its
  `sources`, and **the files themselves are publicly downloadable** from the app's origin, which is how the derivative database is
  made available.
- The transformation is reproducible from `scripts/restrictions/`.
- The map credits "© OpenStreetMap contributors" while an OSM-sourced layer is on, as does Settings → Sources and licences.
- Official and OSM records sit side by side in the same files. NH data (OGL) and TfL data (TfL licence) permit this, and those
  records keep their own licence and attribution. ODbL applies to the OSM-derived records.
- User names, user ids and changeset ids from OSM are never stored.

## Updating the data

1. **Download.**
   - TfL and GLA: `node scripts/restrictions/fetch-sources.ts --only tfl`.
   - OSM: `node scripts/restrictions/fetch-sources.ts --only osm`, which downloads the ONS England boundary and runs 24 tile
     queries (bounding box only; the build clips to England).
     - If `overpass-api.de` is overloaded, use `--overpass <URL>` with another public instance listed on the OSM wiki.
     - An interrupted run resumes with `--into <folder>`.
   - Files go to `data/raw/restrictions/<timestamp>/` (git-ignored), with a manifest of URLs, sizes, SHA-256 hashes and server
     dates.
2. **Check the source terms** (the links above) have not changed. Record any change in this file and in `docs/DATA-SOURCES.md`.
3. **Build:**

   ```
   node scripts/restrictions/build-restrictions.ts --tfl <tfl dir> --osm <osm dir> --nh <NH open capture dir>
   ```

   - Without `--osm`, the files are built from official sources only.
   - The build fails on a changed TfL column layout, an invalid record set, or a ULEZ boundary that disagrees with the GLA's copy.
4. **Review the build report** (printed, and saved as `build-report.json`): kept and skipped counts by reason, and the boundary
   check. Spot-check records against their sources.
5. **Review, test and ship.** Commit the changed `web/src/restrictions/data/*.json` on a `data/` branch with the report summary,
   run `npm run check`, and deploy as usual.

Restriction data older than 120 days is flagged in the app as possibly out of date.

### Reproducing the files

The build is deterministic for the same inputs and `--generated-at`. To check that the shipped files match the script and the
downloads:

1. Copy the TfL download folder somewhere temporary. The build writes `build-report.json` into it.
2. Run:

   ```
   node scripts/restrictions/build-restrictions.ts --tfl <copy> --nh data/raw/2026-10-06T0652Z-open --out <temp dir> --generated-at <manifest generatedAt>
   ```

3. Compare each file byte for byte with `web/src/restrictions/data/`.

Raw downloads aren't in the repository, so no automated test can make this comparison. Run it after any change to the build
script or adapters.

**Why the earlier files didn't match (found in review, 2026-10-09).** The files built at 08:39 UTC were not regenerated after the
build script changed at 09:15 UTC:
- Before the change, the boundary check measured one direction only (TfL vertices to the GLA line). The ULEZ note was written
  from that: "99% of points within 10 m, and up to 111 m apart in one place".
- The changed script measures both directions. It fails the build on the GLA → TfL direction, and its note reads "99% of its
  points are within 11 m of TfL's boundary. The two copies differ by up to about 111 m in places".
- Only the ULEZ note (and the same text in `manifest.json`) differed. Records and geometry were identical.

## Unresolved licence questions

Checked 2026-10-12 against TfL's and the GLA's own pages (evidence in `docs/DATA-SOURCES.md` S11). The owner accepts the first
three uncertainties below (registration, the demonstration notice and the `lez.json` basis) for release; TfL has not been asked.

- **TfL registration (accepted uncertainty).** The Transport Data Service licence "shall apply from the date of registration" and
  asks You to "Ensure the information You provide on registration is accurate", so it assumes registration. But no TfL page
  requires it for these files: "Our open data" says "You need to register…" only for live feeds and APIs, its Roads entries
  (height restrictions; CC, LEZ and ULEZ boundaries) say nothing about registering, the London Datastore lists the heights file
  with no account needed, and the bucket is public with no key. Recorded as: no registration requirement published for these
  static files; the licence wording assumes registration; **not confirmed with TfL**.
- **"Demonstration purposes only" (accepted uncertainty).** Near the top of "Our open data": "The example data listed below are not
  updated and are for demonstration purposes only. Please visit our portal to access our data." Whether this covers the Roads
  static files is unclear: their own entries describe usable data ("You can add the data as a layer to any mapping or routing
  product"), the Datastore lists the heights file as a dataset under the TDS licence, and the sample feeds that are
  demonstration-only say so in their own entries. The app shows the heights' 2019 date and treats them as bands, not clearances.
- **TDS basis for `Boundaries/lez.json` (inferred).** No TfL page links this file. It is in TfL's public Roads bucket, whose data
  "Our open data" puts under the TDS licence ("Using our data is subject to our terms and conditions"), and it is byte-identical
  to `ULEZ_Boundary_20230829.json`, whose dated release TfL does link (as a shapefile zip). TfL's own LEZ link is a 2007 shapefile.
  Pointing the LEZ source at the linked 2023 release needs a data rebuild: deferred to the next one.
- **TfL rules text (removed from the app and its files, 2026-10-12).** The LEZ/ULEZ rule sentences came from tfl.gov.uk web
  pages, not open data. TfL's website terms: TfL material "may not be printed, copied, reproduced, republished … except for your
  own personal non-commercial use. You must gain our permission for any other type of use." The app shows its own wording and a
  link to TfL's page instead (`ZONE_RULES_TEXT`, `web/src/restrictions/describe.ts`). As data minimisation, the sentences were
  then removed from the zone files, the schema, the build script, the tests and this file. This is not a legal determination
  about the earlier copies:
  - they remain in this repository's Git history (commits before the removal), which is not rewritten;
  - whether any deployed build ever served them is not established (`docs/PRODUCTION-LOG.md`).
- **GLA comparison figures.** The ULEZ note publishes figures derived from the GLA's dataset (OGL v2.0; the dataset page,
  re-checked 2026-10-12, specifies no attribution statement). OGL v2.0: "acknowledge the source of the Information by including
  any attribution statement specified by the Information Provider(s) and, where possible, provide a link to this licence", with
  the default "Contains public sector information licensed under the Open Government Licence v2.0." Settings → Sources and
  licences lists the Greater London Authority with that statement and a link to the licence whenever the ULEZ source is listed.
- **Resolved: NH Diversion Routes Public View licence.** OGL v3.0. The item's licence text links "Open Government Licence" to the v3.0
  page (checked 2026-10-09), and the app says OGL v3.0.
  - The data is "derived from Ordnance Survey Highway Network" under NH's OS licence. The OGL doesn't cover third-party rights the
    publisher isn't authorised to license, so the app relies on NH's own statement that it publishes the data under the OGL, and
    keeps NH's OS attribution verbatim.
  - **Caveat:** the app relies on National Highways' published OGL v3.0 statement. Underlying third-party rights, including Ordnance
    Survey rights, have **not** been independently verified.
  - The owner accepted this remaining rights risk for release on 2026-10-12. Accepting it doesn't verify the rights.
  - Written confirmation from NH is optional.
- **Wording:** official sources are labelled "Source: <authority>", never "official record". This follows the TfL licence's
  "Non-endorsement" clause, which forbids suggesting official status or TfL endorsement.
- **Third-party notices:** the shipped `workbox-window` and Workbox runtime (MIT) are minified without their licence headers, as
  MapLibre (BSD-3-Clause) already is. A notices page would cover all of them. Not yet decided.
