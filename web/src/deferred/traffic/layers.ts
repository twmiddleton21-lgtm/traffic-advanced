import type { ExpressionSpecification, FilterSpecification, LayerSpecification, VectorSourceSpecification } from "maplibre-gl";
import { TRAFFIC_MAX_ZOOM, TRAFFIC_MIN_ZOOM, TRAFFIC_TILE_PREFIX } from "../../../../shared/api/traffic.ts";

/**
 * DEFERRED (not in the first release; README.md here). Live traffic map layers for the Routes view: TomTom flow tiles through our
 * Worker (/api/traffic/flow/…, never TomTom directly; shared/api/traffic.ts). Tiles are fetched only from zoom 7 to 13 and stretched
 * beyond, and only while a traffic layer is visible: MapLibre doesn't load a source whose layers are all hidden. `r` changes only on
 * the 10-minute refresh (traffic.ts).
 */
export const TRAFFIC_SOURCE = "routes-traffic";
export const trafficTileUrl = (refresh: number) => `${TRAFFIC_TILE_PREFIX}{z}/{x}/{y}?r=${refresh}`;
export const trafficSource = (refresh: number): VectorSourceSpecification => ({
  type: "vector",
  tiles: [trafficTileUrl(refresh)],
  minzoom: TRAFFIC_MIN_ZOOM,
  maxzoom: TRAFFIC_MAX_ZOOM,
});
/** TomTom's vector layer name for flow (Orbis vector flow tiles). */
const FLOW = "Traffic flow";

/** Main roads only, so the map stays readable: TomTom's road categories. */
const MAIN_ROADS: FilterSpecification = ["in", ["get", "road_category"], ["literal", ["motorway", "trunk", "primary", "secondary"]]];

/**
 * Congestion by TomTom's `relative_speed` (current speed ÷ free-flow speed, 0–1). Bands, and the legend's wording, in
 * TRAFFIC_BANDS. Slower traffic is also drawn wider, so the bands differ by more than colour.
 */
export const TRAFFIC_BANDS = [
  { below: 0.25, colour: "#7a0019", label: "Stationary or very slow", width: 1.6 },
  { below: 0.5, colour: "#d7191c", label: "Heavy", width: 1.35 },
  { below: 0.75, colour: "#f28c00", label: "Slow", width: 1.15 },
  { below: Number.POSITIVE_INFINITY, colour: "#1a9850", label: "Free flowing", width: 1 },
] as const;
const speed: ExpressionSpecification = ["to-number", ["get", "relative_speed"], 1];
const band = (pick: (b: (typeof TRAFFIC_BANDS)[number]) => string | number): ExpressionSpecification => [
  "step",
  speed,
  pick(TRAFFIC_BANDS[0]),
  ...TRAFFIC_BANDS.slice(0, -1).flatMap((b, i) => [b.below, pick(TRAFFIC_BANDS[i + 1]!)]),
] as ExpressionSpecification;
const WIDTH_STOPS = [7, 1.5, 10, 2.5, 13, 4, 16, 7] as const;
const baseWidth: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], ...WIDTH_STOPS];
/** MapLibre allows ["zoom"] only at the top of an interpolate: the band's width factor goes inside each zoom stop. */
const bandWidth: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  ...WIDTH_STOPS.flatMap((v, i): (number | ExpressionSpecification)[] => (i % 2 === 0 ? [v] : [["*", v, band((b) => b.width)]])),
] as ExpressionSpecification;

export const trafficLayers: LayerSpecification[] = [
  {
    id: "routes-traffic",
    type: "line",
    source: TRAFFIC_SOURCE,
    "source-layer": FLOW,
    minzoom: TRAFFIC_MIN_ZOOM,
    filter: ["all", MAIN_ROADS, ["!", ["has", "road_closure"]]],
    layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
    paint: { "line-color": band((b) => b.colour), "line-width": bandWidth, "line-opacity": 0.9 },
  },
  {
    // A closure TomTom reports: a dashed dark line (not National Highways' closure data, which is in the Closures view).
    id: "routes-traffic-closed",
    type: "line",
    source: TRAFFIC_SOURCE,
    "source-layer": FLOW,
    minzoom: TRAFFIC_MIN_ZOOM,
    filter: ["all", MAIN_ROADS, ["has", "road_closure"]],
    layout: { visibility: "none", "line-cap": "butt", "line-join": "round" },
    paint: { "line-color": "#14191e", "line-width": baseWidth, "line-dasharray": [1.5, 1] },
  },
];

export const TRAFFIC_LAYER_IDS = trafficLayers.map((l) => l.id);
