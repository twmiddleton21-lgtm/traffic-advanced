import type { LayerSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { baseLabelAdjustments, overlayLayers, roadEmphasisBeforeId, roadEmphasisLayers } from "./style.ts";

const layers = overlayLayers();
const byId = (id: string): LayerSpecification => {
  const layer = layers.find((l) => l.id === id);
  if (!layer) throw new Error(`no layer ${id}`);
  return layer;
};
const order = (id: string) => layers.findIndex((l) => l.id === id);

describe("diversion arrows", () => {
  const arrows = byId("route-arrows") as SymbolLayerSpecification;

  it("point along the line in its vertex order (line placement, map-aligned, never flipped upright)", () => {
    expect(arrows.layout?.["symbol-placement"]).toBe("line");
    expect(arrows.layout?.["icon-rotation-alignment"]).toBe("map");
    // keep-upright would flip arrows on lines running right-to-left, reversing the direction shown.
    expect(arrows.layout?.["icon-keep-upright"]).toBe(false);
    expect(arrows.layout?.["icon-image"]).toBe("ta-arrow");
  });

  it("are drawn only on official route lines whose direction is proven", () => {
    expect(arrows.source).toBe("selected-route");
    expect(arrows.filter).toEqual(["all", ["==", ["get", "kind"], "route"], ["==", ["get", "directional"], true]]);
  });

  it("are spaced in screen pixels, so their number follows zoom and route length", () => {
    expect(JSON.stringify(arrows.layout?.["symbol-spacing"])).toMatch(/interpolate.*zoom/);
  });
});

describe("label priority (later layers win label collisions and draw on top)", () => {
  it("selected closure > its diversion > arrows > motorway numbers > junction numbers > closure markers > other road numbers", () => {
    const ranked = ["ta-junction-confirmed", "selected-marker-label", "route-ends-label", "route-arrows", "route-line", "ta-ref-motorway", "ta-junction", "ta-ref-primary", "marker-label"];
    for (let i = 1; i < ranked.length; i++) expect(order(ranked[i - 1]!), `${ranked[i - 1]} above ${ranked[i]}`).toBeGreaterThan(order(ranked[i]!));
  });

  it("every layer id is unique", () => {
    expect(new Set(layers.map((l) => l.id)).size).toBe(layers.length);
  });
});

describe("road hierarchy", () => {
  const minzoom = (id: string) => byId(id).minzoom ?? 0;

  it("motorway numbers appear first, then primary routes, A roads, then B roads", () => {
    expect(minzoom("ta-ref-motorway")).toBeLessThan(minzoom("ta-ref-trunk"));
    expect(minzoom("ta-ref-trunk")).toBeLessThan(minzoom("ta-ref-primary"));
    expect(minzoom("ta-ref-primary")).toBeLessThan(minzoom("ta-ref-secondary"));
  });

  it("road numbers come from the base map's own ref field, never from closure data", () => {
    for (const id of ["ta-ref-motorway", "ta-ref-trunk", "ta-ref-primary", "ta-ref-secondary"]) {
      const layer = byId(id) as SymbolLayerSpecification;
      expect(layer.source).toBe("openmaptiles");
      expect(layer.layout?.["text-field"]).toEqual(["get", "ref"]);
    }
  });

  it("road emphasis is the same in both themes apart from colour", () => {
    const strip = (l: LayerSpecification[]) => l.map((x) => ({ id: x.id, type: x.type, filter: "filter" in x ? x.filter : undefined, z: x.minzoom }));
    expect(strip(roadEmphasisLayers("light"))).toEqual(strip(roadEmphasisLayers("dark")));
  });

  it("hides the base map's own road numbers and delays street names (synthetic style excerpt)", () => {
    // Synthetic: shaped like the OpenFreeMap positron/dark layers inspected on 2026-10-05.
    const style = {
      layers: [
        { id: "highway-shield-non-us", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name", minzoom: 11, layout: { "text-field": ["to-string", ["get", "ref"]] } },
        { id: "highway_name_other", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name", layout: { "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]] } },
        { id: "highway-name-minor", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name", minzoom: 15, layout: { "text-field": ["get", "name"] } },
        { id: "place_city", type: "symbol", source: "openmaptiles", "source-layer": "place", layout: { "text-field": ["get", "name"] } },
      ],
    } as unknown as Parameters<typeof baseLabelAdjustments>[0];
    expect(baseLabelAdjustments(style)).toEqual({ hide: ["highway-shield-non-us"], minzoom: [{ id: "highway_name_other", zoom: 13 }] });
  });

  it("puts road emphasis above the base roads, not under buildings (the dark style has a symbol layer before its roads)", () => {
    // Synthetic: mirrors the dark style's order, where water_name comes before buildings and roads.
    const style = {
      layers: [
        { id: "water_name", type: "symbol", source: "openmaptiles", "source-layer": "water_name" },
        { id: "building", type: "fill", source: "openmaptiles", "source-layer": "building" },
        { id: "highway_motorway_inner", type: "line", source: "openmaptiles", "source-layer": "transportation" },
        { id: "highway_name_other", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name" },
      ],
    } as unknown as Parameters<typeof roadEmphasisBeforeId>[0];
    expect(roadEmphasisBeforeId(style)).toBe("highway_name_other");
  });
});
