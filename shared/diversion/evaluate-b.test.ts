import { describe, expect, it } from "vitest";
import type { LonLat } from "../geo/distance.ts";
import { buildNetwork } from "../network/graph.ts";
import type { ClosureStretch, DiversionPoint, DiversionRoute, NetworkLink } from "../sources/nh-arcgis/normalise.ts";
import type { ClosureGroup } from "./closure-groups.ts";
import { describeRoute, evaluateB } from "./evaluate-b.ts";
import { buildStretchIndex } from "./stretch-index.ts";

/**
 * SYNTHETIC unit tests (invented network, labelled as such per CLAUDE.md): one rule per test, including branches the
 * 2026-10-05 real data doesn't exercise. Real-data behaviour is covered by matcher.regression.test.ts.
 *
 * Road M99 northbound: n0 (J1) → n1 → n2 (J2) → n3 → n4 (J3), links l0..l3 of ~1.1 km each.
 */
const pt = (i: number, east = 0): LonLat => [-2 + east, 52 + i * 0.01];
const nodes = ["n0", "n1", "n2", "n3", "n4"];
const links: NetworkLink[] = [0, 1, 2, 3].map((i) => ({
  id: `l${i}`,
  road: "M99",
  direction: "N",
  carriageway: "A",
  form: "DC",
  startNode: nodes[i]!,
  endNode: nodes[i + 1]!,
  twoWay: false,
  description: `synthetic link ${i}`,
  geometry: [[pt(i), pt(i + 1)]],
}));
const junctionRefs = [
  { junctionId: "J1", nodeId: "n0" },
  { junctionId: "J2", nodeId: "n2" },
  { junctionId: "J3", nodeId: "n4" },
];
const junctions = [
  { junctionId: "J1", name: "M99 J1" },
  { junctionId: "J2", name: "M99 J2" },
  { junctionId: "J3", name: "M99 J3" },
];
const stretchJ1J3: ClosureStretch = {
  id: "s-j1-j3",
  road: "M99",
  direction: "northBound",
  junctionFrom: "J1",
  junctionTo: "J3",
  description: "synthetic",
  geometry: [[pt(0), pt(1), pt(2), pt(3), pt(4)]],
};
const route = (over: Partial<DiversionRoute> = {}): DiversionRoute => ({
  id: "r1",
  routeId: "M99/J1/J3/1",
  description: "M99 Northbound Closure: Junction 1 to 3",
  limits: { heightMetres: null, widthMetres: null, weightTonnes: null, lengthMetres: null },
  stretchId: "s-j1-j3",
  routeNumber: 1,
  classification: "Class_1A",
  complete: true,
  decommissioned: false,
  startNode: "n0",
  endNode: "n4",
  signageSymbol: "Triangle - Solid",
  lengthMiles: 5,
  estimatedTravelTime: null,
  lastModified: null,
  ...over,
});

const setup = (stretches: ClosureStretch[] = [stretchJ1J3], routes: DiversionRoute[] = [route()]) => {
  const network = buildNetwork(links, junctionRefs, junctions);
  return { network, index: buildStretchIndex(network, stretches, routes) };
};

const NO_POINTS = new Map<string, DiversionPoint[]>();

const closure = (over: Partial<ClosureGroup> = {}): ClosureGroup => ({
  situationId: "synthetic",
  recordIds: ["r"],
  roads: ["M99"],
  direction: "northBound",
  start: "2026-10-05T19:00:00Z",
  end: "2026-10-06T05:00:00Z",
  closedMainLinkIds: new Set(["l0", "l1", "l2", "l3"]),
  closedExtents: new Map(),
  points: [pt(0.1), pt(1.5), pt(2.5), pt(3.9)],
  comments: ["M99 northbound J1 to J3 carriageway closure"],
  ...over,
});

describe("evaluateB (synthetic network)", () => {
  it("B when every evidence item passes, with all eight items listed", () => {
    const { network, index } = setup();
    const result = evaluateB(closure(), network, index, NO_POINTS);
    expect(result.outcome).toBe("B");
    if (result.outcome === "B") {
      expect(result.stretchId).toBe("s-j1-j3");
      expect(result.evidence.map((e) => e.id)).toEqual(["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8"]);
      expect(result.routes[0]!.hgvStatus).toBe("no-restrictions-recorded");
    }
  });

  it("E1: no main-carriageway link closed", () => {
    const { network, index } = setup();
    expect(evaluateB(closure({ closedMainLinkIds: new Set() }), network, index, NO_POINTS)).toMatchObject({ outcome: "D", failed: "E1" });
  });

  it("E1: NH text doesn't state a carriageway closure", () => {
    const { network, index } = setup();
    expect(evaluateB(closure({ comments: ["M99 northbound J1 to J3 works"] }), network, index, NO_POINTS)).toMatchObject({ outcome: "D", failed: "E1" });
  });

  it.each([
    "M99 northbound J1 entry slip road closure (carriageway closure at merge)",
    "M99 northbound layby carriageway closure",
    "M99 northbound J1 to J3 carriageway closure for temporary traffic lights",
    "M99 northbound depot access road carriageway closure",
    "M99 northbound lane 1 and carriageway closure",
  ])("E1: disqualifying NH text forces D: %s", (text) => {
    const { network, index } = setup();
    expect(evaluateB(closure({ comments: [text] }), network, index, NO_POINTS)).toMatchObject({ outcome: "D", failed: "E1" });
  });

  it("E5: a closed link that isn't in the network", () => {
    const { network, index } = setup();
    expect(evaluateB(closure({ closedMainLinkIds: new Set(["l0", "unknown"]) }), network, index, NO_POINTS)).toMatchObject({ outcome: "D", failed: "E5" });
  });

  it("E6: closure continuing onto another road", () => {
    const { network, index } = setup();
    expect(evaluateB(closure({ roads: ["M99", "A99"] }), network, index, NO_POINTS)).toMatchObject({ outcome: "D", failed: "E6" });
  });

  it("E3/E4: no stretch in the closure's direction", () => {
    const { network, index } = setup();
    expect(evaluateB(closure({ direction: "southBound" }), network, index, NO_POINTS)).toMatchObject({ outcome: "D", failed: "E3" });
  });

  it("E6 (strict, decision D2): closure shorter than the stretch, bounded by intermediate junction J2", () => {
    const { network, index } = setup();
    const result = evaluateB(closure({ closedMainLinkIds: new Set(["l2", "l3"]), points: [pt(2.2), pt(3.8)] }), network, index, NO_POINTS);
    expect(result).toMatchObject({ outcome: "D", failed: "E6" });
  });

  it("E6: a closure that starts at the stretch start but ends before an intermediate junction", () => {
    const { network, index } = setup();
    const result = evaluateB(closure({ closedMainLinkIds: new Set(["l0"]), points: [pt(0.2), pt(0.8)] }), network, index, NO_POINTS);
    expect(result).toMatchObject({ outcome: "D", failed: "E6" });
  });

  it("E7: closure geometry ~200 m away from the stretch", () => {
    const { network, index } = setup();
    const result = evaluateB(closure({ points: [pt(0.5, 0.003), pt(1.5, 0.003), pt(2.5, 0.003), pt(3.5, 0.003)] }), network, index, NO_POINTS);
    expect(result).toMatchObject({ outcome: "D", failed: "E7" });
  });

  it("E8: two official stretches pass, so the result is D rather than a guess", () => {
    const twin: ClosureStretch = { ...stretchJ1J3, id: "s-twin" };
    const { network, index } = setup([stretchJ1J3, twin], [route(), route({ id: "r2", routeId: "M99/J1/J3/X", stretchId: "s-twin" })]);
    expect(evaluateB(closure(), network, index, NO_POINTS)).toMatchObject({ outcome: "D", failed: "E8" });
  });

  it("a Class 2a route is still the official route for the stretch, but is flagged NOT suitable for HGVs", () => {
    const { network, index } = setup([stretchJ1J3], [route({ classification: "Class_2A" })]);
    const result = evaluateB(closure(), network, index, NO_POINTS);
    expect(result.outcome).toBe("B");
    if (result.outcome === "B") expect(result.routes[0]!.hgvStatus).toBe("not-suitable");
  });

  it("a stretch whose route nodes are missing from the network is unusable, so closures on it are D", () => {
    const { network, index } = setup([stretchJ1J3], [route({ startNode: "gone" })]);
    expect(index.failures.get("s-j1-j3")).toBe("route-node-missing-from-network");
    expect(evaluateB(closure(), network, index, NO_POINTS)).toMatchObject({ outcome: "D", failed: "E3" });
  });

  it("incomplete or decommissioned routes don't make a stretch usable (E2)", () => {
    const { index: a } = setup([stretchJ1J3], [route({ complete: false })]);
    const { index: b } = setup([stretchJ1J3], [route({ decommissioned: true })]);
    expect(a.failures.get("s-j1-j3")).toBe("no-complete-route");
    expect(b.failures.get("s-j1-j3")).toBe("no-complete-route");
  });
});

describe("describeRoute HGV status (synthetic routes; descriptions copied from real NH routes)", () => {
  it("never says 'suitable'; with no restrictions recorded it says so with the caveat", () => {
    const r = describeRoute(route(), []);
    expect(r.hgvStatus).toBe("no-restrictions-recorded");
    expect(r.hgvReasons[0]).toContain("does not guarantee");
  });

  it.each([
    "M6 Southbound Closure: Junction 27 to 26 (Route 1- Non HGV Route)",
    "A46 OFF NETWORK EMERGENCY DIVERSION ROUTES (Non-HGV)",
    "A14, JUNCTION 2 TO JUNCTION 3 E/B CLOSURE (Cars only route)",
  ])("Class 1A but NH text says not for HGVs gives not-suitable: %s", (description) => {
    const r = describeRoute(route({ description }), []);
    expect(r.hgvStatus).toBe("not-suitable");
    expect(r.hgvReasons[0]).toContain(description);
  });

  it("an 'HGV route' description is not mistaken for non-HGV", () => {
    const r = describeRoute(route({ description: "M6 Southbound Closure: Junction 27 to 26 (Route 2 - HGV route )" }), []);
    expect(r.hgvStatus).toBe("no-restrictions-recorded");
  });

  it("Class 2a/2b and unknown classifications are not-suitable", () => {
    expect(describeRoute(route({ classification: "Class_2B" }), []).hgvStatus).toBe("not-suitable");
    expect(describeRoute(route({ classification: null }), []).hgvStatus).toBe("not-suitable");
  });

  it("route limits and restriction points both require a vehicle check, and are all listed", () => {
    const r = describeRoute(route({ limits: { heightMetres: 3.6, widthMetres: null, weightTonnes: 7.5, lengthMetres: null } }), [
      { routeId: "r1", kind: "height", value: 4.4, unit: "metres" },
    ]);
    expect(r.hgvStatus).toBe("check-vehicle");
    expect(r.restrictions).toEqual([
      { kind: "height", value: 3.6, unit: "metres", source: "route-limit" },
      { kind: "weight", value: 7.5, unit: "tonnes", source: "route-limit" },
      { kind: "height", value: 4.4, unit: "metres", source: "restriction-point" },
    ]);
  });
});

describe("E6 position precision (approved decision D9; synthetic)", () => {
  // Synthetic links are ~1,105 m long (0.01° latitude). Positions are metres from each link's digitised start.
  const len = (id: string) => buildNetwork(links, junctionRefs, junctions).lengths.get(id)!;

  it("a closure starting in the last few metres of a link starts at that link's end node (here J2), so it is shorter than J1-J3: D", () => {
    const { network, index } = setup();
    const group = closure({
      closedMainLinkIds: new Set(["l1", "l2", "l3"]),
      closedExtents: new Map([["l1", { fromMetres: len("l1") - 3, toMetres: len("l1") }]]),
      points: [pt(2.1), pt(3.9)],
    });
    const result = evaluateB(group, network, index, NO_POINTS);
    expect(result).toMatchObject({ outcome: "D", failed: "E6" });
  });

  it("a closure ending in the first few metres of a link ends at that link's start node (here J2): D", () => {
    const { network, index } = setup();
    const group = closure({
      closedMainLinkIds: new Set(["l0", "l1", "l2"]),
      closedExtents: new Map([["l2", { fromMetres: 0, toMetres: 3 }]]),
      points: [pt(0.1), pt(1.9)],
    });
    expect(evaluateB(group, network, index, NO_POINTS)).toMatchObject({ outcome: "D", failed: "E6" });
  });

  it("a closure starting 55 m before a junction node is bounded by the previous junction (the M54 pattern): position precision doesn't move it", () => {
    const { network, index } = setup();
    const group = closure({
      closedMainLinkIds: new Set(["l1", "l2", "l3"]),
      closedExtents: new Map([["l1", { fromMetres: len("l1") - 55, toMetres: len("l1") }]]),
      points: [pt(1.97), pt(2.5), pt(3.9)],
    });
    const result = evaluateB(group, network, index, NO_POINTS);
    // l0 isn't closed but the closure starts inside l1 (before J2), so the junction before it is J1 = stretch start.
    expect(result.outcome).toBe("B");
    if (result.outcome === "B") {
      expect(result.trace.closureStartMetresIntoFirstLink).toBeCloseTo(len("l1") - 55, 0);
      expect(result.trace.junctionBeforeClosure).toEqual(["J1"]);
    }
  });

  it("converts positions on a two-way link traversed against its digitised direction", () => {
    // l1 digitised n2 → n1 (reverse of travel) and two-way: its "first 3 m" are the LAST 3 m in the direction of travel.
    const reversed = links.map((l) => (l.id === "l1" ? { ...l, startNode: "n2", endNode: "n1", twoWay: true, geometry: [[pt(2), pt(1)]] } : l));
    const network = buildNetwork(reversed, junctionRefs, junctions);
    const index = buildStretchIndex(network, [stretchJ1J3], [route()]);
    const group = closure({
      closedMainLinkIds: new Set(["l1", "l2", "l3"]),
      closedExtents: new Map([["l1", { fromMetres: 0, toMetres: 3 }]]),
      points: [pt(2.1), pt(3.9)],
    });
    expect(evaluateB(group, network, index, NO_POINTS)).toMatchObject({ outcome: "D", failed: "E6" });
  });
});

describe("D7 stretch-label consistency in the index (synthetic)", () => {
  it("labels that reconcile with the path's end junctions keep the stretch usable", () => {
    const { index } = setup();
    expect(index.usable.has("s-j1-j3")).toBe(true);
  });

  it("labels that name another junction make the stretch unable to establish B, without removing it from the data", () => {
    const mislabelled: ClosureStretch = { ...stretchJ1J3, junctionFrom: "J2" };
    const { network, index } = setup([mislabelled]);
    expect(index.failures.get("s-j1-j3")).toBe("labels-disagree-with-path");
    expect(evaluateB(closure(), network, index, NO_POINTS)).toMatchObject({ outcome: "D", failed: "E3" });
  });

  it("labels that aren't road + junction number can't be reconciled", () => {
    const named: ClosureStretch = { ...stretchJ1J3, junctionFrom: "A4130", junctionTo: "WEEFORD ISLAND" };
    const { index } = setup([named]);
    expect(index.failures.get("s-j1-j3")).toBe("labels-not-reconcilable");
  });
});

describe("S4 stretches split across rows (synthetic; pattern seen in 319 real stretches)", () => {
  it("rows with the same GUID and attributes are merged into one stretch, so it is one candidate, not a competing pair", () => {
    const half1: ClosureStretch = { ...stretchJ1J3, geometry: [[pt(0), pt(1), pt(2)]] };
    const half2: ClosureStretch = { ...stretchJ1J3, geometry: [[pt(2), pt(3), pt(4)]] };
    const { network, index } = setup([half1, half2]);
    expect(index.byRoadDirection.get("M99|northBound")).toHaveLength(1);
    expect(evaluateB(closure(), network, index, NO_POINTS).outcome).toBe("B");
  });

  it("rows with the same GUID but different junction labels are a conflict: the stretch can't establish B", () => {
    const { network, index } = setup([stretchJ1J3, { ...stretchJ1J3, junctionTo: "M99J3X" }]);
    expect(index.failures.get("s-j1-j3")).toBe("stretch-rows-conflict");
    expect(evaluateB(closure(), network, index, NO_POINTS).outcome).toBe("D");
  });
});
