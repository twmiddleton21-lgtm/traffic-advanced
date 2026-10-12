/**
 * Reads the Geofabrik England extract (fetch-osm.ts) and keeps only what the Routes map's layers need, in a small JSON file beside
 * it (data/raw/routes-layers/<stamp>/routes-extract.json, git-ignored). build-routes-layers.ts turns that into the app's files.
 *
 *   node scripts/routes-layers/extract-osm.ts <download folder>
 *
 * Three passes over the file (relations, then ways, then nodes, the order the PBF holds them in), because a relation names ways and
 * nodes stored before it:
 *   1. enforcement relations (type=enforcement), with their members;
 *   2. roads (highway=*) carrying a restriction tag, and every way an enforcement relation names;
 *   3. camera and restriction nodes, every node an enforcement relation names, and the coordinates of every way's nodes.
 * Nothing is interpreted here: the build decides what each element means and what it can't use.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readPbf, type PbfMember, type Tags } from "../lib/osm-pbf.ts";

/** Restriction tags read for the Routes layers (plain and :conditional forms). */
export const RESTRICTION_KEYS = [
  "maxheight",
  "maxheight:physical",
  "maxweight",
  "maxweightrating",
  "maxweightrating:hgv",
  "maxweight:hgv",
  "maxwidth",
  "maxwidth:physical",
  "maxlength",
  "hgv",
] as const;

const hasRestriction = (tags: Tags) => RESTRICTION_KEYS.some((k) => tags[k] !== undefined || tags[`${k}:conditional`] !== undefined);

/** A road (not a railway, path of another kind or building) with a restriction tag. */
export const wantedWay = (tags: Tags) => tags["highway"] !== undefined && hasRestriction(tags);
/** A camera, or a point restriction on a road (a barrier, bridge or sign mapped as a node). */
export const wantedNode = (tags: Tags) => tags["highway"] === "speed_camera" || hasRestriction(tags);
export const wantedRelation = (tags: Tags) => tags["type"] === "enforcement";

export interface ExtractNode {
  id: number;
  version: number;
  timestamp: string | null;
  lat: number;
  lon: number;
  tags: Tags;
}
export interface ExtractWay {
  id: number;
  version: number;
  timestamp: string | null;
  tags: Tags;
  refs: number[];
  /** [lon, lat] for each ref, in order; null where the node isn't in the extract (cut off at its edge). */
  geometry: ([number, number] | null)[];
}
export interface ExtractRelation {
  id: number;
  version: number;
  timestamp: string | null;
  tags: Tags;
  members: PbfMember[];
}
export interface RoutesExtract {
  source: { file: string; sha256: string; url: string; fetchedAt: string; replicationTimestamp: string | null; writingProgram: string | null };
  /** Tagged nodes kept for their own sake (cameras, point restrictions) and every node an enforcement relation names. */
  nodes: ExtractNode[];
  /** Restricted roads and every way an enforcement relation names. */
  ways: ExtractWay[];
  relations: ExtractRelation[];
}

function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("Usage: extract-osm.ts <download folder>");
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { entries: { id: string; file: string; sha256: string; url: string; fetchedAt: string }[] };
  const entry = manifest.entries.find((e) => e.id === "geofabrik-england");
  if (!entry) throw new Error(`No Geofabrik extract in ${dir}/manifest.json`);
  const path = join(dir, entry.file);
  const started = Date.now();
  const log = (s: string) => console.log(`${((Date.now() - started) / 1000).toFixed(0)}s ${s}`);

  // 1. Enforcement relations.
  const relations: ExtractRelation[] = [];
  const header = readPbf(path, { relation: (r) => void (wantedRelation(r.tags) && relations.push({ id: r.id, version: r.version, timestamp: r.timestamp, tags: r.tags, members: r.members })) });
  const memberWays = new Set<number>();
  const memberNodes = new Set<number>();
  for (const r of relations) for (const m of r.members) (m.type === "way" ? memberWays : m.type === "node" ? memberNodes : new Set()).add(m.ref);
  log(`pass 1: ${relations.length} enforcement relations`);

  // 2. Ways.
  const ways: ExtractWay[] = [];
  readPbf(path, { way: (w) => void ((wantedWay(w.tags) || memberWays.has(w.id)) && ways.push({ id: w.id, version: w.version, timestamp: w.timestamp, tags: w.tags, refs: w.refs, geometry: [] })) });
  const wayNodes = new Set<number>();
  for (const w of ways) for (const ref of w.refs) wayNodes.add(ref);
  log(`pass 2: ${ways.length} ways`);

  // 3. Nodes: kept ones in full, way nodes as coordinates only.
  const nodes: ExtractNode[] = [];
  const coords = new Map<number, [number, number]>();
  readPbf(path, {
    node: (n) => {
      if (wayNodes.has(n.id)) coords.set(n.id, [n.lon, n.lat]);
      if (wantedNode(n.tags) || memberNodes.has(n.id)) nodes.push({ id: n.id, version: n.version, timestamp: n.timestamp, lat: n.lat, lon: n.lon, tags: n.tags });
    },
  });
  for (const w of ways) w.geometry = w.refs.map((ref) => coords.get(ref) ?? null);
  log(`pass 3: ${nodes.length} nodes, ${coords.size} way-node coordinates`);

  const extract: RoutesExtract = {
    source: { file: entry.file, sha256: entry.sha256, url: entry.url, fetchedAt: entry.fetchedAt, replicationTimestamp: header.replicationTimestamp, writingProgram: header.writingProgram },
    nodes,
    ways,
    relations,
  };
  writeFileSync(join(dir, "routes-extract.json"), JSON.stringify(extract));
  const cameras = nodes.filter((n) => n.tags["highway"] === "speed_camera").length;
  log(`saved routes-extract.json (data to ${header.replicationTimestamp}); highway=speed_camera nodes: ${cameras}`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/routes-layers/extract-osm.ts")) main();
