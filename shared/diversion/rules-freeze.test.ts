import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fingerprint, FROZEN_FILES } from "../../scripts/p0/freeze-rules.ts";
import { E1_TEXT_RULES, E6_POSITION_RULES, E7_RULES, STRETCH_PATH_RULES } from "./rules.ts";

/**
 * The A/B/D evidence rules and thresholds are FROZEN for the remaining P0 evaluation (owner, 2026-10-05). Any change to a file
 * that decides a classification fails this test. A change needs the owner's approval first, then a deliberate re-freeze:
 *   node scripts/p0/freeze-rules.ts "<reason and approval reference>"
 */
const freeze = JSON.parse(readFileSync("fixtures/p0/rules-freeze.json", "utf8")) as { frozenAt: string; reason: string; files: Record<string, string> };

describe("P0 rules freeze", () => {
  it("covers exactly the classification files", () => {
    expect(Object.keys(freeze.files).sort()).toEqual([...FROZEN_FILES].sort());
  });

  for (const file of FROZEN_FILES) {
    it(`${file} is unchanged since the freeze (${freeze.reason})`, () => {
      expect(fingerprint(file), `${file} changed after the P0 freeze. Rule changes need owner approval and a re-freeze.`).toBe(freeze.files[file]);
    });
  }

  it("states the frozen thresholds in plain sight", () => {
    expect(STRETCH_PATH_RULES).toEqual({ minLengthRatio: 0.8, maxLengthRatio: 1.25, minGeometryAgreement: 0.95, bufferMetres: 30 });
    expect(E6_POSITION_RULES).toEqual({ endpointToleranceMetres: 10 });
    expect(E7_RULES).toEqual({ minCoverage: 0.9, bufferMetres: 30 });
    expect(E1_TEXT_RULES.disqualifiers).toHaveLength(10);
  });
});
