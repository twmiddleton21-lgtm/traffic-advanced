import type { ExpressionSpecification, FilterSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";

/**
 * Traffic Advanced map layers as plain data, so they can be tested without a browser.
 *
 * Draw order (bottom → top) gives the label priority asked for: MapLibre places symbols from the top layer down, so a higher
 * layer wins a label collision.
 *   base map → road emphasis lines → closures → closure markers → B-road/A-road numbers → junction numbers → primary-route and
 *   motorway numbers → diversion route → direction arrows → diversion start/rejoin → selected closure → its confirmed junctions
 */
export type Theme = "light" | "dark";

export const COLOURS = {
  sign: "#ffd200",
  ink: "#14191e",
  closure: "#c8102e",
  unmatched: "#5b6770",
  motorway: { light: "#0b4f9c", dark: "#4a8fe0" },
  primaryRoute: { light: "#00703c", dark: "#2fa66a" },
} as const;

const FONT_BOLD = ["Noto Sans Bold"];
const NONE = "__none__";

/** The base map's vector source (OpenMapTiles schema, served by OpenFreeMap). */
export const BASE_SOURCE = "openmaptiles";

/** Road classes in OpenMapTiles: UK motorways are `motorway`, primary routes (green signs) `trunk`, other A roads `primary`. */
const roadRef = (cls: string): FilterSpecification => ["all", ["==", ["get", "class"], cls], ["has", "ref"], ["<=", ["get", "ref_length"], 8]];

/** Road emphasis drawn under the base map's labels: motorways blue and primary routes green, as on UK signs. */
export function roadEmphasisLayers(theme: Theme): LayerSpecification[] {
  const width: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 5, 0.8, 9, 2, 12, 3.5, 15, 7];
  return [
    {
      id: "ta-road-trunk",
      type: "line",
      source: BASE_SOURCE,
      "source-layer": "transportation",
      minzoom: 7,
      filter: ["all", ["==", ["get", "class"], "trunk"], ["!=", ["get", "ramp"], 1]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": COLOURS.primaryRoute[theme], "line-width": width, "line-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.25, 10, theme === "dark" ? 0.55 : 0.45] },
    },
    {
      id: "ta-road-motorway",
      type: "line",
      source: BASE_SOURCE,
      "source-layer": "transportation",
      minzoom: 5,
      filter: ["all", ["==", ["get", "class"], "motorway"], ["!=", ["get", "ramp"], 1]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": COLOURS.motorway[theme], "line-width": width, "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.3, 9, theme === "dark" ? 0.7 : 0.55] },
    },
  ];
}

const shield = (id: string, cls: string, image: string, textColour: string, minzoom: number, size: ExpressionSpecification): LayerSpecification => ({
  id,
  type: "symbol",
  source: BASE_SOURCE,
  "source-layer": "transportation_name",
  minzoom,
  filter: roadRef(cls),
  layout: {
    "symbol-placement": "line",
    "symbol-spacing": ["interpolate", ["linear"], ["zoom"], 6, 250, 12, 400],
    "text-field": ["get", "ref"],
    "text-font": FONT_BOLD,
    "text-size": size,
    "text-rotation-alignment": "viewport",
    "icon-rotation-alignment": "viewport",
    "icon-image": image,
    "icon-text-fit": "both",
    "icon-text-fit-padding": [2, 5, 2, 5],
    "text-padding": 6,
  },
  paint: { "text-color": textColour },
});

/** Road numbers in UK sign colours: motorway white on blue, primary route yellow on green, other A roads black on white. */
export function roadNumberLayers(): { low: LayerSpecification[]; high: LayerSpecification[] } {
  const big: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 6, 11, 12, 13];
  const small: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 9, 10, 14, 12];
  return {
    low: [
      {
        id: "ta-ref-secondary",
        type: "symbol",
        source: BASE_SOURCE,
        "source-layer": "transportation_name",
        minzoom: 11,
        filter: roadRef("secondary"),
        layout: { "symbol-placement": "line", "symbol-spacing": 350, "text-field": ["get", "ref"], "text-font": FONT_BOLD, "text-size": small, "text-rotation-alignment": "viewport" },
        paint: { "text-color": COLOURS.ink, "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      },
      shield("ta-ref-primary", "primary", "ta-shield-white", COLOURS.ink, 9, small),
    ],
    high: [shield("ta-ref-trunk", "trunk", "ta-shield-green", COLOURS.sign, 7, big), shield("ta-ref-motorway", "motorway", "ta-shield-blue", "#ffffff", 5, big)],
  };
}

const junctionText: ExpressionSpecification = ["step", ["zoom"], ["get", "short"], 12, ["get", "name"]];

/** NH junction numbers: white on black, like the junction number box on UK direction signs. */
export const junctionLayer: LayerSpecification = {
  id: "ta-junction",
  type: "symbol",
  source: "junctions",
  minzoom: 9,
  layout: {
    "text-field": junctionText,
    "text-font": FONT_BOLD,
    "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 14, 12],
    "icon-image": "ta-junction",
    "icon-text-fit": "both",
    "icon-text-fit-padding": [1, 4, 1, 4],
    "text-padding": 4,
  },
  paint: { "text-color": "#ffffff" },
};

/** Closures, markers and the selected closure. `selectedId` is applied with setFilter/setPaintProperty on selection change. */
export function closureLayers(): { base: LayerSpecification[]; selected: LayerSpecification[] } {
  const isSelected = (id: string): FilterSpecification => ["==", ["get", "id"], id];
  return {
    base: [
      { id: "closure-halo", type: "line", source: "closures", layout: { "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 } },
      { id: "closure-line", type: "line", source: "closures", layout: { "line-cap": "round" }, paint: { "line-color": COLOURS.closure, "line-width": 4 } },
      {
        id: "marker",
        type: "circle",
        source: "markers",
        paint: { "circle-radius": 10, "circle-color": ["match", ["get", "cls"], "D", COLOURS.unmatched, COLOURS.sign], "circle-stroke-color": COLOURS.ink, "circle-stroke-width": 2 },
      },
      {
        id: "marker-label",
        type: "symbol",
        source: "markers",
        layout: { "text-field": ["get", "cls"], "text-font": FONT_BOLD, "text-size": 12, "text-allow-overlap": true },
        paint: { "text-color": ["match", ["get", "cls"], "D", "#ffffff", COLOURS.ink] },
      },
    ],
    selected: [
      { id: "selected-closure-halo", type: "line", source: "closures", filter: isSelected(NONE), layout: { "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": 13 } },
      { id: "selected-closure-line", type: "line", source: "closures", filter: isSelected(NONE), layout: { "line-cap": "round" }, paint: { "line-color": COLOURS.closure, "line-width": 8 } },
      {
        id: "selected-marker",
        type: "circle",
        source: "markers",
        filter: isSelected(NONE),
        paint: { "circle-radius": 14, "circle-color": ["match", ["get", "cls"], "D", COLOURS.unmatched, COLOURS.sign], "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 },
      },
      {
        id: "selected-marker-label",
        type: "symbol",
        source: "markers",
        filter: isSelected(NONE),
        layout: {
          "text-field": ["format", ["get", "cls"], { "font-scale": 1.1 }, "  ", {}, ["get", "title"], { "font-scale": 0.95 }],
          "text-font": FONT_BOLD,
          "text-size": 13,
          "text-anchor": "left",
          "text-max-width": 30,
          "text-offset": [-0.38, 0],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": COLOURS.ink, "text-halo-color": "#ffffff", "text-halo-width": 2 },
      },
    ],
  };
}

/**
 * The selected B closure's official diversion. Arrows use MapLibre line placement with `icon-keep-upright: false` and
 * map-aligned rotation, so each arrow points along the line in its vertex order: the direction of travel (see layers.ts
 * RouteFeatureProps.directional). Spacing is in screen pixels, so arrows thin out or fill in automatically with zoom.
 */
export function diversionLayers(): LayerSpecification[] {
  const route: FilterSpecification = ["==", ["get", "kind"], "route"];
  return [
    { id: "route-casing", type: "line", source: "selected-route", filter: route, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": COLOURS.ink, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 7, 14, 12] } },
    { id: "route-line", type: "line", source: "selected-route", filter: route, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": COLOURS.sign, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 4, 14, 8] } },
    {
      id: "route-arrows",
      type: "symbol",
      source: "selected-route",
      filter: ["all", route, ["==", ["get", "directional"], true]],
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": ["interpolate", ["linear"], ["zoom"], 8, 90, 14, 170],
        "icon-image": "ta-arrow",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 14, 1.2],
        "icon-rotation-alignment": "map",
        "icon-keep-upright": false,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    },
    {
      id: "route-ends",
      type: "circle",
      source: "route-ends",
      paint: {
        "circle-radius": 7,
        "circle-color": ["match", ["get", "role"], "start", "#ffffff", COLOURS.ink],
        "circle-stroke-color": ["match", ["get", "role"], "start", COLOURS.ink, "#ffffff"],
        "circle-stroke-width": 3,
      },
    },
    {
      id: "route-ends-label",
      type: "symbol",
      source: "route-ends",
      layout: {
        "text-field": ["get", "label"],
        "text-font": FONT_BOLD,
        "text-size": 13,
        "text-variable-anchor": ["left", "right", "top", "bottom"],
        "text-radial-offset": 1,
        "text-allow-overlap": true,
      },
      paint: { "text-color": COLOURS.ink, "text-halo-color": COLOURS.sign, "text-halo-width": 2.5 },
    },
  ];
}

/** The selected closure's confirmed junctions (B only), always labelled in full. Filter set on selection change. */
export const confirmedJunctionLayer: LayerSpecification = {
  id: "ta-junction-confirmed",
  type: "symbol",
  source: "junctions",
  filter: ["in", ["get", "name"], ["literal", []]],
  layout: {
    "text-field": ["get", "name"],
    "text-font": FONT_BOLD,
    "text-size": 14,
    "icon-image": "ta-junction",
    "icon-text-fit": "both",
    "icon-text-fit-padding": [2, 6, 2, 6],
    "text-allow-overlap": true,
    "icon-allow-overlap": true,
  },
  paint: { "text-color": "#ffffff" },
};

export const confirmedJunctionFilter = (names: string[]): FilterSpecification => ["in", ["get", "name"], ["literal", names]];
export const selectedFilter = (id: string | null): FilterSpecification => ["==", ["get", "id"], id ?? NONE];

/**
 * Base-map adjustments: hide its own road-number labels (ours replace them) and hold street-name labels back until zoom 13,
 * so the map doesn't become a wall of labels. Returns the changes rather than applying them, for testing.
 */
export function baseLabelAdjustments(style: Pick<StyleSpecification, "layers">): { hide: string[]; minzoom: { id: string; zoom: number }[] } {
  const hide: string[] = [];
  const minzoom: { id: string; zoom: number }[] = [];
  for (const layer of style.layers) {
    if (layer.type !== "symbol" || layer["source-layer"] !== "transportation_name") continue;
    if (JSON.stringify(layer.layout?.["text-field"] ?? "").includes('"ref"')) hide.push(layer.id);
    else if ((layer.minzoom ?? 0) < 13) minzoom.push({ id: layer.id, zoom: 13 });
  }
  return { hide, minzoom };
}

/** All Traffic Advanced overlay layers in draw order (bottom → top), added on top of the base map. */
export function overlayLayers(): LayerSpecification[] {
  const closure = closureLayers();
  const roads = roadNumberLayers();
  return [...closure.base, ...roads.low, junctionLayer, ...roads.high, ...diversionLayers(), ...closure.selected, confirmedJunctionLayer];
}

/**
 * Where road emphasis goes: above the base map's own road lines but under the labels that follow them. (The first symbol layer
 * is not enough: the dark style puts water names below its buildings and roads.)
 */
export function roadEmphasisBeforeId(style: Pick<StyleSpecification, "layers">): string | undefined {
  const lastRoad = style.layers.findLastIndex((l) => l.type === "line" && "source-layer" in l && l["source-layer"] === "transportation");
  return style.layers.slice(lastRoad + 1).find((l) => l.type === "symbol")?.id;
}
