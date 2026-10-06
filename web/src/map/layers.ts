import type { FeatureCollection, MultiLineString, Point } from "geojson";
import type { TrafficClosure } from "../../../shared/api/closures.ts";
import type { Junction } from "../../../shared/api/junctions.ts";
import { directionLabel } from "../domain/filters.ts";

/**
 * Pure conversion from the closures contract to GeoJSON for the map. No classification happens here: the primary class
 * shown on a marker is read from the matcher's `classes` (B over A when both apply, for the marker only).
 */
type LngLat = [number, number];

export interface ClosureFeatureProps {
  id: string;
  cls: "A" | "B" | "D";
  road: string;
  /** "M53 southbound closed": shown beside the selected closure's marker. */
  title: string;
}

export function markerClass(c: TrafficClosure): "A" | "B" | "D" {
  if (c.classes.includes("B")) return "B";
  if (c.classes.includes("A")) return "A";
  return "D";
}

const props = (c: TrafficClosure): ClosureFeatureProps => ({
  id: c.id,
  cls: markerClass(c),
  road: c.road,
  title: `${c.road} ${directionLabel(c.direction).toLowerCase()} closed`,
});

export function closureLines(closures: TrafficClosure[]): FeatureCollection<MultiLineString, ClosureFeatureProps> {
  return {
    type: "FeatureCollection",
    features: closures.map((c) => ({ type: "Feature", properties: props(c), geometry: { type: "MultiLineString", coordinates: c.geometry.closedCarriageway } })),
  };
}

/** One marker per closure, at the middle vertex of its longest closed section. */
export function closureMarkers(closures: TrafficClosure[]): FeatureCollection<Point, ClosureFeatureProps> {
  return {
    type: "FeatureCollection",
    features: closures.map((c) => {
      const longest = [...c.geometry.closedCarriageway].sort((a, b) => b.length - a.length)[0]!;
      return { type: "Feature", properties: props(c), geometry: { type: "Point", coordinates: longest[Math.floor(longest.length / 2)]! } };
    }),
  };
}

export interface RouteFeatureProps {
  kind: "route" | "stretch";
  routeId: string;
  /**
   * True when the line's vertex order is its direction of travel, so arrows may be drawn along it. NH route geometry runs from
   * where the diversion leaves the network to where it rejoins (verified, docs/DATA-SOURCES.md S4, and re-checked for every route
   * by scripts/dev/export-ui-snapshot.ts). That holds for single-part routes only; multi-part routes have no proven part order.
   */
  directional: boolean;
}

/**
 * Official diversion route(s) and the closed stretch for a selected B closure. Empty for A/D: there is no route geometry for
 * them, so nothing is drawn and no direction is implied. Geometry is passed through unchanged, never reordered or reversed.
 */
export function selectedRouteLines(c: TrafficClosure | null): FeatureCollection<MultiLineString, RouteFeatureProps> {
  if (!c?.matchedRoute) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [
      ...c.matchedRoute.routes.map((r) => ({
        type: "Feature" as const,
        properties: { kind: "route" as const, routeId: r.routeId, directional: r.geometry.length === 1 },
        geometry: { type: "MultiLineString" as const, coordinates: r.geometry },
      })),
      {
        type: "Feature",
        properties: { kind: "stretch", routeId: "", directional: false },
        geometry: { type: "MultiLineString", coordinates: c.matchedRoute.stretch.geometry },
      },
    ],
  };
}

export interface RouteEndProps {
  role: "start" | "rejoin";
  label: string;
}

/** Where each directional route leaves the network (its first vertex) and rejoins it (its last vertex). */
export function diversionEnds(c: TrafficClosure | null): FeatureCollection<Point, RouteEndProps> {
  const routes = (c?.matchedRoute?.routes ?? []).filter((r) => r.geometry.length === 1);
  const numbered = routes.length > 1;
  return {
    type: "FeatureCollection",
    features: routes.flatMap((r) => {
      const line = r.geometry[0]!;
      const prefix = numbered ? `Route ${r.routeNumber} ` : "Diversion ";
      return [
        { type: "Feature" as const, properties: { role: "start" as const, label: `${prefix}starts` }, geometry: { type: "Point" as const, coordinates: line[0]! } },
        { type: "Feature" as const, properties: { role: "rejoin" as const, label: `${prefix}rejoins` }, geometry: { type: "Point" as const, coordinates: line[line.length - 1]! } },
      ];
    }),
  };
}

/**
 * Junctions the matcher confirmed for this closure (the matched official stretch's own junction labels). Null for A/D: the map
 * then shows ordinary junction labels only and never suggests which junctions bound the closure.
 */
export function confirmedJunctionNames(c: TrafficClosure | null): string[] {
  return c?.matchedRoute ? [c.matchedRoute.stretch.junctionFrom, c.matchedRoute.stretch.junctionTo] : [];
}

export function junctionPoints(junctions: Junction[]): FeatureCollection<Point, { name: string; short: string }> {
  return {
    type: "FeatureCollection",
    features: junctions.map((j) => ({
      type: "Feature",
      // "J4" on its own; M6 Toll numbers already carry their "T".
      properties: { name: j.name, short: /^T/.test(j.number) ? j.number : `J${j.number}` },
      geometry: { type: "Point", coordinates: j.position },
    })),
  };
}

/** Bounding box [[west, south], [east, north]] of everything relevant to a closure, or null. */
export function closureBounds(c: TrafficClosure): [LngLat, LngLat] | null {
  const lines = [...c.geometry.closedCarriageway, ...(c.matchedRoute?.routes.flatMap((r) => r.geometry) ?? [])];
  const points = lines.flat();
  if (points.length === 0) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
}

/** England's strategic road network, for the initial view. */
export const ENGLAND_BOUNDS: [LngLat, LngLat] = [
  [-6.3, 49.9],
  [1.9, 55.9],
];
