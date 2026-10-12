import * as z from "zod";
import type { RestrictionKind, RestrictionPoint } from "../../api/restrictions.ts";
import { polylineLength, type LonLat } from "../../geo/distance.ts";

/**
 * OpenStreetMap height and weight restrictions (community data, unverified) → restriction points. Overpass JSON in, validated at
 * the boundary; every element that can't be read reliably is skipped with a reason, never guessed. See docs/RESTRICTIONS.md for the
 * tags used and why.
 *
 * Kinds, from UK tagging practice:
 * - maxheight (signed limit) and maxheight:physical (measured clearance) → height. A maxheight with maxheight:signed=no has no
 *   sign, so it is shown as a clearance, not a signed limit.
 * - maxweight and maxweightrating → weight-structural: a limit for all vehicles.
 * - maxweightrating:hgv, and the older maxweight:hgv → weight-goods: the lorry-symbol environmental limit (e.g. 7.5 t).
 * - hgv=destination and similar access tags carry no value and NEVER create a weight restriction; they are kept as context only.
 * - <key>:conditional values ("7.5 @ (Mo-Fr 07:00-19:00)") are restrictions with conditions, kept verbatim.
 */
const tags = z.record(z.string(), z.string());
const elementSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("node"), id: z.number().int().positive(), version: z.number().int().positive(), timestamp: z.string(), lat: z.number(), lon: z.number(), tags }),
  z.object({
    type: z.literal("way"),
    id: z.number().int().positive(),
    version: z.number().int().positive(),
    timestamp: z.string(),
    geometry: z.array(z.object({ lat: z.number(), lon: z.number() })).min(2),
    tags,
  }),
]);
export type OsmElement = z.infer<typeof elementSchema>;

export const overpassResponseSchema = z.object({
  osm3s: z.object({ timestamp_osm_base: z.string() }),
  elements: z.array(z.unknown()),
});

/** Plausible ranges: anything outside is a typo or a non-road value and is skipped. */
const HEIGHT_RANGE = { min: 1.5, max: 10 };
const WEIGHT_RANGE = { min: 1, max: 100 };

export type Parsed = { value: number } | { skip: string };

/** Values meaning "no specific limit": recorded on purpose, but not a restriction to show. */
const NO_LIMIT = new Set(["default", "none", "below_default", "no_sign", "no_indications", "unsigned"]);

/** An OSM height: metres ("4.2", "4.2 m", "4.2m") or feet and inches ("14'6\"", "14'", typographic quotes too). */
export function parseHeight(text: string): Parsed {
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
  if (metres === null) return { skip: `unreadable height (${t})` };
  if (metres < HEIGHT_RANGE.min || metres > HEIGHT_RANGE.max) return { skip: `implausible height (${t})` };
  return { value: Math.round(metres * 100) / 100 };
}

/** An OSM weight in tonnes ("7.5", "7.5 t", "7.5t"). Other units (st, lbs, kg) are skipped rather than converted. */
export function parseWeight(text: string): Parsed {
  const t = text.trim();
  if (NO_LIMIT.has(t)) return { skip: `no specific limit (${t})` };
  const m = /^(\d+(?:\.\d+)?)\s*(?:t)?$/.exec(t);
  if (!m) return { skip: `unreadable weight (${t})` };
  const tonnes = Number(m[1]);
  if (tonnes < WEIGHT_RANGE.min || tonnes > WEIGHT_RANGE.max) return { skip: `implausible weight (${t})` };
  return { value: tonnes };
}

/** "7.5 @ (Mo-Fr 07:00-19:00); none @ destination" → each value with its condition, verbatim. Throws on malformed text. */
export function parseConditional(text: string): { value: string; condition: string }[] {
  const parts: { value: string; condition: string }[] = [];
  // Split on ";" outside parentheses.
  let depth = 0;
  let start = 0;
  const pieces: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (text[i] === ";" && depth === 0) {
      pieces.push(text.slice(start, i));
      start = i + 1;
    }
  }
  pieces.push(text.slice(start));
  for (const piece of pieces) {
    const at = piece.indexOf("@");
    if (at < 0) throw new Error(`no "@" in conditional "${text}"`);
    const value = piece.slice(0, at).trim();
    const condition = piece.slice(at + 1).trim().replace(/^\((.*)\)$/, "$1").trim();
    if (!value || !condition) throw new Error(`empty part in conditional "${text}"`);
    parts.push({ value, condition });
  }
  return parts;
}

/** The keys read, by kind. The order matters: the first present key with a readable value is the record's limit. */
const KEYS: { kind: RestrictionKind; key: string; physical: boolean; parse: (t: string) => Parsed }[] = [
  { kind: "height", key: "maxheight", physical: false, parse: parseHeight },
  { kind: "height", key: "maxheight:physical", physical: true, parse: parseHeight },
  { kind: "weight-structural", key: "maxweight", physical: false, parse: parseWeight },
  { kind: "weight-structural", key: "maxweightrating", physical: false, parse: parseWeight },
  { kind: "weight-goods", key: "maxweightrating:hgv", physical: false, parse: parseWeight },
  { kind: "weight-goods", key: "maxweight:hgv", physical: false, parse: parseWeight },
];

/** Tags kept with each record, so the details can show exactly what OSM says. Personal or free-text tags are never kept. */
const KEPT = /^(highway|name|ref|bridge|tunnel|barrier|layer|maxheight.*|maxweight.*|maxweightrating.*|hgv.*|goods.*|access)$/;

/** A way's restriction position: halfway along it. Ways longer than this are marked approximate. */
const POINT_LIKE_METRES = 200;

function midpoint(line: LonLat[]): LonLat {
  const half = polylineLength(line) / 2;
  let run = 0;
  for (let i = 1; i < line.length; i++) {
    const seg = polylineLength([line[i - 1]!, line[i]!]);
    if (run + seg >= half && seg > 0) {
      const f = (half - run) / seg;
      return [line[i - 1]![0] + f * (line[i]![0] - line[i - 1]![0]), line[i - 1]![1] + f * (line[i]![1] - line[i - 1]![1])];
    }
    run += seg;
  }
  return line[Math.floor(line.length / 2)]!;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export interface OsmReadResult {
  points: RestrictionPoint[];
  skipped: { element: string; key: string; reason: string }[];
}

/**
 * Restriction points from one element: at most one per kind (a way can carry a height limit and a weight limit). When a kind has
 * both a plain and a conditional value, the plain value is the limit and the conditions are listed with it; a conditional value on
 * its own becomes a limit that applies only under its conditions.
 */
export function readElement(raw: unknown): OsmReadResult {
  const parsed = elementSchema.safeParse(raw);
  if (!parsed.success) return { points: [], skipped: [{ element: describe(raw), key: "-", reason: "invalid element" }] };
  const el = parsed.data;
  const name = `${el.type}/${el.id}`;
  const skipped: OsmReadResult["skipped"] = [];
  const points: RestrictionPoint[] = [];
  const line: LonLat[] = el.type === "way" ? el.geometry.map((g) => [g.lon, g.lat] as const) : [];
  const length = el.type === "way" ? polylineLength(line) : null;
  const position: LonLat = el.type === "node" ? [el.lon, el.lat] : midpoint(line);
  const kept = Object.fromEntries(Object.entries(el.tags).filter(([k]) => KEPT.test(k)));

  for (const kind of ["height", "weight-structural", "weight-goods"] as const) {
    let found: { key: string; value: number; recorded: string; physical: boolean; conditions: string[] } | null = null;
    const conditions: string[] = [];
    for (const k of KEYS.filter((x) => x.kind === kind)) {
      const plain = el.tags[k.key];
      const conditional = el.tags[`${k.key}:conditional`];
      if (conditional !== undefined) {
        try {
          for (const part of parseConditional(conditional)) conditions.push(`${k.key}: ${part.value} @ ${part.condition}`);
        } catch (e) {
          skipped.push({ element: name, key: `${k.key}:conditional`, reason: (e as Error).message });
        }
      }
      if (found) continue;
      if (plain !== undefined) {
        const p = k.parse(plain);
        if ("skip" in p) skipped.push({ element: name, key: k.key, reason: p.skip });
        else found = { key: k.key, value: p.value, recorded: plain, physical: k.physical || (k.key === "maxheight" && el.tags["maxheight:signed"] === "no"), conditions: [] };
      } else if (conditional !== undefined) {
        // A value that applies only under conditions: the first readable value is the limit; all conditions are listed.
        try {
          for (const part of parseConditional(conditional)) {
            const p = k.parse(part.value);
            if ("value" in p) {
              found = { key: `${k.key}:conditional`, value: p.value, recorded: conditional, physical: k.physical, conditions: [] };
              break;
            }
          }
        } catch {
          // Already reported above.
        }
      }
    }
    if (!found) continue;
    points.push({
      id: `osm/${name}/${kind}`,
      source: "osm",
      kind,
      limit: { min: found.value, max: found.value },
      recorded: found.recorded,
      physical: found.physical,
      conditions,
      position: [round6(position[0]), round6(position[1])],
      approximate: length !== null && length > POINT_LIKE_METRES,
      extentMetres: length === null ? null : Math.round(length),
      road: { name: el.tags["name"] ?? null, ref: el.tags["ref"] ?? null, area: null },
      sourceText: null,
      context: null,
      lastEdited: new Date(el.timestamp).toISOString(),
      osm: { type: el.type, id: el.id, version: el.version, tags: kept },
    });
  }
  return { points, skipped };
}

function describe(raw: unknown): string {
  const r = raw as { type?: unknown; id?: unknown } | null;
  return `${String(r?.type)}/${String(r?.id)}`;
}

/** All elements from one or more Overpass responses, de-duplicated by element (tiles overlap at their edges), sorted by id. */
export function readOverpass(responses: unknown[]): OsmReadResult & { dataAsOf: string } {
  const seen = new Map<string, unknown>();
  let dataAsOf = "";
  for (const r of responses) {
    const parsed = overpassResponseSchema.parse(r);
    if (parsed.osm3s.timestamp_osm_base > dataAsOf) dataAsOf = parsed.osm3s.timestamp_osm_base;
    for (const el of parsed.elements) seen.set(describe(el), el);
  }
  const points: RestrictionPoint[] = [];
  const skipped: OsmReadResult["skipped"] = [];
  for (const el of seen.values()) {
    const r = readElement(el);
    points.push(...r.points);
    skipped.push(...r.skipped);
  }
  points.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { points, skipped, dataAsOf };
}
