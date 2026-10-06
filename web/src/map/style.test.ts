import type { LayerSpecification, LineLayerSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { baseLabelAdjustments, COLOURS, overlayLayers, roadEmphasisBeforeId, roadEmphasisLayers } from "./style.ts";

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

describe("closure lines", () => {
  /** The width stops of a zoom-interpolated line width: [zoom, width, zoom, width, ...]. */
  const stops = (id: string): number[] => {
    const width = (byId(id) as LineLayerSpecification).paint?.["line-width"];
    expect(width, `${id} width follows zoom`).toEqual(expect.arrayContaining(["interpolate", ["zoom"]]));
    return (width as unknown[]).slice(3) as number[];
  };

  it("draw red on a wider dark casing, from the same features, for every closure and the selected one", () => {
    for (const [casing, line] of [
      ["closure-casing", "closure-line"],
      ["selected-closure-casing", "selected-closure-line"],
    ] as const) {
      const [c, l] = [byId(casing) as LineLayerSpecification, byId(line) as LineLayerSpecification];
      expect(order(casing), `${casing} under ${line}`).toBeLessThan(order(line));
      expect([c.source, c.filter]).toEqual([l.source, l.filter]);
      expect(c.paint?.["line-color"]).toBe(COLOURS.ink);
      expect(l.paint?.["line-color"]).toBe(COLOURS.closure);
      const [cw, lw] = [stops(casing), stops(line)];
      for (let i = 1; i < lw.length; i += 2) expect(cw[i]!, `${casing} wider at zoom ${lw[i - 1]}`).toBeGreaterThan(lw[i]!);
    }
  });

  it("keep the clickable closure-line id the map's handlers use, and stay below every marker and label", () => {
    expect((byId("closure-line") as LineLayerSpecification).source).toBe("closures");
    expect(order("selected-closure-line")).toBeLessThan(order("selected-marker"));
    expect(order("closure-line")).toBeLessThan(order("marker"));
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
