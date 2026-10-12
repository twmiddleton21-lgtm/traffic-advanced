import type { ExpressionSpecification, LayerSpecification } from "maplibre-gl";

/**
 * Layers used only by the Routes view. They have their own sources, so nothing here can change what the Closures view draws.
 * Each overlay is listed in ROUTES_LAYER_IDS and shown only in Routes (viewLayers.ts). The first release has junction numbers only:
 * live traffic is deferred and kept apart in web/src/deferred/traffic/, which the app doesn't import.
 */
export const ROUTES_JUNCTION_SOURCE = "routes-junctions";

/** Junction numbers in the junction-number box of UK direction signs: "J4" when zoomed out, "M6 J4" from zoom 11. */
export const routesJunctionLayer: LayerSpecification = {
  id: "routes-junction",
  type: "symbol",
  source: ROUTES_JUNCTION_SOURCE,
  minzoom: 8,
  layout: {
    visibility: "none",
    "text-field": ["step", ["zoom"], ["get", "short"], 11, ["get", "name"]] as ExpressionSpecification,
    "text-font": ["Noto Sans Bold"],
    "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 14, 13],
    "icon-image": "ta-junction",
    "icon-text-fit": "both",
    "icon-text-fit-padding": [1, 4, 1, 4],
    "text-padding": 4,
  },
  paint: { "text-color": "#ffffff" },
};

export const ROUTES_LAYER_IDS = [routesJunctionLayer.id] as const;
