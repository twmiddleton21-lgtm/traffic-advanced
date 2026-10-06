import { describe, expect, it } from "vitest";
import { A_LABEL, evaluateA, situationIdFromEventNumber, specificDiversionStatements } from "./evaluate-a.ts";
import { classify, LABELS } from "./classify.ts";

// Description texts below are verbatim S2 descriptions from the 2026-10-05 capture. Event objects are assembled for the test.

describe("situationIdFromEventNumber", () => {
  it("maps NH event numbers to S1 situation ids", () => {
    expect(situationIdFromEventNumber("00435300-001")).toBe("435300");
    expect(situationIdFromEventNumber("00509866-008")).toBe("509866");
  });
  it("rejects anything not in NH's format", () => {
    expect(situationIdFromEventNumber("")).toBeNull();
    expect(situationIdFromEventNumber("435300")).toBeNull();
    expect(situationIdFromEventNumber("ABC-001")).toBeNull();
  });
});

describe("specificDiversionStatements (real S2 text)", () => {
  it.each([
    "Diversion via A4174, A38 and B4469 Muller Road",
    "diversion via - A303 eastbound, A345 and rejoin the A36.",
    "Diversion via A30 to Chard, A358 to rejoin A303 and vice versa. ",
    "Diversion via M48 eastbound Jct 2 exit and entry slip roads, 7.5T weight limit suspended with traffic light control",
  ])("specific: %s", (text) => {
    expect(specificDiversionStatements(text).length).toBeGreaterThan(0);
  });

  it.each([
    "Diversion via National Highways and Local Authorities network",
    "Diversion via Local Authorities network",
    "Diversion route via National Highways and Local Authorities Network",
    "M25 Clockwise Jct 22 to Jct 23 \r\nCarriageway and lane Closure for Cyclical Maintenance. \r\n",
  ])("not specific (generic or none): %s", (text) => {
    expect(specificDiversionStatements(text)).toEqual([]);
  });

  it("returns the statement verbatim, not a paraphrase", () => {
    const text = "M32 southbound Jct 1 to Jct 2 - carriageway closed for drainage work\nDiversion via A4174, A38 and B4469 Muller Road";
    expect(specificDiversionStatements(text)).toEqual(["Diversion via A4174, A38 and B4469 Muller Road"]);
  });
});

describe("evaluateA (decision D1)", () => {
  const specific = "M32 southbound Jct 1 to Jct 2 - carriageway closed for drainage work\nDiversion via A4174, A38 and B4469 Muller Road";

  it("A only through NH's shared event identifier and the same road, with the approved label", () => {
    const result = evaluateA("123456", "M32", [{ eventNumber: "00123456-001", road: "M32", description: specific }]);
    expect(result).toMatchObject({ outcome: "A", label: A_LABEL, eventNumber: "00123456-001" });
    expect(A_LABEL).toBe("Official diversion information for this roadworks event");
  });

  it("no A when the identifier doesn't match, even if the text and road do", () => {
    expect(evaluateA("999999", "M32", [{ eventNumber: "00123456-001", road: "M32", description: specific }]).outcome).toBe("none");
  });

  it("no A when the linked event is on a different road", () => {
    expect(evaluateA("123456", "M5", [{ eventNumber: "00123456-001", road: "M32", description: specific }]).outcome).toBe("none");
  });

  it("generic text is returned as a note, never as A", () => {
    const result = evaluateA("123456", "M25", [{ eventNumber: "00123456-001", road: "M25", description: "M25 closure\nDiversion via National Highways and Local Authorities network" }]);
    expect(result).toMatchObject({ outcome: "none", genericNote: expect.stringContaining("Diversion via National Highways") as unknown });
  });
});

describe("classify", () => {
  it("keeps A and B as separate claims and falls back to D", () => {
    const a = evaluateA("123456", "M32", [{ eventNumber: "00123456-001", road: "M32", description: "Diversion via A4174" }]);
    const dB = { outcome: "D" as const, failed: "E5" as const, reason: "test" };
    expect(classify("nh-s1", a, dB).classes).toEqual(["A"]);
    expect(classify("nh-s1", { outcome: "none", reason: "x" }, dB).classes).toEqual(["D"]);
  });

  it("never produces C (reserved, not implemented in V1) and keeps the exact labels", () => {
    const outcomes = [classify("nh-s1", { outcome: "none", reason: "x" }, { outcome: "D", failed: "E1", reason: "x" })];
    for (const o of outcomes) expect(o.classes).not.toContain("C");
    expect(LABELS).toEqual({
      A: "Official diversion information for this roadworks event",
      B: "Official NH diversion — match based on available data",
      C: "Calculated HGV route — not an official diversion",
      D: "No reliable diversion available",
    });
  });
});
