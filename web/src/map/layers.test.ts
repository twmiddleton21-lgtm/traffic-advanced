import { describe, expect, it } from "vitest";
import type { TrafficClosure } from "../../../shared/api/closures.ts";
import { developmentSnapshotSource } from "../data/trafficService.ts";
import { closureBounds, closureMarkers, confirmedJunctionNames, diversionEnds, junctionPoints, markerClass, selectedRouteLines } from "./layers.ts";

const { closures } = await developmentSnapshotSource.getSnapshot();
const { junctions } = await developmentSnapshotSource.getJunctions();
const find = (road: string, direction: string, situationId: string): TrafficClosure => {
  const c = closures.find((x) => x.road === road && x.direction === direction && x.situationId === situationId);
  if (!c) throw new Error(`${road} ${direction} not in snapshot`);
  return c;
};
const m53 = find("M53", "southbound", "491297");
const m65 = find("M65", "eastbound", "520677");
const m54 = find("M54", "eastbound", "515870");

describe("diversion direction", () => {
  it("passes each official route's geometry through in its own vertex order, never reversed or reordered", () => {
    for (const c of [m53, m65]) {
      const routes = selectedRouteLines(c).features.filter((f) => f.properties.kind === "route");
      expect(routes.map((f) => f.geometry.coordinates)).toEqual(c.matchedRoute!.routes.map((r) => r.geometry));
    }
  });

  it("marks single-part routes as directional (arrows drawn) and nothing else", () => {
    for (const c of [m53, m65]) {
      const features = selectedRouteLines(c).features;
      for (const f of features) expect(f.properties.directional).toBe(f.properties.kind === "route" && f.geometry.coordinates.length === 1);
      expect(features.some((f) => f.properties.directional)).toBe(true);
    }
  });

  it("does not mark a multi-part route as directional: its part order is unproven", () => {
    const route = m53.matchedRoute!.routes[0]!;
    const line = route.geometry[0]!;
    const split: TrafficClosure = {
      ...m53,
      matchedRoute: { ...m53.matchedRoute!, routes: [{ ...route, geometry: [line.slice(0, 10), line.slice(10)] }] },
    };
    expect(selectedRouteLines(split).features.filter((f) => f.properties.directional)).toHaveLength(0);
    expect(diversionEnds(split).features).toHaveLength(0);
  });

  it("puts 'starts' at the route's first vertex and 'rejoins' at its last (M53 J4–J5 SB leaves at J4, rejoins at J5)", () => {
    const line = m53.matchedRoute!.routes[0]!.geometry[0]!;
    const ends = diversionEnds(m53).features;
    expect(ends.map((f) => [f.properties.role, f.geometry.coordinates])).toEqual([
      ["start", line[0]],
      ["rejoin", line[line.length - 1]],
    ]);
    // Independent check against NH's own junction positions: southbound, the diversion leaves near J4 and rejoins near J5.
    const at = (name: string) => junctions.find((j) => j.name === name)!.position;
    const km = (a: readonly number[], b: readonly number[]) => Math.hypot((a[0]! - b[0]!) * 0.6, a[1]! - b[1]!) * 111;
    expect(km(line[0]!, at("M53 J4"))).toBeLessThan(1);
    expect(km(line[line.length - 1]!, at("M53 J5"))).toBeLessThan(1);
  });

  it("M65 J7–J8 EB leaves near J7 and rejoins near J8", () => {
    const line = m65.matchedRoute!.routes[0]!.geometry[0]!;
    const at = (name: string) => junctions.find((j) => j.name === name)!.position;
    const km = (a: readonly number[], b: readonly number[]) => Math.hypot((a[0]! - b[0]!) * 0.6, a[1]! - b[1]!) * 111;
    expect(km(line[0]!, at("M65 J7"))).toBeLessThan(1);
    expect(km(line[line.length - 1]!, at("M65 J8"))).toBeLessThan(1);
  });

  it("draws no route, no arrows and no start/rejoin points for A and D closures, or with nothing selected", () => {
    for (const c of closures.filter((x) => !x.matchedRoute)) {
      expect(selectedRouteLines(c).features).toHaveLength(0);
      expect(diversionEnds(c).features).toHaveLength(0);
    }
    expect(selectedRouteLines(null).features).toHaveLength(0);
    expect(diversionEnds(null).features).toHaveLength(0);
  });
});

describe("map context never changes matcher output", () => {
  it("marker classes are read from the matcher's classes; M54 stays D", () => {
    for (const c of closures) expect(c.classes).toContain(markerClass(c));
    expect(markerClass(m54)).toBe("D");
    expect(closureMarkers([m54]).features[0]!.properties.cls).toBe("D");
  });

  it("building map layers does not mutate closures", () => {
    const before = JSON.stringify(closures);
    for (const c of closures) {
      selectedRouteLines(c);
      diversionEnds(c);
      closureBounds(c);
      confirmedJunctionNames(c);
    }
    closureMarkers(closures);
    expect(JSON.stringify(closures)).toBe(before);
  });

  it("highlights junctions only where the matcher confirmed them (B), never for A or D", () => {
    expect(confirmedJunctionNames(m53)).toEqual(["M53 J4", "M53 J5"]);
    expect(confirmedJunctionNames(m65)).toEqual(["M65 J7", "M65 J8"]);
    for (const c of closures.filter((x) => !x.matchedRoute)) expect(confirmedJunctionNames(c)).toEqual([]);
  });

  it("every confirmed junction has an NH label point to highlight", () => {
    const names = new Set(junctions.map((j) => j.name));
    for (const c of closures) for (const n of confirmedJunctionNames(c)) expect(names.has(n), n).toBe(true);
  });

  it("selected framing covers the closed carriageway and the whole diversion", () => {
    for (const c of [m53, m65, m54]) {
      const [[w, s], [e, n]] = closureBounds(c)!;
      const points = [...c.geometry.closedCarriageway, ...(c.matchedRoute?.routes.flatMap((r) => r.geometry) ?? [])].flat();
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(w);
        expect(x).toBeLessThanOrEqual(e);
        expect(y).toBeGreaterThanOrEqual(s);
        expect(y).toBeLessThanOrEqual(n);
      }
    }
  });

  it("junction labels use NH's names verbatim, shortened only to the number", () => {
    const features = junctionPoints(junctions).features;
    expect(features).toHaveLength(junctions.length);
    const j4 = features.find((f) => f.properties.name === "M53 J4")!;
    expect(j4.properties.short).toBe("J4");
    expect(features.find((f) => f.properties.name === "M6 TOLL T7")?.properties.short).toBe("T7");
  });
});
