import type { RestrictionPoint } from "../../../shared/api/restrictions.ts";

/**
 * One restriction as shown on the map and in the list, with every source record behind it.
 *
 * National Highways records a diversion-point restriction once per diversion route and direction, so one place can have several
 * records (docs/RESTRICTIONS.md). Records are shown once only when they are the same restriction: the same source, kind, value,
 * wording, conditions and exact position. Only the record id and the route they were recorded on (`context`) may differ. Anything
 * else, even at the same place, stays separate. The records themselves are never changed or dropped: `records` keeps them all.
 */
export interface PointGroup {
  /** The record that represents the group (lowest id): its id is the group's id on the map and in the list. */
  point: RestrictionPoint;
  /** Every record of this restriction, sorted by id. Always includes `point`. */
  records: RestrictionPoint[];
}

/** Everything that describes the restriction itself, so records that differ in any of it are never merged. */
const sameRestrictionKey = (p: RestrictionPoint): string =>
  JSON.stringify([p.source, p.kind, p.limit.min, p.limit.max, p.recorded, p.physical, p.conditions, p.position, p.approximate, p.extentMetres, p.road, p.sourceText, p.lastEdited, p.osm]);

const cache = new WeakMap<readonly RestrictionPoint[], PointGroup[]>();

/** Groups a file's records into restrictions (computed once per loaded file), in the order each restriction first appears. */
export function groupPoints(features: readonly RestrictionPoint[]): PointGroup[] {
  const cached = cache.get(features);
  if (cached) return cached;
  const byKey = new Map<string, RestrictionPoint[]>();
  for (const p of features) {
    const key = sameRestrictionKey(p);
    const list = byKey.get(key);
    if (list) list.push(p);
    else byKey.set(key, [p]);
  }
  const groups = [...byKey.values()].map((records) => {
    const sorted = [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { point: sorted[0]!, records: sorted };
  });
  cache.set(features, groups);
  return groups;
}
