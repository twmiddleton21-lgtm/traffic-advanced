import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { metresBetween } from "../../geo/distance.ts";
import { pointInMultiPolygon } from "../../geo/polygons.ts";
import { parseHeightBand, readGlaBoundary, readTflBoundary, readTflHeights } from "./restrictions.ts";

const fixture = (name: string): unknown => JSON.parse(readFileSync(`fixtures/restrictions/${name}`, "utf8"));
const rows = (fixture("tfl-height-rows.json") as { rows: Record<string, string>[] }).rows;

describe("TfL height bands", () => {
  it("keeps TfL's bands as ranges, never as an invented exact height", () => {
    expect(parseHeightBand("Between 3.6 and 4.0")).toEqual({ min: 3.6, max: 4 });
    expect(parseHeightBand("Up to 3.0")).toEqual({ min: null, max: 3 });
    expect(parseHeightBand("4.2")).toBeNull();
    expect(parseHeightBand("Between 4.0 and 3.6")).toBeNull();
  });
});

describe("TfL low bridges, tunnels and road barriers (real records)", () => {
  const { points, skipped } = readTflHeights(rows);

  it("reads every real record, keyed by TfL's grid reference, with road, borough and comment as published", () => {
    expect(skipped).toEqual([]);
    expect(points).toHaveLength(rows.length - 1);
    const p = points.find((x) => x.id === "tfl-height-restrictions/TQ4906283214")!;
    expect(p).toMatchObject({
      kind: "height",
      source: "tfl-height-restrictions",
      limit: { min: 4.6, max: 5.1 },
      recorded: "Between 4.6 and 5.1",
      road: { name: "Chequers Lane", ref: null, area: "Barking & Dagenham" },
      position: [0.147455, 51.528168],
      osm: null,
    });
    expect(points.some((x) => x.sourceText !== null)).toBe(true);
  });

  it("covers every band TfL uses, including the open 'Up to 3.0' band", () => {
    expect(new Set(points.map((p) => p.recorded))).toEqual(new Set(["Between 4.6 and 5.1", "Between 4.1 and 4.5", "Between 3.6 and 4.0", "Between 3.1 and 3.5", "Up to 3.0"]));
    expect(points.find((p) => p.recorded === "Up to 3.0")?.limit).toEqual({ min: null, max: 3 });
  });

  it("skips a record whose grid and lat/long coordinates disagree, and a duplicate", () => {
    const moved = { ...rows[1]!, F: "51.6" };
    const r = readTflHeights([rows[0]!, moved, rows[2]!, rows[2]!]);
    expect(r.points).toHaveLength(1);
    expect(r.skipped.map((s) => s.reason)).toEqual(["grid and lat/long coordinates disagree", "duplicate grid reference"]);
  });

  it("fails the build if TfL changes the column layout, rather than reading the wrong columns", () => {
    expect(() => readTflHeights([{ ...rows[0]!, A: "Height (m)" }, rows[1]!])).toThrow(/column A/);
  });
});

describe("TfL LEZ/ULEZ boundary (real file)", () => {
  const lez = readTflBoundary(fixture("tfl-lez.json"));

  it("decodes 22 closed rings into polygons around Greater London, all in WGS84", () => {
    expect(lez).toHaveLength(22);
    for (const ring of lez.flat()) expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("puts central London inside and places beyond the M25 outside", () => {
    expect(pointInMultiPolygon([-0.1276, 51.5072], lez)).toBe(true); // Trafalgar Square
    expect(pointInMultiPolygon([-0.3415, 51.7527], lez)).toBe(false); // St Albans
    expect(pointInMultiPolygon([0.4685, 51.7356], lez)).toBe(false); // Chelmsford
  });

  it("matches the GLA's independent copy of the boundary (converted from British National Grid) to within metres", () => {
    const gla = readGlaBoundary(fixture("gla-ulez-2023-small-parts.json"));
    expect(gla.length).toBeGreaterThan(0);
    for (const poly of gla) {
      const [lon, lat] = poly[0]![0]!;
      const nearest = Math.min(...lez.flat(2).map((q) => metresBetween([lon, lat], q)));
      expect(nearest).toBeLessThan(30);
    }
  });

  it("rejects a file in another format, and a boundary outside London", () => {
    expect(() => readTflBoundary({ type: "FeatureCollection" })).toThrow();
    expect(() => readTflBoundary({ encodedPaths: ["_p~iF~ps|U_ulLnnqC_mqNvxq`@"] })).toThrow(/outside Greater London/);
  });
});
