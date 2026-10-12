import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { ExpressionSpecification, LayerSpecification } from "maplibre-gl";
import type { RoutesHighlightCategory, RoutesHighlightLayer, RoutesHighlightsFile } from "../../../shared/api/routes-highlights.ts";
import type { RoutesDataLayer, RoutesPoint, RoutesPointKind, RoutesPointsFile, RoutesSectionsFile } from "../../../shared/api/routes-layers.ts";
import { routesMarkerText } from "../routemap/describe.ts";

/**
 * The Routes map's OpenStreetMap layers as plain data (tested without a browser). Each layer has its own source and its own map
 * layers, shown or hidden with `visibility` only, so switching one never touches another layer, the base map, the junction labels
 * or anything in the Closures view (whose layers never use these sources).
 *
 * Legibility: there are no groups or clusters. Every marker is one record, and each layer appears only once the map is zoomed in far
 * enough for its records to be read on their own (ROUTES_LAYER_MIN_ZOOM): nothing at an England or regional view, the few average
 * speed sections at county level, cameras at city level, heights and widths at town level, and the dense weight and lorry access
 * limits at street level. Markers draw under the junction labels (style.ts overlayLayers) and never take their place: they may
 * overlap other symbols but don't block them (`*-ignore-placement`), and they are never hidden by a collision, so a record that is
 * in view is always drawn.
 */
export const ROUTES_OVERLAY_SOURCES: Record<RoutesDataLayer, string> = {
  "speed-cameras": "routes-speed-cameras",
  "average-speed": "routes-average-speed",
  "red-light-cameras": "routes-red-light-cameras",
  height: "routes-height",
  weight: "routes-weight",
  "width-length": "routes-width-length",
  access: "routes-access",
};

/**
 * The zoom each layer appears from, sparse to dense. Below it the layer draws nothing (its switch, data and details are unchanged;
 * the Layers panel and the map key say to zoom in). Zoom 9 is about a county, 11 a city, 12 a town, 13 streets.
 */
export const ROUTES_LAYER_MIN_ZOOM: Record<RoutesDataLayer, number> = {
  "average-speed": 9,
  "speed-cameras": 11,
  "red-light-cameras": 11,
  height: 12,
  "width-length": 12,
  weight: 13,
  access: 13,
};
/** The words for each threshold, for the Layers panel and the key. */
export const ZOOM_LEVEL_WORDS: Record<number, string> = { 9: "county", 11: "city", 12: "town", 13: "street" };

export const AVERAGE_SPEED_COLOUR = "#6a1b9a";

/**
 * Road highlighting, drawn only while its restriction layer is on (shared/api/routes-highlights.ts): the roads a record was mapped
 * on, like an HGV navigation app. Each layer differs by line pattern as well as colour, so they never rely on colour alone; weight
 * limits of 7.5 t or less are the strong warning colour, higher limits a softer one. Roads whose record has conditions or exemptions
 * are drawn fainter (their markers carry "*"). Colours are chosen to read on both the light and the dark base map.
 */
export const ROUTES_HIGHLIGHT_STYLE: Record<RoutesHighlightCategory, { colour: string; label: string }> = {
  "weight-strong": { colour: "#e03131", label: "Weight limit 7.5 t or less" },
  "weight-soft": { colour: "#f08c00", label: "Weight limit above 7.5 t" },
  height: { colour: "#ae3ec9", label: "Height limit" },
  "width-length": { colour: "#0c8599", label: "Width or length limit" },
  access: { colour: "#d6336c", label: "Lorry access restriction" },
};
/** Line patterns, one per layer (MapLibre's line dash in line widths; none = solid). */
export const ROUTES_HIGHLIGHT_DASH: Record<RoutesHighlightLayer, number[] | null> = { weight: null, height: [2, 1], "width-length": [1, 1], access: [3, 1, 1, 1] };
export const ROUTES_HIGHLIGHT_SOURCES: Record<RoutesHighlightLayer, string> = {
  height: "routes-roads-height",
  weight: "routes-roads-weight",
  "width-length": "routes-roads-width-length",
  access: "routes-roads-access",
};
/** Highlighting starts one zoom level before the layer's markers, so the roads show where the limits are as the markers arrive. */
export const routesHighlightMinZoom = (layer: RoutesHighlightLayer) => ROUTES_LAYER_MIN_ZOOM[layer] - 1;
const HIGHLIGHTED_LAYERS: readonly RoutesHighlightLayer[] = ["height", "weight", "width-length", "access"];
const isHighlighted = (layer: RoutesDataLayer): layer is RoutesHighlightLayer => (HIGHLIGHTED_LAYERS as readonly string[]).includes(layer);

export function routesHighlightFeatures(file: RoutesHighlightsFile): FeatureCollection<LineString, { id: string; category: RoutesHighlightCategory; conditional: boolean }> {
  return {
    type: "FeatureCollection",
    features: file.roads.map((r) => ({ type: "Feature", geometry: { type: "LineString", coordinates: r.line.map(([x, y]) => [x, y]) }, properties: { id: r.id, category: r.category, conditional: r.conditional } })),
  };
}

/** One highlight line layer per restriction layer, hidden until its switch is on. Drawn under every marker and section. */
export function routesHighlightLayers(): LayerSpecification[] {
  return HIGHLIGHTED_LAYERS.map((layer): LayerSpecification => {
    const dash = ROUTES_HIGHLIGHT_DASH[layer];
    return {
      id: `routes-${layer}-roads`,
      type: "line",
      source: ROUTES_HIGHLIGHT_SOURCES[layer],
      minzoom: routesHighlightMinZoom(layer),
      layout: { ...hidden, "line-cap": dash ? "butt" : "round", "line-join": "round" },
      paint: {
        "line-color": ["match", ["get", "category"], ...Object.entries(ROUTES_HIGHLIGHT_STYLE).flatMap(([k, v]) => [k, v.colour]), "#888888"] as unknown as ExpressionSpecification,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 13, 4, 16, 9],
        "line-opacity": ["case", ["get", "conditional"], 0.4, 0.7],
        ...(dash ? { "line-dasharray": dash } : {}),
      },
    };
  });
}

/** The marker image for a kind: plates with a glyph and a dashed border (community data), or a camera sign. images.ts draws them. */
export function routesIcon(kind: RoutesPointKind): string {
  switch (kind) {
    case "speed-camera":
      return "ta-routes-speed-camera";
    case "red-light-camera":
      return "ta-routes-red-light-camera";
    case "height":
      return "ta-r-height-community";
    case "weight-goods":
      return "ta-r-weight-goods-community";
    case "weight-structural":
      return "ta-r-weight-structural-community";
    case "width":
      return "ta-routes-width";
    case "length":
      return "ta-routes-length";
    case "hgv-access":
      return "ta-routes-hgv-access";
  }
}

export interface RoutesFeatureProps {
  id: string;
  icon: string;
  /** The plate's text (empty for cameras, which are a sign without a value). */
  text: string;
  /** Lower draws first: lower limits and outright bans before advisories. */
  sort: number;
}

const ACCESS_SORT = { no: 0, delivery: 1, destination: 2, discouraged: 3 } as const;

export function routesPointFeatures(file: RoutesPointsFile): FeatureCollection<Point, RoutesFeatureProps> {
  return {
    type: "FeatureCollection",
    features: file.features.map(
      (p: RoutesPoint): Feature<Point, RoutesFeatureProps> => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.position[0], p.position[1]] },
        properties: {
          id: p.id,
          icon: routesIcon(p.kind),
          text: routesMarkerText(p),
          sort: p.value?.type === "measure" ? p.value.amount : p.value?.type === "access" ? ACCESS_SORT[p.value.access] : 0,
        },
      }),
    ),
  };
}

export function routesSectionFeatures(file: RoutesSectionsFile): FeatureCollection<LineString, { id: string; label: string }> {
  return {
    type: "FeatureCollection",
    features: file.sections.map((s) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: s.line.map(([x, y]) => [x, y]) },
      // The limit is the road's mapped limit (as in the details), never a lorry limit.
      properties: { id: s.id, label: s.value ? `Average speed check ${s.value.amount} mph` : "Average speed check" },
    })),
  };
}

const hidden = { visibility: "none" } as const;
const FONT_BOLD = ["Noto Sans Bold"];
/** Markers start smaller and softer at the zoom their layer first appears, and reach full size and strength two levels later. */
const easeIn = (from: number, start: number, end: number): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], from, start, from + 2, end];

const isCameraLayer = (layer: RoutesDataLayer) => layer === "speed-cameras" || layer === "red-light-cameras";

/** A point layer: one marker per record (a plate with its value, or a camera sign), from its layer's zoom. No groups or clusters. */
export function routesPointLayers(layer: Exclude<RoutesDataLayer, "average-speed">): LayerSpecification[] {
  const camera = isCameraLayer(layer);
  return [
    {
      id: `routes-${layer}`,
      type: "symbol",
      source: ROUTES_OVERLAY_SOURCES[layer],
      minzoom: ROUTES_LAYER_MIN_ZOOM[layer],
      layout: camera
        ? { ...hidden, "icon-image": ["get", "icon"], "icon-size": easeIn(ROUTES_LAYER_MIN_ZOOM[layer], 0.7, 1), "icon-allow-overlap": true, "icon-ignore-placement": true }
        : {
            ...hidden,
            "symbol-sort-key": ["get", "sort"],
            "icon-image": ["get", "icon"],
            "icon-text-fit": "both",
            "icon-text-fit-padding": [3, 5, 3, 5],
            "text-field": ["get", "text"],
            "text-font": FONT_BOLD,
            "text-size": easeIn(ROUTES_LAYER_MIN_ZOOM[layer], 9, 12),
            "text-padding": 2,
            "icon-allow-overlap": true,
            "text-allow-overlap": true,
            "icon-ignore-placement": true,
            "text-ignore-placement": true,
          },
      paint: camera
        ? { "icon-opacity": easeIn(ROUTES_LAYER_MIN_ZOOM[layer], 0.7, 1) }
        : { "text-color": "#14191e", "icon-opacity": easeIn(ROUTES_LAYER_MIN_ZOOM[layer], 0.75, 1), "text-opacity": easeIn(ROUTES_LAYER_MIN_ZOOM[layer], 0.75, 1) },
    },
  ];
}

/** Average speed sections: a dashed line with arrows in the direction of travel the check covers. */
export function routesSectionLayers(): LayerSpecification[] {
  const source = ROUTES_OVERLAY_SOURCES["average-speed"];
  return [
    {
      id: "routes-average-speed-casing",
      type: "line",
      source,
      minzoom: ROUTES_LAYER_MIN_ZOOM["average-speed"],
      layout: { ...hidden, "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 5, 14, 9] },
    },
    {
      id: "routes-average-speed",
      type: "line",
      source,
      minzoom: ROUTES_LAYER_MIN_ZOOM["average-speed"],
      layout: { ...hidden, "line-cap": "butt", "line-join": "round" },
      paint: { "line-color": AVERAGE_SPEED_COLOUR, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 5], "line-dasharray": [2, 1] },
    },
    {
      id: "routes-average-speed-arrows",
      type: "symbol",
      source,
      minzoom: 11,
      layout: { ...hidden, "symbol-placement": "line", "symbol-spacing": 140, "icon-image": "ta-arrow", "icon-size": 0.6, "icon-allow-overlap": true, "icon-ignore-placement": true },
    },
    {
      // The words along the line, so a section reads as an average speed check without the key (not by colour or dashes alone).
      id: "routes-average-speed-label",
      type: "symbol",
      source,
      minzoom: 12,
      layout: {
        ...hidden,
        "symbol-placement": "line",
        "symbol-spacing": 400,
        "text-field": ["get", "label"],
        "text-font": FONT_BOLD,
        "text-size": 12,
        "text-offset": [0, -1.1],
        "text-keep-upright": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": AVERAGE_SPEED_COLOUR, "text-halo-color": "#ffffff", "text-halo-width": 2 },
    },
  ];
}

/** Every Routes overlay layer, bottom to top: road highlighting under everything, sections under markers, restrictions under cameras. */
export function routesOverlayLayers(): LayerSpecification[] {
  return [
    ...routesHighlightLayers(),
    ...routesSectionLayers(),
    ...routesPointLayers("access"),
    ...routesPointLayers("weight"),
    ...routesPointLayers("width-length"),
    ...routesPointLayers("height"),
    ...routesPointLayers("red-light-cameras"),
    ...routesPointLayers("speed-cameras"),
  ];
}

/** The map layers belonging to one Routes data layer, for switching it on and off. */
export function routesOverlayLayerIds(layer: RoutesDataLayer): string[] {
  if (layer === "average-speed") return ["routes-average-speed-casing", "routes-average-speed", "routes-average-speed-arrows", "routes-average-speed-label"];
  return isHighlighted(layer) ? [`routes-${layer}-roads`, `routes-${layer}`] : [`routes-${layer}`];
}

/** The map layers that open a record's details when tapped. */
export const ROUTES_TAP_LAYERS: Record<RoutesDataLayer, string> = {
  "speed-cameras": "routes-speed-cameras",
  "average-speed": "routes-average-speed",
  "red-light-cameras": "routes-red-light-cameras",
  height: "routes-height",
  weight: "routes-weight",
  "width-length": "routes-width-length",
  access: "routes-access",
};

/** The map credit while any of these layers is on (MapLibre shows a source's attribution only while its layers are visible). */
export const ROUTES_OSM_ATTRIBUTION = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> (ODbL): Routes layers';
