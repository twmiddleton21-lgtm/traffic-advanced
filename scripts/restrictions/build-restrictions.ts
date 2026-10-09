/**
 * Builds the app's restriction data files (web/src/restrictions/data/*.json) from reviewed downloads:
 *
 *   node scripts/restrictions/build-restrictions.ts --tfl <dir> --nh <open capture dir> [--osm <dir>] [--out <dir>] [--generated-at <ISO>]
 *
 * --tfl and --osm are folders written by fetch-sources.ts; --nh is an existing NH open-data capture (scripts/capture/capture-open.ts).
 * Every input is validated; unreadable records are skipped and counted by reason in the build report (printed, and saved beside the
 * TfL download as build-report.json). Output is deterministic for the same inputs and --generated-at. Nothing is uploaded or deployed.
 * See docs/RESTRICTIONS.md for the sources, licences and the update procedure.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  restrictionPointsFileSchema,
  restrictionsManifestSchema,
  RESTRICTIONS_SCHEMA_VERSION,
  zonesFileSchema,
  type RestrictionPoint,
  type RestrictionPointsFile,
  type RestrictionsManifest,
  type RestrictionSource,
  type ZonesFile,
} from "../../shared/api/restrictions.ts";
import { distanceToPolylines } from "../../shared/geo/distance.ts";
import { pointInMultiPolygon } from "../../shared/geo/polygons.ts";
import { readDiversionPoints, readVehicleRestrictions } from "../../shared/sources/nh-arcgis/restrictions.ts";
import { inEngland, readEnglandBoundary } from "../../shared/sources/ons/england.ts";
import { readOverpass } from "../../shared/sources/osm/restrictions.ts";
import { readGlaBoundary, readTflBoundary, readTflHeights } from "../../shared/sources/tfl/restrictions.ts";
import { readFirstSheet } from "../lib/xlsx.ts";

// Both NH items (Diversion Routes Public View and Network Model) give OGL v3.0 in their ArcGIS licence field, checked 2026-10-09. The
// Diversion Routes field reads "The data is published under an Open Government Licence", linked to this v3 URL.
const OGL3 = { name: "Open Government Licence v3.0", url: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" };
const TFL_LICENCE = { name: "TfL Transport Data Service licence (based on OGL v2.0)", url: "https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service" };
const TFL_ATTRIBUTION = "Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016. Geomni UK Map data © and database rights [2019].";
const ODBL = { name: "Open Database License (ODbL) 1.0", url: "https://opendatacommons.org/licenses/odbl/1-0/" };

/** TfL's own wording about who each zone applies to and when (tfl.gov.uk, checked 2026-10-09). Prices are left out: they change. */
const LEZ_RULES = [
  "The Low Emission Zone (LEZ) operates to encourage the most polluting heavy diesel vehicles driving in London to become cleaner. The LEZ covers most of Greater London and is in operation 24 hours a day, every day of the year.",
  "The LEZ is separate from the Ultra Low Emission Zone (ULEZ) which operates in the same zone 24 hours a day, every day of the year except Christmas Day.",
];
const ULEZ_RULES = [
  "To help clear London's air, the Ultra Low Emission Zone (ULEZ) operates 24 hours a day, 7 days a week, every day of the year, except Christmas Day (25 December). The zone operates across all London boroughs, and does not include the M25.",
  "This applies to cars, motorcycles, vans and specialist vehicles (up to and including 3.5 tonnes) and minibuses (up to and including 5 tonnes).",
  "Lorries, vans or specialist heavy vehicles (all over 3.5 tonnes) and buses, minibuses and coaches (all over 5 tonnes) do not need to pay the ULEZ charge. They will need to pay the LEZ charge if they do not meet the Low Emission Zone (LEZ) emissions standard.",
];

/**
 * The TfL and GLA copies of the boundary must agree this closely. TfL's file is rounded to about 1 m and slightly simplified, so
 * nearly every vertex is within about 11 m; a wrong file or coordinate system would be kilometres out. When checked (2026-10-09,
 * build report boundaryCheck), 99% of GLA vertices were within 10.6 m of TfL's line and all within 41.7 m, and one short stretch of
 * TfL's line by the M25 near Heathrow was up to 110.7 m from the GLA's.
 */
const BOUNDARY_P99_LIMIT_METRES = 40;
const BOUNDARY_MAX_LIMIT_METRES = 150;

interface ManifestEntry {
  id?: string;
  file: string;
  url: string;
  fetchedAt: string;
  lastModified?: string | null;
  sourceLastEditDate?: string | null;
}
const manifest = (dir: string): ManifestEntry[] => (JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { entries: ManifestEntry[] }).entries;
const entry = (dir: string, pred: (e: ManifestEntry) => boolean): ManifestEntry => {
  const e = manifest(dir).find(pred);
  if (!e) throw new Error(`No matching file in ${dir}/manifest.json`);
  return e;
};
const json = (dir: string, file: string): unknown => JSON.parse(readFileSync(join(dir, file), "utf8"));
const iso = (s: string | null | undefined) => (s ? new Date(s).toISOString() : null);

type Report = Record<string, { kept: number; skipped: Record<string, number> }>;
const tally = (skipped: { reason: string }[]) => {
  const out: Record<string, number> = {};
  for (const s of skipped) {
    const reason = s.reason.replace(/ \(.*\)$/, "").replace(/"[^"]*"/g, "…");
    out[reason] = (out[reason] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
};

export interface BuildInputs {
  tflDir: string;
  /** Optional: without it, the files are built from official sources only (and the report says OSM was left out). */
  osmDir: string | null;
  nhDir: string;
  generatedAt: string;
}

export function buildRestrictions({ tflDir, osmDir, nhDir, generatedAt }: BuildInputs): { files: Record<string, RestrictionPointsFile | ZonesFile | RestrictionsManifest>; report: { sources: Report; boundaryCheck: object } } {
  const report: Report = {};

  // National Highways (existing open-data capture).
  const s4 = entry(nhDir, (e) => e.file === "s4/diversion-points.json");
  const s5 = entry(nhDir, (e) => e.file === "s5/vehicle-restrictions.json");
  const s4Read = readDiversionPoints((json(nhDir, s4.file) as { features: unknown[] }).features);
  const s5Read = readVehicleRestrictions((json(nhDir, s5.file) as { features: unknown[] }).features);
  report["nh-s4-diversion-points"] = { kept: s4Read.points.length, skipped: tally(s4Read.skipped) };
  report["nh-s5-vehicle-restrictions"] = { kept: s5Read.points.length, skipped: tally(s5Read.skipped) };

  // TfL heights.
  const tflHeight = entry(tflDir, (e) => e.id === "tfl-height-restrictions");
  const tflRead = readTflHeights(readFirstSheet(readFileSync(join(tflDir, tflHeight.file))));
  report["tfl-height-restrictions"] = { kept: tflRead.points.length, skipped: tally(tflRead.skipped) };

  // OpenStreetMap, every tile.
  const osmEntries = osmDir ? manifest(osmDir).filter((e) => e.id?.startsWith("osm-tile")) : [];
  if (osmDir && osmEntries.length === 0) throw new Error(`No OSM tiles in ${osmDir}`);
  const osmAll = osmDir ? readOverpass(osmEntries.map((e) => json(osmDir, e.file))) : { points: [], skipped: [], dataAsOf: "" };
  // Tiles reach into Wales, Scotland, the Isle of Man and France: keep only records in England (ONS boundary).
  const england = osmDir ? readEnglandBoundary(json(osmDir, entry(osmDir, (e) => e.id === "ons-england-boundary").file)) : null;
  const osmRead = {
    ...osmAll,
    points: osmAll.points.filter((p) => england !== null && inEngland(p.position, england)),
    skipped: [...osmAll.skipped, ...osmAll.points.filter((p) => england !== null && !inEngland(p.position, england)).map((p) => ({ element: p.id, key: "-", reason: "outside England" }))],
  };
  report["osm"] = osmDir ? { kept: osmRead.points.length, skipped: tally(osmRead.skipped) } : { kept: 0, skipped: { "left out: no OSM download given": 1 } };
  const osmFetchedAt = osmEntries.map((e) => e.fetchedAt).sort().at(-1) ?? null;

  const nhS4Notes = {
    height: [
      "Only restrictions National Highways records along its emergency diversion routes.",
      "One restriction can appear once for each diversion route that passes it.",
      "Heights recorded in decimal feet are left out, because their meaning is ambiguous.",
    ],
    weight: [
      "Only weight values National Highways records along its emergency diversion routes. Weight limits elsewhere are not shown.",
      "National Highways records only the value. It doesn't record whether it is a structural limit or a lorry (goods vehicle) limit, which vehicles it applies to, where it starts and ends, or any exemptions.",
      "One place can appear once for each diversion route that passes it.",
    ],
  };
  const nhS4Source = (layer: "height" | "weight", records: number): RestrictionSource => ({
    id: "nh-s4-diversion-points",
    name: "Diversion Routes Public View: diversion points",
    authority: "National Highways",
    kind: "official",
    licence: OGL3,
    attribution:
      "Data derived from Ordnance Survey Highway Network, Subject to Crown copyright and database rights 2024. Ordnance Survey Licence: AC0000827444. The data is published under an Open Government Licence.",
    url: "https://www.arcgis.com/home/item.html?id=dcf7f6b642924f00a5410acbbb56b15b",
    datasetDate: iso(s4.sourceLastEditDate),
    fetchedAt: iso(s4.fetchedAt)!,
    records,
    notes: nhS4Notes[layer],
  });
  const nhS5Source: RestrictionSource = {
    id: "nh-s5-vehicle-restrictions",
    name: "Network Model (Public): vehicle restrictions",
    authority: "National Highways",
    kind: "official",
    licence: OGL3,
    attribution: "Contains public sector information licensed under the Open Government Licence v3.0.",
    url: "https://www.arcgis.com/home/item.html?id=4b64217e40dc48ebb38315a9a95c96e5",
    datasetDate: iso(s5.sourceLastEditDate),
    fetchedAt: iso(s5.fetchedAt)!,
    records: s5Read.points.length,
    notes: ["Only height restrictions on National Highways' own network (motorways and major A roads), a small number of records."],
  };
  const tflHeightSource: RestrictionSource = {
    id: "tfl-height-restrictions",
    name: "Bridges, tunnels, road barriers: height restrictions",
    authority: "Transport for London",
    kind: "official",
    licence: TFL_LICENCE,
    attribution: TFL_ATTRIBUTION,
    url: "https://data.london.gov.uk/dataset/bridges-tunnels-road-barriers-height-restrictions-epowr/",
    datasetDate: iso(tflHeight.lastModified),
    fetchedAt: iso(tflHeight.fetchedAt)!,
    records: tflRead.points.length,
    notes: [
      "Low bridges, tunnels and road barriers within Greater London and the M25 only.",
      "TfL records heights in bands (for example, between 3.6 and 4.0 m), not exact clearances. Check the signed height on the structure.",
      "TfL last updated this dataset in October 2019, so it may be out of date.",
    ],
  };
  const osmSource = (records: number): RestrictionSource => ({
    id: "osm",
    name: "OpenStreetMap",
    authority: "OpenStreetMap contributors",
    kind: "community",
    licence: ODBL,
    attribution: "© OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
    datasetDate: iso(osmRead.dataAsOf),
    fetchedAt: iso(osmFetchedAt)!,
    records,
    notes: [
      "Community-sourced and unverified. Coverage varies from place to place and is not complete.",
      "Records come from map tags (maxheight, maxheight:physical, maxweight, maxweightrating, maxweightrating:hgv, maxweight:hgv and their conditional forms). Values that can't be read reliably are left out.",
      "A restriction mapped along a stretch of road is shown at the middle of that stretch.",
      "Records show the tags as mapped: some lorry (goods vehicle) limits may be mapped as limits for all vehicles, and the reverse.",
      "Only records in England are kept, using the ONS England boundary (Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2023).",
    ],
  });

  const heights = [...s4Read.points.filter((p) => p.kind === "height"), ...s5Read.points, ...tflRead.points, ...osmRead.points.filter((p) => p.kind === "height")];
  const weights = [...s4Read.points.filter((p) => p.kind !== "height"), ...osmRead.points.filter((p) => p.kind !== "height")];
  const count = (list: RestrictionPoint[], id: RestrictionSource["id"]) => list.filter((p) => p.source === id).length;
  const sortById = (list: RestrictionPoint[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const height = restrictionPointsFileSchema.parse({
    schemaVersion: RESTRICTIONS_SCHEMA_VERSION,
    layer: "height",
    generatedAt,
    sources: [nhS4Source("height", count(heights, "nh-s4-diversion-points")), nhS5Source, tflHeightSource, ...(osmDir ? [osmSource(count(heights, "osm"))] : [])],
    features: sortById(heights),
  });
  const weight = restrictionPointsFileSchema.parse({
    schemaVersion: RESTRICTIONS_SCHEMA_VERSION,
    layer: "weight",
    generatedAt,
    sources: [nhS4Source("weight", count(weights, "nh-s4-diversion-points")), ...(osmDir ? [osmSource(count(weights, "osm"))] : [])],
    features: sortById(weights),
  });

  // London zones: TfL's own boundary files, checked against the GLA's independent copy of the 2023 boundary.
  const lezEntry = entry(tflDir, (e) => e.id === "tfl-lez-boundary");
  const ulezEntry = entry(tflDir, (e) => e.id === "tfl-ulez-boundary");
  const glaEntry = entry(tflDir, (e) => e.id === "gla-ulez-2023");
  const lez = readTflBoundary(json(tflDir, lezEntry.file));
  const ulez = readTflBoundary(json(tflDir, ulezEntry.file));
  const gla = readGlaBoundary(json(tflDir, glaEntry.file));
  const boundaryCheck = checkBoundary(ulez, gla);
  if (boundaryCheck.glaToTfl.p99GapMetres > BOUNDARY_P99_LIMIT_METRES || boundaryCheck.glaToTfl.maxGapMetres > BOUNDARY_MAX_LIMIT_METRES) {
    throw new Error(`TfL ULEZ boundary differs from the GLA copy: ${JSON.stringify(boundaryCheck)}`);
  }
  const sameAsLez = JSON.stringify(lez) === JSON.stringify(ulez);

  const zoneSource = (id: "tfl-lez" | "tfl-ulez", e: ManifestEntry, name: string, notes: string[]): RestrictionSource => ({
    id,
    name,
    authority: "Transport for London",
    kind: "official",
    licence: TFL_LICENCE,
    attribution: TFL_ATTRIBUTION,
    url: e.url,
    datasetDate: iso(e.lastModified),
    fetchedAt: iso(e.fetchedAt)!,
    records: 1,
    notes,
  });
  const lezFile = zonesFileSchema.parse({
    schemaVersion: RESTRICTIONS_SCHEMA_VERSION,
    generatedAt,
    sources: [zoneSource("tfl-lez", lezEntry, "Low Emission Zone (LEZ) boundary", ["The boundary only: whether a vehicle must pay depends on its emissions standard. Check your vehicle with TfL."])],
    zones: [{ id: "lez", name: "London Low Emission Zone (LEZ)", source: "tfl-lez", geometry: lez, rules: LEZ_RULES, rulesUrl: "https://tfl.gov.uk/modes/driving/low-emission-zone" }],
  });
  const ulezFile = zonesFileSchema.parse({
    schemaVersion: RESTRICTIONS_SCHEMA_VERSION,
    generatedAt,
    sources: [
      zoneSource("tfl-ulez", ulezEntry, "Ultra Low Emission Zone (ULEZ) boundary, London-wide from 29 August 2023", [
        "The boundary only: whether a vehicle must pay depends on its type and emissions standard. Check your vehicle with TfL.",
        ...(sameAsLez ? ["TfL publishes the same boundary for the ULEZ and the LEZ: since August 2023 they cover the same area, with different rules."] : []),
        `Checked against the Greater London Authority's copy of the 2023 ULEZ boundary (Open Government Licence v2.0): 99% of its points are within ${Math.ceil(boundaryCheck.glaToTfl.p99GapMetres)} m of TfL's boundary. The two copies differ by up to about ${Math.ceil(Math.max(boundaryCheck.glaToTfl.maxGapMetres, boundaryCheck.tflToGla.maxGapMetres))} m in places. Near the boundary, follow the zone signs.`,
      ]),
    ],
    zones: [{ id: "ulez", name: "London Ultra Low Emission Zone (ULEZ)", source: "tfl-ulez", geometry: ulez, rules: ULEZ_RULES, rulesUrl: "https://tfl.gov.uk/modes/driving/ultra-low-emission-zone" }],
  });

  const catalogue = restrictionsManifestSchema.parse({
    schemaVersion: RESTRICTIONS_SCHEMA_VERSION,
    generatedAt,
    layers: {
      height: { file: "height.json", records: height.features.length, sources: height.sources },
      weight: { file: "weight.json", records: weight.features.length, sources: weight.sources },
      lez: { file: "lez.json", records: 1, sources: lezFile.sources },
      ulez: { file: "ulez.json", records: 1, sources: ulezFile.sources },
    },
  });
  return { files: { "height.json": height, "weight.json": weight, "lez.json": lezFile, "ulez.json": ulezFile, "manifest.json": catalogue }, report: { sources: report, boundaryCheck: { ...boundaryCheck, sameAsLez } } };
}

/**
 * How closely the two copies agree: every GLA vertex's distance to TfL's boundary line (enforced: it works on any part of the GLA
 * copy), and every TfL vertex's distance to the GLA line plus an inside/outside comparison on a fixed grid (reported, meaningful
 * when the whole GLA copy is given).
 */
function checkBoundary(tfl: ReturnType<typeof readTflBoundary>, gla: ReturnType<typeof readGlaBoundary>) {
  const round = (n: number) => Math.round(n * 10) / 10;
  const stats = (from: readonly (readonly [number, number])[], to: (readonly (readonly [number, number])[])[]) => {
    const gaps = from.map((p) => ({ gap: distanceToPolylines(p, to), at: p })).sort((a, b) => a.gap - b.gap);
    const worst = gaps.at(-1)!;
    return { vertices: gaps.length, medianGapMetres: round(gaps[gaps.length >> 1]!.gap), p99GapMetres: round(gaps[Math.floor(gaps.length * 0.99)]!.gap), maxGapMetres: round(worst.gap), maxGapAt: worst.at };
  };
  let disagreements = 0;
  let samples = 0;
  for (let lon = -0.55; lon <= 0.35; lon += 0.01) {
    for (let lat = 51.25; lat <= 51.72; lat += 0.01) {
      samples++;
      if (pointInMultiPolygon([lon, lat], tfl) !== pointInMultiPolygon([lon, lat], gla)) disagreements++;
    }
  }
  return { glaToTfl: stats(gla.flat(2), tfl.flat()), tflToGla: stats(tfl.flat(2), gla.flat()), gridSamples: samples, gridDisagreements: disagreements };
}

const stableJson = (value: unknown) => `${JSON.stringify(value)}\n`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/restrictions/build-restrictions.ts")) {
  const tflDir = arg("--tfl");
  const osmDir = arg("--osm");
  const nhDir = arg("--nh");
  if (!tflDir || !nhDir) throw new Error("Usage: build-restrictions.ts --tfl <dir> --nh <open capture> [--osm <dir>] [--out <dir>] [--generated-at <ISO>]");
  const out = arg("--out") ?? "web/src/restrictions/data";
  const generatedAt = new Date(arg("--generated-at") ?? Date.now()).toISOString();
  const { files, report } = buildRestrictions({ tflDir, osmDir: osmDir ?? null, nhDir, generatedAt });
  mkdirSync(out, { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    writeFileSync(join(out, name), stableJson(data));
    console.log(`${name}: ${Buffer.byteLength(stableJson(data))} bytes`);
  }
  writeFileSync(join(tflDir, "build-report.json"), `${JSON.stringify({ generatedAt, inputs: { tflDir, osmDir, nhDir }, report }, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`Existing files in ${out}: ${readdirSync(out).join(", ")}`);
}
