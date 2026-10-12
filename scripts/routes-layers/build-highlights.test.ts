import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRoutesLayers } from "./build-routes-layers.ts";
import { buildHighlights } from "./build-highlights.ts";

/** The highlight build on the real fixture, after the layer build. The boundary is SYNTHETIC (a box round Great Britain). */
const extract = JSON.parse(readFileSync("fixtures/routes-layers/osm-elements.json", "utf8")) as Parameters<typeof buildRoutesLayers>[0]["extract"] & { source: { sha256: string } };
const boundary = { spatialReference: { wkid: 27700 }, features: [{ attributes: { CTRY23CD: "E92000001" }, geometry: { rings: [[[0, 0], [0, 1_300_000], [700_000, 1_300_000], [700_000, 0], [0, 0]]] } }] };
const layerFiles = () => {
  const { files } = buildRoutesLayers({ extract, boundary, generatedAt: "2026-10-12T21:30:00.000Z" });
  return ["height", "weight", "width-length", "access"].map((l) => files[`${l}.json`]) as Parameters<typeof buildHighlights>[0]["layerFiles"];
};

describe("build-highlights", () => {
  it("writes one roads file per restriction layer, from that layer's own records", () => {
    const { files, report } = buildHighlights({ layerFiles: layerFiles(), ways: extract.ways, extractSha256: extract.source.sha256, generatedAt: "2026-10-12T21:30:00.000Z" });
    expect(Object.keys(files).sort()).toEqual(["access-roads.json", "height-roads.json", "weight-roads.json", "width-length-roads.json"]);
    expect(report["weight"]!.roads).toBe(files["weight-roads.json"]!.roads.length);
  });

  it("refuses marker files built from a different extract", () => {
    expect(() => buildHighlights({ layerFiles: layerFiles(), ways: extract.ways, extractSha256: "f".repeat(64), generatedAt: "2026-10-12T21:30:00.000Z" })).toThrow(/not ffffffffffff/);
  });
});
