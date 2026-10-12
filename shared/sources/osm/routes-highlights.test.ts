import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { routesHighlightsFileSchema, ROUTES_HIGHLIGHTS_SCHEMA_VERSION } from "../../api/routes-highlights.ts";
import type { RoutesPoint } from "../../api/routes-layers.ts";
import { highlightCategory, readHighlights, type WayGeometry } from "./routes-highlights.ts";
import { readRoutesLayers, type RoutesInput } from "./routes-layers.ts";

/**
 * Road highlighting on REAL elements (fixtures/routes-layers/osm-elements.json): built from the layer's own records and the extract's
 * roads, never from tags of its own. Inline records are SYNTHETIC and labelled.
 */
const fixture = JSON.parse(readFileSync("fixtures/routes-layers/osm-elements.json", "utf8")) as RoutesInput;
const layers = readRoutesLayers(fixture, () => true);
const ways = new Map<number, WayGeometry>(fixture.ways.map((w) => [w.id, w]));

describe("road highlighting from the layer's own records", () => {
  it("every highlighted road is a record of that layer, read from that same road, with the record's id", () => {
    for (const layer of ["height", "weight", "width-length", "access"] as const) {
      const records = layers.points[layer];
      const { roads } = readHighlights(layer, records, ways);
      const ids = new Map(records.map((r) => [r.id, r]));
      for (const road of roads) {
        const record = ids.get(road.id);
        expect(record, road.id).toBeDefined();
        expect(record!.osm[0]!.type).toBe("way");
        const way = ways.get(record!.osm[0]!.id)!;
        expect(road.line[0]).toEqual([Math.round(way.geometry[0]![0] * 1e5) / 1e5, Math.round(way.geometry[0]![1] * 1e5) / 1e5]);
      }
    }
  });

  it("a 7.5 t lorry limit is the strong warning colour; an 18 t limit the softer one", () => {
    const weight = layers.points.weight;
    const { roads } = readHighlights("weight", weight, ways);
    expect(roads.find((r) => r.id === "osm/way/2273/weight-goods")).toMatchObject({ category: "weight-strong", conditional: true });
    // SYNTHETIC record: an 18 t all-vehicle limit on the same road.
    const heavier: RoutesPoint = { ...weight.find((r) => r.id === "osm/way/2273/weight-goods")!, id: "osm/way/2273/weight-structural", kind: "weight-structural", value: { type: "measure", amount: 18, unit: "t" }, conditions: [] };
    expect(highlightCategory("weight", heavier)).toBe("weight-soft");
    expect(readHighlights("weight", [heavier], ways).roads[0]).toMatchObject({ category: "weight-soft", conditional: false });
  });

  it("conditions or exemptions make a road faint; a plain limit doesn't", () => {
    const { roads } = readHighlights("access", layers.points.access, ways);
    expect(roads.find((r) => r.id === "osm/way/3994632/hgv-access")?.conditional).toBe(true);
    expect(roads.find((r) => r.id === "osm/way/960/hgv-access")?.conditional).toBe(false);
  });

  it("records from a single point get no road; a road missing from the extract or cut at its edge is reported, never drawn", () => {
    const height = layers.points.height;
    // SYNTHETIC: a record from a node, and records whose road is missing or incomplete.
    const node: RoutesPoint = { ...height[0]!, id: "osm/node/9/height", osm: [{ type: "node", id: 9, version: 1 }] };
    const missing: RoutesPoint = { ...height[0]!, id: "osm/way/999999999/height", osm: [{ type: "way", id: 999999999, version: 1 }] };
    const cut: RoutesPoint = { ...height[0]!, id: "osm/way/5/height", osm: [{ type: "way", id: 5, version: 1 }] };
    const geometry = new Map<number, WayGeometry>([[5, { id: 5, geometry: [[-1, 52], null] }]]);
    const { roads, skipped } = readHighlights("height", [node, missing, cut], geometry);
    expect(roads).toEqual([]);
    expect(skipped).toEqual([
      { id: "osm/way/999999999/height", reason: "road not in the extract" },
      { id: "osm/way/5/height", reason: "road geometry incomplete" },
    ]);
  });

  it("the file contract refuses a road in the wrong layer's category and duplicates", () => {
    const source = {
      name: "OpenStreetMap",
      attribution: "© OpenStreetMap contributors",
      copyrightUrl: "https://www.openstreetmap.org/copyright",
      licence: { name: "Open Database License (ODbL) 1.0", url: "https://opendatacommons.org/licenses/odbl/1-0/" },
      extract: { url: "https://download.geofabrik.de/europe/united-kingdom/england-261011.osm.pbf", file: "england-261011.osm.pbf", sha256: "a".repeat(64), fetchedAt: "2026-10-12T20:15:40Z" },
      dataAsOf: "2026-10-11T20:21:06Z",
      notes: [],
    };
    const road = { id: "osm/way/1/height", category: "height", conditional: false, line: [[-1, 52], [-1.001, 52.001]] };
    const file = (layer: string, roads: unknown[]) => routesHighlightsFileSchema.safeParse({ schemaVersion: ROUTES_HIGHLIGHTS_SCHEMA_VERSION, layer, generatedAt: "2026-10-12T21:30:00Z", source, roads }).success;
    expect(file("height", [road])).toBe(true);
    expect(file("weight", [road])).toBe(false);
    expect(file("height", [road, road])).toBe(false);
  });
});
