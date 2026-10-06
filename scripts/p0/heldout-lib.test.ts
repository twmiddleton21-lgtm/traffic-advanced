import { describe, expect, it } from "vitest";
import { parseGroundTruth, score, selectHeldOut, upperBound95, type Candidate } from "./heldout-lib.ts";

// SYNTHETIC inputs: these test the evaluation tooling itself, not matcher behaviour.
const population: Candidate[] = [
  { key: "s1|eastBound|a", outcome: "B", failed: "" },
  { key: "s2|eastBound|a", outcome: "B", failed: "" },
  ...Array.from({ length: 60 }, (_, i) => ({ key: `e5-${String(i).padStart(2, "0")}`, outcome: "D" as const, failed: "E5" })),
  ...Array.from({ length: 60 }, (_, i) => ({ key: `e3-${String(i).padStart(2, "0")}`, outcome: "D" as const, failed: "E3" })),
  ...Array.from({ length: 5 }, (_, i) => ({ key: `e6-${i}`, outcome: "D" as const, failed: "E6" })),
];

describe("selectHeldOut", () => {
  it("includes every B, reaches the target, and represents every failing-evidence stratum", () => {
    const { selected, shortfall } = selectHeldOut(population, 100, 42);
    expect(selected).toHaveLength(100);
    expect(shortfall).toBe(0);
    expect(selected).toEqual(expect.arrayContaining(["s1|eastBound|a", "s2|eastBound|a"]));
    expect(selected.some((k) => k.startsWith("e6-"))).toBe(true);
    expect(new Set(selected).size).toBe(selected.length);
  });

  it("is reproducible from the seed and independent of input order", () => {
    const a = selectHeldOut(population, 100, 42).selected;
    const b = selectHeldOut([...population].reverse(), 100, 42).selected;
    expect(b).toEqual(a);
    expect(selectHeldOut(population, 100, 43).selected).not.toEqual(a);
  });

  it("reports a shortfall rather than inventing items when the population is too small", () => {
    const { selected, shortfall } = selectHeldOut(population.slice(0, 10), 100, 1);
    expect(selected).toHaveLength(10);
    expect(shortfall).toBe(90);
  });
});

describe("parseGroundTruth", () => {
  it("accepts the three forms and rejects anything else", () => {
    expect(parseGroundTruth("stretch:F4D161AF-19A1-4104-96EC-147659531EF3")).toEqual({ kind: "stretch", stretchId: "f4d161af-19a1-4104-96ec-147659531ef3" });
    expect(parseGroundTruth("no-correct-stretch")).toEqual({ kind: "no-correct-stretch" });
    expect(parseGroundTruth("unsure")).toEqual({ kind: "unsure" });
    expect(parseGroundTruth(null)).toBeNull();
    expect(() => parseGroundTruth("probably M53")).toThrow();
  });
});

describe("score", () => {
  const stretch = { kind: "stretch" as const, stretchId: "x" };
  it("a B on the wrong stretch, or where there is no correct stretch, is a false positive", () => {
    expect(score({ outcome: "B", stretchId: "x" }, stretch)).toBe("true-positive");
    expect(score({ outcome: "B", stretchId: "y" }, stretch)).toBe("false-positive");
    expect(score({ outcome: "B", stretchId: "x" }, { kind: "no-correct-stretch" })).toBe("false-positive");
  });
  it("a D where a correct stretch exists is a (safe) false negative", () => {
    expect(score({ outcome: "D" }, stretch)).toBe("false-negative");
    expect(score({ outcome: "D" }, { kind: "no-correct-stretch" })).toBe("true-negative");
  });
});

describe("upperBound95", () => {
  it("gives ~3/N for zero failures (rule of three) and the exact Clopper-Pearson bound otherwise", () => {
    expect(upperBound95(0, 100)).toBeCloseTo(0.0295, 3);
    expect(upperBound95(0, 300)).toBeCloseTo(0.00994, 4);
    expect(upperBound95(1, 100)).toBeCloseTo(0.0466, 3);
    expect(upperBound95(0, 0)).toBe(1);
  });
});

describe("seededShuffle", () => {
  it("is a reproducible permutation", async () => {
    const { seededShuffle } = await import("./heldout-lib.ts");
    const xs = Array.from({ length: 50 }, (_, i) => i);
    const a = seededShuffle(xs, 7);
    expect(a).toEqual(seededShuffle(xs, 7));
    expect([...a].sort((p, q) => p - q)).toEqual(xs);
    expect(a).not.toEqual(xs);
  });
});
