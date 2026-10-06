import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { closuresSnapshotSchema, trafficClosureSchema, type TrafficClosure } from "./closures.ts";

// Real development snapshot (scripts/dev/export-ui-snapshot.ts) as the base for contract tests.
const snapshot = closuresSnapshotSchema.parse(JSON.parse(readFileSync("web/src/data/dev-snapshot.json", "utf8")));
const b = snapshot.closures.find((c) => c.classes.includes("B"))!;
const d = snapshot.closures.find((c) => c.classes.includes("D"))!;

describe("closures contract invariants (mirror the matcher's)", () => {
  it("accepts the real development snapshot", () => {
    expect(snapshot.closures.length).toBeGreaterThan(0);
  });

  it("rejects B without its matched route, and a matched route without B", () => {
    expect(trafficClosureSchema.safeParse({ ...b, matchedRoute: null }).success).toBe(false);
    expect(trafficClosureSchema.safeParse({ ...d, matchedRoute: b.matchedRoute }).success).toBe(false);
  });

  it("rejects D combined with A or B", () => {
    expect(trafficClosureSchema.safeParse({ ...d, classes: ["A", "D"] } satisfies Partial<TrafficClosure>).success).toBe(false);
  });

  it("rejects an S2-only closure classified B (decision D3)", () => {
    expect(trafficClosureSchema.safeParse({ ...b, source: "nh-s2" }).success).toBe(false);
  });

  it("rejects class C (reserved, not in V1) and any HGV status outside the three cautious values", () => {
    expect(trafficClosureSchema.safeParse({ ...d, classes: ["C"] }).success).toBe(false);
    const route = { ...b.matchedRoute!.routes[0]!, hgvStatus: "suitable" };
    expect(trafficClosureSchema.safeParse({ ...b, matchedRoute: { ...b.matchedRoute!, routes: [route] } }).success).toBe(false);
  });
});
