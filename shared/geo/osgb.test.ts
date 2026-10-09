import { describe, expect, it } from "vitest";
import { metresBetween } from "./distance.ts";
import { gridToOsgb36, gridToWgs84 } from "./osgb.ts";

const deg = (r: number) => (r * 180) / Math.PI;

describe("British National Grid to WGS84", () => {
  it("reproduces Ordnance Survey's worked example for the inverse projection (OS guide, C.2)", () => {
    // E 651409.903, N 313177.270 → OSGB36 52°39′27.2531″N, 1°43′4.5177″E.
    const { lat, lon } = gridToOsgb36(651409.903, 313177.27);
    expect(deg(lat)).toBeCloseTo(52 + 39 / 60 + 27.2531 / 3600, 6);
    expect(deg(lon)).toBeCloseTo(1 + 43 / 60 + 4.5177 / 3600, 6);
  });

  it("agrees with TfL's own published coordinates for the same structures to within a few metres (real records)", () => {
    // From TfL's height-restrictions-in-london.xlsx (2019), which gives both grid and WGS84 coordinates for each structure.
    const records: [number, number, number, number][] = [
      [549062, 183214, 0.147455, 51.528168],
      [528611, 184683, -0.14664731, 51.546393],
      [515399, 183904, -0.33734636, 51.542246],
    ];
    for (const [e, n, lon, lat] of records) expect(metresBetween(gridToWgs84(e, n), [lon, lat])).toBeLessThan(10);
  });
});
