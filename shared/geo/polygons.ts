import type { LonLat } from "./distance.ts";

/** Google's encoded polyline format (precision 5, as in TfL's boundary JSON) → [lon, lat] points. Throws on truncated input. */
export function decodePolyline(encoded: string, precision = 5): LonLat[] {
  const factor = 10 ** precision;
  const points: LonLat[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (i >= encoded.length) throw new Error("Truncated encoded polyline");
      byte = encoded.charCodeAt(i++) - 63;
      if (byte < 0 || byte > 63) throw new Error("Invalid character in encoded polyline");
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < encoded.length) {
    lat += next();
    lon += next();
    points.push([lon / factor, lat / factor]);
  }
  return points;
}

/** Ray-casting point-in-ring test (planar; fine at city scale). */
export function pointInRing(point: LonLat, ring: readonly LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Planar area of a ring (absolute, in squared degrees): only used to order rings by size. */
export function ringArea(ring: readonly LonLat[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[j]![0] + ring[i]![0]) * (ring[j]![1] - ring[i]![1]);
  return Math.abs(sum / 2);
}

const closed = (ring: LonLat[]): LonLat[] => {
  const a = ring[0]!;
  const b = ring[ring.length - 1]!;
  return a[0] === b[0] && a[1] === b[1] ? ring : [...ring, a];
};

/**
 * Loose rings (as TfL publishes its zone boundaries: one ring per path, with no outer/hole structure) → MultiPolygon coordinates by
 * the even-odd rule: a ring inside an even number of other rings is an outer boundary; inside an odd number, it is a hole in the
 * smallest ring containing it. Containment is decided by the ring's first vertex, so rings must not cross (true of zone boundaries;
 * the build checks the result against an independent copy of the boundary).
 */
export function ringsToMultiPolygon(rings: LonLat[][]): LonLat[][][] {
  const all = rings.map(closed).filter((r) => r.length >= 4);
  const containers = all.map((r, i) => all.filter((o, j) => j !== i && ringArea(o) > ringArea(r) && pointInRing(r[0]!, o)));
  const polygons = new Map<LonLat[], LonLat[][]>();
  all.forEach((r, i) => {
    if (containers[i]!.length % 2 === 0) polygons.set(r, [r]);
  });
  all.forEach((r, i) => {
    if (containers[i]!.length % 2 === 0) return;
    const parent = [...containers[i]!].sort((a, b) => ringArea(a) - ringArea(b))[0]!;
    polygons.get(parent)?.push(r);
  });
  return [...polygons.values()];
}

/** Whether a point is inside a MultiPolygon (inside an outer ring and none of its holes). */
export function pointInMultiPolygon(point: LonLat, polygons: readonly (readonly (readonly LonLat[])[])[]): boolean {
  return polygons.some(([outer, ...holes]) => pointInRing(point, outer!) && !holes.some((h) => pointInRing(point, h)));
}
