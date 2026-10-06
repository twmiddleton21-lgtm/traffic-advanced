import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { ArcgisFeature } from "../sources/arcgis/schema.ts";
import { normaliseDiversionPoint, normaliseJunction, normaliseJunctionRef, normaliseLink, normaliseRoute, normaliseStretch, type DiversionPoint } from "../sources/nh-arcgis/normalise.ts";
import { mergeS1Pages } from "../sources/nh-closures/merge.ts";
import { normaliseSituation } from "../sources/nh-closures/normalise.ts";
import { buildNetwork } from "../network/graph.ts";
import { buildStretchIndex } from "./stretch-index.ts";
import { groupClosures } from "./closure-groups.ts";
import { evaluateB } from "./evaluate-b.ts";

/**
 * Real-data regression suite (fixtures/matcher, captured 2026-10-05). Expected outcomes come from human review
 * (fixtures/matcher/cases.json), never from the matcher itself.
 */

interface Case {
  name: string;
  situationId: string;
  textIncludes: string;
  expected: "B" | "D";
  expectedStretch?: string;
  direction?: string;
  review: string;
}

interface Fixture {
  now: string;
  s1Page: unknown;
  s5Links: ArcgisFeature[];
  s5JunctionRefs: ArcgisFeature[];
  s5Junctions: ArcgisFeature[];
  s4Stretches: ArcgisFeature[];
  s4Routes: ArcgisFeature[];
  s4Points: ArcgisFeature[];
  fullRunOutcomes: string[];
}

const { cases } = JSON.parse(readFileSync("fixtures/matcher/cases.json", "utf8")) as { cases: Case[] };

function run(c: Case) {
  const f = JSON.parse(gunzipSync(readFileSync(`fixtures/matcher/${c.name}.json.gz`)).toString("utf8")) as Fixture;
  const network = buildNetwork(f.s5Links.map(normaliseLink), f.s5JunctionRefs.map(normaliseJunctionRef), f.s5Junctions.map(normaliseJunction));
  const index = buildStretchIndex(network, f.s4Stretches.map(normaliseStretch), f.s4Routes.map(normaliseRoute));
  const points = new Map<string, DiversionPoint[]>();
  for (const p of f.s4Points.map(normaliseDiversionPoint)) points.set(p.routeId, [...(points.get(p.routeId) ?? []), p]);
  const situation = mergeS1Pages([f.s1Page]).situations.get(c.situationId);
  if (!situation) throw new Error(`fixture ${c.name} has no situation ${c.situationId}`);
  const groups = groupClosures(normaliseSituation(situation).records, f.now).filter((g) => g.comments.some((t) => t.includes(c.textIncludes)));
  return { fixture: f, results: groups.map((g) => ({ group: g, evaluation: evaluateB(g, network, index, points) })) };
}

describe("matcher regression: known false positives stay D", () => {
  for (const c of cases.filter((x) => x.expected === "D")) {
    it(`${c.name}: ${c.review}`, () => {
      const { fixture, results } = run(c);
      expect(results.length).toBe(fixture.fullRunOutcomes.length);
      for (const { evaluation } of results) expect(evaluation.outcome).toBe("D");
    });
  }
});

describe("matcher regression: reviewer-checked positives (pending owner confirmation)", () => {
  for (const c of cases.filter((x) => x.expected === "B")) {
    it(`${c.name}: ${c.review}`, () => {
      const { fixture, results } = run(c);
      expect(results.length).toBe(fixture.fullRunOutcomes.length);
      const inDirection = results.filter((r) => r.group.direction === c.direction);
      expect(inDirection.length).toBeGreaterThan(0);
      for (const { evaluation } of inDirection) {
        expect(evaluation.outcome).toBe("B");
        if (evaluation.outcome !== "B") continue;
        expect(evaluation.stretchLabel).toBe(c.expectedStretch);
        expect(evaluation.evidence.map((e) => e.id)).toEqual(["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8"]);
        expect(evaluation.routes.length).toBeGreaterThan(0);
        // The app never asserts an HGV fits: every route carries one of the three cautious statuses with a reason.
        for (const r of evaluation.routes) {
          expect(["not-suitable", "check-vehicle", "no-restrictions-recorded"]).toContain(r.hgvStatus);
          expect(r.hgvReasons.length).toBeGreaterThan(0);
        }
      }
      // Any other closure-direction in the same records must not borrow the match.
      for (const { evaluation } of results.filter((r) => r.group.direction !== c.direction)) expect(evaluation.outcome).toBe("D");
    });
  }
});
