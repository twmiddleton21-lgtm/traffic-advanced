/**
 * Builds the road highlighting files for the Routes map's restriction layers, AFTER build-routes-layers.ts and from its output:
 *
 *   node scripts/routes-layers/build-highlights.ts --osm <routes-layers download folder> [--layers <dir>] [--generated-at <ISO>]
 *
 * For each restriction layer (height, weight, width-length, access) it reads the layer's marker file (web/src/routemap/data by
 * default) and the routes-extract.json it was built from, and writes "<layer>-roads.json" beside the marker file: one line per
 * record that was read from a road. It reads no tags and changes no record (shared/sources/osm/routes-highlights.ts). It refuses to
 * run if the marker files and the extract don't come from the same extract (SHA-256). Nothing is uploaded, published or deployed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { highlightFileName, ROUTES_HIGHLIGHT_LAYERS, ROUTES_HIGHLIGHTS_SCHEMA_VERSION, routesHighlightsFileSchema, type RoutesHighlightsFile } from "../../shared/api/routes-highlights.ts";
import { routesPointsFileSchema, type RoutesPointsFile } from "../../shared/api/routes-layers.ts";
import { readHighlights, type WayGeometry } from "../../shared/sources/osm/routes-highlights.ts";

export function buildHighlights({ layerFiles, ways, extractSha256, generatedAt }: { layerFiles: RoutesPointsFile[]; ways: WayGeometry[]; extractSha256: string; generatedAt: string }) {
  const byId = new Map(ways.map((w) => [w.id, w]));
  const files: Record<string, RoutesHighlightsFile> = {};
  const report: Record<string, { roads: number; pointRecords: number; skipped: Record<string, number> }> = {};
  for (const file of layerFiles) {
    const layer = file.layer;
    if (!(ROUTES_HIGHLIGHT_LAYERS as readonly string[]).includes(layer)) continue;
    if (file.source.extract.sha256 !== extractSha256) throw new Error(`${layer}: marker file is from extract ${file.source.extract.sha256.slice(0, 12)}, not ${extractSha256.slice(0, 12)}`);
    const { roads, skipped } = readHighlights(layer as (typeof ROUTES_HIGHLIGHT_LAYERS)[number], file.features, byId);
    const out = routesHighlightsFileSchema.parse({ schemaVersion: ROUTES_HIGHLIGHTS_SCHEMA_VERSION, layer, generatedAt, source: file.source, roads });
    files[highlightFileName(out.layer)] = out;
    const tally: Record<string, number> = {};
    for (const s of skipped) tally[s.reason] = (tally[s.reason] ?? 0) + 1;
    report[layer] = { roads: roads.length, pointRecords: file.features.filter((f) => f.osm[0]!.type !== "way").length, skipped: tally };
  }
  return { files, report };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/routes-layers/build-highlights.ts")) {
  const osmDir = arg("--osm");
  if (!osmDir) throw new Error("Usage: build-highlights.ts --osm <dir> [--layers <dir>] [--generated-at <ISO>]");
  const layersDir = arg("--layers") ?? "web/src/routemap/data";
  const generatedAt = new Date(arg("--generated-at") ?? Date.now()).toISOString();
  const extract = JSON.parse(readFileSync(join(osmDir, "routes-extract.json"), "utf8")) as { source: { sha256: string }; ways: WayGeometry[] };
  const layerFiles = ROUTES_HIGHLIGHT_LAYERS.map((l) => routesPointsFileSchema.parse(JSON.parse(readFileSync(join(layersDir, `${l}.json`), "utf8"))));
  const { files, report } = buildHighlights({ layerFiles, ways: extract.ways, extractSha256: extract.source.sha256, generatedAt });
  for (const [name, data] of Object.entries(files)) {
    const text = `${JSON.stringify(data)}\n`;
    writeFileSync(join(layersDir, name), text);
    console.log(`${name}: ${Buffer.byteLength(text)} bytes`);
  }
  console.log(JSON.stringify(report, null, 2));
}
