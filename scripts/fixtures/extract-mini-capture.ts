/**
 * Builds fixtures/p0/mini-capture/: a small, real-data capture in the exact on-disk layout the matcher pipeline reads,
 * trimmed to a few known situations. Used by scripts/lib/pipeline-equivalence.test.ts to prove run-matcher and the held-out
 * tools run the same frozen pipeline. Files are gzipped (decision D6). The script runs the shared pipeline on the trimmed
 * capture and aborts unless every outcome equals the full-capture run for those situations.
 * Usage: node scripts/fixtures/extract-mini-capture.ts data/raw/<open capture> data/raw/<nh-api capture>
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import type { ArcgisFeature } from "../../shared/sources/arcgis/schema.ts";
import { normaliseJunctionRef, normaliseLink, normaliseRoute, normaliseScheduledClosure, normaliseStretch } from "../../shared/sources/nh-arcgis/normalise.ts";
import { situationIdFromEventNumber } from "../../shared/diversion/evaluate-a.ts";
import { runMatcher, summariseRun } from "../lib/matcher-pipeline.ts";

/** M53 J4–J5 SB (B), M65 J7–J8 EB (B), M54 J1–M6 J10A EB (D via D7), A42 continuing from M42 (D). */
const SITUATIONS = ["491297", "520677", "515870", "469317"];
const MARGIN_DEG = 0.03;

const [openDir, apiDir] = process.argv.slice(2);
if (!openDir || !apiDir) throw new Error("Usage: extract-mini-capture.ts <open capture> <nh-api capture>");

const full = await runMatcher(openDir, apiDir);
const fullOutcomes = Object.fromEntries(
  full.results.filter((r) => SITUATIONS.includes(r.situationId)).map((r) => [r.key, outcomeKey(r)]),
);

const read = async (dir: string, file: string) => JSON.parse(await readFile(join(dir, file), "utf8")) as { layer?: unknown; features: ArcgisFeature[] };

// Areas of interest: one box per selected situation's closure geometry (sites are far apart).
const selectedGroups = full.groups.filter((g) => SITUATIONS.includes(g.situationId));
const roadDirections = new Set(selectedGroups.flatMap((g) => g.roads.map((r) => `${r}|${g.direction}`)));
const boxes = SITUATIONS.map((id) => {
  const pts = selectedGroups.filter((g) => g.situationId === id).flatMap((g) => g.points);
  return [
    Math.min(...pts.map((p) => p[0])) - MARGIN_DEG,
    Math.min(...pts.map((p) => p[1])) - MARGIN_DEG,
    Math.max(...pts.map((p) => p[0])) + MARGIN_DEG,
    Math.max(...pts.map((p) => p[1])) + MARGIN_DEG,
  ];
});
const near = (f: ArcgisFeature): boolean => {
  const g = f.geometry;
  if (!g || !("paths" in g)) return false;
  return g.paths.some((path) => path.some(([x, y]) => boxes.some((b) => x! >= b[0]! && x! <= b[2]! && y! >= b[1]! && y! <= b[3]!)));
};
/** Keep only the attributes the adapters read (plus geometry where matching uses it). */
const KEEP: Record<string, string[]> = {
  link: ["linkid", "roadname", "direction", "carriageway", "linkform", "startnode", "endnode", "directionality", "linkdesc"],
  ref: ["junctionid", "nodeid"],
  junction: ["junctionid", "junctionname"],
  stretch: ["SRNClosureStretchGUID", "RoadName", "Direction", "JunctionNumberFrom", "JunctionNumberTo", "Description"],
  route: ["DiversionRouteGUID", "DiversionRouteID", "Description", "HeightLimitMetres", "WidthLimitMetres", "WeightLimitTonnes", "LengthLimitMetres", "SRNClosureStretchGUID", "RouteNumber", "RouteClassification", "RecordState", "DecommissionedDatetime", "SRNStartNode", "SRNEndNode", "SignageSymbol", "RouteLengthMiles", "EstimatedTravelTime", "LastmodifiedDatetime"],
  point: ["DiversionRouteGUID", "RestrictionType", "MeasureValue", "MeasureUnit"],
  s2: ["formattedeventnumber", "road_number", "description", "scheduledplannedstartdate", "scheduledplannedenddate"],
};
const slim = (kind: string, withGeometry: boolean) => (f: ArcgisFeature): ArcgisFeature => ({
  attributes: Object.fromEntries(KEEP[kind]!.filter((k) => k in f.attributes).map((k) => [k, f.attributes[k]])),
  ...(withGeometry && f.geometry ? { geometry: f.geometry } : {}),
});

// S4: every stretch on the involved roads and directions (so E3/E8 see all candidates) plus anything nearby; their routes/points.
const stretches = (await read(openDir, "s4/closure-stretches.json")).features.filter((f) => {
  const st = normaliseStretch(f);
  return roadDirections.has(`${st.road}|${st.direction ?? ""}`) || near(f);
});
const stretchIds = new Set(stretches.map((f) => normaliseStretch(f).id));
const routes = (await read(openDir, "s4/diversion-routes.json")).features.filter((f) => stretchIds.has(normaliseRoute(f).stretchId));
const routeIds = new Set(routes.map((f) => normaliseRoute(f).id));
const routePoints = (await read(openDir, "s4/diversion-points.json")).features.filter((f) =>
  routeIds.has(String(f.attributes["DiversionRouteGUID"] as string).replace(/[{}]/g, "").toLowerCase()),
);
// S5: links near the closures, plus every link on the traced path of an included stretch, and the junctions of their nodes.
const pathLinks = new Set([...stretchIds].flatMap((id) => full.index.usable.get(id)?.linkIds ?? []));
const closedLinks = new Set(selectedGroups.flatMap((g) => [...g.closedMainLinkIds]));
const links = (await read(openDir, "s5/links.json")).features.filter((f) => {
  const id = normaliseLink(f).id;
  return near(f) || pathLinks.has(id) || closedLinks.has(id);
});
const nodes = new Set(links.flatMap((f) => [normaliseLink(f).startNode, normaliseLink(f).endNode]));
const junctionRefs = (await read(openDir, "s5/junction-references.json")).features.filter((f) => nodes.has(normaliseJunctionRef(f).nodeId));
const junctionIds = new Set(junctionRefs.map((f) => normaliseJunctionRef(f).junctionId));
const junctions = (await read(openDir, "s5/junctions.json")).features.filter((f) =>
  junctionIds.has(String(f.attributes["junctionid"] as string).replace(/[{}]/g, "").toLowerCase()),
);
const s2 = (await read(openDir, "s2/scheduled-closures.json")).features.filter((f) => {
  const id = situationIdFromEventNumber(normaliseScheduledClosure(f).eventNumber);
  return id !== null && SITUATIONS.includes(id);
});

// S1: the selected situations, all their records, as one page in the API's own payload shape.
const pageFiles = (await readdir(join(apiDir, "s1"))).filter((f) => f.startsWith("s1-planned-page")).sort();
const situations = new Map<string, { idG: string; situationVersionTime: string; situationRecord: unknown[] }>();
let publicationTime = "";
for (const f of pageFiles) {
  const body = (JSON.parse(await readFile(join(apiDir, "s1", f), "utf8")) as { body: { D2Payload: { publicationTime: string; situation: { idG: string; situationVersionTime: string; situationRecord: unknown[] }[] } } }).body;
  publicationTime ||= body.D2Payload.publicationTime;
  for (const s of body.D2Payload.situation) {
    if (!SITUATIONS.includes(s.idG)) continue;
    const existing = situations.get(s.idG);
    if (existing) {
      existing.situationRecord.push(...s.situationRecord);
      if (s.situationVersionTime > existing.situationVersionTime) existing.situationVersionTime = s.situationVersionTime;
    } else situations.set(s.idG, { ...s, situationRecord: [...s.situationRecord] });
  }
}
const manifest = JSON.parse(await readFile(join(apiDir, "manifest.json"), "utf8")) as { startedAt: string };

// The mini capture keeps the source capture folder names, so tools treat it as the same (development) day.
const files: Record<string, unknown> = {
  [`${basename(openDir)}/s2/scheduled-closures.json`]: { features: s2.map(slim("s2", false)) },
  [`${basename(openDir)}/s4/closure-stretches.json`]: { features: stretches.map(slim("stretch", true)) },
  [`${basename(openDir)}/s4/diversion-routes.json`]: { features: routes.map(slim("route", false)) },
  [`${basename(openDir)}/s4/diversion-points.json`]: { features: routePoints.map(slim("point", false)) },
  [`${basename(openDir)}/s5/links.json`]: { features: links.map(slim("link", true)) },
  [`${basename(openDir)}/s5/junction-references.json`]: { features: junctionRefs.map(slim("ref", false)) },
  [`${basename(openDir)}/s5/junctions.json`]: { features: junctions.map(slim("junction", false)) },
  [`${basename(apiDir)}/manifest.json`]: { startedAt: manifest.startedAt, note: "mini capture extracted for tests" },
  [`${basename(apiDir)}/s1/s1-planned-page000.json`]: { body: { D2Payload: { publicationTime, situation: [...situations.values()] } } },
};

// Parity check on a plain-JSON copy in a temp folder, using the shared pipeline.
const tmp = join(tmpdir(), `mini-capture-${process.pid}`);
await rm(tmp, { recursive: true, force: true });
for (const [path, content] of Object.entries(files)) {
  await mkdir(dirname(join(tmp, path)), { recursive: true });
  await writeFile(join(tmp, path), JSON.stringify(content));
}
const mini = await runMatcher(join(tmp, basename(openDir)), join(tmp, basename(apiDir)));
const miniOutcomes = Object.fromEntries(mini.results.map((r) => [r.key, outcomeKey(r)]));
const mismatches = Object.keys({ ...fullOutcomes, ...miniOutcomes }).filter((k) => fullOutcomes[k] !== miniOutcomes[k]);
await rm(tmp, { recursive: true, force: true });
if (mismatches.length > 0) throw new Error(`Mini capture changes outcomes: ${mismatches.slice(0, 5).join(", ")}`);

const out = "fixtures/p0/mini-capture";
await rm(out, { recursive: true, force: true });
for (const [path, content] of Object.entries(files)) {
  await mkdir(dirname(join(out, path)), { recursive: true });
  await writeFile(join(out, `${path}.gz`), gzipSync(JSON.stringify(content), { level: 9 }));
}
const summary = summariseRun(mini);
await writeFile(
  join(out, "expected.json"),
  JSON.stringify(
    {
      note: "Outcomes equal the full Day-1 run for these situations (verified at extraction). Real data, trimmed.",
      source: { open: basename(openDir), nhApi: basename(apiDir) },
      situations: SITUATIONS,
      openDirName: basename(openDir),
      nhApiDirName: basename(apiDir),
      classes: summary.classes,
      outcomes: miniOutcomes,
    },
    null,
    1,
  ),
);
console.log(`Mini capture: ${mini.results.length} closure-directions ${JSON.stringify(summary.classes)}; parity with full run verified.`);

function outcomeKey(r: (typeof full.results)[number]): string {
  return r.b.outcome === "B" ? `B:${r.b.stretchId}` : `D:${r.b.failed}`;
}
