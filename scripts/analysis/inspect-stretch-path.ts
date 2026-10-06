/**
 * P0 diagnostic: print a stretch's traced path node by node, with junction membership and slip-road connections.
 * Usage: node scripts/analysis/inspect-stretch-path.ts <open capture dir> <DiversionRouteID>
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ArcgisFeature } from "../../shared/sources/arcgis/schema.ts";
import { normaliseJunction, normaliseJunctionRef, normaliseLink, normaliseRoute, normaliseStretch } from "../../shared/sources/nh-arcgis/normalise.ts";
import { buildNetwork } from "../../shared/network/graph.ts";
import { buildStretchIndex } from "../../shared/diversion/stretch-index.ts";

const [openDir, routeIdArg] = process.argv.slice(2);
if (!openDir || !routeIdArg) throw new Error("Usage: inspect-stretch-path.ts <open capture dir> <DiversionRouteID>");
const features = async (f: string) => (JSON.parse(await readFile(join(openDir, f), "utf8")) as { features: ArcgisFeature[] }).features;
const links = (await features("s5/links.json")).map(normaliseLink);
const network = buildNetwork(links, (await features("s5/junction-references.json")).map(normaliseJunctionRef), (await features("s5/junctions.json")).map(normaliseJunction));
const routes = (await features("s4/diversion-routes.json")).map(normaliseRoute);
const route = routes.find((r) => r.routeId === routeIdArg);
if (!route) throw new Error(`route ${routeIdArg} not found`);
const index = buildStretchIndex(network, (await features("s4/closure-stretches.json")).map(normaliseStretch), routes);
const sp = index.usable.get(route.stretchId);
if (!sp) throw new Error(`stretch not usable: ${index.failures.get(route.stretchId)}`);
const names = new Map((await features("s5/junctions.json")).map((f) => [String(f.attributes["junctionid"] as string).replace(/[{}]/g, "").toLowerCase(), String(f.attributes["junctionname"] as string)]));
const slipsAt = new Map<string, string[]>();
for (const l of links) {
  if (l.form !== "SL") continue;
  slipsAt.set(l.startNode, [...(slipsAt.get(l.startNode) ?? []), `exit/out: ${l.description}`]);
  slipsAt.set(l.endNode, [...(slipsAt.get(l.endNode) ?? []), `entry/in: ${l.description}`]);
}
console.log(`${sp.stretch.road} ${sp.stretch.direction} ${sp.stretch.junctionFrom} -> ${sp.stretch.junctionTo}`);
sp.nodes.forEach((node, i) => {
  const j = [...(network.nodeJunctions.get(node) ?? [])].map((id) => names.get(id) ?? id).join(", ");
  const slips = slipsAt.get(node) ?? [];
  const link = i < sp.linkIds.length ? network.links.get(sp.linkIds[i]!)?.description : "";
  console.log(`node ${String(i).padStart(2)} ${j ? `[${j}]` : ""} ${slips.length ? `SLIPS: ${slips.join("; ")}` : ""}`);
  if (link) console.log(`   link ${i}: ${link}`);
});
