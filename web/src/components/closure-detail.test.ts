import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OfficialRoute } from "../../../shared/api/closures.ts";
import type { ArcgisFeature } from "../../../shared/sources/arcgis/schema.ts";
import { describeRoute } from "../../../shared/diversion/evaluate-b.ts";
import { normaliseDiversionPoint, normaliseRoute } from "../../../shared/sources/nh-arcgis/normalise.ts";
import { NO_RESTRICTIONS_RECORDED } from "../domain/units.ts";
import { RouteCard } from "./ClosureDetail.tsx";

/**
 * A route card's restrictions, rendered from the frozen evaluator's output for real NH routes (fixtures/matcher, captured
 * 2026-10-05). Absence of restriction data is never shown as clearance (SPECIFICATION §7).
 */
function realRoute(fixture: string, routeId: string): OfficialRoute {
  const f = JSON.parse(gunzipSync(readFileSync(`fixtures/matcher/${fixture}.json.gz`)).toString("utf8")) as { s4Routes: ArcgisFeature[]; s4Points: ArcgisFeature[] };
  const route = f.s4Routes.map(normaliseRoute).find((r) => r.routeId === routeId);
  if (!route) throw new Error(`${fixture} has no route ${routeId}`);
  const points = f.s4Points.map(normaliseDiversionPoint).filter((p) => p.routeId === routeId);
  // estimatedTravelTime and geometry are added by the publisher, not the evaluator; the card's restriction text doesn't use them.
  return { ...describeRoute(route, points), estimatedTravelTime: null, geometry: [] };
}

const render = (route: OfficialRoute) => renderToStaticMarkup(h(RouteCard, { route }));
const count = (html: string, text: string) => html.split(text).length - 1;

describe("route card: no recorded restrictions", () => {
  it("uses the evaluator's own sentence (the frozen evaluator is the source of the wording)", () => {
    expect(realRoute("a1-colsterworth-layby", "A1/A606/A607/1").hgvReasons).toEqual([NO_RESTRICTIONS_RECORDED]);
  });

  it("says once that none recorded doesn't mean none exist (Class 1A, no restrictions)", () => {
    const route = realRoute("a1-colsterworth-layby", "A1/A606/A607/1");
    expect(route).toMatchObject({ hgvStatus: "no-restrictions-recorded", restrictions: [] });
    const out = render(route);
    expect(count(out, NO_RESTRICTIONS_RECORDED)).toBe(1);
    expect(out).not.toContain("None recorded by National Highways");
  });

  it("keeps the caveat on a route not for HGVs that records no restrictions (Class 2A), with its not-for-HGVs reason", () => {
    const route = realRoute("a42-j13-to-m1-j23a", "M1/J30/J31/2");
    expect(route).toMatchObject({ hgvStatus: "not-suitable", classification: "Class_2A", restrictions: [] });
    const out = render(route);
    expect(count(out, NO_RESTRICTIONS_RECORDED)).toBe(1);
    expect(out).toContain("National Highways classifies this route Class 2A: not to be used by HGVs.");
  });

  it("doesn't show the caveat when restrictions are recorded, and lists them", () => {
    const route = realRoute("a1-colsterworth-layby", "A1/A606/A6121/1");
    expect(route.hgvStatus).toBe("check-vehicle");
    expect(route.restrictions.length).toBeGreaterThan(0);
    const out = render(route);
    expect(out).not.toContain(NO_RESTRICTIONS_RECORDED);
    expect(out).toContain("National Highways records restrictions on this route. Check them against your vehicle.");
  });
});
