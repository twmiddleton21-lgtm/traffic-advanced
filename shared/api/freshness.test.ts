import { describe, expect, it } from "vitest";
import { FRESHNESS_RULES, freshnessOf } from "./freshness.ts";

const captured = "2026-10-05T12:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(captured) + minutes * 60_000);

describe("data freshness (SPECIFICATION §4)", () => {
  it("states the spec thresholds in plain sight", () => {
    expect(FRESHNESS_RULES).toEqual({ delayedAfterMinutes: 15, staleAfterMinutes: 60 });
  });

  it("is fresh under 15 minutes, delayed from 15 to 60, stale after 60", () => {
    expect(freshnessOf(captured, at(0))).toBe("fresh");
    expect(freshnessOf(captured, at(14.9))).toBe("fresh");
    expect(freshnessOf(captured, at(15))).toBe("delayed");
    expect(freshnessOf(captured, at(60))).toBe("delayed");
    expect(freshnessOf(captured, at(60.1))).toBe("stale");
    expect(freshnessOf(captured, at(24 * 60))).toBe("stale");
  });

  it("treats a capture time in the future (clock skew) as age 0, not as fresher than fresh", () => {
    expect(freshnessOf(captured, at(-5))).toBe("fresh");
  });

  it("treats an unreadable time as stale: it can't prove the data is recent", () => {
    expect(freshnessOf("not a date", at(0))).toBe("stale");
  });
});
