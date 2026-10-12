import * as z from "zod";
import type { LonLat } from "../../geo/distance.ts";
import { gridToWgs84 } from "../../geo/osgb.ts";
import { pointInRing } from "../../geo/polygons.ts";

/**
 * England's boundary from the ONS (Countries December 2023, full resolution, extent of the realm, simplified to 10 m by the
 * service; Open Government Licence v3.0), used only to keep OpenStreetMap records that lie in England. "Extent of the realm" reaches
 * the low-water mark, so seafront and harbour roads stay in. Esri JSON in British National Grid, converted to WGS84.
 */
const esriSchema = z.object({
  spatialReference: z.object({ wkid: z.literal(27700) }).optional(),
  features: z
    .array(z.object({ attributes: z.object({ CTRY23CD: z.literal("E92000001") }), geometry: z.object({ rings: z.array(z.array(z.tuple([z.number(), z.number()])).min(4)).min(1) }) }))
    .length(1),
});

export interface Boundary {
  rings: LonLat[][];
  /** Bounding boxes per ring, [w, s, e, n], so most points skip most rings. */
  boxes: [number, number, number, number][];
}

export function readEnglandBoundary(raw: unknown): Boundary {
  const rings = esriSchema.parse(raw).features[0]!.geometry.rings.map((ring) => ring.map(([e, n]) => gridToWgs84(e, n)));
  const boxes = rings.map((r): [number, number, number, number] => [Math.min(...r.map((p) => p[0])), Math.min(...r.map((p) => p[1])), Math.max(...r.map((p) => p[0])), Math.max(...r.map((p) => p[1]))]);
  return { rings, boxes };
}

/** Inside by the even-odd rule over all rings (outer rings and holes alike, as Esri stores them). */
export function inEngland(point: LonLat, b: Boundary): boolean {
  let inside = false;
  for (let i = 0; i < b.rings.length; i++) {
    const [w, s, e, n] = b.boxes[i]!;
    if (point[0] < w || point[0] > e || point[1] < s || point[1] > n) continue;
    if (pointInRing(point, b.rings[i]!)) inside = !inside;
  }
  return inside;
}
