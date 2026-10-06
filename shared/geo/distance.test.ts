import { describe, expect, it } from "vitest";
import { distanceToPolylines, fractionWithin, metresBetween, polylineLength, type LonLat } from "./distance.ts";

// Synthetic coordinates near Birmingham (lat ~52.5): 0.001° lat ≈ 110.5 m; 0.001° lon ≈ 67.8 m.
const a: LonLat = [-1.9, 52.5];
const b: LonLat = [-1.9, 52.501];

describe("geo distance helpers (synthetic)", () => {
  it("measures short distances to within 1%", () => {
    expect(metresBetween(a, b)).toBeGreaterThan(109);
    expect(metresBetween(a, b)).toBeLessThan(112);
    expect(metresBetween([-1.9, 52.5], [-1.899, 52.5])).toBeCloseTo(67.8, 0);
  });

  it("sums polyline segments", () => {
    expect(polylineLength([a, b, [-1.9, 52.502]])).toBeCloseTo(2 * metresBetween(a, b), 6);
  });

  it("measures perpendicular distance to a segment", () => {
    const offset: LonLat = [-1.899, 52.5005]; // ~68 m east of the a-b segment
    expect(distanceToPolylines(offset, [[a, b]])).toBeCloseTo(67.8, 0);
  });

  it("computes the fraction of points within a buffer, and 0 for no evidence", () => {
    const points: LonLat[] = [a, [-1.9, 52.5005], [-1.899, 52.5005]];
    expect(fractionWithin(points, [[a, b]], 30)).toBeCloseTo(2 / 3, 6);
    expect(fractionWithin([], [[a, b]], 30)).toBe(0);
    expect(fractionWithin(points, [], 30)).toBe(0);
  });
});
