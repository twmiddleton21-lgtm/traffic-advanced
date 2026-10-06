/**
 * P0 diagnostic for decision D7 (approved): how many stretches can establish B, and why the others can't
 * (including the D7 label checks applied inside buildStretchIndex).
 * Usage: node scripts/analysis/check-stretch-labels.ts <open capture dir>
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ArcgisFeature } from "../../shared/sources/arcgis/schema.ts";
import { normaliseJunction, normaliseJunctionRef, normaliseLink, normaliseRoute, normaliseStretch } from "../../shared/sources/nh-arcgis/normalise.ts";
import { buildNetwork } from "../../shared/network/graph.ts";
import { buildStretchIndex } from "../../shared/diversion/stretch-index.ts";

const [openDir] = process.argv.slice(2);
if (!openDir) throw new Error("Usage: check-stretch-labels.ts <open capture dir>");
const features = async (f: string) => (JSON.parse(await readFile(join(openDir, f), "utf8")) as { features: ArcgisFeature[] }).features;
const network = buildNetwork((await features("s5/links.json")).map(normaliseLink), (await features("s5/junction-references.json")).map(normaliseJunctionRef), (await features("s5/junctions.json")).map(normaliseJunction));
const index = buildStretchIndex(network, (await features("s4/closure-stretches.json")).map(normaliseStretch), (await features("s4/diversion-routes.json")).map(normaliseRoute));
const tally = new Map<string, number>();
for (const reason of index.failures.values()) tally.set(reason, (tally.get(reason) ?? 0) + 1);
console.log({ stretches: index.usable.size + index.failures.size, usableForB: index.usable.size, ...Object.fromEntries(tally) });
