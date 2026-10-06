/**
 * P0 held-out set builder (SPECIFICATION §13.1 criteria 12–13). Runs the FROZEN matcher (shared pipeline) on a capture that
 * is not development data, selects the held-out closure-directions, and writes:
 *   worksheet.json        BLIND review sheet: closure facts and candidate official stretches, with no matcher outcome
 *   matcher-outcomes.json the frozen matcher's outcomes, kept separate and only joined at scoring time
 *   selection.json        provenance: dataset label, captures + SHA-256 of every capture file, rules-freeze hash, seed, population
 *   run-summary.json      the frozen matcher's A/B/D totals, B candidates with evidence, D rejection reasons (sealed: don't read while reviewing)
 *
 * Output: evaluation/heldout/<nh-api capture id>/ (real), or <capture>/analysis/heldout-dryrun/ (git-ignored) with --dry-run.
 * Usage: node scripts/p0/heldout-build.ts <open capture dir> <nh-api capture dir> [--dry-run] [--target 100] [--seed 20261010]
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { situationIdFromEventNumber } from "../../shared/diversion/evaluate-a.ts";
import { mergeStretchRows } from "../../shared/diversion/stretch-index.ts";
import { describeBResults, describeDReasons, runMatcher, summariseRun } from "../lib/matcher-pipeline.ts";
import { assertRulesFrozen, hashCapture, seededShuffle, selectHeldOut, type Candidate } from "./heldout-lib.ts";

/** Development captures (rules were designed on these). A held-out set must come from a different capture day. */
const DEV_CAPTURE_DAY = "2026-10-05";
const DEV_RESULTS = ["data/raw/2026-10-05T1208Z-nh-api/analysis/matcher-results.json", "data/raw/2026-10-05T1300Z-nh-api/analysis/matcher-results.json"];
const OWNER_SAMPLE_D = 20;

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const VALUE_FLAGS = new Set(["--target", "--seed"]);
const [openDir, apiDir] = args.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(args[i - 1] ?? ""));
if (!openDir || !apiDir) throw new Error("Usage: heldout-build.ts <open capture dir> <nh-api capture dir> [--dry-run] [--target N] [--seed S]");
const dryRun = args.includes("--dry-run");
const target = Number(flag("--target") ?? 100);
const seed = Number(flag("--seed") ?? 20261010);

const { freezeHash, reason } = assertRulesFrozen();
const apiId = basename(apiDir);
const openId = basename(openDir);
if (apiId.slice(0, 10) !== openId.slice(0, 10)) throw new Error(`Captures are from different days (${openId} vs ${apiId}).`);
if (apiId.startsWith(DEV_CAPTURE_DAY) && !dryRun) {
  throw new Error(`${apiId} is development data (${DEV_CAPTURE_DAY}). A held-out set must come from another capture day. Use --dry-run to test the tooling.`);
}
const outDir = dryRun ? join(apiDir, "analysis", "heldout-dryrun") : join("evaluation", "heldout", apiId);
if (!dryRun && existsSync(join(outDir, "worksheet.json"))) throw new Error(`${outDir}/worksheet.json exists. Refusing to overwrite review work.`);

const captureManifest = { open: hashCapture(openDir), nhApi: hashCapture(apiDir) };
const run = await runMatcher(openDir, apiDir);
const summary = summariseRun(run);
const dataset = dryRun ? "development-dry-run (NOT held-out evidence)" : "held-out";

// Closure-directions already seen in development captures are not held-out evidence.
const devKeys = new Set<string>();
for (const file of DEV_RESULTS) {
  if (!existsSync(file)) continue;
  const dev = JSON.parse(await readFile(file, "utf8")) as { results: { situationId: string; direction: string; start: string; end: string }[] };
  for (const r of dev.results) devKeys.add(`${r.situationId}|${r.direction}|${r.start}|${r.end}`);
}

// Eligible population: full main-carriageway closures (passed E1). E1 rejections aren't closures a diversion could apply to.
const eligible = run.results.filter((r) => r.b.outcome === "B" || r.b.failed !== "E1");
const excludedAsDev = dryRun ? 0 : eligible.filter((r) => devKeys.has(r.key)).length;
const population: Candidate[] = eligible
  .filter((r) => dryRun || !devKeys.has(r.key))
  .map((r) => ({ key: r.key, outcome: r.b.outcome, failed: r.b.outcome === "D" ? r.b.failed : "" }));
const { selected, shortfall } = selectHeldOut(population, target, seed);

// Owner sample: every B plus a seeded random sample of D (every disputed case is added at scoring time).
const outcomeOf = new Map(population.map((p) => [p.key, p.outcome]));
const dKeys = selected.filter((k) => outcomeOf.get(k) === "D").sort();
const ownerD = new Set(seededShuffle(dKeys, seed + 1).slice(0, OWNER_SAMPLE_D));

const { merged: stretches } = mergeStretchRows(run.stretches);
const routesByStretch = new Map<string, string[]>();
for (const r of run.routes) if (r.complete && !r.decommissioned) routesByStretch.set(r.stretchId, [...(routesByStretch.get(r.stretchId) ?? []), r.routeId]);
const byKey = new Map(run.results.map((r) => [r.key, r]));
const groupByKey = new Map(run.groups.map((g) => [`${g.situationId}|${g.direction}|${g.start}|${g.end}`, g]));

const blankReview = { groundTruth: null, reviewer: null, reviewedAt: null, notes: "" };
const items = selected.map((key, i) => {
  const r = byKey.get(key)!;
  const g = groupByKey.get(key)!;
  const roads = new Set(r.roads);
  return {
    id: `H${String(i + 1).padStart(3, "0")}`,
    key,
    situationId: r.situationId,
    roads: r.roads,
    direction: r.direction,
    start: r.start,
    end: r.end,
    nhComments: r.comments,
    closedMainLinks: Object.entries(
      [...g.closedMainLinkIds]
        .map((id) => run.network.links.get(id)?.description ?? id)
        .reduce<Record<string, number>>((acc, d) => ({ ...acc, [d]: (acc[d] ?? 0) + 1 }), {}),
    ).map(([description, links]) => ({ description, links })),
    linkedS2Descriptions: [
      ...new Set(run.s2.filter((e) => situationIdFromEventNumber(e.eventNumber) === r.situationId).map((e) => e.description)),
    ],
    candidateStretches: stretches
      .filter((s) => roads.has(s.road) && s.direction === r.direction)
      .map((s) => ({ stretchId: s.id, label: `${s.junctionFrom} -> ${s.junctionTo}`, description: s.description, routes: routesByStretch.get(s.id) ?? [] })),
    ownerSample: r.b.outcome === "B" || ownerD.has(key),
    review: { ...blankReview },
    ownerReview: { ...blankReview },
  };
});

const outcomes = Object.fromEntries(
  selected.map((key) => {
    const r = byKey.get(key)!;
    return [key, { classes: r.classes, b: r.b.outcome === "B" ? { outcome: "B", stretchId: r.b.stretchId, stretchLabel: r.b.stretchLabel } : { outcome: "D", failed: r.b.failed, reason: r.b.reason }, a: r.a.outcome }];
  }),
);

const count = (xs: string[]) => xs.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x]: (acc[x] ?? 0) + 1 }), {});
const selection = {
  dataset,
  dryRun,
  generatedAt: new Date().toISOString(),
  captures: { open: openId, nhApi: apiId, openDir: openDir.replaceAll("\\", "/"), nhApiDir: apiDir.replaceAll("\\", "/"), evaluatedAt: run.now },
  captureManifest,
  rulesFreeze: { hash: freezeHash, reason },
  seed,
  target,
  selected: selected.length,
  shortfall,
  population: {
    closureDirections: run.results.length,
    eligiblePassedE1: eligible.length,
    excludedAsSeenInDevelopment: excludedAsDev,
    eligibleByOutcome: count(population.map((p) => (p.outcome === "B" ? "B" : `D:${p.failed}`))),
  },
  matcherTotals: summary.classes,
  bEligibleStretches: summary.stretchIndex.usable,
  ownerSampleRule: `every B plus ${OWNER_SAMPLE_D} seeded-random D; every "unsure" or disputed item is added at scoring`,
  instructions:
    'Blind review: set review.groundTruth to "stretch:<guid>" (the correct official stretch for this closure-direction, from candidateStretches), ' +
    '"no-correct-stretch", or "unsure". Record reviewer and reviewedAt. The owner fills ownerReview for items with ownerSample=true and for any "unsure". ' +
    "Do not look at matcher-outcomes.json while reviewing.",
};

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "selection.json"), JSON.stringify(selection, null, 2));
await writeFile(join(outDir, "worksheet.json"), JSON.stringify({ selection: { captures: selection.captures, rulesFreeze: selection.rulesFreeze, instructions: selection.instructions }, items }, null, 2));
await writeFile(join(outDir, "matcher-outcomes.json"), JSON.stringify({ dataset, rulesFreeze: selection.rulesFreeze, outcomes }, null, 2));
await writeFile(
  join(outDir, "run-summary.json"),
  JSON.stringify({ dataset, captures: selection.captures, rulesFreeze: selection.rulesFreeze, summary, bResults: describeBResults(run), dReasons: describeDReasons(run) }, null, 2),
);
console.log(
  JSON.stringify(
    {
      outDir,
      dataset,
      captures: { open: openId, nhApi: apiId },
      captureFilesPinned: Object.keys(captureManifest.open).length + Object.keys(captureManifest.nhApi).length,
      totals: summary.classes,
      bEligibleStretches: summary.stretchIndex.usable,
      dReasons: Object.fromEntries(Object.entries(describeDReasons(run)).map(([k, v]) => [k, v.count])),
      bCandidates: describeBResults(run).map((b) => `${b.situationId} ${b.roads.join("+")} ${b.direction} ${b.window.start.slice(0, 10)} -> ${b.stretch.label}`),
      selected: selection.selected,
      shortfall,
      population: selection.population,
    },
    null,
    2,
  ),
);
