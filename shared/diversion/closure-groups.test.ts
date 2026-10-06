import { describe, expect, it } from "vitest";
import type { ClosureElement, ClosureRecord } from "../sources/nh-closures/normalise.ts";
import { eligibleRecords, groupClosures } from "./closure-groups.ts";

/** SYNTHETIC records exercising grouping rules (real behaviour: matcher.regression.test.ts). */
const element = (linkId: string, over: Partial<ClosureElement> = {}): ClosureElement => ({
  linkId,
  road: "M99",
  type: "aCarriageway",
  direction: "northBound",
  operationalLanes: 0,
  fromMetres: null,
  toMetres: null,
  points: [[-2, 52]],
  ...over,
});
const record = (id: string, over: Partial<ClosureRecord> = {}): ClosureRecord => ({
  situationId: "s1",
  recordId: id,
  managementType: "carriagewayClosures",
  validityStatus: "planned",
  start: "2026-10-06T19:00:00.00Z",
  end: "2026-10-07T05:00:00.00Z",
  comments: [`comment ${id}`],
  elements: [element(`link-${id}`)],
  ...over,
});
const NOW = "2026-10-05T12:00:00.00Z";

describe("eligibleRecords", () => {
  it("keeps only current or upcoming, non-suspended carriagewayClosures records", () => {
    const records = [
      record("ok"),
      record("lane", { managementType: "other" }),
      record("suspended", { validityStatus: "suspended" }),
      record("ended", { end: "2026-10-05T05:00:00.00Z" }),
    ];
    expect(eligibleRecords(records, NOW).map((r) => r.recordId)).toEqual(["ok"]);
  });
});

describe("groupClosures", () => {
  it("joins records of one situation with overlapping windows into one whole closure (E6 needs the full extent)", () => {
    const groups = groupClosures([record("a"), record("b", { start: "2026-10-06T22:00:00.00Z" })], NOW);
    expect(groups).toHaveLength(1);
    expect([...groups[0]!.closedMainLinkIds].sort()).toEqual(["link-a", "link-b"]);
  });

  it("keeps different nights apart", () => {
    const groups = groupClosures([record("a"), record("b", { start: "2026-10-07T19:00:00.00Z", end: "2026-10-08T05:00:00.00Z" })], NOW);
    expect(groups).toHaveLength(2);
  });

  it("splits directions but keeps roads together, so a closure continuing onto another road is visible", () => {
    const groups = groupClosures(
      [
        record("a", {
          elements: [element("m"), element("a42", { road: "A42" }), element("sb", { direction: "southBound" })],
        }),
      ],
      NOW,
    );
    const nb = groups.find((g) => g.direction === "northBound")!;
    expect(nb.roads.sort()).toEqual(["A42", "M99"]);
    expect(groups.find((g) => g.direction === "southBound")!.roads).toEqual(["M99"]);
  });

  it("ignores slip elements and main elements with lanes still open", () => {
    const groups = groupClosures(
      [record("a", { elements: [element("slip", { type: "aCarriagewayEntrySlip" }), element("open", { operationalLanes: 2 }), element("unknown", { operationalLanes: null })] })],
      NOW,
    );
    expect(groups).toHaveLength(0);
  });
});
