import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { routesManifestSchema } from "../../shared/api/routes-layers.ts";
import { buildRoutesLayers, LAYER_NOTES } from "./build-routes-layers.ts";

/**
 * The Routes layers build, on the real fixture (fixtures/routes-layers/osm-elements.json). The boundary here is SYNTHETIC: a British
 * National Grid rectangle round all of Great Britain, standing in for the ONS England boundary (whose clip is tested with the
 * Closures pipeline, scripts/restrictions/build-restrictions.test.ts).
 */
const extract = JSON.parse(readFileSync("fixtures/routes-layers/osm-elements.json", "utf8")) as Parameters<typeof buildRoutesLayers>[0]["extract"];
const boundary = {
  spatialReference: { wkid: 27700 },
  features: [{ attributes: { CTRY23CD: "E92000001" }, geometry: { rings: [[[0, 0], [0, 1_300_000], [700_000, 1_300_000], [700_000, 0], [0, 0]]] } }],
};

describe("build-routes-layers", () => {
  const build = () => buildRoutesLayers({ extract, boundary, generatedAt: "2026-10-12T21:30:00.000Z" });

  it("writes one validated file per layer and a catalogue whose counts, notes and data date match", () => {
    const { files, report } = build();
    const manifest = routesManifestSchema.parse(files["manifest.json"]);
    expect(manifest.dataAsOf).toBe("2026-10-11T20:21:06.000Z");
    for (const [layer, entry] of Object.entries(manifest.layers)) {
      expect(report.kept[layer], layer).toBe(entry.records);
      expect(entry.notes.slice(0, LAYER_NOTES[layer as keyof typeof LAYER_NOTES].length), layer).toEqual(LAYER_NOTES[layer as keyof typeof LAYER_NOTES]);
      expect(entry.notes.some((n) => n.includes("ONS England boundary")), layer).toBe(true);
    }
    expect(report.kept["average-speed"]).toBe(1);
    expect(Object.keys(files).sort()).toEqual(["access.json", "average-speed.json", "height.json", "manifest.json", "red-light-cameras.json", "speed-cameras.json", "weight.json", "width-length.json"]);
  });

  it("is deterministic for the same inputs, and counts everything left out by reason", () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
    expect(build().report.skipped["average-speed"]).toMatchObject({ "from or to point is not on the section": 1 });
  });

  it("refuses an extract without a data date rather than guessing one", () => {
    expect(() => buildRoutesLayers({ extract: { ...extract, source: { ...extract.source, replicationTimestamp: null } }, boundary, generatedAt: "2026-10-12T21:30:00.000Z" })).toThrow(/data date is unknown/);
  });
});
