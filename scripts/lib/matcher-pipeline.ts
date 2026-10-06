/**
 * Loads one capture day and runs the frozen matcher over it. Used by scripts/analysis/run-matcher.ts, and must also be used by the
 * held-out evaluation tools when they're built, so analysis and evaluation can never use different pipelines.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ArcgisFeature } from "../../shared/sources/arcgis/schema.ts";
import {
  normaliseDiversionPoint,
  normaliseJunction,
  normaliseJunctionRef,
  normaliseLink,
  normaliseRoute,
  normaliseScheduledClosure,
  normaliseStretch,
  type DiversionPoint,
} from "../../shared/sources/nh-arcgis/normalise.ts";
import { mergeS1Pages } from "../../shared/sources/nh-closures/merge.ts";
import { normaliseSituation, type ClosureRecord } from "../../shared/sources/nh-closures/normalise.ts";
import { buildNetwork } from "../../shared/network/graph.ts";
import { buildStretchIndex } from "../../shared/diversion/stretch-index.ts";
import { groupClosures, type ClosureGroup } from "../../shared/diversion/closure-groups.ts";
import { evaluateB } from "../../shared/diversion/evaluate-b.ts";
import { evaluateA } from "../../shared/diversion/evaluate-a.ts";
import { classify, type Classification } from "../../shared/diversion/classify.ts";
import { classifyS2Only, findS2OnlyEvents, type S2OnlyEvent } from "../../shared/diversion/s2-only.ts";

export interface ClosureResult extends Classification {
  key: string;
  situationId: string;
  roads: string[];
  direction: string;
  start: string;
  end: string;
  comments: string[];
  links: number;
}

export async function runMatcher(openDir: string, apiDir: string) {
  const features = async (file: string): Promise<ArcgisFeature[]> =>
    (JSON.parse(await readFile(join(openDir, file), "utf8")) as { features: ArcgisFeature[] }).features;
  const manifest = JSON.parse(await readFile(join(apiDir, "manifest.json"), "utf8")) as { startedAt: string };
  const now = manifest.startedAt;

  const network = buildNetwork(
    (await features("s5/links.json")).map(normaliseLink),
    (await features("s5/junction-references.json")).map(normaliseJunctionRef),
    (await features("s5/junctions.json")).map(normaliseJunction),
  );
  const stretches = (await features("s4/closure-stretches.json")).map(normaliseStretch);
  const routes = (await features("s4/diversion-routes.json")).map(normaliseRoute);
  const index = buildStretchIndex(network, stretches, routes);
  const pointsByRoute = new Map<string, DiversionPoint[]>();
  for (const p of (await features("s4/diversion-points.json")).map(normaliseDiversionPoint)) {
    pointsByRoute.set(p.routeId, [...(pointsByRoute.get(p.routeId) ?? []), p]);
  }

  const pageFiles = (await readdir(join(apiDir, "s1"))).filter((f) => f.startsWith("s1-planned-page")).sort();
  const pages = await Promise.all(pageFiles.map(async (f) => (JSON.parse(await readFile(join(apiDir, "s1", f), "utf8")) as { body: unknown }).body));
  const { situations, conflicts } = mergeS1Pages(pages);
  const records: ClosureRecord[] = [];
  let skipped = 0;
  for (const s of situations.values()) {
    const n = normaliseSituation(s);
    records.push(...n.records);
    skipped += n.skipped.length;
  }
  const s2 = (await features("s2/scheduled-closures.json")).map(normaliseScheduledClosure);

  const groups: ClosureGroup[] = groupClosures(records, now);
  const results: ClosureResult[] = groups.map((g) => ({
    key: `${g.situationId}|${g.direction}|${g.start}|${g.end}`,
    situationId: g.situationId,
    roads: g.roads,
    direction: g.direction,
    start: g.start,
    end: g.end,
    comments: [...new Set(g.comments)],
    links: g.closedMainLinkIds.size,
    ...classify("nh-s1", evaluateA(g.situationId, g.roads[0] ?? "", s2), evaluateB(g, network, index, pointsByRoute)),
  }));
  const s2Only: (Classification & { event: S2OnlyEvent })[] = findS2OnlyEvents(s2, new Set(situations.keys())).map((e) => ({ event: e, ...classifyS2Only(e) }));
  return { now, network, index, stretches, routes, situations, records, skipped, conflicts, s2, groups, results, s2Only };
}

export type MatcherRun = Awaited<ReturnType<typeof runMatcher>>;

const tally = <T>(items: T[], key: (t: T) => string): Record<string, number> =>
  items.reduce<Record<string, number>>((acc, t) => ({ ...acc, [key(t)]: (acc[key(t)] ?? 0) + 1 }), {});

/**
 * The ONE summary of a matcher run. Used by run-matcher.ts and the held-out tools, so their totals can't diverge
 * (enforced by scripts/lib/pipeline-equivalence.test.ts).
 */
export function summariseRun(run: MatcherRun) {
  return {
    evaluatedAt: run.now,
    s1: { situations: run.situations.size, records: run.records.length, skippedRecords: run.skipped, mergeConflicts: run.conflicts.length },
    stretchIndex: { usable: run.index.usable.size, failures: tally([...run.index.failures.values()], (f) => f) },
    closureGroups: run.groups.length,
    classes: tally(run.results, (r) => r.classes.join("+")),
    dFailedEvidence: tally(run.results.filter((r) => r.b.outcome === "D"), (r) => (r.b.outcome === "D" ? r.b.failed : "")),
    aOutcomes: tally(run.results, (r) => (r.a.outcome === "A" ? "A" : r.a.reason)),
    s2Only: { events: run.s2Only.length, classes: tally(run.s2Only, (r) => r.classes.join("+")), multiClosureEvents: run.s2Only.filter((r) => r.event.closureCount > 1).length },
  };
}

/** Every B result with its evidence, in plain terms (junction ids resolved to S5 names). */
export function describeBResults(run: MatcherRun) {
  const names = (ids: string[]) => ids.map((id) => run.network.junctionNames.get(id) || id);
  return run.results.flatMap((r) => {
    if (r.b.outcome !== "B") return [];
    const t = r.b.trace;
    return [
      {
        key: r.key,
        situationId: r.situationId,
        roads: r.roads,
        direction: r.direction,
        window: { start: r.start, end: r.end },
        nhComments: r.comments,
        stretch: { id: r.b.stretchId, label: r.b.stretchLabel },
        evidence: {
          E1: t.closureStatements,
          E5: `${t.closedLinkCount} closed links at path positions ${t.firstPathPosition}-${t.lastPathPosition} of ${t.pathLinkCount}`,
          E6: `closure bounded by ${names(t.junctionBeforeClosure).join("/")} -> ${names(t.junctionAfterClosure).join("/")}; stretch ${names(t.stretchStartJunctions).join("/")} -> ${names(t.stretchEndJunctions).join("/")}`,
          E7: r.b.e7Coverage,
          E8: `${t.candidatesSameRoadDirection} same road+direction, ${t.candidatesContainingAllLinks} containing all links, ${t.candidatesPassingAll} passing`,
        },
        routes: r.b.routes.map((x) => ({ routeId: x.routeId, classification: x.classification, hgvStatus: x.hgvStatus, restrictions: x.restrictions })),
        alsoA: r.classes.includes("A"),
      },
    ];
  });
}

/** D rejections by first failing evidence item, with each item's distinct reasons and counts. */
export function describeDReasons(run: MatcherRun) {
  const out: Record<string, { count: number; reasons: Record<string, number> }> = {};
  for (const r of run.results) {
    if (r.b.outcome !== "D") continue;
    const entry = (out[r.b.failed] ??= { count: 0, reasons: {} });
    entry.count++;
    entry.reasons[r.b.reason] = (entry.reasons[r.b.reason] ?? 0) + 1;
  }
  return out;
}
