import type { LonLat } from "../geo/distance.ts";
import { isMainCarriageway, type ClosureRecord } from "../sources/nh-closures/normalise.ts";

/**
 * Builds whole closures from S1 records (SPECIFICATION §5.2, E6 "evaluated over the whole closure").
 * NH splits one closure across several records, so records of a situation whose validity windows overlap are taken
 * together, and each direction is a separate closure. Overlap grouping is deliberately conservative: it can only make a
 * closure's extent larger, never smaller. Roads are NOT split apart: one closure can continue from one road onto another
 * (e.g. M42 → A42 at J11, verified 2026-10-05), and splitting by road would let a fragment match a single-road stretch.
 */

export interface ClosureGroup {
  situationId: string;
  recordIds: string[];
  /** Every road the closed main-carriageway links lie on. More than one means the closure continues onto another road. */
  roads: string[];
  direction: string;
  start: string;
  end: string;
  /** Main-carriageway links reported with zero operational lanes. */
  closedMainLinkIds: Set<string>;
  /**
   * Closed section of each closed link (metres from the link's digitised start), the union over contributing elements.
   * Null bounds mean S1 gave no position, so the whole link is assumed closed at that end.
   */
  closedExtents: Map<string, { fromMetres: number | null; toMetres: number | null }>;
  points: LonLat[];
  comments: string[];
}

const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }): boolean => a.start < b.end && b.start < a.end;

/** Records eligible to contribute to a full closure at time `now` (E1 record type, E2 status/time). */
export function eligibleRecords(records: ClosureRecord[], now: string): ClosureRecord[] {
  return records.filter((r) => r.managementType === "carriagewayClosures" && r.validityStatus !== "suspended" && r.end > now);
}

export function groupClosures(records: ClosureRecord[], now: string): ClosureGroup[] {
  const groups: ClosureGroup[] = [];
  const bySituation = new Map<string, ClosureRecord[]>();
  for (const r of eligibleRecords(records, now)) bySituation.set(r.situationId, [...(bySituation.get(r.situationId) ?? []), r]);

  for (const [situationId, list] of bySituation) {
    for (const cluster of overlapClusters(list)) {
      const byDirection = new Map<string, ClosureGroup>();
      for (const record of cluster) {
        for (const element of record.elements) {
          if (!isMainCarriageway(element.type) || element.operationalLanes !== 0) continue;
          const key = element.direction;
          let group = byDirection.get(key);
          if (!group) {
            group = {
              situationId,
              recordIds: [],
              roads: [],
              direction: element.direction,
              start: record.start,
              end: record.end,
              closedMainLinkIds: new Set(),
              closedExtents: new Map(),
              points: [],
              comments: [],
            };
            byDirection.set(key, group);
          }
          if (!group.roads.includes(element.road)) group.roads.push(element.road);
          if (!group.recordIds.includes(record.recordId)) {
            group.recordIds.push(record.recordId);
            group.comments.push(...record.comments);
            if (record.start < group.start) group.start = record.start;
            if (record.end > group.end) group.end = record.end;
          }
          group.closedMainLinkIds.add(element.linkId);
          const previous = group.closedExtents.get(element.linkId);
          group.closedExtents.set(element.linkId, {
            fromMetres: mergeBound(previous?.fromMetres, element.fromMetres, Math.min),
            toMetres: mergeBound(previous?.toMetres, element.toMetres, Math.max),
          });
          group.points.push(...element.points);
        }
      }
      groups.push(...byDirection.values());
    }
  }
  return groups;
}

/** Union of two optional bounds. An unknown (null) bound stays unknown, so the whole link is assumed at that end. */
function mergeBound(previous: number | null | undefined, next: number | null, pick: (a: number, b: number) => number): number | null {
  if (previous === undefined) return next;
  if (previous === null || next === null) return null;
  return pick(previous, next);
}

/** Connected components of records whose validity windows overlap (transitively). */
function overlapClusters(records: ClosureRecord[]): ClosureRecord[][] {
  const sorted = [...records].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const clusters: ClosureRecord[][] = [];
  let current: ClosureRecord[] = [];
  let currentEnd = "";
  for (const record of sorted) {
    if (current.length > 0 && overlaps({ start: record.start, end: record.end }, { start: current[0]!.start, end: currentEnd })) {
      current.push(record);
      if (record.end > currentEnd) currentEnd = record.end;
    } else {
      if (current.length > 0) clusters.push(current);
      current = [record];
      currentEnd = record.end;
    }
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}
