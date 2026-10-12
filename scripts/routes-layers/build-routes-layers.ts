/**
 * Builds the Routes map's layer files (web/src/routemap/data/*.json) from a reviewed OpenStreetMap extract:
 *
 *   node scripts/routes-layers/build-routes-layers.ts --osm <routes-layers download folder> --boundary <restrictions download folder>
 *        [--out <dir>] [--generated-at <ISO>]
 *
 * --osm is a folder written by fetch-osm.ts and extract-osm.ts (manifest.json, routes-extract.json); --boundary is a folder holding
 * the ONS England boundary (ons-england-bfe.json, from scripts/restrictions/fetch-sources.ts --only osm). Every file is validated
 * against shared/api/routes-layers.ts before it is written; everything left out is counted by reason in the build report (printed,
 * and saved beside the extract as build-report.json). Output is deterministic for the same inputs and --generated-at. Nothing is
 * uploaded, published or deployed. The Closures view's restriction files (web/src/restrictions/data) are never read or written.
 * See docs/ROUTES-MAP.md for the sources, licence and update procedure.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROUTES_LAYERS_SCHEMA_VERSION,
  routesManifestSchema,
  routesPointsFileSchema,
  routesSectionsFileSchema,
  type RoutesDataLayer,
  type RoutesManifest,
  type RoutesPointsFile,
  type RoutesSectionsFile,
  type RoutesSource,
} from "../../shared/api/routes-layers.ts";
import { inEngland, readEnglandBoundary } from "../../shared/sources/ons/england.ts";
import { readRoutesLayers, type RoutesInput, type Skip } from "../../shared/sources/osm/routes-layers.ts";

const COMMON_NOTES = [
  "Community-mapped OpenStreetMap data: unverified, and coverage varies from place to place.",
  "Only records in England are kept, using the ONS England boundary (Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2023).",
];

/** Each layer's known limitations, shown with its source. */
export const LAYER_NOTES: Record<RoutesDataLayer, string[]> = {
  "speed-cameras": [
    "Fixed cameras as mapped (highway=speed_camera, and the devices of speed enforcement relations). Mobile and temporary cameras are not mapped.",
    "A speed limit is shown only when mapped in mph and every mapped value for the camera agrees. It is the road's mapped limit, not a lorry limit: lower limits apply to many lorries.",
    "Direction is shown only as mapped: from the enforcement relation's start and end points, or the camera's own direction tag, whose meaning varies between mappers.",
  ],
  "average-speed": [
    "Only average speed checks whose mapped section joins into one unbroken stretch of road between its mapped start and end points. Other mapped checks are left out.",
    "A speed limit is shown only when mapped in mph. It is the road's mapped limit, not a lorry limit.",
  ],
  "red-light-cameras": ["Only red-light cameras mapped with an enforcement relation (enforcement=traffic_signals). Very few are mapped in England."],
  height: [
    "Signed height limits (maxheight) and measured clearances (maxheight:physical). Where both are mapped, the lower is shown. Values that can't be read, and 'default' or 'none', are left out: they never mean a road is clear.",
  ],
  weight: [
    "Lorry (goods vehicle) weight limits (maxweightrating:hgv, maxweight:hgv) and limits for all vehicles (maxweight, maxweightrating) are kept apart, as mapped. Some may be mapped as the wrong kind.",
    "Exemptions such as 'except for access' or 'except for loading' are mapped as conditions and shown with each limit. Most lorry weight limits in England have one.",
  ],
  "width-length": ["Signed width limits (maxwidth), measured widths on roads (maxwidth:physical) and length limits (maxlength). Physical widths mapped only on a lone point, usually a barrier on a path, are left out."],
  access: [
    "Lorry access as mapped (hgv=no, destination, delivery, discouraged), with any time or vehicle conditions shown as mapped and never evaluated.",
    "'Discouraged' is advisory (for example 'Unsuitable for HGVs' signs), not a prohibition.",
  ],
};

const FILES: Record<RoutesDataLayer, string> = {
  "speed-cameras": "speed-cameras.json",
  "average-speed": "average-speed.json",
  "red-light-cameras": "red-light-cameras.json",
  height: "height.json",
  weight: "weight.json",
  "width-length": "width-length.json",
  access: "access.json",
};

interface ExtractFile extends RoutesInput {
  source: { file: string; sha256: string; url: string; fetchedAt: string; replicationTimestamp: string | null };
}

const tally = (skipped: Skip[]) => {
  const out: Record<string, Record<string, number>> = {};
  for (const s of skipped) {
    const reason = s.reason.replace(/ \(.*\)$/, "");
    const layer = (out[s.layer] ??= {});
    layer[reason] = (layer[reason] ?? 0) + 1;
  }
  return out;
};

export function buildRoutesLayers({ extract, boundary, generatedAt }: { extract: ExtractFile; boundary: unknown; generatedAt: string }) {
  if (!extract.source.replicationTimestamp) throw new Error("The extract has no replication timestamp, so its data date is unknown");
  const england = readEnglandBoundary(boundary);
  const result = readRoutesLayers(extract, (p) => inEngland(p, england));
  const source = (layer: RoutesDataLayer): RoutesSource => ({
    name: "OpenStreetMap",
    attribution: "© OpenStreetMap contributors",
    copyrightUrl: "https://www.openstreetmap.org/copyright",
    licence: { name: "Open Database License (ODbL) 1.0", url: "https://opendatacommons.org/licenses/odbl/1-0/" },
    extract: { url: extract.source.url, file: extract.source.file, sha256: extract.source.sha256, fetchedAt: new Date(extract.source.fetchedAt).toISOString() },
    dataAsOf: new Date(extract.source.replicationTimestamp!).toISOString(),
    notes: [...LAYER_NOTES[layer], ...COMMON_NOTES],
  });
  const files: Record<string, RoutesPointsFile | RoutesSectionsFile | RoutesManifest> = {};
  const layers: RoutesManifest["layers"] = {};
  for (const layer of Object.keys(result.points) as (keyof typeof result.points)[]) {
    const file = routesPointsFileSchema.parse({ schemaVersion: ROUTES_LAYERS_SCHEMA_VERSION, layer, generatedAt, source: source(layer), features: result.points[layer] });
    files[FILES[layer]] = file;
    layers[layer] = { file: FILES[layer], records: file.features.length, notes: file.source.notes };
  }
  const sections = routesSectionsFileSchema.parse({ schemaVersion: ROUTES_LAYERS_SCHEMA_VERSION, layer: "average-speed", generatedAt, source: source("average-speed"), sections: result.sections });
  files[FILES["average-speed"]] = sections;
  layers["average-speed"] = { file: FILES["average-speed"], records: sections.sections.length, notes: sections.source.notes };
  files["manifest.json"] = routesManifestSchema.parse({ schemaVersion: ROUTES_LAYERS_SCHEMA_VERSION, generatedAt, dataAsOf: new Date(extract.source.replicationTimestamp).toISOString(), layers });
  const counts = Object.fromEntries(Object.entries(layers).map(([l, e]) => [l, e.records]));
  return { files, report: { kept: counts, skipped: tally(result.skipped) } };
}

const stableJson = (value: unknown) => `${JSON.stringify(value)}\n`;
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/routes-layers/build-routes-layers.ts")) {
  const osmDir = arg("--osm");
  const boundaryDir = arg("--boundary");
  if (!osmDir || !boundaryDir) throw new Error("Usage: build-routes-layers.ts --osm <dir> --boundary <dir> [--out <dir>] [--generated-at <ISO>]");
  const out = arg("--out") ?? "web/src/routemap/data";
  const generatedAt = new Date(arg("--generated-at") ?? Date.now()).toISOString();
  const extract = JSON.parse(readFileSync(join(osmDir, "routes-extract.json"), "utf8")) as ExtractFile;
  const boundary = JSON.parse(readFileSync(join(boundaryDir, "ons-england-bfe.json"), "utf8")) as unknown;
  const { files, report } = buildRoutesLayers({ extract, boundary, generatedAt });
  mkdirSync(out, { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    writeFileSync(join(out, name), stableJson(data));
    console.log(`${name}: ${Buffer.byteLength(stableJson(data))} bytes`);
  }
  writeFileSync(join(osmDir, "build-report.json"), `${JSON.stringify({ generatedAt, inputs: { osmDir, boundaryDir }, report }, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`Files in ${out}: ${readdirSync(out).join(", ")}`);
}
