/** [longitude, latitude] in WGS84 degrees (GeoJSON order). */
export type LonLat = readonly [number, number];
export type Polyline = readonly LonLat[];

const METRES_PER_DEG_LAT = 110_540;
const METRES_PER_DEG_LON_AT_EQUATOR = 111_320;

/**
 * Local equirectangular projection around a reference latitude. Error is well under 1% at the
 * ≤ 10 km scales used for matching; matching never relies on precision finer than its 30 m buffer.
 */
function project(point: LonLat, refLat: number): [number, number] {
  return [point[0] * Math.cos((refLat * Math.PI) / 180) * METRES_PER_DEG_LON_AT_EQUATOR, point[1] * METRES_PER_DEG_LAT];
}

export function metresBetween(a: LonLat, b: LonLat): number {
  const refLat = (a[1] + b[1]) / 2;
  const [ax, ay] = project(a, refLat);
  const [bx, by] = project(b, refLat);
  return Math.hypot(bx - ax, by - ay);
}

export function polylineLength(line: Polyline): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += metresBetween(line[i - 1]!, line[i]!);
  return total;
}

export function distanceToPolylines(point: LonLat, lines: readonly Polyline[]): number {
  const refLat = point[1];
  const [px, py] = project(point, refLat);
  let best = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = project(line[i - 1]!, refLat);
      const [bx, by] = project(line[i]!, refLat);
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
      best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    }
  }
  return best;
}

/** Share of `points` lying within `bufferMetres` of any of `lines`. Empty input returns 0 (no evidence). */
export function fractionWithin(points: readonly LonLat[], lines: readonly Polyline[], bufferMetres: number): number {
  if (points.length === 0 || lines.length === 0) return 0;
  let inside = 0;
  for (const point of points) if (distanceToPolylines(point, lines) <= bufferMetres) inside++;
  return inside / points.length;
}
