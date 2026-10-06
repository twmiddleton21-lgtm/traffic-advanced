import { describe, expect, it } from "vitest";
import { canonicalJunctionLabel, checkStretchLabels } from "./stretch-labels.ts";

// Label forms below are taken from real S4 JunctionNumberFrom/To and S5 junction names (2026-10-05 capture).
describe("canonicalJunctionLabel", () => {
  it.each([
    ["M53 J4", "M53", "M53J4"],
    ["M5 JUNCTION 3", "M5", "M5J3"],
    ["J64", "A64", "A64J64"],
    ["M6 J10A", "M54", "M6J10A"],
    ["JUNCTION 2", "M61", "M61J2"],
  ])("%s on %s → %s", (label, road, expected) => {
    expect(canonicalJunctionLabel(label, road)).toBe(expected);
  });

  it.each(["A4130", "WEEFORD ISLAND", "SYMONDS-LANE", "A6/A66", ""])("not a road + junction number: %s", (label) => {
    expect(canonicalJunctionLabel(label, "A5")).toBeNull();
  });
});

describe("checkStretchLabels", () => {
  it("reconciled when both labels match the junctions at the path ends", () => {
    expect(checkStretchLabels("M53", "M53 J4", "M53 J5", ["M53 J4"], ["M53 J5"])).toBe("reconciled");
  });
  it("the real M54 case disagrees: label J1, path starts at J2", () => {
    expect(checkStretchLabels("M54", "M54 J1", "M6 J10A", ["M54 J2"], ["M6 J10A"])).toBe("labels-disagree-with-path");
  });
  it("a node belonging to two junctions reconciles if either matches", () => {
    expect(checkStretchLabels("M56", "M56 J9", "M56 J8", ["M6 J20", "M56 J9"], ["M56 J8"])).toBe("reconciled");
  });
  it("unreconcilable labels are never guessed", () => {
    expect(checkStretchLabels("A34", "A4130", "A420", ["A34 J?"], ["A34 J?"])).toBe("labels-not-reconcilable");
  });
});
