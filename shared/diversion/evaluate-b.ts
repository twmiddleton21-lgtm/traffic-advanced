import { fractionWithin } from "../geo/distance.ts";
import type { Network } from "../network/graph.ts";
import { isAllVehicleClassification, type DiversionPoint, type DiversionRoute } from "../sources/nh-arcgis/normalise.ts";
import type { ClosureGroup } from "./closure-groups.ts";
import { E1_TEXT_RULES, E6_POSITION_RULES, E7_RULES, HGV_TEXT_RULES } from "./rules.ts";
import type { StretchIndex, StretchPath } from "./stretch-index.ts";

/**
 * Classification B evidence (SPECIFICATION §5.2). Every item E1–E8 must pass. The first failing item is reported
 * and the result is D. Nothing here infers, relaxes or "probably" matches.
 */

export type EvidenceId = "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7" | "E8";

/**
 * HGV status of an official route. There is deliberately no "suitable" value: without a vehicle profile check against
 * every recorded restriction, the app can't say an HGV fits, and absence of data is not clearance (SPECIFICATION §7).
 */
export type HgvStatus = "not-suitable" | "check-vehicle" | "no-restrictions-recorded";

export interface Restriction {
  /** height | width | weight | length from route limits; restriction points may use other NH values, kept verbatim. */
  kind: string;
  value: number | null;
  unit: string;
  source: "route-limit" | "restriction-point";
}

export interface BRoute {
  routeId: string;
  routeNumber: number | null;
  /** NH description, verbatim. */
  description: string;
  classification: DiversionRoute["classification"];
  hgvStatus: HgvStatus;
  hgvReasons: string[];
  restrictions: Restriction[];
  signageSymbol: string | null;
  lengthMiles: number | null;
  lastModified: string | null;
}

export type BEvaluation =
  | {
      outcome: "B";
      stretchId: string;
      stretchLabel: string;
      routes: BRoute[];
      evidence: { id: EvidenceId; detail: string }[];
      e7Coverage: number;
      /** The facts behind each evidence item, for review and for the UI's "why" panel. */
      trace: BTrace;
    }
  | { outcome: "D"; failed: EvidenceId; reason: string; detail?: Record<string, unknown> };

/**
 * `pointsByRoute` (S4 restriction points keyed by route GUID) is required, not optional: a silent empty default would
 * hide restrictions from HGV drivers.
 */
export interface BTrace {
  /** E1: NH comments that state the closure (verbatim). */
  closureStatements: string[];
  /** E5: closed main-carriageway links and where they sit on the stretch path (0-based link positions). */
  closedLinkCount: number;
  pathLinkCount: number;
  firstPathPosition: number;
  lastPathPosition: number;
  /** E6 (D9): where the closure starts/ends within its first/last path link, in metres along the direction of travel. */
  closureStartMetresIntoFirstLink: number;
  firstLinkLengthMetres: number;
  closureEndMetresIntoLastLink: number;
  lastLinkLengthMetres: number;
  /** E6: junction ids at the stretch ends and the junctions found either side of the closure. */
  stretchStartJunctions: string[];
  stretchEndJunctions: string[];
  junctionBeforeClosure: string[];
  junctionAfterClosure: string[];
  /** E8: candidate counts at each stage. */
  candidatesSameRoadDirection: number;
  candidatesContainingAllLinks: number;
  candidatesPassingAll: number;
}

export function evaluateB(
  group: ClosureGroup,
  network: Network,
  index: StretchIndex,
  pointsByRoute: ReadonlyMap<string, DiversionPoint[]>,
): BEvaluation {
  // E1: full main-carriageway closure, and NH's own text does not contradict it.
  if (group.closedMainLinkIds.size === 0) return d("E1", "No main-carriageway link reported with zero operational lanes.");
  if (!group.comments.some((c) => E1_TEXT_RULES.closureStatement.test(c))) {
    return d("E1", "No contributing NH comment states a carriageway closure.", { comments: group.comments });
  }
  const disqualified = group.comments.filter((c) => E1_TEXT_RULES.disqualifiers.some((rx) => rx.test(c)));
  if (disqualified.length > 0) {
    return d("E1", "NH comment describes a slip-road, layby, access, lane, link, services or traffic-light work, not a full carriageway closure.", {
      comments: disqualified,
    });
  }
  for (const id of group.closedMainLinkIds) {
    if (!network.links.has(id)) return d("E5", "A closed link is not in the current Network Model.", { linkId: id });
  }

  // E6 (whole closure): a closure continuing onto another road cannot be confined to one single-road stretch.
  if (group.roads.length !== 1) {
    return d("E6", "The closure continues onto another road, so it isn't confined to one official stretch.", { roads: group.roads });
  }
  const road = group.roads[0]!;

  // E3 + E4: candidate stretches on the same road and direction. Their routes are complete and not decommissioned (E2).
  const sameRoadDirection = index.byRoadDirection.get(`${road}|${group.direction}`) ?? [];
  if (sameRoadDirection.length === 0) return d("E3", "No usable official stretch on the same road and direction.");

  // E5: every closed link lies on the stretch's network path.
  const containing = sameRoadDirection.filter((sp) => [...group.closedMainLinkIds].every((id) => sp.linkIndex.has(id)));
  if (containing.length === 0) return d("E5", "No usable stretch path contains all closed links (closure may span stretches).");

  const passing: { sp: StretchPath; coverage: number }[] = [];
  let lastFailure: BEvaluation | null = null;
  for (const sp of containing) {
    const e6 = checkJunctionExtent(group, sp, network);
    if (e6) {
      lastFailure = e6;
      continue;
    }
    const coverage = fractionWithin(group.points, sp.stretch.geometry, E7_RULES.bufferMetres);
    if (coverage < E7_RULES.minCoverage) {
      lastFailure = d("E7", `Only ${(coverage * 100).toFixed(0)}% of closure geometry lies within ${E7_RULES.bufferMetres} m of the stretch.`, {
        coverage,
      });
      continue;
    }
    passing.push({ sp, coverage });
  }
  if (passing.length === 0) return lastFailure ?? d("E6", "No stretch passed the junction-extent check.");
  if (passing.length > 1) return d("E8", "More than one official stretch passes all checks.", { stretches: passing.map((p) => p.sp.stretch.id) });

  const { sp, coverage } = passing[0]!;
  const extent = junctionExtent(group, sp, network);
  const routes = [...sp.routes]
    .sort((a, b) => (a.routeNumber ?? 99) - (b.routeNumber ?? 99))
    .map((r) => describeRoute(r, pointsByRoute.get(r.id) ?? []));
  return {
    outcome: "B",
    stretchId: sp.stretch.id,
    stretchLabel: `${sp.stretch.road} ${sp.stretch.direction ?? ""} ${sp.stretch.junctionFrom} to ${sp.stretch.junctionTo}`.trim(),
    routes,
    e7Coverage: coverage,
    trace: {
      closureStatements: [...new Set(group.comments.filter((c) => E1_TEXT_RULES.closureStatement.test(c)))],
      closedLinkCount: group.closedMainLinkIds.size,
      pathLinkCount: sp.linkIds.length,
      firstPathPosition: extent.first,
      lastPathPosition: extent.last,
      closureStartMetresIntoFirstLink: round1(extent.startIntoFirst),
      firstLinkLengthMetres: round1(extent.firstLength),
      closureEndMetresIntoLastLink: round1(extent.endIntoLast),
      lastLinkLengthMetres: round1(extent.lastLength),
      stretchStartJunctions: [...(extent.startJunctions ?? [])],
      stretchEndJunctions: [...(extent.endJunctions ?? [])],
      junctionBeforeClosure: [...(extent.upstream ?? [])],
      junctionAfterClosure: [...(extent.downstream ?? [])],
      candidatesSameRoadDirection: sameRoadDirection.length,
      candidatesContainingAllLinks: containing.length,
      candidatesPassingAll: passing.length,
    },
    evidence: [
      { id: "E1", detail: "Full main-carriageway closure, stated by NH, with no contradicting text." },
      { id: "E2", detail: "Closure current or upcoming; official routes complete and not decommissioned." },
      { id: "E3", detail: `Same road (${road}).` },
      { id: "E4", detail: `Same direction (${group.direction}).` },
      { id: "E5", detail: "All closed links lie on the official stretch's Network Model path." },
      { id: "E6", detail: "The junctions either side of the closure are the stretch's own start and end junctions." },
      { id: "E7", detail: `${(coverage * 100).toFixed(0)}% of closure geometry within ${E7_RULES.bufferMetres} m of the stretch.` },
      { id: "E8", detail: "No competing stretch." },
    ],
  };
}

/**
 * E6 (strict, approved decision D2): walking the stretch path, the nearest junction at or before the closure start must
 * be the stretch's start junction, and the nearest junction at or after the closure end must be its end junction.
 * A closure inside a junction, beyond the stretch, or shorter than the stretch (bounded by an intermediate junction) fails.
 */
/**
 * Closure extent along a stretch path (approved decision D9: position-precise). Junction nodes sit at link ends, so precision
 * matters where a closed section starts at the very end of its first link (the junction is then the next node) or ends at the
 * very start of its last link (the junction is then that link's start node), within E6_POSITION_RULES.endpointToleranceMetres.
 * Positions are converted to the path's direction of travel; missing positions mean the whole link is assumed.
 */
function junctionExtent(group: ClosureGroup, sp: StretchPath, network: Network) {
  const indices = [...group.closedMainLinkIds].map((id) => sp.linkIndex.get(id)!);
  const first = Math.min(...indices);
  const last = Math.max(...indices);
  const along = (index: number) => {
    const id = sp.linkIds[index]!;
    const link = network.links.get(id);
    const length = network.lengths.get(id) ?? 0;
    const extent = group.closedExtents.get(id) ?? { fromMetres: null, toMetres: null };
    const from = Math.max(0, Math.min(length, extent.fromMetres ?? 0));
    const to = Math.max(0, Math.min(length, extent.toMetres ?? length));
    const forward = link?.startNode === sp.nodes[index];
    return { length, start: forward ? from : length - to, end: forward ? to : length - from };
  };
  const firstLink = along(first);
  const lastLink = along(last);
  const tolerance = E6_POSITION_RULES.endpointToleranceMetres;
  const upstreamFrom = firstLink.start >= firstLink.length - tolerance ? first + 1 : first;
  const downstreamFrom = lastLink.end <= tolerance ? last : last + 1;

  const junctionsAt = (node: string | undefined): Set<string> | undefined => (node ? network.nodeJunctions.get(node) : undefined);
  const startJunctions = junctionsAt(sp.nodes[0]);
  const endJunctions = junctionsAt(sp.nodes[sp.nodes.length - 1]);
  let upstream: Set<string> | undefined;
  for (let i = upstreamFrom; i >= 0 && !upstream; i--) upstream = junctionsAt(sp.nodes[i]);
  let downstream: Set<string> | undefined;
  for (let i = downstreamFrom; i < sp.nodes.length && !downstream; i++) downstream = junctionsAt(sp.nodes[i]);
  return {
    first,
    last,
    startIntoFirst: firstLink.start,
    firstLength: firstLink.length,
    endIntoLast: lastLink.end,
    lastLength: lastLink.length,
    startJunctions,
    endJunctions,
    upstream,
    downstream,
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

function checkJunctionExtent(group: ClosureGroup, sp: StretchPath, network: Network): BEvaluation | null {
  const { startJunctions, endJunctions, upstream, downstream } = junctionExtent(group, sp, network);
  if (!startJunctions || !endJunctions) return d("E6", "Stretch start or end node is not a Network Model junction node.");

  if (!upstream || !sameSet(upstream, startJunctions)) {
    return d("E6", "The junction before the closure is not the stretch's start junction (closure inside a junction or shorter than the stretch).");
  }
  if (!downstream || !sameSet(downstream, endJunctions)) {
    return d("E6", "The junction after the closure is not the stretch's end junction (closure shorter than the stretch).");
  }
  return null;
}

export function describeRoute(route: DiversionRoute, points: DiversionPoint[]): BRoute {
  const restrictions: Restriction[] = [
    ...(route.limits.heightMetres === null ? [] : [{ kind: "height", value: route.limits.heightMetres, unit: "metres", source: "route-limit" } as const]),
    ...(route.limits.widthMetres === null ? [] : [{ kind: "width", value: route.limits.widthMetres, unit: "metres", source: "route-limit" } as const]),
    ...(route.limits.weightTonnes === null ? [] : [{ kind: "weight", value: route.limits.weightTonnes, unit: "tonnes", source: "route-limit" } as const]),
    ...(route.limits.lengthMetres === null ? [] : [{ kind: "length", value: route.limits.lengthMetres, unit: "metres", source: "route-limit" } as const]),
    ...points.map((p): Restriction => ({ kind: p.kind, value: p.value, unit: p.unit, source: "restriction-point" })),
  ];
  const reasons: string[] = [];
  let status: HgvStatus;
  if (!isAllVehicleClassification(route.classification)) {
    status = "not-suitable";
    reasons.push(
      route.classification
        ? `National Highways classifies this route ${route.classification.replace("Class_", "Class ")}: not to be used by HGVs.`
        : "National Highways gives no recognised classification for this route.",
    );
  } else if (HGV_TEXT_RULES.notForHgv.test(route.description)) {
    status = "not-suitable";
    reasons.push(`National Highways describes this route as not for HGVs ("${route.description}"), although it is classified ${route.classification.replace("Class_", "Class ")}.`);
  } else if (restrictions.length > 0) {
    status = "check-vehicle";
    reasons.push("National Highways records restrictions on this route. Check them against your vehicle.");
  } else {
    status = "no-restrictions-recorded";
    reasons.push("National Highways records no restrictions on this route. This does not guarantee there are none.");
  }
  return {
    routeId: route.routeId,
    routeNumber: route.routeNumber,
    description: route.description,
    classification: route.classification,
    hgvStatus: status,
    hgvReasons: reasons,
    restrictions,
    signageSymbol: route.signageSymbol,
    lengthMiles: route.lengthMiles,
    lastModified: route.lastModified,
  };
}

const sameSet = (a: Set<string>, b: Set<string>): boolean => a.size === b.size && [...a].every((x) => b.has(x));

function d(failed: EvidenceId, reason: string, detail?: Record<string, unknown>): BEvaluation {
  return detail ? { outcome: "D", failed, reason, detail } : { outcome: "D", failed, reason };
}
