import type { AppView } from "../routemap/view.ts";
import { ROUTES_LAYER_IDS } from "./routesLayers.ts";
import { closureLayers, confirmedJunctionLayer, diversionLayers, junctionLayer } from "./style.ts";

/**
 * Which of our layers each view shows. The base map, road emphasis and road numbers are shared. The Closures view's layers are
 * hidden in Routes (they keep their data and filters, so they come back exactly as they were) and Routes' layers are hidden in
 * Closures. Restriction layers belong to Closures and are handled with their switches (MapView applyRestrictions).
 */
export interface RoutesLayerSwitches {
  junctions: boolean;
}

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
  ];
}
