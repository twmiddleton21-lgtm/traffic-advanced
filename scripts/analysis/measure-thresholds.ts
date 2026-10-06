/**
 * P0 criterion 9: distributions behind the provisional stretch-path thresholds (rules.ts STRETCH_PATH_RULES).
 * For every complete route whose nodes trace on its road, report path length ÷ stretch length and the share of path
 * vertices within 30 m of the stretch geometry. Analysis only: changes no rule.
 * Usage: node scripts/analysis/measure-thresholds.ts <open capture dir>
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ArcgisFeature } from "../../shared/sources/arcgis/schema.ts";
import { fractionWithin, polylineLength } from "../../shared/geo/distance.ts";
import { normaliseJunction, normaliseJunctionRef, normaliseLink, normaliseRoute, normaliseStretch } from "../../shared/sources/nh-arcgis/normalise.ts";
import { buildNetwork, tracePath } from "../../shared/network/graph.ts";

const [openDir] = process.argv.slice(2);
if (!openDir) throw new Error("Usage: measure-thresholds.ts <open capture dir>");
const features = async (f: string) => (JSON.parse(await readFile(join(openDir, f), "utf8")) as { features: ArcgisFeature[] }).features;
const network = buildNetwork((await features("s5/links.json")).map(normaliseLink), (await features("s5/junction-references.json")).map(normaliseJunctionRef), (await features("s5/junctions.json")).map(normaliseJunction));
const stretches = new Map((await features("s4/closure-stretches.json")).map(normaliseStretch).map((s) => [s.id, s]));
const routes = (await features("s4/diversion-routes.json")).map(normaliseRoute).filter((r) => r.complete && !r.decommissioned);

const ratios: number[] = [];
const agreements: number[] = [];
const joint: { ratio: number; agreement: number }[] = [];
for (const r of routes) {
  const s = stretches.get(r.stretchId);
  if (!s || s.geometry.length === 0) continue;
  const path = tracePath(network, s.road, r.startNode, r.endNode);
  if (!path) continue;
  const len = s.geometry.reduce((n, l) => n + polylineLength(l), 0);
  const ratio = path.lengthMetres / len;
  const agreement = fractionWithin(path.linkIds.flatMap((id) => network.links.get(id)?.geometry.flat() ?? []), s.geometry, 30);
  ratios.push(ratio);
  agreements.push(agreement);
  joint.push({ ratio, agreement });
}
const pct = (xs: number[], qs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return Object.fromEntries(qs.map((q) => [`p${q * 100}`, Number(s[Math.min(s.length - 1, Math.floor(q * s.length))]!.toFixed(3))]));
};
const band = (lo: number, hi: number) => joint.filter((j) => j.ratio >= lo && j.ratio <= hi).length;
console.log({
  tracedRoutes: joint.length,
  lengthRatio: pct(ratios, [0.05, 0.1, 0.25, 0.5, 0.75, 0.9]),
  geometryAgreement: pct(agreements, [0.05, 0.1, 0.25, 0.5, 0.75, 0.9]),
  ratioWithin_0_95_1_05: band(0.95, 1.05),
  ratioWithin_0_8_1_25: band(0.8, 1.25),
  agreement_ge_0_95: agreements.filter((a) => a >= 0.95).length,
  agreement_ge_0_99: agreements.filter((a) => a >= 0.99).length,
  bothProvisionalChecksPass: joint.filter((j) => j.ratio >= 0.8 && j.ratio <= 1.25 && j.agreement >= 0.95).length,
  inRatioBandButAgreementBelow0_95: joint.filter((j) => j.ratio >= 0.8 && j.ratio <= 1.25 && j.agreement < 0.95).length,
});
