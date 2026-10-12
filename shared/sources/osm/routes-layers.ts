import type { OsmRef, RoutesPoint, RoutesPointKind, RoutesSection, RoutesValue } from "../../api/routes-layers.ts";
import { metresBetween, polylineLength, type LonLat } from "../../geo/distance.ts";
import { parseConditional, parseHeight, parseWeight, type Parsed } from "./restrictions.ts";

/**
 * OpenStreetMap cameras and road restrictions for the Routes map's layers (docs/ROUTES-MAP.md), read from the elements
 * scripts/routes-layers/extract-osm.ts keeps from a Geofabrik extract. Pure and deterministic: the same elements give the same
 * records. Every element or tag that can't be read reliably is left out with a reason (the build report counts them); nothing is
 * guessed, and a road with no record is never treated as unrestricted.
 *
 * The height, weight and conditional parsers are the Closures view's own (shared/sources/osm/restrictions.ts), used unchanged, so
 * the same tag means the same thing in both views. The Closures pipeline itself is not touched.
 *
 * Rules, by layer:
 * - Speed cameras: nodes tagged highway=speed_camera, and the device node of each enforcement relation for speed
 *   (enforcement=maxspeed or average_speed). One record per node.
 * - Red-light cameras: the device node of each enforcement relation with enforcement=traffic_signals (the documented tagging;
 *   enforcement=red_light_camera and enforcement tags on nodes are documented mistakes and are left out).
 * - Camera speed limits: shown only when mapped as "<n> mph" and every mapped value agrees. A bare number is km/h by OSM's rules
 *   but is often a mistake in England, so it is never converted. This is the road's mapped limit, never a lorry limit.
 * - Camera direction: the bearing from each enforcement relation's "from" point to its "to" point (OSM's documented roles), and the
 *   camera's own direction tag verbatim. Nothing else is inferred.
 * - Average speed sections: an average_speed relation whose "section" ways join into one unbroken line that passes through its
 *   "from" and "to" points. Only the stretch between them is drawn, from start to end. Anything less is left out.
 * - Restrictions: roads for motor vehicles (highway=*) and nodes with a restriction tag. Signed and physical heights and widths are
 *   kept as recorded, and the lower is shown, never the higher. Conditions and exemptions are kept verbatim; a value mapped only
 *   under conditions is marked as such, never shown as a general rule.
 */

export type Tags = Record<string, string>;
export interface InputNode {
  id: number;
  version: number;
  timestamp: string | null;
  lat: number;
  lon: number;
  tags: Tags;
}
export interface InputWay {
  id: number;
  version: number;
  timestamp: string | null;
  tags: Tags;
  refs: number[];
  geometry: (readonly [number, number] | null)[];
}
export interface InputMember {
  type: "node" | "way" | "relation";
  ref: number;
  role: string;
}
export interface InputRelation {
  id: number;
  version: number;
  timestamp: string | null;
  tags: Tags;
  members: InputMember[];
}
export interface RoutesInput {
  nodes: InputNode[];
  ways: InputWay[];
  relations: InputRelation[];
}
export interface Skip {
  element: string;
  layer: string;
  reason: string;
}
export interface RoutesLayersResult {
  points: Record<"speed-cameras" | "red-light-cameras" | "height" | "weight" | "width-length" | "access", RoutesPoint[]>;
  sections: RoutesSection[];
  skipped: Skip[];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Values.

/** Plausible ranges: anything outside is a typo, a unit mistake or not a road value, and is left out. */
const WIDTH_RANGE = { min: 1.5, max: 10 };
const LENGTH_RANGE = { min: 3, max: 40 };
const MPH_RANGE = { min: 5, max: 70 };
const NO_LIMIT = new Set(["default", "none", "below_default", "no_sign", "no_indications", "unsigned"]);

/** Metres ("2.1", "2.1 m", "2.1m") or feet and inches ("6'6\""), as OSM maps widths and lengths. */
export function parseMetres(text: string, range: { min: number; max: number }, what: string): Parsed {
  const t = text.trim();
  if (NO_LIMIT.has(t)) return { skip: `no specific limit (${t})` };
  let metres: number | null = null;
  const m = /^(\d+(?:\.\d+)?)\s*(?:m)?$/.exec(t);
  if (m) metres = Number(m[1]);
  const ft = /^(\d+)\s*['′’]\s*(?:(\d+(?:\.\d+)?)\s*(?:"|″|”|''))?$/.exec(t);
  if (ft) {
    const inches = Number(ft[2] ?? 0);
    if (inches >= 12) return { skip: `inches out of range (${t})` };
    metres = (Number(ft[1]) * 12 + inches) * 0.0254;
  }
  if (metres === null) return { skip: `unreadable ${what} (${t})` };
  if (metres < range.min || metres > range.max) return { skip: `implausible ${what} (${t})` };
  return { value: Math.round(metres * 100) / 100 };
}

/** A UK speed limit as OSM maps it, "<n> mph". Anything else (bare numbers, which mean km/h, "national", "none") is not read. */
export function parseMph(text: string): Parsed {
  const m = /^(\d{1,3}) ?mph$/.exec(text.trim());
  if (!m) return { skip: `not an mph value (${text.trim()})` };
  const mph = Number(m[1]);
  if (mph < MPH_RANGE.min || mph > MPH_RANGE.max) return { skip: `implausible speed limit (${text.trim()})` };
  return { value: mph };
}

const ACCESS = new Set(["no", "destination", "delivery", "discouraged"] as const);
type Access = "no" | "destination" | "delivery" | "discouraged";
/** hgv=*: the values that restrict lorries. Permissions (yes, designated) and undocumented values are not restrictions to show. */
export function parseAccess(text: string): { value: Access } | { skip: string } {
  const t = text.trim();
  if ((ACCESS as Set<string>).has(t)) return { value: t as Access };
  if (["yes", "designated", "permissive", "official"].includes(t)) return { skip: `a permission, not a restriction (${t})` };
  return { skip: `value not shown (${t})` };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Geometry.

/** Roads for motor vehicles. Restriction tags on footways, cycleways, paths and tracks aren't lorry information. */
const MOTOR_ROADS = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
  "residential",
  "living_street",
  "service",
  "road",
  "busway",
]);

/** A stretch longer than this is marked approximate: its record is shown at its middle. */
const POINT_LIKE_METRES = 200;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function midpoint(line: LonLat[]): LonLat {
  const half = polylineLength(line) / 2;
  let run = 0;
  for (let i = 1; i < line.length; i++) {
    const seg = metresBetween(line[i - 1]!, line[i]!);
    if (run + seg >= half && seg > 0) {
      const f = (half - run) / seg;
      return [line[i - 1]![0] + f * (line[i]![0] - line[i - 1]![0]), line[i - 1]![1] + f * (line[i]![1] - line[i - 1]![1])];
    }
    run += seg;
  }
  return line[Math.floor(line.length / 2)]!;
}

/** Initial compass bearing from a to b, in whole degrees 0–359. */
export function bearing(a: LonLat, b: LonLat): number {
  const [l1, p1, l2, p2] = [a[0], a[1], b[0], b[1]].map((d) => (d * Math.PI) / 180) as [number, number, number, number];
  const y = Math.sin(l2 - l1) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(l2 - l1);
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360) % 360;
}

/** A way's full line, or null when any of its nodes is missing (cut off at the extract's edge) or it has fewer than two. */
function wayLine(w: InputWay): LonLat[] | null {
  if (w.geometry.length < 2 || w.geometry.length !== w.refs.length || w.geometry.some((g) => g === null)) return null;
  return w.geometry as LonLat[];
}

const newest = (times: (string | null)[]) => {
  const t = times.filter((x): x is string => x !== null).sort();
  return t.length > 0 ? new Date(t.at(-1)!).toISOString() : null;
};
const road = (tags: Tags) => ({ name: tags["name"] ?? null, ref: tags["ref"] ?? null });

// ---------------------------------------------------------------------------------------------------------------------------------
// Restrictions.

interface KeySpec {
  key: string;
  physical: boolean;
  parse: (t: string) => Parsed;
}
interface RestrictionSpec {
  kind: Exclude<RoutesPointKind, "speed-camera" | "red-light-camera" | "hgv-access">;
  layer: "height" | "weight" | "width-length";
  unit: "m" | "t";
  keys: KeySpec[];
  /** Ways only: the key is ignored on a node (a physical width on a lone node is usually a path barrier; road use can't be told). */
  waysOnly?: string[];
}

const RESTRICTIONS: RestrictionSpec[] = [
  {
    kind: "height",
    layer: "height",
    unit: "m",
    keys: [
      { key: "maxheight", physical: false, parse: parseHeight },
      { key: "maxheight:physical", physical: true, parse: parseHeight },
    ],
  },
  {
    kind: "weight-goods",
    layer: "weight",
    unit: "t",
    keys: [
      { key: "maxweightrating:hgv", physical: false, parse: parseWeight },
      { key: "maxweight:hgv", physical: false, parse: parseWeight },
    ],
  },
  {
    kind: "weight-structural",
    layer: "weight",
    unit: "t",
    keys: [
      { key: "maxweight", physical: false, parse: parseWeight },
      { key: "maxweightrating", physical: false, parse: parseWeight },
    ],
  },
  {
    kind: "width",
    layer: "width-length",
    unit: "m",
    keys: [
      { key: "maxwidth", physical: false, parse: (t) => parseMetres(t, WIDTH_RANGE, "width") },
      { key: "maxwidth:physical", physical: true, parse: (t) => parseMetres(t, WIDTH_RANGE, "width") },
    ],
    waysOnly: ["maxwidth:physical"],
  },
  { kind: "length", layer: "width-length", unit: "m", keys: [{ key: "maxlength", physical: false, parse: (t) => parseMetres(t, LENGTH_RANGE, "length") }] },
];

interface Place {
  ref: OsmRef;
  name: string;
  tags: Tags;
  position: LonLat;
  extent: number | null;
  timestamp: string | null;
}

/** The record for one restriction kind on one element, or null. Conditions are verbatim; malformed ones are reported and dropped. */
function readRestriction(spec: RestrictionSpec, place: Place, skip: (key: string, reason: string) => void): RoutesPoint | null {
  const keys = spec.keys.filter((k) => !(place.ref.type === "node" && spec.waysOnly?.includes(k.key)));
  const recorded: { key: string; value: string }[] = [];
  const conditions: string[] = [];
  const plain: { value: number; physical: boolean }[] = [];
  const conditional: { value: number; physical: boolean }[] = [];
  for (const k of keys) {
    const p = place.tags[k.key];
    const c = place.tags[`${k.key}:conditional`];
    if (p === undefined && c === undefined) continue;
    if (p !== undefined) {
      recorded.push({ key: k.key, value: p });
      const r = k.parse(p);
      if ("skip" in r) skip(k.key, r.skip);
      else plain.push({ value: r.value, physical: k.physical || (k.key === "maxheight" && place.tags["maxheight:signed"] === "no") });
    }
    if (c !== undefined) {
      recorded.push({ key: `${k.key}:conditional`, value: c });
      try {
        for (const part of parseConditional(c)) {
          conditions.push(`${k.key}: ${part.value} @ ${part.condition}`);
          const r = k.parse(part.value);
          if ("value" in r) conditional.push({ value: r.value, physical: k.physical });
        }
      } catch (e) {
        skip(`${k.key}:conditional`, (e as Error).message);
      }
    }
  }
  // The lower of the readable values: a record never overstates a clearance or a limit.
  const pick = (list: { value: number; physical: boolean }[]) => list.reduce((a, b) => (b.value < a.value ? b : a));
  const chosen = plain.length > 0 ? pick(plain) : conditional.length > 0 ? pick(conditional) : null;
  if (!chosen) return null;
  return {
    id: `osm/${place.name}/${spec.kind}`,
    kind: spec.kind,
    value: { type: "measure", amount: chosen.value, unit: spec.unit },
    recorded,
    conditionalOnly: plain.length === 0,
    conditions,
    physical: chosen.physical,
    direction: null,
    partOf: [],
    position: [place.position[0], place.position[1]],
    approximate: place.extent !== null && place.extent > POINT_LIKE_METRES,
    extentMetres: place.extent === null ? null : Math.round(place.extent),
    road: road(place.tags),
    lastEdited: newest([place.timestamp]),
    osm: [place.ref],
  };
}

/** hgv=* and hgv:conditional: a lorry access rule as mapped, or null. */
function readAccess(place: Place, skip: (key: string, reason: string) => void): RoutesPoint | null {
  const p = place.tags["hgv"];
  const c = place.tags["hgv:conditional"];
  if (p === undefined && c === undefined) return null;
  const recorded: { key: string; value: string }[] = [];
  const conditions: string[] = [];
  let plain: Access | null = null;
  let conditional: Access | null = null;
  if (p !== undefined) {
    recorded.push({ key: "hgv", value: p });
    const r = parseAccess(p);
    if ("skip" in r) skip("hgv", r.skip);
    else plain = r.value;
  }
  if (c !== undefined) {
    recorded.push({ key: "hgv:conditional", value: c });
    try {
      for (const part of parseConditional(c)) {
        conditions.push(`hgv: ${part.value} @ ${part.condition}`);
        const r = parseAccess(part.value);
        if ("value" in r && conditional === null) conditional = r.value;
      }
    } catch (e) {
      skip("hgv:conditional", (e as Error).message);
    }
  }
  // A restriction under conditions only (e.g. "no @ (22:00-07:00)") is kept, marked conditional; one whose conditional parts are
  // all permissions (e.g. hgv=no with "yes @ (delivery)") keeps the plain rule with those conditions listed.
  const access = plain ?? conditional;
  if (access === null) return null;
  return {
    id: `osm/${place.name}/hgv-access`,
    kind: "hgv-access",
    value: { type: "access", access },
    recorded,
    conditionalOnly: plain === null,
    conditions,
    physical: false,
    direction: null,
    partOf: [],
    position: [place.position[0], place.position[1]],
    approximate: place.extent !== null && place.extent > POINT_LIKE_METRES,
    extentMetres: place.extent === null ? null : Math.round(place.extent),
    road: road(place.tags),
    lastEdited: newest([place.timestamp]),
    osm: [place.ref],
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Cameras and sections.

type Enforcement = "maxspeed" | "average_speed" | "traffic_signals";
const ENFORCEMENTS = new Set<string>(["maxspeed", "average_speed", "traffic_signals"]);

/** The bearing of the traffic a relation checks: its single "from" node to its single "to" node, when both are mapped and apart. */
function travelBearing(r: InputRelation, nodes: Map<number, InputNode>): number | null {
  const from = r.members.filter((m) => m.role === "from");
  const to = r.members.filter((m) => m.role === "to");
  if (from.length !== 1 || to.length !== 1 || from[0]!.type !== "node" || to[0]!.type !== "node") return null;
  const a = nodes.get(from[0]!.ref);
  const b = nodes.get(to[0]!.ref);
  if (!a || !b) return null;
  const pa: LonLat = [a.lon, a.lat];
  const pb: LonLat = [b.lon, b.lat];
  return metresBetween(pa, pb) < 5 ? null : bearing(pa, pb);
}

/** The speed limit shown with a camera: every readable mapped value must agree, or none is shown. */
function cameraLimit(recorded: { key: string; value: string }[]): RoutesValue {
  const values = new Set<number>();
  for (const r of recorded) {
    const p = parseMph(r.value);
    if ("value" in p) values.add(p.value);
  }
  return values.size === 1 ? { type: "measure", amount: [...values][0]!, unit: "mph" } : null;
}

/** Joins ways into one unbroken line by their end nodes, or null when they don't form exactly one (a gap, a fork, a repeat). */
export function chainWays(ways: { refs: number[]; line: LonLat[] }[]): { refs: number[]; line: LonLat[] } | null {
  if (ways.length === 0) return null;
  const left = ways.slice(1);
  let refs = [...ways[0]!.refs];
  let line = [...ways[0]!.line];
  while (left.length > 0) {
    const i = left.findIndex((w) => [refs[0], refs.at(-1)].some((end) => w.refs[0] === end || w.refs.at(-1) === end));
    if (i < 0) return null;
    const w = left.splice(i, 1)[0]!;
    if (w.refs.at(-1) === refs[0]) [refs, line] = [[...w.refs, ...refs.slice(1)], [...w.line, ...line.slice(1)]];
    else if (w.refs[0] === refs.at(-1)) [refs, line] = [[...refs, ...w.refs.slice(1)], [...line, ...w.line.slice(1)]];
    else if (w.refs[0] === refs[0]) [refs, line] = [[...[...w.refs].reverse(), ...refs.slice(1)], [...[...w.line].reverse(), ...line.slice(1)]];
    else [refs, line] = [[...refs, ...[...w.refs].reverse().slice(1)], [...line, ...[...w.line].reverse().slice(1)]];
  }
  // A node visited twice means a loop or a fork folded back on itself: not one simple stretch of road.
  return new Set(refs).size === refs.length ? { refs, line } : null;
}

// ---------------------------------------------------------------------------------------------------------------------------------

/** Every Routes layer's records from one extract. `keep` decides whether a position is in scope (the build passes England). */
export function readRoutesLayers(input: RoutesInput, keep: (p: LonLat) => boolean): RoutesLayersResult {
  const skipped: Skip[] = [];
  const nodes = new Map(input.nodes.map((n) => [n.id, n]));
  const ways = new Map(input.ways.map((w) => [w.id, w]));
  const points: RoutesLayersResult["points"] = { "speed-cameras": [], "red-light-cameras": [], height: [], weight: [], "width-length": [], access: [] };
  const sections: RoutesSection[] = [];
  const out = (element: string, layer: string, reason: string) => skipped.push({ element, layer, reason });

  // Enforcement relations, by device node.
  const relationsByDevice = new Map<number, { r: InputRelation; enforcement: Enforcement }[]>();
  for (const r of input.relations) {
    const name = `relation/${r.id}`;
    const enforcement = r.tags["enforcement"];
    if (enforcement === undefined) {
      out(name, "cameras", "no enforcement tag");
      continue;
    }
    if (!ENFORCEMENTS.has(enforcement)) {
      out(name, "cameras", enforcement === "red_light_camera" ? "non-standard value (enforcement=red_light_camera)" : `enforcement type not shown (${enforcement})`);
      continue;
    }
    const devices = r.members.filter((m) => m.role === "device");
    if (devices.length === 0 && enforcement !== "average_speed") out(name, "cameras", "no device member");
    for (const d of devices) {
      if (d.type !== "node") out(name, "cameras", "device is not a node");
      else if (!nodes.has(d.ref)) out(name, "cameras", "device node not in the extract");
      else relationsByDevice.set(d.ref, [...(relationsByDevice.get(d.ref) ?? []), { r, enforcement: enforcement as Enforcement }]);
    }
  }

  // Cameras: one record per node, from its own tags and every relation that names it as the device.
  const cameraRecord = (n: InputNode, kind: "speed-camera" | "red-light-camera", relations: { r: InputRelation; enforcement: Enforcement }[]): RoutesPoint | null => {
    const position: LonLat = [round6(n.lon), round6(n.lat)];
    if (!keep(position)) {
      out(`node/${n.id}`, kind, "outside England");
      return null;
    }
    const recorded: { key: string; value: string }[] = [];
    if (n.tags["maxspeed"] !== undefined) recorded.push({ key: "maxspeed", value: n.tags["maxspeed"] });
    for (const { r } of relations) if (r.tags["maxspeed"] !== undefined) recorded.push({ key: `relation ${r.id} maxspeed`, value: r.tags["maxspeed"] });
    const bearings = [...new Set(relations.map(({ r }) => travelBearing(r, nodes)).filter((b): b is number => b !== null))].sort((a, b) => a - b);
    const mapped = n.tags["direction"] ?? null;
    return {
      id: `osm/node/${n.id}/${kind}`,
      kind,
      value: cameraLimit(recorded),
      recorded,
      conditionalOnly: false,
      conditions: [],
      physical: false,
      direction: bearings.length > 0 || mapped !== null ? { travelBearings: bearings, mapped } : null,
      partOf: [...new Set(relations.map((x) => x.enforcement))].sort(),
      position: [position[0], position[1]],
      approximate: false,
      extentMetres: null,
      road: road(n.tags),
      lastEdited: newest([n.timestamp, ...relations.map(({ r }) => r.timestamp)]),
      osm: [{ type: "node", id: n.id, version: n.version }, ...relations.map(({ r }) => ({ type: "relation" as const, id: r.id, version: r.version }))],
    };
  };
  const speedNodes = new Set<number>([
    ...input.nodes.filter((n) => n.tags["highway"] === "speed_camera").map((n) => n.id),
    ...[...relationsByDevice].filter(([, rs]) => rs.some((x) => x.enforcement !== "traffic_signals")).map(([id]) => id),
  ]);
  for (const id of [...speedNodes].sort((a, b) => a - b)) {
    const rec = cameraRecord(nodes.get(id)!, "speed-camera", (relationsByDevice.get(id) ?? []).filter((x) => x.enforcement !== "traffic_signals"));
    if (rec) points["speed-cameras"].push(rec);
  }
  for (const [id, rs] of [...relationsByDevice].sort(([a], [b]) => a - b)) {
    const red = rs.filter((x) => x.enforcement === "traffic_signals");
    if (red.length === 0) continue;
    const rec = cameraRecord(nodes.get(id)!, "red-light-camera", red);
    if (rec) points["red-light-cameras"].push(rec);
  }
  for (const n of input.nodes) if (n.tags["enforcement"] !== undefined) out(`node/${n.id}`, "cameras", "enforcement tag on a node (a documented mistake)");

  // Average speed sections.
  for (const r of input.relations.filter((x) => x.tags["enforcement"] === "average_speed")) {
    const name = `relation/${r.id}`;
    const fail = (reason: string) => out(name, "average-speed", reason);
    const from = r.members.filter((m) => m.role === "from" && m.type === "node");
    const to = r.members.filter((m) => m.role === "to" && m.type === "node");
    const sectionWays = r.members.filter((m) => m.role === "section" && m.type === "way").map((m) => ways.get(m.ref));
    if (sectionWays.length === 0) {
      fail("no section ways");
      continue;
    }
    if (from.length !== 1 || to.length !== 1) {
      fail("not exactly one from and one to point");
      continue;
    }
    const parts = sectionWays.map((w) => (w ? { w, line: wayLine(w) } : null));
    if (parts.some((p) => p === null || p.line === null)) {
      fail("section way missing or incomplete in the extract");
      continue;
    }
    const chain = chainWays(parts.map((p) => ({ refs: p!.w.refs, line: p!.line! })));
    if (!chain) {
      fail("section ways don't join into one unbroken line");
      continue;
    }
    let a = chain.refs.indexOf(from[0]!.ref);
    let b = chain.refs.indexOf(to[0]!.ref);
    if (a < 0 || b < 0) {
      fail("from or to point is not on the section");
      continue;
    }
    if (a === b) {
      fail("from and to are the same point");
      continue;
    }
    let line = chain.line;
    if (a > b) {
      line = [...line].reverse();
      [a, b] = [line.length - 1 - a, line.length - 1 - b];
    }
    const stretch = line.slice(a, b + 1).map(([x, y]) => [round6(x), round6(y)] as LonLat);
    if (!stretch.every(keep)) {
      fail("outside England");
      continue;
    }
    const recorded = r.tags["maxspeed"] !== undefined ? [{ key: "maxspeed", value: r.tags["maxspeed"] }] : [];
    const limit = recorded.length > 0 ? parseMph(recorded[0]!.value) : null;
    const first = parts[0]!.w.tags;
    sections.push({
      id: `osm/${name}/average-speed`,
      line: stretch.map(([x, y]) => [x, y] as [number, number]),
      lengthMetres: Math.round(polylineLength(stretch)),
      value: limit && "value" in limit ? { type: "measure", amount: limit.value, unit: "mph" } : null,
      recorded,
      travelBearing: bearing(stretch[0]!, stretch.at(-1)!),
      road: { name: r.tags["name"] ?? first["name"] ?? null, ref: first["ref"] ?? null },
      lastEdited: newest([r.timestamp, ...parts.map((p) => p!.w.timestamp)]),
      osm: [{ type: "relation", id: r.id, version: r.version }, ...parts.map((p) => ({ type: "way" as const, id: p!.w.id, version: p!.w.version }))],
    });
  }

  // Restrictions on roads and nodes.
  const places: Place[] = [];
  for (const w of input.ways) {
    const name = `way/${w.id}`;
    const highway = w.tags["highway"];
    if (highway === undefined) continue; // a section way only, read above
    if (!MOTOR_ROADS.has(highway)) {
      out(name, "restrictions", `not a road for motor vehicles (highway=${highway})`);
      continue;
    }
    const line = wayLine(w);
    if (!line) {
      out(name, "restrictions", "incomplete geometry");
      continue;
    }
    const mid = midpoint(line);
    places.push({ ref: { type: "way", id: w.id, version: w.version }, name, tags: w.tags, position: [round6(mid[0]), round6(mid[1])], extent: polylineLength(line), timestamp: w.timestamp });
  }
  for (const n of input.nodes) {
    if (n.tags["highway"] === "speed_camera") continue;
    places.push({ ref: { type: "node", id: n.id, version: n.version }, name: `node/${n.id}`, tags: n.tags, position: [round6(n.lon), round6(n.lat)], extent: null, timestamp: n.timestamp });
  }
  for (const place of places) {
    const found: { layer: keyof RoutesLayersResult["points"]; rec: RoutesPoint }[] = [];
    for (const spec of RESTRICTIONS) {
      const rec = readRestriction(spec, place, (key, reason) => out(place.name, spec.layer, `${key}: ${reason}`));
      if (rec) found.push({ layer: spec.layer, rec });
    }
    const access = readAccess(place, (key, reason) => out(place.name, "access", `${key}: ${reason}`));
    if (access) found.push({ layer: "access", rec: access });
    if (found.length === 0) continue;
    if (!keep(place.position)) {
      out(place.name, "restrictions", "outside England");
      continue;
    }
    for (const { layer, rec } of found) points[layer].push(rec);
  }

  for (const list of Object.values(points)) list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  sections.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { points, sections, skipped };
}
