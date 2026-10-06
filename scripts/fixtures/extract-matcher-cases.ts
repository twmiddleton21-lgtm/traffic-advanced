/**
 * Builds fixtures/matcher/<case>.json from raw captures for each case in fixtures/matcher/cases.json.
 * Each fixture holds real, trimmed data: the situation's carriagewayClosures records (raw S1), and the S4/S5 features
 * around it. The script re-runs the matcher on the trimmed data and aborts if any outcome differs from the full run,
 * so fixtures can't pass on a convenient subset.
 * Usage: node scripts/fixtures/extract-matcher-cases.ts data/raw/<open capture> data/raw/<nh-api capture>
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type { ArcgisFeature } from "../../shared/sources/arcgis/schema.ts";
import { normaliseDiversionPoint, normaliseJunction, normaliseJunctionRef, normaliseLink, normaliseRoute, normaliseStretch, type DiversionPoint } from "../../shared/sources/nh-arcgis/normalise.ts";
import { mergeS1Pages } from "../../shared/sources/nh-closures/merge.ts";
import { normaliseSituation } from "../../shared/sources/nh-closures/normalise.ts";
import { buildNetwork } from "../../shared/network/graph.ts";
import { buildStretchIndex } from "../../shared/diversion/stretch-index.ts";
import { groupClosures, type ClosureGroup } from "../../shared/diversion/closure-groups.ts";
import { evaluateB, type BEvaluation } from "../../shared/diversion/evaluate-b.ts";

interface Case {
  name: string;
  situationId: string;
  textIncludes: string;
  expected: "B" | "D";
}

const [openDir, apiDir] = process.argv.slice(2);
if (!openDir || !apiDir) throw new Error("Usage: extract-matcher-cases.ts <open capture> <nh-api capture>");
const MARGIN_DEG = 0.03; // ~2-3 km around the closure

const featuresOf = async (file: string): Promise<ArcgisFeature[]> =>
  (JSON.parse(await readFile(join(openDir, file), "utf8")) as { features: ArcgisFeature[] }).features;
const now = (JSON.parse(await readFile(join(apiDir, "manifest.json"), "utf8")) as { startedAt: string }).startedAt;

const linkFeatures = await featuresOf("s5/links.json");
const junctionRefFeatures = await featuresOf("s5/junction-references.json");
const junctionFeatures = await featuresOf("s5/junctions.json");
const stretchFeatures = await featuresOf("s4/closure-stretches.json");
const routeFeatures = await featuresOf("s4/diversion-routes.json");
const pointFeatures = await featuresOf("s4/diversion-points.json");
const pointsMap = (fs: ArcgisFeature[]): Map<string, DiversionPoint[]> => {
  const m = new Map<string, DiversionPoint[]>();
  for (const p of fs.map(normaliseDiversionPoint)) m.set(p.routeId, [...(m.get(p.routeId) ?? []), p]);
  return m;
};
const fullPoints = pointsMap(pointFeatures);

const fullNetwork = buildNetwork(linkFeatures.map(normaliseLink), junctionRefFeatures.map(normaliseJunctionRef), junctionFeatures.map(normaliseJunction));
const fullIndex = buildStretchIndex(fullNetwork, stretchFeatures.map(normaliseStretch), routeFeatures.map(normaliseRoute));

// Raw S1 records per situation, merged across pages.
const pageFiles = (await readdir(join(apiDir, "s1"))).filter((f) => f.startsWith("s1-planned-page")).sort();
const pages = await Promise.all(pageFiles.map(async (f) => (JSON.parse(await readFile(join(apiDir, "s1", f), "utf8")) as { body: unknown }).body));
const merged = mergeS1Pages(pages).situations;

const { cases } = JSON.parse(await readFile("fixtures/matcher/cases.json", "utf8")) as { cases: Case[] };

type Box = [number, number, number, number];
const boxOf = (points: Iterable<readonly [number, number]>): Box => {
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  }
  return [box[0] - MARGIN_DEG, box[1] - MARGIN_DEG, box[2] + MARGIN_DEG, box[3] + MARGIN_DEG];
};
const inBox = (box: Box, p: readonly number[]): boolean => p[0]! >= box[0] && p[0]! <= box[2] && p[1]! >= box[1] && p[1]! <= box[3];
const featureTouches = (box: Box, f: ArcgisFeature): boolean => {
  const g = f.geometry;
  return !!g && "paths" in g && g.paths.some((path) => path.some((p) => inBox(box, p)));
};
const outcomeKey = (e: BEvaluation): string =>
  e.outcome === "B" ? `B:${e.stretchId}:${e.routes.map((r) => `${r.routeId}=${r.hgvStatus}`).join("|")}` : `D:${e.failed}`;

/** Keep only the attributes the adapters read, plus geometry where matching uses it (not route lines), to keep fixtures small. */
const KEEP: Record<string, string[]> = {
  link: ["linkid", "roadname", "direction", "carriageway", "linkform", "startnode", "endnode", "directionality", "linkdesc"],
  ref: ["junctionid", "nodeid"],
  junction: ["junctionid", "junctionname"],
  stretch: ["SRNClosureStretchGUID", "RoadName", "Direction", "JunctionNumberFrom", "JunctionNumberTo", "Description"],
  point: ["DiversionRouteGUID", "RestrictionType", "MeasureValue", "MeasureUnit"],
  route: ["DiversionRouteGUID", "DiversionRouteID", "Description", "HeightLimitMetres", "WidthLimitMetres", "WeightLimitTonnes", "LengthLimitMetres", "SRNClosureStretchGUID", "RouteNumber", "RouteClassification", "RecordState", "DecommissionedDatetime", "SRNStartNode", "SRNEndNode", "SignageSymbol", "RouteLengthMiles", "EstimatedTravelTime", "LastmodifiedDatetime"],
};
const slim = (kind: keyof typeof KEEP) => (f: ArcgisFeature): ArcgisFeature => ({
  attributes: Object.fromEntries(KEEP[kind]!.filter((k) => k in f.attributes).map((k) => [k, f.attributes[k]])),
  ...(f.geometry && kind !== "route" && kind !== "ref" && kind !== "point" && kind !== "junction" ? { geometry: f.geometry } : {}),
});

await mkdir("fixtures/matcher", { recursive: true });
for (const c of cases) {
  const situation = merged.get(c.situationId);
  if (!situation) throw new Error(`${c.name}: situation ${c.situationId} not in capture`);
  const normalised = normaliseSituation(situation).records;
  const groups = groupClosures(normalised, now).filter((g) => g.comments.some((t) => t.includes(c.textIncludes)));
  const fullOutcomes = groups.map((g) => outcomeKey(evaluateB(g, fullNetwork, fullIndex, fullPoints)));
  // Keep carriagewayClosures records whose window overlaps a selected closure (others can't affect its grouping).
  const windows = groups.map((g) => ({ start: g.start, end: g.end }));
  const keepIds = new Set(
    normalised
      .filter((r) => r.managementType === "carriagewayClosures" && windows.some((w) => r.start < w.end && w.start < r.end))
      .map((r) => r.recordId),
  );
  const records = [...situation.records.values()].filter(({ record }) => keepIds.has(record.idG));

  const box = boxOf(groups.flatMap((g) => g.points));
  const closedLinks = new Set(groups.flatMap((g: ClosureGroup) => [...g.closedMainLinkIds]));
  const roadDirections = new Set(groups.flatMap((g) => g.roads.map((r) => `${r}|${g.direction}`)));
  const stretches = stretchFeatures.filter((f) => {
    const st = normaliseStretch(f);
    return featureTouches(box, f) || roadDirections.has(`${st.road}|${st.direction ?? ""}`);
  });
  const stretchIds = new Set(stretches.map((f) => normaliseStretch(f).id));
  const routes = routeFeatures.filter((f) => stretchIds.has(normaliseRoute(f).stretchId));
  const routeIds = new Set(routes.map((f) => normaliseRoute(f).id));
  const points = pointFeatures.filter((f) => routeIds.has(normaliseDiversionPoint(f).routeId));
  const pathLinks = new Set([...stretchIds].flatMap((id) => fullIndex.usable.get(id)?.linkIds ?? []));
  const links = linkFeatures.filter((f) => {
    const id = normaliseLink(f).id;
    return closedLinks.has(id) || pathLinks.has(id) || featureTouches(box, f);
  });
  const nodes = new Set(links.flatMap((f) => [normaliseLink(f).startNode, normaliseLink(f).endNode]));
  const junctionRefs = junctionRefFeatures.filter((f) => nodes.has(normaliseJunctionRef(f).nodeId));
  const junctionIds = new Set(junctionRefs.map((f) => normaliseJunctionRef(f).junctionId));
  const junctions = junctionFeatures.filter((f) => junctionIds.has(normaliseJunction(f).junctionId));

  // Parity check: the trimmed data must reproduce the full-data outcomes exactly.
  const subNetwork = buildNetwork(links.map(normaliseLink), junctionRefs.map(normaliseJunctionRef), junctions.map(normaliseJunction));
  const subIndex = buildStretchIndex(subNetwork, stretches.map(normaliseStretch), routes.map(normaliseRoute));
  const subSituation = mergeS1Pages([
    { D2Payload: { publicationTime: now, situation: [{ idG: situation.id, situationVersionTime: situation.versionTime, situationRecord: records.map(({ type, record }) => ({ [type]: record })) }] } },
  ]).situations.get(situation.id)!;
  const subGroups = groupClosures(normaliseSituation(subSituation).records, now).filter((g) => g.comments.some((t) => t.includes(c.textIncludes)));
  const subOutcomes = subGroups.map((g) => outcomeKey(evaluateB(g, subNetwork, subIndex, pointsMap(points))));
  if (subGroups.length !== groups.length || subOutcomes.join() !== fullOutcomes.join()) {
    throw new Error(`${c.name}: trimmed fixture changes outcomes (${fullOutcomes.join()} vs ${subOutcomes.join()})`);
  }

  const fixture = {
    case: c.name,
    capture: { open: openDir.split(/[\\/]/).pop(), nhApi: apiDir.split(/[\\/]/).pop() },
    now,
    note: "Real data, trimmed: only this situation's carriagewayClosures records and S4/S5 features near the closure. Parity with the full run verified at extraction.",
    s1Page: {
      D2Payload: {
        publicationTime: now,
        situation: [{ idG: situation.id, situationVersionTime: situation.versionTime, situationRecord: records.map(({ type, record }) => ({ [type]: record })) }],
      },
    },
    s5Links: links.map(slim("link")),
    s5JunctionRefs: junctionRefs.map(slim("ref")),
    s5Junctions: junctions.map(slim("junction")),
    s4Stretches: stretches.map(slim("stretch")),
    s4Routes: routes.map(slim("route")),
    s4Points: points.map(slim("point")),
    fullRunOutcomes: fullOutcomes,
  };
  // Approved decision D6: fixtures are stored gzip-compressed to keep the repository small (no Git LFS).
  await writeFile(join("fixtures/matcher", `${c.name}.json.gz`), gzipSync(JSON.stringify(fixture), { level: 9 }));
  console.log(`${c.name}: ${groups.length} group(s) ${fullOutcomes.join(", ") || "(none: no eligible full closure)"} | links ${links.length}, stretches ${stretches.length}`);
}
