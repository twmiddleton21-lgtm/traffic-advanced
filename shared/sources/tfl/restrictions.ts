import * as z from "zod";
import type { RestrictionPoint } from "../../api/restrictions.ts";
import { metresBetween, type LonLat } from "../../geo/distance.ts";
import { gridToWgs84 } from "../../geo/osgb.ts";
import { decodePolyline, ringsToMultiPolygon } from "../../geo/polygons.ts";

/**
 * Transport for London open data (official, Transport Data Service licence): low bridges, tunnels and road barriers, and the LEZ and
 * ULEZ boundaries. See docs/RESTRICTIONS.md for the files, their dates and what they do and don't contain.
 */

/** The spreadsheet's header row, exactly as TfL publishes it: a changed layout fails the build rather than being guessed at. */
const HEIGHT_HEADER = {
  A: "Height restriction (m)",
  B: "Height restriction (imperial)",
  C: "Easting",
  D: "Northing",
  E: "Grid Reference",
  F: "Lat",
  G: "Lng",
  H: "Borough",
  I: "Road name",
  J: "Road number",
  K: "TLRN [Red route]?",
  L: "Comments",
} as const;

/** TfL records heights only in bands: "Between 4.6 and 5.1", or "Up to 3.0" (no lower bound). */
export function parseHeightBand(text: string): { min: number | null; max: number } | null {
  const between = /^Between (\d+(?:\.\d+)?) and (\d+(?:\.\d+)?)$/.exec(text.trim());
  if (between) {
    const min = Number(between[1]);
    const max = Number(between[2]);
    return min > 0 && min <= max ? { min, max } : null;
  }
  const upTo = /^Up to (\d+(?:\.\d+)?)$/.exec(text.trim());
  return upTo ? { min: null, max: Number(upTo[1]) } : null;
}

/** The two coordinate pairs TfL gives must agree; further apart than this, the record is skipped as unreliable. */
const MAX_COORDINATE_DISAGREEMENT_METRES = 25;

const blank = (s: string | undefined) => (s === undefined || s.trim() === "" ? null : s.trim());

export function readTflHeights(rows: Record<string, string>[]): { points: RestrictionPoint[]; skipped: { record: string; reason: string }[] } {
  const [header, ...records] = rows;
  for (const [col, title] of Object.entries(HEIGHT_HEADER)) {
    if (header?.[col] !== title) throw new Error(`TfL height file: column ${col} is "${header?.[col]}", expected "${title}"`);
  }
  const points: RestrictionPoint[] = [];
  const skipped: { record: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    const gridRef = blank(r["E"]);
    const name = gridRef ?? JSON.stringify(r).slice(0, 60);
    const band = parseHeightBand(r["A"] ?? "");
    const lat = Number(r["F"]);
    const lon = Number(r["G"]);
    const e = Number(r["C"]);
    const n = Number(r["D"]);
    if (!gridRef || !/^T[QL]\d{10}$/.test(gridRef)) skipped.push({ record: name, reason: "missing or unexpected grid reference" });
    else if (seen.has(gridRef)) skipped.push({ record: name, reason: "duplicate grid reference" });
    else if (!band) skipped.push({ record: name, reason: `unreadable height band "${r["A"]}"` });
    else if (![lat, lon, e, n].every(Number.isFinite) || !lat || !e) skipped.push({ record: name, reason: "missing coordinates" });
    else if (metresBetween(gridToWgs84(e, n), [lon, lat]) > MAX_COORDINATE_DISAGREEMENT_METRES) skipped.push({ record: name, reason: "grid and lat/long coordinates disagree" });
    else {
      seen.add(gridRef);
      points.push({
        id: `tfl-height-restrictions/${gridRef}`,
        source: "tfl-height-restrictions",
        kind: "height",
        limit: band,
        recorded: r["A"]!.trim(),
        physical: false,
        conditions: [],
        position: [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6],
        approximate: false,
        extentMetres: null,
        road: { name: blank(r["I"]), ref: blank(r["J"]), area: blank(r["H"]) },
        sourceText: blank(r["L"]),
        context: null,
        lastEdited: null,
        osm: null,
      });
    }
  }
  points.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { points, skipped };
}

const encodedPathsSchema = z.object({ encodedPaths: z.array(z.string().min(1)).min(1) });

/** A TfL boundary file (Google encoded polylines, WGS84) → MultiPolygon coordinates. */
export function readTflBoundary(raw: unknown): LonLat[][][] {
  const { encodedPaths } = encodedPathsSchema.parse(raw);
  const polygons = ringsToMultiPolygon(encodedPaths.map((p) => decodePolyline(p)));
  for (const ring of polygons.flat()) {
    for (const [lon, lat] of ring) if (lon < -0.6 || lon > 0.4 || lat < 51.2 || lat > 51.75) throw new Error("TfL boundary point outside Greater London");
  }
  return polygons;
}

const glaSchema = z.object({
  crs: z.object({ properties: z.object({ name: z.literal("urn:ogc:def:crs:EPSG::27700") }) }),
  features: z.array(z.object({ geometry: z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))) }) })),
});

/** The GLA's copy of the 2023 London-wide ULEZ (British National Grid) → WGS84 MultiPolygon coordinates, to check TfL's boundary. */
export function readGlaBoundary(raw: unknown): LonLat[][][] {
  return glaSchema.parse(raw).features.flatMap((f) => f.geometry.coordinates.map((poly) => poly.map((ring) => ring.map(([e, n]) => gridToWgs84(e, n)))));
}
