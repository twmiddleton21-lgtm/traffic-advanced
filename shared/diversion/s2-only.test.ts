import { describe, expect, it } from "vitest";
import type { ScheduledClosureEvent } from "../sources/nh-arcgis/normalise.ts";
import { classify } from "./classify.ts";
import { classifyS2Only, findS2OnlyEvents } from "./s2-only.ts";

// Event numbers and descriptions are verbatim from the 2026-10-05 S2 capture; both events had no S1 situation there.
// (22 of the 148 S2-only events in that capture had specific diversion text.)
const row = (eventNumber: string, road: string, description: string, start = "2026-10-06T19:00:00.000Z"): ScheduledClosureEvent => ({
  eventNumber,
  road,
  description,
  start,
  end: "2026-10-07T05:00:00.000Z",
});
const crookedBillet = "A30 Westbound Crooked Billet to M25 \r\nCarriageway and Lane closure for cyclic maintenance works\r\nDiversion via National Highways and Local Authorities network";
const rawridge = "A303 Both Directions Rawridge to Southfields roundabout carriageway closure for horticulture works. Diversion via A30 to Chard, A358 to rejoin A303 and vice versa. ";

describe("findS2OnlyEvents (decision D3)", () => {
  it("keeps events without an S1 situation, grouping their rows and counting closures", () => {
    const rows = [row("00435255-001", "A30", crookedBillet), row("00435255-001", "A30", crookedBillet, "2026-10-07T19:00:00.000Z"), row("00435300-001", "A30", "linked")];
    const events = findS2OnlyEvents(rows, new Set(["435300"]));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ source: "nh-s2", eventNumber: "00435255-001", closureCount: 2 });
  });
});

describe("classifyS2Only (decision D3)", () => {
  it("generic text gives D, with source nh-s2", () => {
    const [event] = findS2OnlyEvents([row("00435255-001", "A30", crookedBillet)], new Set());
    const c = classifyS2Only(event!);
    expect(c.source).toBe("nh-s2");
    expect(c.classes).toEqual(["D"]);
  });

  it("specific own text gives A, labelled for the roadworks event and based on the record's own text", () => {
    const rows = [0, 1, 2, 3, 4].map((i) => row("00501729-001", "A303", rawridge, `2026-10-0${5 + i}T19:00:00.000Z`));
    const [event] = findS2OnlyEvents(rows, new Set());
    const c = classifyS2Only(event!);
    expect(c.classes).toEqual(["A"]);
    expect(event!.closureCount).toBe(5); // the UI must say the event covers several closures
    expect(c.a).toMatchObject({ outcome: "A", basis: "own-s2-record", label: "Official diversion information for this roadworks event" });
  });

  it("is never B, whatever the text says", () => {
    for (const text of [crookedBillet, rawridge]) {
      const [event] = findS2OnlyEvents([row("00999999-001", "A30", text)], new Set());
      const c = classifyS2Only(event!);
      expect(c.classes).not.toContain("B");
      expect(c.b.outcome).toBe("D");
    }
  });

  it("classify refuses an S2-only closure marked B (defensive invariant)", () => {
    const trace = {
      closureStatements: [], closedLinkCount: 0, pathLinkCount: 0, firstPathPosition: 0, lastPathPosition: 0,
      closureStartMetresIntoFirstLink: 0, firstLinkLengthMetres: 0, closureEndMetresIntoLastLink: 0, lastLinkLengthMetres: 0,
      stretchStartJunctions: [], stretchEndJunctions: [], junctionBeforeClosure: [], junctionAfterClosure: [],
      candidatesSameRoadDirection: 0, candidatesContainingAllLinks: 0, candidatesPassingAll: 0,
    };
    const fakeB = { outcome: "B" as const, stretchId: "x", stretchLabel: "x", routes: [], evidence: [], e7Coverage: 1, trace };
    expect(() => classify("nh-s2", { outcome: "none", reason: "x" }, fakeB)).toThrow(/cannot be classified B/);
  });
});
