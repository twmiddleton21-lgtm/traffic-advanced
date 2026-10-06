/**
 * P0 analysis: run the frozen matcher over one capture day.
 * Usage: node scripts/analysis/run-matcher.ts <open capture dir> <nh-api capture dir>
 * Writes <nh-api capture dir>/analysis/matcher-results.json (git-ignored) and prints a summary.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describeBResults, describeDReasons, runMatcher, summariseRun } from "../lib/matcher-pipeline.ts";

const [openDir, apiDir] = process.argv.slice(2);
if (!openDir || !apiDir) throw new Error("Usage: run-matcher.ts <open capture dir> <nh-api capture dir>");

const run = await runMatcher(openDir, apiDir);
const summary = summariseRun(run);
await mkdir(join(apiDir, "analysis"), { recursive: true });
await writeFile(join(apiDir, "analysis", "matcher-results.json"), JSON.stringify({ dataset: "analysis", summary, bResults: describeBResults(run), dReasons: describeDReasons(run), results: run.results, s2Only: run.s2Only }, null, 1));
console.log(JSON.stringify(summary, null, 2));
for (const b of describeBResults(run)) {
  console.log(
    `B  ${b.situationId} ${b.roads.join("+")} ${b.direction} ${b.window.start.slice(0, 10)} | ${b.nhComments[0] ?? ""} | stretch ${b.stretch.label} | ` +
      `E5 ${b.evidence.E5} | E6 ${b.evidence.E6} | E7 ${b.evidence.E7.toFixed(2)} | E8 ${b.evidence.E8} | ` +
      b.routes.map((x) => `${x.routeId} ${x.classification ?? "?"} [${x.hgvStatus}]`).join("; "),
  );
}
