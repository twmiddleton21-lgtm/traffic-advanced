import type { RoutesDataLayer, RoutesPoint, RoutesSection } from "../../../shared/api/routes-layers.ts";
import type { RoutesLayerData } from "./useRoutesLayerData.ts";

/**
 * The keyboard and screen-reader route to the Routes layers' records (the map key's list in view, MapKey.tsx): the records of the
 * layers that are on, in the current map view, nearest the centre first. Computed on the device from files already downloaded, so
 * no request reveals the view.
 */
export const ROUTES_LIST_LIMIT = 50;

export type RoutesListed = { layer: RoutesDataLayer; kind: "point"; point: RoutesPoint; distance: number } | { layer: RoutesDataLayer; kind: "section"; section: RoutesSection; distance: number };

const inside = (p: readonly [number, number], [w, s, e, n]: readonly [number, number, number, number]) => p[0] >= w && p[0] <= e && p[1] >= s && p[1] <= n;
/** Equirectangular nearness: only used to order the list. */
const nearness = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot((a[0] - b[0]) * Math.cos((b[1] * Math.PI) / 180), a[1] - b[1]);

export function routesInView(layers: { layer: RoutesDataLayer; data: RoutesLayerData }[], bounds: [number, number, number, number], centre: [number, number]): { items: RoutesListed[]; total: number } {
  const all: RoutesListed[] = [];
  for (const { layer, data } of layers) {
    if (data.kind === "points") {
      for (const point of data.file.features) if (inside(point.position, bounds)) all.push({ layer, kind: "point", point, distance: nearness(point.position, centre) });
    } else {
      for (const section of data.file.sections) {
        const shown = section.line.filter((p) => inside(p, bounds));
        if (shown.length > 0) all.push({ layer, kind: "section", section, distance: Math.min(...shown.map((p) => nearness(p, centre))) });
      }
    }
  }
  const id = (x: RoutesListed) => (x.kind === "point" ? x.point.id : x.section.id);
  all.sort((a, b) => a.distance - b.distance || (id(a) < id(b) ? -1 : 1));
  return { items: all.slice(0, ROUTES_LIST_LIMIT), total: all.length };
}

/** Finds a record by layer and id in the loaded files. */
export function findRoutesRecord(layers: { layer: RoutesDataLayer; data: RoutesLayerData }[], selection: { layer: RoutesDataLayer; id: string }): RoutesListed | null {
  const entry = layers.find((l) => l.layer === selection.layer);
  if (!entry) return null;
  if (entry.data.kind === "points") {
    const point = entry.data.file.features.find((f) => f.id === selection.id);
    return point ? { layer: entry.layer, kind: "point", point, distance: 0 } : null;
  }
  const section = entry.data.file.sections.find((s) => s.id === selection.id);
  return section ? { layer: entry.layer, kind: "section", section, distance: 0 } : null;
}
