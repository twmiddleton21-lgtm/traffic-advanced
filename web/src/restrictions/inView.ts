import type { RestrictionPoint, RestrictionPointsFile, RestrictionSource, Zone, ZonesFile } from "../../../shared/api/restrictions.ts";
import { groupPoints } from "./group.ts";

/**
 * The keyboard and screen-reader route to restriction details (the map key's list of restrictions in view, MapKey.tsx): the
 * restrictions in the current map view, nearest the centre first. Computed on the device from files already downloaded, so no
 * request reveals the view. Records of the same restriction (group.ts) are listed once, with all of them kept in `records`.
 */
export const LIST_LIMIT = 50;

export interface ListedPoint {
  point: RestrictionPoint;
  /** Every source record of this restriction (one per NH diversion route it was recorded on), including `point`. */
  records: RestrictionPoint[];
  source: RestrictionSource;
  distance: number;
}

export interface ListedZone {
  zone: Zone;
  source: RestrictionSource;
}

const inside = (p: readonly [number, number], [w, s, e, n]: readonly [number, number, number, number]) => p[0] >= w && p[0] <= e && p[1] >= s && p[1] <= n;

/** Equirectangular distance in degrees-ish units: only used to order by nearness. */
const nearness = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot((a[0] - b[0]) * Math.cos((b[1] * Math.PI) / 180), a[1] - b[1]);

export function pointsInView(files: RestrictionPointsFile[], bounds: [number, number, number, number], centre: [number, number]): { items: ListedPoint[]; total: number } {
  const all: ListedPoint[] = [];
  for (const f of files) {
    const sources = new Map(f.sources.map((s) => [s.id, s]));
    for (const { point: p, records } of groupPoints(f.features)) if (inside(p.position, bounds)) all.push({ point: p, records, source: sources.get(p.source)!, distance: nearness(p.position, centre) });
  }
  all.sort((a, b) => a.distance - b.distance || (a.point.id < b.point.id ? -1 : 1));
  return { items: all.slice(0, LIST_LIMIT), total: all.length };
}

/** Finds a zone (LEZ or ULEZ) in the loaded zone files, with its source. */
export function findZone(files: ZonesFile[], id: string): ListedZone | null {
  for (const f of files) {
    const zone = f.zones.find((z) => z.id === id);
    if (zone) return { zone, source: f.sources.find((s) => s.id === zone.source)! };
  }
  return null;
}

/** Finds the restriction a record id belongs to (any of its records' ids) in the loaded files, with its source. */
export function findPoint(files: RestrictionPointsFile[], id: string): ListedPoint | null {
  for (const f of files) {
    const g = groupPoints(f.features).find((x) => x.records.some((r) => r.id === id));
    if (g) return { point: g.point, records: g.records, source: f.sources.find((s) => s.id === g.point.source)!, distance: 0 };
  }
  return null;
}
