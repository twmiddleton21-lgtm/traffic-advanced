/**
 * Trims a real Routes extract (extract-osm.ts) to the elements the tests use, with every node and way their relations name:
 *
 *   node scripts/routes-layers/capture-fixtures.ts <download folder>
 *
 * Writes fixtures/routes-layers/osm-elements.json. The elements are chosen to cover each rule in shared/sources/osm/routes-layers.ts
 * with real mapping, including near-misses that must be left out. © OpenStreetMap contributors, ODbL 1.0.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RoutesExtract } from "./extract-osm.ts";

/** Why each element is in the fixture (asserted in shared/sources/osm/routes-layers.test.ts). */
export const FIXTURE_ELEMENTS = {
  relations: {
    67109: "speed enforcement relation with device, from, to and maxspeed",
    1326764: "red-light camera relation (enforcement=traffic_signals)",
    13056650: "enforcement=red_light_camera: a documented mistake, left out",
    10253900: "average speed check whose section joins into one line through its from and to points",
    14161786: "average speed check whose from or to point is not on its section: left out",
    10157575: "average speed check without exactly one from and one to point: left out",
    10266611: "average speed check whose section ways don't join into one line: left out",
  },
  nodes: {
    222227: "speed camera with maxspeed=30 mph",
    1414957293: "speed camera with a bare-number maxspeed (km/h by OSM's rules): no limit shown",
    99878: "maxwidth:physical on a lone node: left out",
    26421233: "enforcement tag on a node: a documented mistake, left out",
  },
  ways: {
    2273: "maxweightrating:hgv=7.5 with none @ destination",
    1858766: "maxheight in feet and inches",
    1166: "maxheight=default: no limit, left out",
    1144: "maxwidth=6'6\"",
    1881115: "maxlength",
    960: "hgv=no",
    2769: "hgv=destination",
    797917: "hgv=discouraged (advisory)",
    3987398: "hgv=unsuitable (undocumented): left out",
    1430327: "hgv:conditional on a pedestrian street: not a road for motor vehicles, left out",
    3994632: "hgv:conditional only (no @ (22:00-07:00 AND weight > 7.5)) on a road",
    1218: "hgv=designated (a permission): left out",
    2407076: "hgv on a footway or path: left out",
    4066422: "lorry weight limit mapped only under conditions",
    24325993: "maxheight and maxheight:physical both mapped",
    28984370: "maxwidth on a track: not a road for motor vehicles, left out",
    955693000: "maxwidth=1 m on a road: implausible, left out",
  },
} as const;

function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("Usage: capture-fixtures.ts <download folder>");
  const x = JSON.parse(readFileSync(join(dir, "routes-extract.json"), "utf8")) as RoutesExtract;
  const relIds = new Set(Object.keys(FIXTURE_ELEMENTS.relations).map(Number));
  const relations = x.relations.filter((r) => relIds.has(r.id));
  const wayIds = new Set([...Object.keys(FIXTURE_ELEMENTS.ways).map(Number), ...relations.flatMap((r) => r.members.filter((m) => m.type === "way").map((m) => m.ref))]);
  const nodeIds = new Set([...Object.keys(FIXTURE_ELEMENTS.nodes).map(Number), ...relations.flatMap((r) => r.members.filter((m) => m.type === "node").map((m) => m.ref))]);
  const out = {
    _comment: "Real OpenStreetMap elements trimmed from the Geofabrik England extract named in `source` (© OpenStreetMap contributors, ODbL 1.0). See scripts/routes-layers/capture-fixtures.ts.",
    source: x.source,
    nodes: x.nodes.filter((n) => nodeIds.has(n.id)),
    ways: x.ways.filter((w) => wayIds.has(w.id)),
    relations,
  };
  const missing = [...relIds].filter((id) => !relations.some((r) => r.id === id)).concat([...wayIds].filter((id) => !out.ways.some((w) => w.id === id)));
  if (missing.length > 0) console.warn(`Not in this extract: ${missing.join(", ")}`);
  writeFileSync("fixtures/routes-layers/osm-elements.json", `${JSON.stringify(out, null, 1)}\n`);
  console.log(`fixtures/routes-layers/osm-elements.json: ${out.nodes.length} nodes, ${out.ways.length} ways, ${out.relations.length} relations`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/routes-layers/capture-fixtures.ts")) main();
