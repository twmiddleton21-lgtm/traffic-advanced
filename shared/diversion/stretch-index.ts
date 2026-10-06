import { fractionWithin, polylineLength } from "../geo/distance.ts";
import { tracePath, type Network } from "../network/graph.ts";
import type { ClosureStretch, DiversionRoute } from "../sources/nh-arcgis/normalise.ts";
import { STRETCH_PATH_RULES } from "./rules.ts";
import { checkStretchLabels } from "./stretch-labels.ts";

/**
 * Establishes each S4 stretch's ordered S5 link path from its complete routes' SRNStartNode → SRNEndNode.
 * A stretch is usable for E5/E6 only if every complete route traces to the same path and that path agrees with the
 * stretch geometry. Anything else is recorded with a reason, and closures on that stretch can't reach B.
 */

export interface StretchPath {
  stretch: ClosureStretch;
  routes: DiversionRoute[];
  nodes: string[];
  linkIds: string[];
  linkIndex: Map<string, number>;
}

export type StretchPathFailure =
  | "no-complete-route"
  | "route-node-missing-from-network"
  | "no-path-on-road"
  | "routes-disagree-on-path"
  | "path-length-disagrees-with-stretch"
  | "path-geometry-disagrees-with-stretch"
  | "stretch-without-geometry"
  /** S4 rows sharing one stretch GUID disagree on road, direction or junction labels. Never resolved by guessing. */
  | "stretch-rows-conflict"
  /** D7: S4 labels aren't road + junction number, so they can't be reconciled with the path. Can't establish B. */
  | "labels-not-reconcilable"
  /** D7: S4 labels name different junctions from those at the route path's ends. Can't establish B. */
  | "labels-disagree-with-path";

export interface StretchIndex {
  usable: Map<string, StretchPath>;
  failures: Map<string, StretchPathFailure>;
  /** `${road}|${direction}` → usable stretch paths. */
  byRoadDirection: Map<string, StretchPath[]>;
}

export function buildStretchIndex(network: Network, stretches: ClosureStretch[], routes: DiversionRoute[]): StretchIndex {
  const knownNodes = new Set<string>();
  for (const link of network.links.values()) {
    knownNodes.add(link.startNode);
    knownNodes.add(link.endNode);
  }
  const routesByStretch = new Map<string, DiversionRoute[]>();
  for (const route of routes) {
    if (!route.complete || route.decommissioned) continue;
    routesByStretch.set(route.stretchId, [...(routesByStretch.get(route.stretchId) ?? []), route]);
  }
  const index: StretchIndex = { usable: new Map(), failures: new Map(), byRoadDirection: new Map() };
  const { merged, conflicts } = mergeStretchRows(stretches);
  for (const id of conflicts) index.failures.set(id, "stretch-rows-conflict");
  for (const stretch of merged) {
    const result = establish(network, knownNodes, stretch, routesByStretch.get(stretch.id) ?? []);
    if (typeof result === "string") {
      index.failures.set(stretch.id, result);
      continue;
    }
    index.usable.set(stretch.id, result);
    const key = `${stretch.road}|${stretch.direction ?? "unknown"}`;
    index.byRoadDirection.set(key, [...(index.byRoadDirection.get(key) ?? []), result]);
  }
  return index;
}

/**
 * S4 splits some stretches across several rows with the same GUID (319 of 2,433 on 2026-10-05), one per geometry part.
 * Rows that agree on road, direction and junction labels are merged into one stretch with all geometry parts. Rows that
 * disagree are a conflict: that stretch can't establish B.
 */
export function mergeStretchRows(stretches: ClosureStretch[]): { merged: ClosureStretch[]; conflicts: Set<string> } {
  const byId = new Map<string, ClosureStretch[]>();
  for (const s of stretches) byId.set(s.id, [...(byId.get(s.id) ?? []), s]);
  const merged: ClosureStretch[] = [];
  const conflicts = new Set<string>();
  for (const [id, rows] of byId) {
    const first = rows[0]!;
    const agree = rows.every(
      (r) => r.road === first.road && r.direction === first.direction && r.junctionFrom === first.junctionFrom && r.junctionTo === first.junctionTo,
    );
    if (!agree) {
      conflicts.add(id);
      continue;
    }
    merged.push({ ...first, geometry: rows.flatMap((r) => r.geometry) });
  }
  return { merged, conflicts };
}

function establish(
  network: Network,
  knownNodes: Set<string>,
  stretch: ClosureStretch,
  routes: DiversionRoute[],
): StretchPath | StretchPathFailure {
  if (routes.length === 0) return "no-complete-route";
  if (stretch.geometry.length === 0) return "stretch-without-geometry";
  let agreed: { nodes: string[]; linkIds: string[]; lengthMetres: number } | null = null;
  for (const route of routes) {
    if (!knownNodes.has(route.startNode) || !knownNodes.has(route.endNode)) return "route-node-missing-from-network";
    const path = tracePath(network, stretch.road, route.startNode, route.endNode);
    if (!path) return "no-path-on-road";
    if (agreed && agreed.linkIds.join() !== path.linkIds.join()) return "routes-disagree-on-path";
    agreed = path;
  }
  if (!agreed) return "no-complete-route";
  const stretchLength = stretch.geometry.reduce((sum, line) => sum + polylineLength(line), 0);
  const ratio = stretchLength > 0 ? agreed.lengthMetres / stretchLength : Number.POSITIVE_INFINITY;
  if (ratio < STRETCH_PATH_RULES.minLengthRatio || ratio > STRETCH_PATH_RULES.maxLengthRatio) return "path-length-disagrees-with-stretch";
  const pathPoints = agreed.linkIds.flatMap((id) => network.links.get(id)?.geometry.flat() ?? []);
  if (fractionWithin(pathPoints, stretch.geometry, STRETCH_PATH_RULES.bufferMetres) < STRETCH_PATH_RULES.minGeometryAgreement) {
    return "path-geometry-disagrees-with-stretch";
  }
  // D7: the stretch's own labels must reconcile with the junctions at the traced path's ends. Never inferred or repaired.
  const junctionNamesAt = (node: string | undefined): string[] =>
    [...((node && network.nodeJunctions.get(node)) || [])].map((id) => network.junctionNames.get(id) ?? "");
  const labels = checkStretchLabels(
    stretch.road,
    stretch.junctionFrom,
    stretch.junctionTo,
    junctionNamesAt(agreed.nodes[0]),
    junctionNamesAt(agreed.nodes[agreed.nodes.length - 1]),
  );
  if (labels !== "reconciled") return labels;
  return {
    stretch,
    routes,
    nodes: agreed.nodes,
    linkIds: agreed.linkIds,
    linkIndex: new Map(agreed.linkIds.map((id, i) => [id, i])),
  };
}
