import { ROUTES_DATA_LAYERS, type RoutesDataLayer } from "../../../shared/api/routes-layers.ts";
import type { AppView } from "../routemap/view.ts";
import { routesOverlayLayerIds } from "./routesOverlayLayers.ts";
import { ROUTES_LAYER_IDS } from "./routesLayers.ts";
import { closureLayers, confirmedJunctionLayer, diversionLayers, junctionLayer } from "./style.ts";

/**
 * Which of our layers each view shows. The base map, road emphasis and road numbers are shared. The Closures view's layers are
 * hidden in Routes (they keep their data and filters, so they come back exactly as they were) and Routes' layers are hidden in
 * Closures. Restriction layers belong to Closures and are handled with their switches (MapView applyRestrictions).
 */
/**
 * The Routes view's layer switches: junction numbers, and each OpenStreetMap layer (routemap/catalog.ts). Each is independent:
 * one switch never changes another, and a missing entry means off.
 */
export type RoutesLayerSwitches = { junctions: boolean } & Partial<Record<RoutesDataLayer, boolean>>;

/** Junction numbers on (as before); every OpenStreetMap layer off until the user switches it on. */
export const DEFAULT_ROUTES_LAYERS: RoutesLayerSwitches = { junctions: true };

export const ROUTES_OVERLAY_LAYER_IDS: readonly string[] = ROUTES_DATA_LAYERS.flatMap((l) => routesOverlayLayerIds(l));

export const CLOSURES_LAYER_IDS: readonly string[] = (() => {
  const c = closureLayers();
  return [...c.base, ...diversionLayers(), ...c.selected, junctionLayer, confirmedJunctionLayer].map((l) => l.id);
})();

export function viewLayerVisibility(view: AppView, routes: RoutesLayerSwitches): { id: string; visible: boolean }[] {
  return [
    ...CLOSURES_LAYER_IDS.map((id) => ({ id, visible: view === "closures" })),
    ...ROUTES_LAYER_IDS.map((id) => ({
      id,
      visible: view === "routes" && (id === "routes-junction" ? routes.junctions : true),
    })),
    ...ROUTES_DATA_LAYERS.flatMap((layer) => routesOverlayLayerIds(layer).map((id) => ({ id, visible: view === "routes" && routes[layer] === true }))),
  ];
}
