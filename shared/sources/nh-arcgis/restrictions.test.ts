import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readDiversionPoints, readVehicleRestrictions } from "./restrictions.ts";

const features = (name: string) => (JSON.parse(readFileSync(`fixtures/restrictions/${name}`, "utf8")) as { features: unknown[] }).features;

describe("NH diversion points (S4, real records)", () => {
  const { points, skipped } = readDiversionPoints(features("nh-s4-diversion-points.json"));

  it("uses heights in metres and weights in tonnes, and names the diversion route they were recorded on", () => {
    expect(points.map((p) => p.kind).sort()).toEqual(["height", "height", "weight-unrecorded-type", "weight-unrecorded-type"]);
    const h = points.find((p) => p.id === "nh-s4-diversion-points/a14e6d58-f7c1-429a-b0e9-d2f026d0cd3f")!;
    expect(h).toMatchObject({ kind: "height", limit: { min: 4.4, max: 4.4 }, recorded: "4.4 m", context: "Recorded on National Highways emergency diversion route M56/J12/J14/1" });
  });

  it("never calls an NH weight limit structural or a lorry limit: NH doesn't record which", () => {
    expect(points.filter((p) => p.kind.startsWith("weight")).every((p) => p.kind === "weight-unrecorded-type")).toBe(true);
  });

  it("skips ambiguous decimal-feet heights and the width and length records, with reasons", () => {
    const reasons = skipped.map((s) => s.reason).sort();
    expect(reasons).toEqual(
      ["height in decimal feet is ambiguous", "height in decimal feet is ambiguous", "no value", "not shown: width in metres", "not shown: width in metres", "not shown: width in tonnes", "not shown: width in tonnes"].sort(),
    );
  });
});

describe("NH vehicle restrictions (S5, real records)", () => {
  it("uses maximum-height records with NH's description verbatim", () => {
    const { points, skipped } = readVehicleRestrictions(features("nh-s5-vehicle-restrictions.json"));
    expect(skipped).toEqual([]);
    expect(points[0]).toMatchObject({ kind: "height", source: "nh-s5-vehicle-restrictions" });
    expect(points.map((p) => p.sourceText)).toContain("Vehicles Exceeding Height 4.9m Prohibited");
    expect(points.every((p) => p.lastEdited !== null)).toBe(true);
  });

  it("skips other restriction types and records without a height in metres", () => {
    const [first] = features("nh-s5-vehicle-restrictions.json") as { attributes: Record<string, unknown>; geometry: unknown }[];
    const weight = { ...first!, attributes: { ...first!.attributes, restriction: "MW" } };
    const feet = { ...first!, attributes: { ...first!.attributes, unitofmeasure: "FT" } };
    expect(readVehicleRestrictions([weight, feet]).points).toEqual([]);
  });
});
