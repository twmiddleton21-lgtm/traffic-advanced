/**
 * Maps frozen-matcher output to the API contracts (shared/api/). Used by the development exporters (scripts/dev/) and the API
 * publisher (scripts/publish/), so the bundled development snapshot and the API can never be built differently.
 * Classifications are the matcher's own; nothing here decides A/B/D. Every snapshot is validated against its contract.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { closuresSnapshotSchema, DIVERSION_LABELS, type ClosuresSnapshot, type Direction, type TrafficClosure } from "../../shared/api/closures.ts";
import { junctionsSnapshotSchema, parseJunctionName, type Junction, type JunctionsSnapshot } from "../../shared/api/junctions.ts";
import { metresBetween } from "../../shared/geo/distance.ts";
import type { ArcgisFeature } from "../../shared/sources/arcgis/schema.ts";
import { normaliseGuid, normaliseJunction, normaliseJunctionRef } from "../../shared/sources/nh-arcgis/normalise.ts";
import { runMatcher, type ClosureResult, type MatcherRun } from "./matcher-pipeline.ts";

type Provenance = ClosuresSnapshot["provenance"];

export const CLOSURE_SOURCES = [
  "National Highways Road and Lane Closures API v2.0",
  "National Highways Public Scheduled Road Closures",
  "National Highways Diversion Routes",
  "National Highways Network Model",
];
export const LICENCE_NOTES = [
  "Contains public sector information licensed under the Open Government Licence v3.0.",
  "Diversion route data derived from Ordnance Survey Highway Network, Subject to Crown copyright and database rights 2024. Ordnance Survey Licence: AC0000827444.",
];

const features = async (dir: string, file: string): Promise<ArcgisFeature[]> =>
  (JSON.parse(await readFile(join(dir, file), "utf8")) as { features: ArcgisFeature[] }).features;

async function nodePositions(openDir: string): Promise<Map<string, [number, number]>> {
  const nodes = new Map<string, [number, number]>();
  for (const f of await features(openDir, "s5/nodes.json")) {
    const g = f.geometry;
    if (g && "x" in g && typeof g.x === "number" && typeof g.y === "number") nodes.set(normaliseGuid(String(f.attributes["nodeid"])), [g.x, g.y]);
  }
  return nodes;
}

interface CaptureManifest {
  problems?: unknown[];
  entries?: { file?: string; records?: number; expectedRecords?: number }[];
}

/**
 * Refuses a capture that recorded a partial upstream failure: any logged problem, or a dataset with fewer records than the
 * source reported. A snapshot built from incomplete data could silently drop closures or diversions.
 */
export async function assertCompleteCapture(dir: string): Promise<void> {
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")) as CaptureManifest;
  const problems = manifest.problems ?? [];
  if (problems.length > 0) throw new Error(`${dir}: capture recorded ${problems.length} problem(s), refusing to build a snapshot from it`);
  for (const e of manifest.entries ?? []) {
    if (e.expectedRecords !== undefined && e.records !== e.expectedRecords) {
      throw new Error(`${dir}: ${e.file ?? "a dataset"} has ${e.records ?? 0} of ${e.expectedRecords} records, refusing to build a snapshot from it`);
    }
  }
}

const DIRECTIONS: Record<string, Direction> = {
  northBound: "northbound",
  southBound: "southbound",
  eastBound: "eastbound",
  westBound: "westbound",
  clockwise: "clockwise",
  anticlockwise: "anticlockwise",
};
const round = (n: number) => Math.round(n * 1e5) / 1e5;
const simplify = (path: readonly (readonly number[])[], max = 400): [number, number][] => {
  const step = Math.max(1, Math.ceil(path.length / max));
  const kept = path.filter((_, i) => i % step === 0 || i === path.length - 1);
  return kept.map((p) => [round(p[0]!), round(p[1]!)]);
};

/** Loads the route geometry and node positions needed to map matcher results for one capture. */
export async function closureMapper(run: MatcherRun, openDir: string) {
  const groups = new Map(run.groups.map((g) => [`${g.situationId}|${g.direction}|${g.start}|${g.end}`, g]));
  const routeGeometry = new Map(
    (await features(openDir, "s4/diversion-routes.json")).map((f) => [String(f.attributes["DiversionRouteID"] as string), f.geometry && "paths" in f.geometry ? f.geometry.paths : []]),
  );
  const nodes = await nodePositions(openDir);

  /**
   * The map draws direction arrows along route geometry in vertex order, so that order must be the direction of travel.
   * S4 routes are digitised from SRNStartNode (where the diversion leaves the SRN) to SRNEndNode (where it rejoins): verified on
   * 2,022 of 2,022 testable single-part routes on 2026-10-05 (docs/DATA-SOURCES.md S4). This re-checks every exported route and
   * refuses to export one that disagrees. Multi-part routes have no proven part order; the map draws them without arrows.
   */
  const DIRECTION_TOLERANCE_METRES = 50;
  function assertTravelOrder(routeId: string, paths: readonly (readonly number[])[][]): void {
    if (paths.length !== 1) {
      console.warn(`${routeId}: ${paths.length} geometry parts, direction not verified (no arrows will be drawn)`);
      return;
    }
    const route = run.routes.find((r) => r.routeId === routeId);
    const start = route && nodes.get(route.startNode);
    const end = route && nodes.get(route.endNode);
    const path = paths[0]!;
    const first = path[0] as [number, number];
    const last = path[path.length - 1] as [number, number];
    if (!start || !end) throw new Error(`${routeId}: start/end node not found, cannot verify direction of travel`);
    const [fromStart, toEnd] = [metresBetween(first, start), metresBetween(last, end)];
    if (fromStart > DIRECTION_TOLERANCE_METRES || toEnd > DIRECTION_TOLERANCE_METRES) {
      throw new Error(`${routeId}: geometry does not run start → end node (${Math.round(fromStart)} m, ${Math.round(toEnd)} m)`);
    }
  }

  return {
    groups,
    /**
     * A closure can be shown only if its closed carriageway resolves to Network Model links that have geometry (the contract requires
     * it). Seen on 2026-10-05: one S1 closure referenced a link absent from the S5 capture.
     */
    mappable: (r: ClosureResult): boolean => [...(groups.get(r.key)?.closedMainLinkIds ?? [])].some((id) => (run.network.links.get(id)?.geometry.length ?? 0) > 0),
    toClosure: (r: ClosureResult): TrafficClosure => {
      const g = groups.get(r.key)!;
      const sections = new Map<string, number>();
      for (const id of g.closedMainLinkIds) {
        const d = run.network.links.get(id)?.description ?? "Unnamed Network Model link";
        sections.set(d, (sections.get(d) ?? 0) + 1);
      }
      const closedCarriageway = [...g.closedMainLinkIds].flatMap((id) => run.network.links.get(id)?.geometry ?? []).map((l) => simplify(l));
      let matchedRoute: TrafficClosure["matchedRoute"] = null;
      if (r.b.outcome === "B") {
        const sp = run.index.usable.get(r.b.stretchId)!;
        matchedRoute = {
          label: DIVERSION_LABELS.B,
          confidence: "High — matched by National Highways network position (E1–E8)",
          stretch: { id: sp.stretch.id, label: r.b.stretchLabel, junctionFrom: sp.stretch.junctionFrom, junctionTo: sp.stretch.junctionTo, geometry: sp.stretch.geometry.map((l) => simplify(l)) },
          routes: r.b.routes.map((x) => {
            const paths = routeGeometry.get(x.routeId) ?? [];
            assertTravelOrder(x.routeId, paths);
            // simplify() keeps vertex order and both end vertices, so the exported line still starts and ends at the NH nodes.
            return { ...x, estimatedTravelTime: run.routes.find((rt) => rt.routeId === x.routeId)?.estimatedTravelTime ?? null, geometry: paths.map((p) => simplify(p)) };
          }),
          evidence: r.b.evidence,
        };
      }
      return {
        id: r.key,
        source: "nh-s1",
        situationId: r.situationId,
        road: r.roads[0] ?? "",
        roads: r.roads,
        direction: DIRECTIONS[r.direction] ?? "northbound",
        window: { start: r.start, end: r.end },
        nhText: r.comments,
        closedSections: [...sections].map(([description, links]) => ({ description, links })),
        fullCarriagewayClosure: !(r.b.outcome === "D" && r.b.failed === "E1"),
        classes: r.classes,
        officialText:
          r.a.outcome === "A" ? { label: DIVERSION_LABELS.A, eventNumber: r.a.eventNumber, text: r.a.text, statements: r.a.statements, basis: r.a.basis } : null,
        matchedRoute,
        noReliableDiversion:
          r.b.outcome === "D" && !r.classes.includes("A")
            ? { label: DIVERSION_LABELS.D, failedEvidence: r.b.failed, reason: r.b.reason, genericNote: r.a.outcome === "none" ? (r.a.genericNote ?? null) : null }
            : null,
        reviewNote: r.b.outcome === "B" ? "P0 candidate pending owner review. Not a confirmed production match." : null,
        geometry: { closedCarriageway },
      };
    },
  };
}

export function closuresSnapshot(provenance: Provenance, closures: TrafficClosure[], generatedAt: string): ClosuresSnapshot {
  return closuresSnapshotSchema.parse({ provenance, generatedAt, closures });
}

/** A junction whose nodes are spread further than this has no single sensible label point, so it is left off the map. */
const MAX_JUNCTION_SPREAD_METRES = 2_000;

/**
 * Numbered junctions for the map from the NH Network Model (S5): Junction names, Junction_Reference (junction → nodes) and Node
 * positions. Names are NH's own; the position is the centre of the junction's nodes. Map context only: nothing here touches
 * matching or classification.
 */
export async function junctionsSnapshot(openDir: string, provenance: Provenance, generatedAt: string): Promise<{ snapshot: JunctionsSnapshot; skipped: string[] }> {
  const nodes = await nodePositions(openDir);
  const nodesByJunction = new Map<string, string[]>();
  for (const r of (await features(openDir, "s5/junction-references.json")).map(normaliseJunctionRef)) {
    nodesByJunction.set(r.junctionId, [...(nodesByJunction.get(r.junctionId) ?? []), r.nodeId]);
  }
  const skipped: string[] = [];
  // NH sometimes records one junction as several Junction rows with the same name (e.g. M55 J2), so nodes are pooled by name.
  const pointsByName = new Map<string, [number, number][]>();
  for (const j of (await features(openDir, "s5/junctions.json")).map(normaliseJunction)) {
    const points = (nodesByJunction.get(j.junctionId) ?? []).map((id) => nodes.get(id)).filter((p): p is [number, number] => p !== undefined);
    pointsByName.set(j.name, [...(pointsByName.get(j.name) ?? []), ...points]);
  }
  const junctions: Junction[] = [];
  for (const [name, points] of pointsByName) {
    const parsed = parseJunctionName(name);
    if (!parsed || points.length === 0) {
      // Named junctions without a number ("Almondsbury Interchange") aren't junction numbers, so they're not shown.
      skipped.push(`${name || "(unnamed)"}: ${parsed ? "no node positions" : "no junction number in the name"}`);
      continue;
    }
    const centre: [number, number] = [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
    const spread = Math.max(...points.map((p) => metresBetween(p, centre)));
    if (spread > MAX_JUNCTION_SPREAD_METRES) {
      skipped.push(`${name}: nodes spread ${Math.round(spread)} m`);
      continue;
    }
    junctions.push({ name, ...parsed, position: [round(centre[0]), round(centre[1])] });
  }
  const snapshot = junctionsSnapshotSchema.parse({
    provenance,
    generatedAt,
    junctions: junctions.sort((a, b) => a.name.localeCompare(b.name, "en-GB", { numeric: true })),
  });
  return { snapshot, skipped };
}

export const JUNCTION_PROVENANCE_NOTES = [
  "Junction names are National Highways' own. Each label sits at the centre of the junction's Network Model nodes.",
  "Contains public sector information licensed under the Open Government Licence v3.0.",
];

/**
 * The API snapshot pair from one capture pair: runs the FROZEN matcher through the shared pipeline (runMatcher) and maps every
 * closure it can draw to the contract. Not live data until a live ingestion is approved, so provenance says so. Closures without
 * map geometry are quarantined and named in `leftOut`, never silently dropped.
 */
export async function buildApiSnapshots(openDir: string, apiDir: string, generatedAt: string) {
  const run = await runMatcher(openDir, apiDir);
  const mapper = await closureMapper(run, openDir);
  const shown = run.results.filter(mapper.mappable);
  const leftOut = run.results
    .filter((r) => !mapper.mappable(r))
    .map((r) => `${r.roads.join("/")} ${r.direction} ${r.situationId} ${r.start} [${r.classes.join("+")}] (no Network Model geometry for its closed links)`);
  const provenance = { kind: "development-snapshot" as const, label: "Development snapshot", capturedAt: run.now };
  const closures = closuresSnapshot(
    {
      ...provenance,
      sources: CLOSURE_SOURCES,
      notes: [
        "Published by the ingestion pipeline from a National Highways capture, before live operation is approved. This is not live data.",
        "Diversion classes come from the frozen P0 matcher. Official route matches are candidates pending review.",
        ...LICENCE_NOTES,
      ],
    },
    shown.map(mapper.toClosure),
    generatedAt,
  );
  const junctions = (await junctionsSnapshot(openDir, { ...provenance, sources: ["National Highways Network Model"], notes: JUNCTION_PROVENANCE_NOTES }, generatedAt)).snapshot;
  return { closures, junctions, leftOut, capturedAt: run.now };
}
