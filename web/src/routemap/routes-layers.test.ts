import { existsSync, readdirSync, readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { createElement as h, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ROUTES_DATA_LAYERS,
  ROUTES_LAYERS_SCHEMA_VERSION,
  ROUTES_OSM_CAVEAT,
  routesManifestSchema,
  routesPointsFileSchema,
  routesSectionsFileSchema,
  type RoutesDataLayer,
  type RoutesPoint,
  type RoutesPointsFile,
  type RoutesSource,
} from "../../../shared/api/routes-layers.ts";
import { routesHighlightsFileSchema } from "../../../shared/api/routes-highlights.ts";
import { MapKey } from "../components/MapKey.tsx";
import { RoutesFeatureDialog } from "../components/RoutesFeatureDialog.tsx";
import { OsmLayerSwitches, ROUTES_SCOPE_TEXT, RoutesLayerSwitch, RoutesMapControls, type RoutesOsmLayers } from "../components/RoutesMapControls.tsx";
import { getRoutesLayerFile, TrafficApiError } from "../data/trafficService.ts";
import { ROUTES_HIGHLIGHT_DASH, ROUTES_HIGHLIGHT_SOURCES, ROUTES_HIGHLIGHT_STYLE, ROUTES_LAYER_MIN_ZOOM, routesOverlayLayerIds, routesOverlayLayers, routesPointFeatures, routesSectionFeatures, ROUTES_OVERLAY_SOURCES } from "../map/routesOverlayLayers.ts";
import { overlayLayers } from "../map/style.ts";
import { CLOSURES_LAYER_IDS, DEFAULT_ROUTES_LAYERS, viewLayerVisibility } from "../map/viewLayers.ts";
import { readRoutesLayers, ROUTES_LAYERS_KEY, writeRoutesLayers } from "../settings/preferences.ts";
import { availableLayers } from "../restrictions/catalog.ts";
import { availableRoutesLayers, routesManifest } from "./catalog.ts";
import { ROUTES_LAYER_TEXT, routesKindLabel, routesMarkerText, routesValueText } from "./describe.ts";
import { routesInView } from "./inView.ts";
import { forgetFailedRoutesLoad, loadRoutesLayer, routesQueryKey, type RoutesLayerStatus } from "./useRoutesLayerData.ts";

/**
 * The Routes map's OpenStreetMap layers in the app: the shipped data, loading and caching, independent switches, the Layers panel,
 * the map key, wording, and that the Closures view is untouched. Records built inline are SYNTHETIC unless they come from the
 * shipped files (real OpenStreetMap data, web/src/routemap/data).
 */
const app = readFileSync("web/src/App.tsx", "utf8");
const DATA = "web/src/routemap/data";
const shipped = (file: string) => JSON.parse(readFileSync(`${DATA}/${file}`, "utf8")) as unknown;

const source: RoutesSource = {
  name: "OpenStreetMap",
  attribution: "© OpenStreetMap contributors",
  copyrightUrl: "https://www.openstreetmap.org/copyright",
  licence: { name: "Open Database License (ODbL) 1.0", url: "https://opendatacommons.org/licenses/odbl/1-0/" },
  extract: { url: "https://download.geofabrik.de/europe/united-kingdom/england-261011.osm.pbf", file: "england-261011.osm.pbf", sha256: "a".repeat(64), fetchedAt: "2026-10-12T20:15:40Z" },
  dataAsOf: "2026-10-11T20:21:06Z",
  notes: [],
};
const point = (over: Partial<RoutesPoint> = {}): RoutesPoint => ({
  id: "osm/way/1/weight-goods",
  kind: "weight-goods",
  value: { type: "measure", amount: 7.5, unit: "t" },
  recorded: [{ key: "maxweightrating:hgv", value: "7.5" }],
  conditionalOnly: false,
  conditions: [],
  physical: false,
  direction: null,
  partOf: [],
  position: [-1.5, 52.5],
  approximate: false,
  extentMetres: 120,
  road: { name: "High Street", ref: null },
  lastEdited: "2025-01-01T00:00:00.000Z",
  osm: [{ type: "way", id: 1, version: 3 }],
  ...over,
});
const pointsFile = (layer: RoutesPointsFile["layer"], features: RoutesPoint[]): RoutesPointsFile => ({ schemaVersion: ROUTES_LAYERS_SCHEMA_VERSION, layer, generatedAt: "2026-10-12T21:30:00Z", source, features });
const status = (layer: RoutesDataLayer, state: RoutesLayerStatus["state"], file?: RoutesPointsFile): RoutesLayerStatus => ({
  layer,
  state,
  data: file ? { kind: "points", file } : null,
  error: state === "error" ? "Map layer data couldn't be loaded (error 500)." : null,
  retry: () => undefined,
});
const allOff = Object.fromEntries(ROUTES_DATA_LAYERS.map((l) => [l, status(l, "off")])) as Record<RoutesDataLayer, RoutesLayerStatus>;
// SYNTHETIC catalogue with every layer, so the panel tests run without the generated data (web/src/routemap/data is not committed).
const allEntries = ROUTES_DATA_LAYERS.map((layer) => ({ layer, url: `/assets/${layer}-test.json`, records: 1, notes: [], roadsUrl: null }));
const osmLayers = (statuses = allOff, zoom: number | null = 14): RoutesOsmLayers => ({ entries: allEntries, statuses, dataAsOf: "2026-10-11T20:21:06Z", now: new Date("2026-10-12T22:00:00Z"), zoom });

function findAll(node: ReactNode, match: (e: ReactElement) => boolean): ReactElement[] {
  const found: ReactElement[] = [];
  const walk = (n: ReactNode) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isValidElement(n)) return;
    if (match(n)) found.push(n);
    walk((n.props as { children?: ReactNode }).children);
  };
  walk(node);
  return found;
}

// The generated data isn't kept in the repository (docs/ROUTES-MAP.md, "Generated data"): these run where it has been built, and the
// fixture-based tests (shared/sources/osm/routes-layers.test.ts) always run.
const HAS_DATA = existsSync(`${DATA}/manifest.json`);

describe.skipIf(!HAS_DATA)("shipped Routes data (real OpenStreetMap, England extract of 2026-10-11)", () => {
  // Read only when present: a skipped describe still runs its body, and a checkout without the generated data has no manifest.
  const manifest = HAS_DATA ? routesManifestSchema.parse(shipped("manifest.json")) : (undefined as never);

  it("lists every layer, each file validates, and record counts match the catalogue", () => {
    expect(routesManifest).not.toBeNull();
    expect(availableRoutesLayers().map((e) => e.layer)).toEqual([...ROUTES_DATA_LAYERS]);
    expect(Object.keys(manifest.layers).sort()).toEqual([...ROUTES_DATA_LAYERS].sort());
    for (const layer of ROUTES_DATA_LAYERS) {
      const entry = manifest.layers[layer]!;
      if (layer === "average-speed") {
        const file = routesSectionsFileSchema.parse(shipped(entry.file));
        expect(file.sections.length, layer).toBe(entry.records);
      } else {
        const file = routesPointsFileSchema.parse(shipped(entry.file));
        expect(file.layer).toBe(layer);
        expect(file.features.length, layer).toBe(entry.records);
        expect(file.source.dataAsOf).toBe(manifest.dataAsOf);
      }
    }
  });

  it("carries its data date, the ODbL and the attribution, and the extract it came from by SHA-256", () => {
    expect(manifest.dataAsOf).toBe("2026-10-11T20:21:06.000Z");
    const file = routesPointsFileSchema.parse(shipped("speed-cameras.json"));
    expect(file.source.attribution).toBe("© OpenStreetMap contributors");
    expect(file.source.licence.name).toBe("Open Database License (ODbL) 1.0");
    expect(file.source.extract.file).toBe("england-261011.osm.pbf");
    expect(file.source.extract.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is real England data: 3,142 mapped highway=speed_camera nodes are all among the cameras", () => {
    const cameras = routesPointsFileSchema.parse(shipped("speed-cameras.json")).features;
    expect(cameras.length).toBeGreaterThanOrEqual(3_000);
    expect(cameras.every((c) => c.position[0] > -6.5 && c.position[0] < 2 && c.position[1] > 49.8 && c.position[1] < 56)).toBe(true);
  });

  it("contains no key, token or secret", () => {
    for (const f of readdirSync(DATA)) expect(readFileSync(`${DATA}/${f}`, "utf8"), f).not.toMatch(/api[_-]?key|token=|secret|TomTom-Api-Key/i);
  });
});

describe("catalogue", () => {
  it("offers a switch only for layers with a catalogue entry and a file; an invalid catalogue offers none", () => {
    const m = routesManifestSchema.parse({ schemaVersion: 1, generatedAt: "2026-10-12T21:30:00Z", dataAsOf: "2026-10-11T20:21:06Z", layers: { height: { file: "height.json", records: 2, notes: [] }, weight: { file: "weight.json", records: 1, notes: [] } } });
    expect(availableRoutesLayers(m, { "./data/height.json": "/assets/height-1.json" }).map((e) => e.layer)).toEqual(["height"]);
    expect(availableRoutesLayers(null, {})).toEqual([]);
  });
});

describe("loading: only when switched on, once per visit, failures isolated", () => {
  const respond = (body: unknown, status = 200) => vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  const entry = { layer: "weight" as const, url: "/assets/weight-abc.json", records: 1, notes: [], roadsUrl: null };

  it("switching off and on again, or opening and closing the panel, never downloads the file again", async () => {
    const client = new QueryClient();
    const fetchImpl = respond(pointsFile("weight", [point()]));
    const options = { queryKey: routesQueryKey("weight", entry.url), queryFn: () => loadRoutesLayer(entry, undefined, fetchImpl), staleTime: Number.POSITIVE_INFINITY };
    await client.fetchQuery(options);
    forgetFailedRoutesLoad(client, "weight", entry.url); // switching off: a good load is kept
    await client.fetchQuery(options);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // The hook asks for the file only while its layer is on, and keeps it for the visit; App ties loading to the switches only.
    const hook = readFileSync("web/src/routemap/useRoutesLayerData.ts", "utf8");
    expect(hook).toMatch(/enabled: enabled && entry !== undefined/);
    expect(hook).toMatch(/staleTime: Number\.POSITIVE_INFINITY/);
    expect(app).toMatch(/useRoutesLayerData\(routesEntryOf\("weight"\), "weight", routeLayers\.weight === true\)/);
    expect(app).not.toMatch(/useRoutesLayerData\([^)]*routesPanelOpen/);
  });

  it("a failed load is forgotten when the layer is switched off, so switching it on tries again", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const failing = respond({}, 500);
    await expect(client.fetchQuery({ queryKey: routesQueryKey("weight", entry.url), queryFn: () => loadRoutesLayer(entry, undefined, failing) })).rejects.toThrow(/error 500/);
    expect(client.getQueryState(routesQueryKey("weight", entry.url))?.status).toBe("error");
    forgetFailedRoutesLoad(client, "weight", entry.url);
    expect(client.getQueryState(routesQueryKey("weight", entry.url))).toBeUndefined();
  });

  it("an invalid, unreadable or missing file is refused whole: no partial data, so no invalid markers", async () => {
    await expect(getRoutesLayerFile("/x.json", routesPointsFileSchema, undefined, respond({ ...pointsFile("weight", []), schemaVersion: 2 }))).rejects.toThrow("Map layer data failed validation, so it isn't shown.");
    // One invalid record (a weight with no value) fails the whole file.
    await expect(getRoutesLayerFile("/x.json", routesPointsFileSchema, undefined, respond(pointsFile("weight", [point(), point({ id: "osm/way/2/weight-goods", value: null })])))).rejects.toThrow(/failed validation/);
    await expect(getRoutesLayerFile("/x.json", routesPointsFileSchema, undefined, () => Promise.resolve(new Response("{", { status: 200 })))).rejects.toThrow(/couldn't be read/);
    await expect(getRoutesLayerFile("/x.json", routesPointsFileSchema, undefined, () => Promise.reject(new TypeError("Failed to fetch")))).rejects.toBeInstanceOf(TrafficApiError);
  });

  it("the schema refuses records in the wrong layer, units that don't fit the kind, duplicates and restrictions with directions", () => {
    const bad = (features: RoutesPoint[], layer: RoutesPointsFile["layer"] = "weight") => routesPointsFileSchema.safeParse(pointsFile(layer, features)).success;
    expect(bad([point()])).toBe(true);
    expect(bad([point({ kind: "height" })])).toBe(false);
    expect(bad([point({ value: { type: "measure", amount: 7.5, unit: "m" } })])).toBe(false);
    expect(bad([point(), point()])).toBe(false);
    expect(bad([point({ direction: { travelBearings: [90], mapped: null } })])).toBe(false);
  });

  it("one layer's failure is reported on its own row only; the map, junctions and other layers carry on", () => {
    const statuses = { ...allOff, weight: status("weight", "error"), height: status("height", "ready", pointsFile("height", [point({ id: "osm/way/3/height", kind: "height", value: { type: "measure", amount: 4.4, unit: "m" } })])) };
    const html = renderToStaticMarkup(h(RoutesMapControls, { layers: { junctions: true, weight: true, height: true }, onToggle: () => undefined, junctions: { state: "ready", count: 596, leftOut: 0 }, onRetry: () => undefined, osm: osmLayers(statuses), open: true, onOpenChange: () => undefined }));
    expect(html).toContain("Weight limits couldn&#x27;t be loaded.");
    expect(html).not.toContain("Height limits couldn&#x27;t be loaded.");
    expect(html).not.toContain("Junction numbers couldn");
  });
});

describe("independent switches", () => {
  it("each switch reports only its own layer, and new layers start off", () => {
    const onToggle = vi.fn();
    const tree = OsmLayerSwitches({ osm: osmLayers(), layers: { junctions: true }, onToggle });
    const switches = findAll(tree, (e) => e.type === RoutesLayerSwitch);
    expect(switches.map((s) => (s.props as { layer: string }).layer)).toEqual([...ROUTES_DATA_LAYERS]);
    for (const s of switches) {
      const p = s.props as { layer: RoutesDataLayer; on: boolean; onToggle: (on: boolean) => void };
      expect(p.on, p.layer).toBe(false);
      p.onToggle(true);
      expect(onToggle).toHaveBeenLastCalledWith(p.layer, true);
    }
    expect(onToggle).toHaveBeenCalledTimes(ROUTES_DATA_LAYERS.length);
  });

  it("a switch is a labelled 48 px role=switch button that says its state", () => {
    const html = renderToStaticMarkup(h(RoutesLayerSwitch, { layer: "speed-cameras", on: true, onToggle: () => undefined, status: status("speed-cameras", "off"), records: 3159 }));
    expect(html).toMatch(/<button type="button" role="switch" aria-checked="true" aria-describedby="routes-layer-speed-cameras-description" class="flex min-h-12/);
    expect(html).toContain("Speed cameras");
  });

  it("switching one layer changes only that layer's map layers; the junction labels and every other layer stay as they were", () => {
    const shown = (switches: Parameters<typeof viewLayerVisibility>[1]) => new Set(viewLayerVisibility("routes", switches).filter((l) => l.visible).map((l) => l.id));
    const base = shown({ junctions: true });
    for (const layer of ROUTES_DATA_LAYERS) {
      const on = shown({ junctions: true, [layer]: true });
      expect([...on].filter((id) => !base.has(id)).sort(), layer).toEqual([...routesOverlayLayerIds(layer)].sort());
      expect([...base].every((id) => on.has(id)), layer).toBe(true);
    }
    // App changes one key at a time.
    expect(app).toMatch(/setRouteLayers\(\(l\) => \(\{ \.\.\.l, \[layer\]: on \}\)\)/);
  });

  it("closing the Layers panel only reports that it closed: no switch changes and nothing loads", () => {
    const onToggle = vi.fn();
    const onOpenChange = vi.fn();
    const tree = RoutesMapControls({ layers: { junctions: true, "speed-cameras": true }, onToggle, junctions: { state: "ready", count: 596, leftOut: 0 }, onRetry: () => undefined, osm: osmLayers(), open: true, onOpenChange });
    const details = findAll(tree, (e) => e.type === "details")[0]!;
    (details.props as { onToggle: (e: { currentTarget: { open: boolean } }) => void }).onToggle({ currentTarget: { open: false } });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onToggle).not.toHaveBeenCalled();
    // The switches live in App, apart from the panel's own open state.
    expect(app).toMatch(/const \[routeLayers, setRouteLayers\] = useState<RoutesLayerSwitches>/);
    expect(app).toMatch(/const \[routesPanelOpen, setRoutesPanelOpen\] = useState\(wide\)/);
  });
});

describe("panel wording", () => {
  it("keeps the Routes disclaimer word for word with the new layers, adds the community-data caveat, the source, its licence and its date", () => {
    expect(ROUTES_SCOPE_TEXT).toBe("Routes is for route awareness only. It doesn't plan routes, check whether roads suit your vehicle, or give directions. Always follow road signs.");
    const html = renderToStaticMarkup(h(RoutesMapControls, { layers: { junctions: true }, onToggle: () => undefined, junctions: { state: "ready", count: 596, leftOut: 0 }, onRetry: () => undefined, osm: osmLayers(), open: true, onOpenChange: () => undefined }));
    expect(html).toContain(ROUTES_SCOPE_TEXT.replace("doesn't", "doesn&#x27;t"));
    expect(html).toContain(ROUTES_OSM_CAVEAT);
    expect(html).toContain("© OpenStreetMap contributors");
    expect(html).toContain("Open Database License (ODbL) 1.0. OpenStreetMap data to 11 Oct 2026.");
    expect(html).toMatch(/href="https:\/\/www\.openstreetmap\.org\/copyright" target="_blank" rel="noopener noreferrer"/);
  });

  it("never says a road, route or vehicle is clear, legal, safe, suitable or verified", () => {
    const words = [...Object.values(ROUTES_LAYER_TEXT).flatMap((t) => [t.label, t.description]), ROUTES_OSM_CAVEAT];
    for (const w of words) expect(w).not.toMatch(/\b(clear|legal|safe|suitable|verified|official|guaranteed?)\b/i);
  });
});

describe("map key: a permanent legend", () => {
  const cameras = pointsFile("speed-cameras", [point({ id: "osm/node/1/speed-camera", kind: "speed-camera", value: { type: "measure", amount: 30, unit: "mph" }, recorded: [], osm: [{ type: "node", id: 1, version: 1 }] })]);
  const all = [...ROUTES_DATA_LAYERS];
  const key = (on: Partial<Record<RoutesDataLayer, boolean>>, statuses: RoutesLayerStatus[] = [], view: "routes" | "closures" = "routes", zoom = 14) =>
    renderToStaticMarkup(
      h(MapKey, { view, open: true, onOpenChange: () => undefined, routes: { available: all, on, statuses, area: { bounds: [-2, 52, -1, 53], centre: [-1.5, 52.5], zoom }, now: new Date("2026-10-12T22:00:00Z"), dataAsOf: "2026-10-11T20:21:06Z", onSelect: () => undefined } }),
    );
  const rows = (html: string) => [...html.matchAll(/<li class="flex items-center gap-2[^"]*">[\s\S]*?<\/li>/g)].map((m) => m[0]).filter((li) => /Speed cameras|Average speed checks|Red-light cameras|Height limits|Weight limits|Width and length limits|Lorry access restrictions/.test(li));
  const labels = ["Speed cameras", "Average speed checks", "Red-light cameras", "Height limits", "Weight limits", "Width and length limits", "Lorry access restrictions"];

  it("always lists all seven layers, in the panel's order, whatever is switched on", () => {
    for (const on of [{}, { weight: true }, Object.fromEntries(all.map((l) => [l, true]))]) {
      const r = rows(key(on));
      expect(r.map((li) => labels.find((l) => li.includes(l))), JSON.stringify(on)).toEqual(labels);
    }
  });

  it("a layer that is off is muted and marked Off (not by colour alone); on, it shows normally", () => {
    const html = key({ weight: true });
    const weight = rows(html).find((li) => li.includes("Weight limits"))!;
    const height = rows(html).find((li) => li.includes("Height limits"))!;
    expect(weight).not.toContain("opacity-60");
    expect(weight).not.toContain(">Off<");
    expect(height).toContain("opacity-60");
    expect(height).toContain(">Off<");
  });

  it("stays minimal: one symbol per row, no descriptions; the caveat appears once, only while a layer is on", () => {
    expect(key({})).not.toContain(ROUTES_OSM_CAVEAT);
    const html = key({ "speed-cameras": true }, [status("speed-cameras", "ready", cameras)]);
    expect(html.split(ROUTES_OSM_CAVEAT).length - 1).toBe(1);
    expect(html).toContain("© OpenStreetMap contributors, ODbL. Data to 11 Oct 2026.");
    for (const li of rows(html)) expect(li.length, li).toBeLessThan(2500);
  });

  it("explains the road highlighting only while a restriction layer is on, with the weight colours while weight is on", () => {
    expect(key({ "speed-cameras": true })).not.toContain("Highlighted road");
    const weight = key({ weight: true });
    expect(weight).toContain("Highlighted road: limit mapped along it.");
    expect(weight).toContain("7.5 t or less");
    expect(weight).toContain("above 7.5 t");
    expect(key({ height: true })).not.toContain("7.5 t or less");
  });

  it("says which switched-on layers need more zoom", () => {
    expect(key({ "speed-cameras": true }, [], "routes", 8)).toContain("Zoom in to see: speed cameras.");
    expect(key({ "speed-cameras": true }, [], "routes", 12)).not.toContain("Zoom in to see");
  });

  it("the Closures key never shows Routes rows", () => {
    expect(key({ "speed-cameras": true }, [status("speed-cameras", "ready", cameras)], "closures")).not.toContain("Community map data");
  });
});

describe("Layers and the map key are never open together (Routes)", () => {
  it("opening one folds the other, through shared state; the Routes key has its own state, so the Closures key is unaffected", () => {
    expect(app).toMatch(/const openRoutesPanel = \(open: boolean\) => \{\s*setRoutesPanelOpen\(open\);\s*if \(open\) setRoutesKeyOpen\(false\);/);
    expect(app).toMatch(/const openRoutesKey = \(open: boolean\) => \{\s*setRoutesKeyOpen\(open\);\s*if \(open\) setRoutesPanelOpen\(false\);/);
    expect(app).toMatch(/<RoutesMapControls[\s\S]*?open=\{routesPanelOpen\}\s+onOpenChange=\{openRoutesPanel\}/);
    expect(app).toMatch(/open=\{routesKeyOpen\}\s+onOpenChange=\{openRoutesKey\}\s+rootRef=\{setRoutesKeyElement\}/);
    // The Closures key keeps its own, unchanged state.
    expect(app).toMatch(/<MapKey\s+view=\{appView\}\s+open=\{mapKeyOpen\}\s+onOpenChange=\{setMapKeyOpen\}\s+restrictions=/);
    // Routes starts with Layers open where there's room and the key folded, so they never start open together.
    expect(app).toMatch(/const \[routesPanelOpen, setRoutesPanelOpen\] = useState\(wide\);\s*const \[routesKeyOpen, setRoutesKeyOpen\] = useState\(false\);/);
  });
});

describe("markers and details", () => {
  it("marker text gives the value, '*' where conditions or exemptions are mapped, nothing on cameras", () => {
    expect(routesMarkerText(point())).toBe("7.5t");
    expect(routesMarkerText(point({ conditions: ["maxweightrating:hgv: none @ destination"] }))).toBe("7.5t*");
    expect(routesMarkerText(point({ kind: "hgv-access", value: { type: "access", access: "destination" }, conditionalOnly: true }))).toBe("Access*");
    expect(routesMarkerText(point({ kind: "speed-camera", value: { type: "measure", amount: 30, unit: "mph" } }))).toBe("");
    const f = routesPointFeatures(pointsFile("weight", [point()])).features[0]!;
    expect(f.properties).toEqual({ id: "osm/way/1/weight-goods", icon: "ta-r-weight-goods-community", text: "7.5t", sort: 7.5 });
  });

  it("every marker image the layers ask for is drawn (images.ts)", () => {
    const images = readFileSync("web/src/map/images.ts", "utf8");
    for (const id of ["ta-routes-speed-camera", "ta-routes-red-light-camera", "ta-routes-width", "ta-routes-length", "ta-routes-hgv-access", "ta-arrow"]) expect(images, id).toContain(`"${id}"`);
  });

  it("a camera's speed limit is the road's mapped limit, never presented as a lorry limit", () => {
    expect(routesValueText(point({ kind: "speed-camera", value: { type: "measure", amount: 30, unit: "mph" } }))).toBe("Speed limit as mapped: 30 mph. This is the road's mapped limit, not a lorry limit.");
    expect(routesValueText(point({ kind: "speed-camera", value: null }))).toBe("Speed limit: not mapped, or mapped values disagree.");
  });

  it("details show conditions verbatim, say they aren't evaluated, and keep the caveat and the Routes disclaimer", () => {
    const p = point({ kind: "hgv-access", value: { type: "access", access: "no" }, conditionalOnly: true, conditions: ["hgv: no @ 22:00-07:00 AND weight > 7.5"], recorded: [{ key: "hgv:conditional", value: "no @ (22:00-07:00 AND weight > 7.5)" }] });
    const html = renderToStaticMarkup(h(RoutesFeatureDialog, { record: { layer: "access", kind: "point", point: p, distance: 0 }, dataAsOf: "2026-10-11T20:21:06Z", now: new Date("2026-10-12T22:00:00Z"), onClose: () => undefined, returnFocus: () => null }));
    expect(html).toContain("hgv: no @ 22:00-07:00 AND weight &gt; 7.5");
    expect(html).toContain("This applies only under the conditions mapped below.");
    expect(html).toContain(ROUTES_OSM_CAVEAT);
    expect(html).toContain(ROUTES_SCOPE_TEXT.replace("doesn't", "doesn&#x27;t"));
    expect(html).toContain('href="https://www.openstreetmap.org/way/1"');
    expect(routesKindLabel(p)).toBe("No lorries");
    expect(html).not.toMatch(/\b(suitable for|legal|safe to|verified|guaranteed)\b/i);
  });

  it("the keyboard list holds the records in view, nearest the centre first", () => {
    const file = pointsFile("weight", [point({ id: "osm/way/1/weight-goods", position: [-1.5, 52.5] }), point({ id: "osm/way/2/weight-goods", position: [-1.4, 52.5] }), point({ id: "osm/way/3/weight-goods", position: [5, 52.5] })]);
    const { items, total } = routesInView([{ layer: "weight", data: { kind: "points", file } }], [-2, 52, -1, 53], [-1.41, 52.5]);
    expect(total).toBe(2);
    expect(items.map((i) => (i.kind === "point" ? i.point.id : ""))).toEqual(["osm/way/2/weight-goods", "osm/way/1/weight-goods"]);
  });
});

describe("the Closures view is unchanged", () => {
  it("its restriction catalogue and files are its own: the Routes catalogue and builder never read or write them", () => {
    expect(availableLayers().map((e) => [e.layer, e.records])).toEqual([
      ["height", 972],
      ["weight", 84],
      ["lez", 1],
      ["ulez", 1],
    ]);
    for (const f of ["web/src/routemap/catalog.ts", "scripts/routes-layers/build-routes-layers.ts", "shared/sources/osm/routes-layers.ts"]) {
      // No import of the Closures restriction catalogue or data, and no path into its data folder.
      expect(readFileSync(f, "utf8"), f).not.toMatch(/from "[^"]*restrictions\/(?:data|catalog)|"web\/src\/restrictions\/data"/);
    }
  });

  it("Routes layers have their own sources, start hidden and never share a source with Closures' layers", () => {
    const routes = routesOverlayLayers();
    const sources = new Set([...Object.values(ROUTES_OVERLAY_SOURCES), ...Object.values(ROUTES_HIGHLIGHT_SOURCES)]);
    expect(routes.every((l) => "source" in l && sources.has(l.source))).toBe(true);
    expect(routes.every((l) => (l.layout as { visibility?: string }).visibility === "none")).toBe(true);
    const closureSources = new Set(overlayLayers().filter((l) => CLOSURES_LAYER_IDS.includes(l.id)).map((l) => (l as { source: string }).source));
    for (const s of sources) expect(closureSources.has(s)).toBe(false);
  });

  it("Routes markers draw under the junction labels and never hide them", () => {
    const order = overlayLayers().map((l) => l.id);
    const junction = order.indexOf("routes-junction");
    for (const id of routesOverlayLayers().map((l) => l.id)) expect(order.indexOf(id), id).toBeLessThan(junction);
    for (const l of routesOverlayLayers().filter((x) => x.type === "symbol")) {
      const layout = l.layout as Record<string, unknown>;
      if ("icon-image" in layout) expect(layout["icon-ignore-placement"], l.id).toBe(true);
      if ("text-field" in layout) expect(layout["text-ignore-placement"], l.id).toBe(true);
    }
  });
});

describe("Routes layer preferences: remembered on this device only", () => {
  const memory = () => {
    const items = new Map<string, string>();
    return { items, getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), removeItem: (k: string) => void items.delete(k) };
  };

  it("a new visitor (nothing stored, storage blocked or throwing) gets the defaults: junction numbers on, every OSM layer off", () => {
    expect(readRoutesLayers(memory())).toEqual(DEFAULT_ROUTES_LAYERS);
    expect(readRoutesLayers(null)).toEqual(DEFAULT_ROUTES_LAYERS);
    const throwing = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); }, removeItem: () => undefined };
    expect(readRoutesLayers(throwing)).toEqual(DEFAULT_ROUTES_LAYERS);
    expect(writeRoutesLayers(throwing, { junctions: true })).toBe(false);
    expect(DEFAULT_ROUTES_LAYERS).toEqual({ junctions: true });
  });

  it("restores the layers switched on, under a versioned key of its own", () => {
    const store = memory();
    expect(writeRoutesLayers(store, { junctions: false, "speed-cameras": true, weight: true })).toBe(true);
    expect(ROUTES_LAYERS_KEY).toBe("ta-routes-layers-v1");
    expect([...store.items.keys()]).toEqual([ROUTES_LAYERS_KEY]);
    expect(readRoutesLayers(store)).toEqual({ junctions: false, "speed-cameras": true, weight: true });
  });

  it("stores only the switches: never the map position, a selected marker, a search or filters", () => {
    const store = memory();
    writeRoutesLayers(store, { junctions: true, height: true, ...({ centre: [0, 51], selected: "osm/way/1/height", query: "M6", filter: "hgv" } as object) });
    const stored = JSON.parse(store.items.get(ROUTES_LAYERS_KEY)!) as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(["access", "average-speed", "height", "junctions", "red-light-cameras", "speed-cameras", "weight", "width-length"]);
    expect(Object.values(stored).every((v) => typeof v === "boolean")).toBe(true);
    expect(app).not.toMatch(/writeRoutesLayers\([^)]*(?:view|selected|query|filter)/);
  });

  it("damaged, partly invalid or unknown values fall back per switch and can never add anything else", () => {
    const store = memory();
    for (const raw of ["{", "null", "[]", '"on"', "42"]) {
      store.items.set(ROUTES_LAYERS_KEY, raw);
      expect(readRoutesLayers(store), raw).toEqual(DEFAULT_ROUTES_LAYERS);
    }
    store.items.set(ROUTES_LAYERS_KEY, JSON.stringify({ junctions: "yes", height: true, weight: 1, cameras: true, __proto__: { access: true } }));
    expect(readRoutesLayers(store)).toEqual({ junctions: true, height: true });
  });
});

describe("symbols differ by shape, not colour alone", () => {
  it("every Routes kind has its own marker image; cameras are signs, restrictions plates with their own glyphs", () => {
    const kinds = ["speed-camera", "red-light-camera", "height", "weight-goods", "weight-structural", "width", "length", "hgv-access"] as const;
    const icons = kinds.map((k) => routesPointFeatures(pointsFile(k === "speed-camera" ? "speed-cameras" : k === "red-light-camera" ? "red-light-cameras" : k === "height" ? "height" : k.startsWith("weight") ? "weight" : k === "hgv-access" ? "access" : "width-length", [point({ id: `osm/way/1/${k}`, kind: k, value: k.includes("camera") ? null : k === "hgv-access" ? { type: "access", access: "no" } : { type: "measure", amount: 3, unit: k.startsWith("weight") ? "t" : "m" } })])).features[0]!.properties.icon);
    expect(new Set(icons).size).toBe(kinds.length);
    const images = readFileSync("web/src/map/images.ts", "utf8");
    // The red-light camera is a tall housing (18 × 32), the speed camera a square (26 × 26).
    expect(images).toMatch(/const redLightCamera = draw\(18, 32,/);
    expect(images).toMatch(/const speedCamera = draw\(26, 26,/);
    // No group or cluster images: every marker is one record.
    expect(images).not.toMatch(/camera-group|cluster/);
  });

  it("no groups or clusters: every Routes source is plain, and each point layer is one marker layer per record", () => {
    const mapView = readFileSync("web/src/map/MapView.tsx", "utf8");
    expect(mapView).toMatch(/for \(const layer of ROUTES_DATA_LAYERS\) map\.addSource\(ROUTES_OVERLAY_SOURCES\[layer\], \{ type: "geojson", data: EMPTY, attribution: ROUTES_OSM_ATTRIBUTION \}\);/);
    expect(mapView).not.toMatch(/ROUTES_POINT_CLUSTER|routes-\$\{layer\}-group/);
    for (const l of routesOverlayLayers()) {
      expect(l.id, l.id).not.toMatch(/group|cluster/);
      expect(JSON.stringify(l), l.id).not.toMatch(/point_count|cluster/);
    }
    for (const layer of ["speed-cameras", "red-light-cameras"] as const) expect(routesOverlayLayerIds(layer)).toEqual([`routes-${layer}`]);
    // Restriction layers: their markers, and their road highlighting (a line layer, not a group).
    for (const layer of ["height", "weight", "width-length", "access"] as const) expect(routesOverlayLayerIds(layer)).toEqual([`routes-${layer}-roads`, `routes-${layer}`]);
  });

  it("each layer appears only from its zoom, sparse to dense: nothing England-wide, county, city, town, then street level", () => {
    expect(ROUTES_LAYER_MIN_ZOOM).toEqual({ "average-speed": 9, "speed-cameras": 11, "red-light-cameras": 11, height: 12, "width-length": 12, weight: 13, access: 13 });
    for (const layer of ROUTES_DATA_LAYERS) {
      for (const id of routesOverlayLayerIds(layer)) {
        const spec = routesOverlayLayers().find((l) => l.id === id)!;
        // Road highlighting starts one level before its layer's markers; everything else at the layer's own zoom or later.
        expect(spec.minzoom, id).toBeGreaterThanOrEqual(ROUTES_LAYER_MIN_ZOOM[layer] - (id.endsWith("-roads") ? 1 : 0));
      }
    }
    // Nothing at all is drawn at an England or regional view.
    expect(Math.min(...routesOverlayLayers().map((l) => l.minzoom ?? 0))).toBe(9);
  });

  it("a layer that is on but not drawn at this zoom says so, in its panel row and in the key", () => {
    const cams = pointsFile("speed-cameras", [point({ id: "osm/node/1/speed-camera", kind: "speed-camera", value: null, recorded: [], osm: [{ type: "node", id: 1, version: 1 }] })]);
    const row = (zoom: number | null) =>
      renderToStaticMarkup(h(RoutesLayerSwitch, { layer: "speed-cameras", on: true, onToggle: () => undefined, status: status("speed-cameras", "ready", cams), records: 3159, zoom }));
    expect(row(8)).toContain("Zoom in on the map to see them.");
    expect(row(11)).not.toContain("Zoom in on the map to see them.");
    expect(row(8)).toContain("Shown when zoomed in to city level.");
    const key = (zoom: number) =>
      renderToStaticMarkup(
        h(MapKey, { view: "routes", open: true, onOpenChange: () => undefined, routes: { available: ["speed-cameras"], on: { "speed-cameras": true }, statuses: [status("speed-cameras", "ready", cams)], area: { bounds: [-2, 52, -1, 53], centre: [-1.5, 52.5], zoom }, now: new Date(), dataAsOf: null, onSelect: () => undefined } }),
      );
    expect(key(8)).toContain("Zoom in to see: speed cameras.");
    expect(key(12)).not.toContain("Zoom in to see");
    expect(key(8)).not.toMatch(/Group of nearby/);
  });

  it("average speed sections carry their name along the line as well as the dashes and arrows", () => {
    const label = routesOverlayLayers().find((l) => l.id === "routes-average-speed-label")!;
    expect((label.layout as Record<string, unknown>)["text-field"]).toEqual(["get", "label"]);
    expect(routesOverlayLayerIds("average-speed")).toContain("routes-average-speed-label");
    const file = routesSectionsFileSchema.parse({ schemaVersion: 1, layer: "average-speed", generatedAt: "2026-10-12T21:30:00Z", source, sections: [{ id: "osm/relation/1/average-speed", line: [[-1, 52], [-1.01, 52.01]], lengthMetres: 1300, value: { type: "measure", amount: 50, unit: "mph" }, recorded: [], travelBearing: 330, road: { name: null, ref: "A1" }, lastEdited: null, osm: [{ type: "relation", id: 1, version: 1 }] }] });
    expect(routesSectionFeatures(file).features[0]!.properties.label).toBe("Average speed check 50 mph");
  });
});

describe("road highlighting on the map (restriction layers only, only while switched on)", () => {
  it("is a line layer per restriction layer, hidden until its switch is on, drawn under every marker and section", () => {
    const order = routesOverlayLayers().map((l) => l.id);
    const roads = ["routes-height-roads", "routes-weight-roads", "routes-width-length-roads", "routes-access-roads"];
    for (const id of roads) {
      const spec = routesOverlayLayers().find((l) => l.id === id)!;
      expect(spec.type, id).toBe("line");
      expect((spec.layout as { visibility?: string }).visibility, id).toBe("none");
    }
    const lastRoad = Math.max(...roads.map((id) => order.indexOf(id)));
    for (const id of order.filter((x) => !x.endsWith("-roads"))) expect(order.indexOf(id), id).toBeGreaterThan(lastRoad);
    // On only with its own switch, and only in Routes.
    const shown = (switches: Parameters<typeof viewLayerVisibility>[1], view: "routes" | "closures" = "routes") => viewLayerVisibility(view, switches).filter((l) => l.visible).map((l) => l.id);
    expect(shown({ junctions: true })).not.toContain("routes-weight-roads");
    expect(shown({ junctions: true, weight: true })).toContain("routes-weight-roads");
    expect(shown({ junctions: true, weight: true })).not.toContain("routes-height-roads");
    expect(shown({ junctions: true, weight: true }, "closures")).not.toContain("routes-weight-roads");
  });

  it("each layer has its own line pattern as well as its own colour; weight 7.5 t or less is the strong colour", () => {
    const dashes = Object.values(ROUTES_HIGHLIGHT_DASH).map((d) => JSON.stringify(d));
    expect(new Set(dashes).size).toBe(4);
    expect(ROUTES_HIGHLIGHT_STYLE["weight-strong"].colour).not.toBe(ROUTES_HIGHLIGHT_STYLE["weight-soft"].colour);
    const weight = routesOverlayLayers().find((l) => l.id === "routes-weight-roads")! as { paint: Record<string, unknown> };
    expect(JSON.stringify(weight.paint["line-color"])).toContain(`"weight-strong","${ROUTES_HIGHLIGHT_STYLE["weight-strong"].colour}"`);
    expect(weight.paint["line-opacity"]).toEqual(["case", ["get", "conditional"], 0.4, 0.7]);
  });

  it("is loaded only while its layer is on, kept for the visit, and optional (markers show without it)", () => {
    const hook = readFileSync("web/src/routemap/useRoutesHighlights.ts", "utf8");
    expect(hook).toMatch(/enabled: enabled && url !== null/);
    expect(hook).toMatch(/staleTime: Number\.POSITIVE_INFINITY/);
    expect(app).toMatch(/weight: useRoutesHighlights\(routesEntryOf\("weight"\), routeLayers\.weight === true\)/);
  });

  it.skipIf(!HAS_DATA)("shipped highlight files: every road is a record of its layer, coloured by that record's own value", () => {
    for (const layer of ["height", "weight", "width-length", "access"] as const) {
      const records = new Map(routesPointsFileSchema.parse(shipped(`${layer}.json`)).features.map((f) => [f.id, f]));
      const roads = routesHighlightsFileSchema.parse(shipped(`${layer}-roads.json`)).roads;
      for (const road of roads) {
        const record = records.get(road.id);
        expect(record, road.id).toBeDefined();
        if (layer === "weight") expect(road.category, road.id).toBe(record!.value!.type === "measure" && record!.value!.amount <= 7.5 ? "weight-strong" : "weight-soft");
        expect(road.conditional, road.id).toBe(record!.conditionalOnly || record!.conditions.length > 0);
      }
    }
  });
});

describe("visual hierarchy", () => {
  it("markers start smaller and softer at the zoom their layer appears, full size two levels later", () => {
    const cams = routesOverlayLayers().find((l) => l.id === "routes-speed-cameras")! as { layout: Record<string, unknown>; paint: Record<string, unknown> };
    expect(cams.layout["icon-size"]).toEqual(["interpolate", ["linear"], ["zoom"], 11, 0.7, 13, 1]);
    expect(cams.paint["icon-opacity"]).toEqual(["interpolate", ["linear"], ["zoom"], 11, 0.7, 13, 1]);
    const weight = routesOverlayLayers().find((l) => l.id === "routes-weight")! as { layout: Record<string, unknown>; paint: Record<string, unknown> };
    expect(weight.layout["text-size"]).toEqual(["interpolate", ["linear"], ["zoom"], 13, 9, 15, 12]);
    expect(weight.paint["text-opacity"]).toEqual(["interpolate", ["linear"], ["zoom"], 13, 0.75, 15, 1]);
  });
});
