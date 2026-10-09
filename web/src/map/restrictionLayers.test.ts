import { readFileSync } from "node:fs";
import type { LayerSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { restrictionPointsFileSchema, type RestrictionPointsFile } from "../../../shared/api/restrictions.ts";
import { iconFor, layerIds, RESTRICTION_MIN_ZOOM, RESTRICTION_SOURCES, restrictionFeatures, sourceAttribution } from "./restrictionLayers.ts";
import { overlayLayers } from "./style.ts";

const layers = overlayLayers();
const order = (id: string) => {
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0) throw new Error(`no layer ${id}`);
  return i;
};
const byId = (id: string) => layers.find((l) => l.id === id) as LayerSpecification;
const restrictionLayerIds = (["height", "weight", "lez", "ulez"] as const).flatMap(layerIds);
const visibility = (l: LayerSpecification) => (l.layout as { visibility?: string } | undefined)?.visibility;

describe("restriction layers in the map style", () => {
  it("are all hidden until switched on, and every one belongs to exactly one restriction layer", () => {
    for (const id of restrictionLayerIds) expect(visibility(byId(id)), id).toBe("none");
    expect(new Set(restrictionLayerIds).size).toBe(restrictionLayerIds.length);
    const sources = new Set(Object.values(RESTRICTION_SOURCES));
    const fromRestrictionSources = layers.filter((l) => "source" in l && sources.has(l.source)).map((l) => l.id);
    expect(fromRestrictionSources.sort()).toEqual([...restrictionLayerIds].sort());
  });

  it("never share a source with closures, diversions or junctions, so switching them can't affect those", () => {
    for (const id of restrictionLayerIds) expect(["closures", "markers", "selected-route", "route-ends", "junctions"]).not.toContain((byId(id) as { source: string }).source);
    // Switching a layer touches only its own layer ids (MapView applyRestrictions).
    const view = readFileSync("web/src/map/MapView.tsx", "utf8");
    expect(view).toMatch(/for \(const id of layerIds\(o\.layer\)\) map\.setLayoutProperty\(id, "visibility"/);
  });

  it("put the London zones under everything else we draw, so closures stay on top", () => {
    for (const z of ["zone-lez-fill", "zone-lez-line", "zone-ulez-fill", "zone-ulez-line", "zone-lez-label", "zone-ulez-label"]) expect(order(z)).toBeLessThan(order("closure-casing"));
  });

  it("put height and weight markers above road numbers (they win a label collision) and under the selected closure's diversion", () => {
    for (const id of ["restriction-height", "restriction-weight"]) {
      expect(order(id)).toBeGreaterThan(order("ta-ref-motorway"));
      expect(order(id)).toBeGreaterThan(order("ta-junction"));
      expect(order(id)).toBeLessThan(order("route-line"));
      expect(order(id)).toBeLessThan(order("selected-marker"));
      expect(order(id)).toBeLessThan(order("ta-junction-confirmed"));
    }
  });

  it("show markers only when zoomed in, with readable values on sign-style plates", () => {
    for (const id of ["restriction-height", "restriction-weight"]) {
      const l = byId(id) as SymbolLayerSpecification;
      expect(l.minzoom).toBe(RESTRICTION_MIN_ZOOM);
      expect(RESTRICTION_MIN_ZOOM).toBeGreaterThanOrEqual(12);
      expect(l.layout?.["text-field"]).toEqual(["get", "text"]);
      expect(l.layout?.["icon-text-fit"]).toBe("both");
    }
  });

  it("are reinstalled with closures after every style change, hidden or shown as the switches say", () => {
    const view = readFileSync("web/src/map/MapView.tsx", "utf8");
    expect(view).toMatch(/map\.on\("style\.load", \(\) => installLayers\(map, latest\)\)/);
    expect(view).toMatch(/applySelection\(map, selected\);\s*applyRestrictions\(map, latest\.current\.restrictions, latest\.current\.selectedRestrictionId\);/);
    // A new style starts with no data: each source's data is handed over again.
    expect(view).toMatch(/shownData\.delete\(map\);/);
  });

  it("keep closures' priority when a tap hits both a closure and a restriction marker", () => {
    const view = readFileSync("web/src/map/MapView.tsx", "utf8");
    expect(view).toMatch(/queryRenderedFeatures\(e\.point, \{ layers: \["marker", "closure-line", "selected-marker"\] \}\)\.length > 0\) return;/);
  });
});

describe("restriction features", () => {
  const f: RestrictionPointsFile = {
    schemaVersion: 1,
    layer: "weight",
    generatedAt: "2026-10-09T09:00:00.000Z",
    sources: [
      { id: "osm", name: "OpenStreetMap", authority: "OpenStreetMap contributors", kind: "community", licence: { name: "ODbL", url: "https://opendatacommons.org/licenses/odbl/1-0/" }, attribution: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright", datasetDate: null, fetchedAt: "2026-10-09T09:00:00.000Z", records: 1, notes: [] },
      { id: "nh-s4-diversion-points", name: "NH", authority: "National Highways", kind: "official", licence: { name: "OGL", url: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" }, attribution: "OGL", url: "https://www.arcgis.com/home/item.html?id=x", datasetDate: null, fetchedAt: "2026-10-06T06:52:53.821Z", records: 1, notes: [] },
    ],
    features: [
      { id: "osm/way/1/weight-goods", source: "osm", kind: "weight-goods", limit: { min: 7.5, max: 7.5 }, recorded: "7.5", physical: false, conditions: [], position: [-0.1, 51.5], approximate: false, extentMetres: 10, road: { name: null, ref: null, area: null }, sourceText: null, context: null, lastEdited: null, osm: null },
      { id: "nh-s4-diversion-points/x", source: "nh-s4-diversion-points", kind: "weight-unrecorded-type", limit: { min: 18, max: 18 }, recorded: "18 tonnes", physical: false, conditions: [], position: [-2, 53], approximate: false, extentMetres: null, road: { name: null, ref: null, area: null }, sourceText: null, context: "x", lastEdited: null, osm: null },
    ],
  };

  it("mark community records (dashed plate) and each kind with its own plate, official records drawn first", () => {
    const fc = restrictionFeatures(f);
    expect(fc.features.map((x) => x.properties.icon)).toEqual(["ta-r-weight-goods-community", "ta-r-weight-unrecorded-type"]);
    expect(fc.features[0]!.properties.sort).toBeGreaterThan(fc.features[1]!.properties.sort);
    expect(iconFor("height", false)).toBe("ta-r-height");
  });

  it("draw one marker per place for a restriction NH records on several diversion routes, counting its records", () => {
    const weight = restrictionPointsFileSchema.parse(JSON.parse(readFileSync("web/src/restrictions/data/weight.json", "utf8")));
    const fc = restrictionFeatures(weight);
    expect(weight.features).toHaveLength(84);
    expect(fc.features).toHaveLength(75);
    expect(fc.features.reduce((n, x) => n + x.properties.records, 0)).toBe(84);
    expect(new Set(fc.features.map((x) => x.geometry.coordinates.join(","))).size).toBe(75);
    const m56 = fc.features.find((x) => x.geometry.coordinates[0] === -2.545119 && x.geometry.coordinates[1] === 53.350447);
    expect(m56?.properties).toMatchObject({ records: 2, text: "7.5t" });
  });

  it("every plate the layers can ask for is drawn (images.ts)", () => {
    const images = readFileSync("web/src/map/images.ts", "utf8");
    for (const kind of ["height", "weight-goods", "weight-structural", "weight-unrecorded-type"]) expect(images).toContain(`{ kind: "${kind}"`);
    expect(images).toMatch(/addPlate\(map, `ta-r-\$\{k\.kind\}`[\s\S]*addPlate\(map, `ta-r-\$\{k\.kind\}-community`/);
  });

  it("credit each source with its licence while its layer is on", () => {
    expect(sourceAttribution(f.sources)).toBe("OpenStreetMap contributors: © OpenStreetMap contributors (ODbL) · National Highways: OGL (OGL)");
    expect(readFileSync("web/src/map/MapView.tsx", "utf8")).toMatch(/map\.addSource\(RESTRICTION_SOURCES\[r\.layer\], \{ type: "geojson", data: EMPTY, attribution: r\.attribution \}\)/);
  });
});
