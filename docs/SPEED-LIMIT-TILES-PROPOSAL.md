# Proposal: speed limits on the Routes map as vector tiles (2026-10-12)

**Status:** a proposal for review. Nothing here is built, configured or approved.

**Labels:**
- **Verified:** checked on 2026-10-12.
- **Estimate** and **Unverified:** what they say.

## Why not a static marker file

- England has **1,108,171 ways tagged `maxspeed`** (taginfo England, data to 2026-10-11; **verified**). They are lines, and a speed
  limit is only useful drawn along its road.
- The largest stage 1 file is weight, with 33,707 point records: 17.8 MB raw, 1.28 MB gzipped.
- Speed limits as GeoJSON lines would be roughly two orders of magnitude larger (**estimate**). That is far beyond what a phone
  should download, parse and hold.
- Vector tiles send only the area and detail in view.

## Data rules (unchanged from the approved safety rules)

- **Shown:** only values mapped as `<n> mph` on roads for motor vehicles. Bare numbers (km/h by OSM's rules, often mistakes in
  England), `none`, `national` and railway `maxspeed` (60,079 England ways carry both `railway` and `maxspeed`; **verified**) are
  left out.
- **Labelled:** "speed limit as mapped". These are **car** limits. **Lorry limits are never inferred.**
  - England has only 2 `maxspeed:hgv` ways (**verified**).
  - gov.uk sets lower national limits for goods vehicles by weight (**verified**, gov.uk/speed-limits).
  - The layer must say lower limits apply to lorries.
- **Directional values** (`maxspeed:forward` / `:backward`, 609 / 638 England ways) are drawn on the side they apply to, or left out.
- **Not evaluated:**
  - `maxspeed:conditional` (135 ways) is shown verbatim in details and never applied.
  - `maxspeed:variable` is flagged "variable limit; the mapped value is the maximum".
- **No data is not proof:** a road with no tag is "not mapped", never a limit. Completeness is unknown. The only figures are from
  2015 (motorway 96.6%, primary 59.8%, residential 16.1%; **verified**, community forum).

## Options

| | A. PMTiles archive (one file, read by range requests) | B. Pre-cut static tiles (`/tiles/z/x/y.pbf`) | C. Main roads only, as a stage 1 style file |
|---|---|---|---|
| Build | Planetiler (Java 21 is installed; Apache 2.0) with a small custom profile, reading the same Geofabrik extract | Planetiler to MBTiles, then unpacked to files | The existing builder, filtered to motorway, trunk, primary and secondary, simplified |
| App | MapLibre with the `pmtiles` protocol: **a new npm dependency, needs approval** (BSD-3, small; **unverified** size) | MapLibre as now, no new dependency | As now |
| Hosting | Workers Static Assets' per-file limit is 25 MiB (**verified** 2026-10-12), below an all-roads England archive (about 90 MB, **estimate**, see Measurement). Otherwise R2 behind a Worker route (Worker requests and CPU per tile; new infrastructure) | Static assets: 20,000 files per version on Free, 100,000 on Paid (**verified**); all roads z8–z14 is about 60,000 files (**estimate**), main roads z8–z12 about 5,000 | Static asset, same as stage 1 |
| Freshness | One file per build | One set per build | One file per build |
| Fit | Best rendering; needs a hosting decision | No dependency; heavy deploys | Smallest step, but no minor roads |

## Measurement (2026-10-12, local, no new dependency, no app change)

Method:
- I read the same Geofabrik England extract (OSM data to 2026-10-11) with the repo's PBF reader, using a throwaway script outside
  the repo (409 s).
- I kept the roads a speed-limit layer would draw: `highway=*` roads for motor vehicles with `maxspeed` (or a directional form).

**Measured:**
- 1,042,533 road ways carry a speed limit; **1,040,554 (99.8%) are readable `<n> mph`**; 1,979 are not; 38 use directional forms.
- By road class:

  | Class | Ways |
  |---|---|
  | residential | 399,400 |
  | tertiary | 133,215 |
  | primary | 116,876 |
  | unclassified | 100,756 |
  | trunk | 96,563 |
  | service | 87,654 |
  | secondary | 71,350 |
  | motorway | 9,396 |

- 176,887 km of road and 8,132,315 vertices.

**Estimated:**
- GeoJSON of all of it: about **258 MB**. Not practical in a browser.
- Vector tile sizes per zoom:
  - Vertices closer than half a pixel at each zoom are dropped, then about 2.5 bytes per vertex and 10 per feature, gzipped at
    about 60%.
  - These are rough model figures, not a tiler's real output. A real build would differ, probably smaller.
  - "Main" means motorway, trunk, primary and secondary, with their links.

| Zoom | All roads: tiles, total, p95 / max tile | Main roads only: tiles, total, p95 / max tile |
|---|---|---|
| 8 | 32 tiles, 10.0 MB, 1.5 MB / 1.9 MB | 32, 3.1 MB, 390 KB / 571 KB |
| 10 | 295, 12.2 MB, 150 KB / 849 KB | 290, 3.8 MB, 44 KB / 252 KB |
| 12 | 3,866, 15.9 MB, 17 KB / 130 KB | 3,596, 4.9 MB, 5 KB / 44 KB |
| 14 | 43,002, 18.9 MB, 2 KB / 16 KB | 29,034, 5.7 MB, 0.7 KB / 6 KB |

**What the numbers mean against the verified hosting limits:**
- The limits: Workers Static Assets allow 25 MiB per file, and 20,000 files per version on Free (100,000 on Paid), per
  developers.cloudflare.com/workers/platform/limits, checked 2026-10-12.
- **All roads, z8–z14:** about 90 MB as one PMTiles archive (interpolating z9, z11 and z13), so too big for one static asset. As
  separate tiles it is about 60,000 files, over the Free limit. Not practical without R2 or the Paid plan.
- **All roads at low zoom:** z8 tiles of 1–2 MB are too heavy for a phone. Minor roads must start at z12 or later.
- **Main roads only, z8–z12, overzoomed beyond:**
  - About 20 MB as one archive, under 25 MiB with little headroom.
  - About 5,000 separate tiles, well under 20,000.
  - Per-tile p95 of 5–44 KB at z10–z12.
  - **This is the practical first option.**
  - Caveat: z12 geometry kept to about 20 m, so at z15–16 the lines may sit visibly off the road.
- **Main roads to z13, minor roads at z13–z14 only:** probably around 40–50 MB (**estimate**). Needs R2 or Paid.

**Performance:** at z12 and above, tiles are small (all roads: p95 17 KB at z12, 2 KB at z14). The cost is in the low zooms, so
the layer should start at z10 for main roads and z13 for the rest, and not draw England-wide at all.

## Recommendation

Updated after the measurement above:
1. **First release: main roads only (motorway, trunk, primary, secondary and links), z10–z12, overzoomed beyond, as pre-cut static
   tiles** (option B with C's scope).
   - About 5,000 files, about 20 MB in total.
   - The app needs **no new dependency**: a MapLibre vector source with a `tiles` URL.
   - Served as Workers Static Assets, so no Worker code or CPU.
   - Built in the same separate release job as the other Routes layers (ROUTES-MAP.md, "Generated data").
   - The build needs a tile encoder:
     - either a build-time-only tool (Planetiler with Java, or an npm MVT encoder), each **a dependency needing approval**;
     - or a small encoder of our own, tested like the PBF reader.
2. **Minor roads later, only with a hosting decision.** All roads to z14 is about 90 MB, or about 60,000 files. It needs R2 (with
   a Worker route or a public bucket) or the Paid plan's file limit. Each is a separate approval.
3. **Before building:** one real tiler run on the extract to replace these estimates with measured sizes, and a check of z12
   geometry at z15–16 against the base map.

## Acceptance gates

- Sizes measured and within an agreed budget.
- Tiles open in MapLibre in both themes.
- Speed limits are drawn under the junction labels, as a switch of their own in the Layers panel, off by default.
- Tests prove:
  - only `<n> mph` values are drawn;
  - railway `maxspeed` is excluded;
  - no lorry limit is derived;
  - directional values are on the right side or left out;
  - conditional values are never applied;
  - the wording says lorries have lower limits;
  - "not mapped" never reads as "no limit".
- A per-layer caveat, OSM attribution and the data date are shown, as for the stage 1 layers.

## Decisions needed

- Approve the measurement step: local only, no new dependency until step 2.
- Add `pmtiles`? Use R2 or a new route for tiles? Each is a separate approval.
- The wording for the layer's lorry-limit note.
