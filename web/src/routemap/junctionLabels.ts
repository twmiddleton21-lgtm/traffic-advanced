import { parseJunctionName, type Junction } from "../../../shared/api/junctions.ts";

/**
 * Junction numbers for the Routes map: National Highways' own junction names from the Network Model (shared/api/junctions.ts,
 * validated by its schema when the snapshot loads). A label is drawn only when it is unambiguous:
 * - its name parses to a road and junction number that agree with the record's own road and number fields;
 * - no other record has the same name (two positions for one name: neither is drawn).
 * Anything left out is named, never silently dropped. Nothing is invented or moved.
 */
export interface JunctionLabels {
  labels: Junction[];
  leftOut: { name: string; reason: string }[];
}

export function junctionLabels(junctions: readonly Junction[]): JunctionLabels {
  const count = new Map<string, number>();
  for (const j of junctions) count.set(j.name, (count.get(j.name) ?? 0) + 1);
  const labels: Junction[] = [];
  const leftOut: JunctionLabels["leftOut"] = [];
  const reported = new Set<string>();
  for (const j of junctions) {
    const parsed = parseJunctionName(j.name);
    if (!parsed || parsed.road !== j.road || parsed.number !== j.number) {
      leftOut.push({ name: j.name, reason: "name doesn't match its road and junction number" });
    } else if ((count.get(j.name) ?? 0) > 1) {
      if (!reported.has(j.name)) leftOut.push({ name: j.name, reason: `recorded ${count.get(j.name)} times at different places` });
      reported.add(j.name);
    } else {
      labels.push(j);
    }
  }
  return { labels, leftOut };
}

export type JunctionLoad =
  | { state: "off" }
  | { state: "loading" }
  | { state: "error" }
  | { state: "empty" }
  | { state: "ready"; count: number; leftOut: number };

/** What the Routes panel says about the junction numbers, from the switch and the junctions query. */
export function junctionLoad(on: boolean, query: { isPending: boolean; isError: boolean; hasData: boolean }, labels: JunctionLabels): JunctionLoad {
  if (!on) return { state: "off" };
  if (query.hasData) return labels.labels.length === 0 ? { state: "empty" } : { state: "ready", count: labels.labels.length, leftOut: labels.leftOut.length };
  if (query.isError) return { state: "error" };
  return { state: "loading" };
}
