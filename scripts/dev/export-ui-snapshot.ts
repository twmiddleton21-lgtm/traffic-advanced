/**
 * Exports a small DEVELOPMENT snapshot for the UI (web/src/data/dev-snapshot.json) by running the frozen matcher through the
 * shared pipeline on a development capture and mapping its output to the API contract (shared/api/closures.ts). It is bundled
 * only into development builds, as the fallback when the API is unavailable (web/src/data/trafficService.ts).
 * Classifications are the matcher's own; nothing here decides A/B/D. The output is validated against the contract.
 * Usage: node scripts/dev/export-ui-snapshot.ts data/raw/<open capture> data/raw/<nh-api capture>
 */
import { writeFile } from "node:fs/promises";
import { runMatcher, type ClosureResult } from "../lib/matcher-pipeline.ts";
import { CLOSURE_SOURCES, closureMapper, closuresSnapshot, LICENCE_NOTES } from "../lib/snapshot-builder.ts";

const [openDir, apiDir] = process.argv.slice(2);
if (!openDir || !apiDir) throw new Error("Usage: export-ui-snapshot.ts <open capture> <nh-api capture>");

const run = await runMatcher(openDir, apiDir);
const mapper = await closureMapper(run, openDir);

// Selection: the review candidates, the known hard cases, a few A results and some ordinary D, first occurrence of each.
const firstOccurrence = (situationId: string, direction: string) =>
  run.results.filter((r) => r.situationId === situationId && r.direction === direction).sort((a, b) => (a.start < b.start ? -1 : 1))[0];
const picks: ClosureResult[] = [
  firstOccurrence("491297", "southBound"), // M53 J4–J5 SB: B candidate
  firstOccurrence("520677", "eastBound"), // M65 J7–J8 EB: B candidate
  firstOccurrence("515870", "eastBound"), // M54 J1 to M6 J10A EB: D (stretch excluded by D7)
  firstOccurrence("469317", "northBound"), // A42 continuing from M42: D (E6)
  firstOccurrence("513589", "northBound"), // M1 J11A to J13: D (E6)
  firstOccurrence("491584", "southBound"), // A1 Colsterworth layby: D (E1, not a full closure)
].filter((r): r is ClosureResult => r !== undefined);
const seen = new Set(picks.map((p) => p.situationId));
const firstPerSituation = (filter: (r: ClosureResult) => boolean, limit: number) => {
  const out: ClosureResult[] = [];
  const roads = new Set<string>();
  for (const r of [...run.results].sort((a, b) => (a.key < b.key ? -1 : 1))) {
    if (out.length >= limit || seen.has(r.situationId) || roads.has(r.roads[0] ?? "") || !filter(r)) continue;
    if (!mapper.mappable(r)) continue;
    out.push(r);
    seen.add(r.situationId);
    roads.add(r.roads[0] ?? "");
  }
  return out;
};
picks.push(...firstPerSituation((r) => r.classes.includes("A") && /^M/.test(r.roads[0] ?? ""), 3));
picks.push(...firstPerSituation((r) => r.b.outcome === "D" && (r.b.failed === "E3" || r.b.failed === "E5") && r.roads.length === 1, 7));

const snapshot = closuresSnapshot(
  {
    kind: "development-snapshot",
    label: "Development snapshot",
    capturedAt: run.now,
    sources: CLOSURE_SOURCES,
    notes: [
      "Captured once for P0 development. This is not live data.",
      "Diversion classes come from the frozen P0 matcher. Official route matches are candidates pending review.",
      ...LICENCE_NOTES,
    ],
  },
  picks.map(mapper.toClosure),
  new Date().toISOString(),
);
await writeFile("web/src/data/dev-snapshot.json", JSON.stringify(snapshot));
console.log(`Exported ${snapshot.closures.length} closures: ${JSON.stringify(snapshot.closures.map((c) => `${c.road} ${c.direction} ${c.classes.join("+")}`))}`);
