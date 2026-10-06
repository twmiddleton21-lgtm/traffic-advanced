import * as z from "zod";
import type { LonLat, Polyline } from "../../geo/distance.ts";
import type { ArcgisFeature } from "../arcgis/schema.ts";

/**
 * Adapters for the key-free NH ArcGIS layers (S4 Diversion Routes, S5 Network Model), requested with outSR=4326.
 * GUIDs are normalised to lower case without braces: S1 and S4 use braced upper-case forms of the same S5 ids.
 */
export const normaliseGuid = (value: string): string => value.trim().replace(/^\{|\}$/g, "").toLowerCase();

/** "A1(M)" ≡ "A1M". Only brackets and whitespace are removed; anything else must match exactly. */
export const normaliseRoad = (value: string): string => value.replace(/[()\s]/g, "").toUpperCase();

const pathsGeometry = z.object({ paths: z.array(z.array(z.tuple([z.number(), z.number()]).rest(z.number()))) });

function toPolylines(feature: ArcgisFeature): Polyline[] {
  const parsed = pathsGeometry.safeParse(feature.geometry);
  if (!parsed.success) return [];
  return parsed.data.paths.map((path) => path.map((p): LonLat => [p[0], p[1]]));
}

// --- S5 Network Model ---------------------------------------------------------------------------

/** S5 linkform. Seen 2026-10-05: DC, SC, SL, R, L, SR, DL, EA. Kept open: new values must not break parsing. */
export type LinkForm = string;

export interface NetworkLink {
  id: string;
  road: string;
  /** S5 per-link compass/ring label (N, S, E, W, CW, ACW). */
  direction: string;
  carriageway: string;
  form: LinkForm;
  startNode: string;
  endNode: string;
  twoWay: boolean;
  description: string;
  geometry: Polyline[];
}

const linkAttributes = z.looseObject({
  linkid: z.string(),
  roadname: z.string(),
  direction: z.string(),
  carriageway: z.string(),
  linkform: z.string(),
  startnode: z.string(),
  endnode: z.string(),
  directionality: z.string(),
  linkdesc: z.string().nullish(),
});

export function normaliseLink(feature: ArcgisFeature): NetworkLink {
  const a = linkAttributes.parse(feature.attributes);
  return {
    id: normaliseGuid(a.linkid),
    road: normaliseRoad(a.roadname),
    direction: a.direction,
    carriageway: a.carriageway,
    form: a.linkform,
    startNode: normaliseGuid(a.startnode),
    endNode: normaliseGuid(a.endnode),
    twoWay: a.directionality === "0",
    description: a.linkdesc ?? "",
    geometry: toPolylines(feature),
  };
}

const junctionAttributes = z.looseObject({ junctionid: z.string(), junctionname: z.string().nullish() });

export function normaliseJunction(feature: ArcgisFeature): { junctionId: string; name: string } {
  const a = junctionAttributes.parse(feature.attributes);
  return { junctionId: normaliseGuid(a.junctionid), name: a.junctionname ?? "" };
}

const junctionRefAttributes = z.looseObject({ junctionid: z.string(), nodeid: z.string() });

export function normaliseJunctionRef(feature: ArcgisFeature): { junctionId: string; nodeId: string } {
  const a = junctionRefAttributes.parse(feature.attributes);
  return { junctionId: normaliseGuid(a.junctionid), nodeId: normaliseGuid(a.nodeid) };
}

// --- S4 Diversion Routes -------------------------------------------------------------------------

/** S4 stretch direction → S1 `directionOnLinearSection` value. Unknown values map to null (E4 then fails). */
const STRETCH_DIRECTION: Record<string, string> = {
  Northbound: "northBound",
  Southbound: "southBound",
  Eastbound: "eastBound",
  Westbound: "westBound",
  Clockwise: "clockwise",
  "Anti-clockwise": "anticlockwise",
};

export interface ClosureStretch {
  id: string;
  road: string;
  direction: string | null;
  junctionFrom: string;
  junctionTo: string;
  description: string;
  geometry: Polyline[];
}

const stretchAttributes = z.looseObject({
  SRNClosureStretchGUID: z.string(),
  RoadName: z.string(),
  Direction: z.string().nullish(),
  JunctionNumberFrom: z.string().nullish(),
  JunctionNumberTo: z.string().nullish(),
  Description: z.string().nullish(),
});

export function normaliseStretch(feature: ArcgisFeature): ClosureStretch {
  const a = stretchAttributes.parse(feature.attributes);
  return {
    id: normaliseGuid(a.SRNClosureStretchGUID),
    road: normaliseRoad(a.RoadName),
    direction: (a.Direction && STRETCH_DIRECTION[a.Direction]) ?? null,
    junctionFrom: a.JunctionNumberFrom ?? "",
    junctionTo: a.JunctionNumberTo ?? "",
    description: a.Description ?? "",
    geometry: toPolylines(feature),
  };
}

export type RouteClassification = "Class_1A" | "Class_1B" | "Class_2A" | "Class_2B";

export interface RouteLimits {
  heightMetres: number | null;
  widthMetres: number | null;
  weightTonnes: number | null;
  lengthMetres: number | null;
}

export interface DiversionRoute {
  id: string;
  routeId: string;
  /** NH description, verbatim. Can contradict the classification (e.g. "Non HGV Route" on a Class 1A route). */
  description: string;
  limits: RouteLimits;
  stretchId: string;
  routeNumber: number | null;
  classification: RouteClassification | null;
  complete: boolean;
  decommissioned: boolean;
  startNode: string;
  endNode: string;
  signageSymbol: string | null;
  lengthMiles: number | null;
  estimatedTravelTime: string | null;
  lastModified: string | null;
}

const routeAttributes = z.looseObject({
  DiversionRouteGUID: z.string(),
  DiversionRouteID: z.string(),
  Description: z.string().nullish(),
  HeightLimitMetres: z.number().nullish(),
  WidthLimitMetres: z.number().nullish(),
  WeightLimitTonnes: z.number().nullish(),
  LengthLimitMetres: z.number().nullish(),
  SRNClosureStretchGUID: z.string(),
  RouteNumber: z.number().nullish(),
  RouteClassification: z.string().nullish(),
  RecordState: z.string().nullish(),
  DecommissionedDatetime: z.number().nullish(),
  SRNStartNode: z.string().nullish(),
  SRNEndNode: z.string().nullish(),
  SignageSymbol: z.string().nullish(),
  RouteLengthMiles: z.number().nullish(),
  EstimatedTravelTime: z.union([z.string(), z.number()]).nullish(),
  LastmodifiedDatetime: z.number().nullish(),
});

const CLASSIFICATIONS = new Set(["Class_1A", "Class_1B", "Class_2A", "Class_2B"]);

export function normaliseRoute(feature: ArcgisFeature): DiversionRoute {
  const a = routeAttributes.parse(feature.attributes);
  const classification = a.RouteClassification && CLASSIFICATIONS.has(a.RouteClassification) ? (a.RouteClassification as RouteClassification) : null;
  return {
    id: normaliseGuid(a.DiversionRouteGUID),
    routeId: a.DiversionRouteID,
    description: a.Description ?? "",
    limits: {
      heightMetres: a.HeightLimitMetres ?? null,
      widthMetres: a.WidthLimitMetres ?? null,
      weightTonnes: a.WeightLimitTonnes ?? null,
      lengthMetres: a.LengthLimitMetres ?? null,
    },
    stretchId: normaliseGuid(a.SRNClosureStretchGUID),
    routeNumber: a.RouteNumber ?? null,
    classification,
    complete: a.RecordState === "Complete",
    decommissioned: a.DecommissionedDatetime !== null && a.DecommissionedDatetime !== undefined,
    startNode: a.SRNStartNode ? normaliseGuid(a.SRNStartNode) : "",
    endNode: a.SRNEndNode ? normaliseGuid(a.SRNEndNode) : "",
    signageSymbol: a.SignageSymbol ?? null,
    lengthMiles: a.RouteLengthMiles ?? null,
    estimatedTravelTime: a.EstimatedTravelTime === null || a.EstimatedTravelTime === undefined ? null : String(a.EstimatedTravelTime),
    lastModified: a.LastmodifiedDatetime ? new Date(a.LastmodifiedDatetime).toISOString() : null,
  };
}

/**
 * NH Class 1a/1b = "to be used by all vehicles" (DMRB GG 903 §E/2.15–2.16). This is necessary but NOT sufficient for
 * an HGV: P0 found Class 1A routes with 3.6 m height limits and "Non HGV Route" descriptions (docs/P0-REPORT.md).
 */
export const isAllVehicleClassification = (c: RouteClassification | null): c is "Class_1A" | "Class_1B" =>
  c === "Class_1A" || c === "Class_1B";

export interface DiversionPoint {
  routeId: string;
  kind: string;
  value: number | null;
  unit: string;
}

const pointAttributes = z.looseObject({
  DiversionRouteGUID: z.string(),
  RestrictionType: z.string().nullish(),
  MeasureValue: z.number().nullish(),
  MeasureUnit: z.string().nullish(),
});

/** S4 layer 3: restrictions along a diversion route (e.g. height 4.4 metres). Keyed by DiversionRouteGUID. */
export function normaliseDiversionPoint(feature: ArcgisFeature): DiversionPoint {
  const a = pointAttributes.parse(feature.attributes);
  return { routeId: normaliseGuid(a.DiversionRouteGUID), kind: a.RestrictionType ?? "unknown", value: a.MeasureValue ?? null, unit: a.MeasureUnit ?? "" };
}

// --- S2 Public Scheduled Road Closures ------------------------------------------------------------

export interface ScheduledClosureEvent {
  eventNumber: string;
  road: string;
  description: string;
  start: string | null;
  end: string | null;
}

const s2Attributes = z.looseObject({
  formattedeventnumber: z.string().nullish(),
  road_number: z.string().nullish(),
  description: z.string().nullish(),
  scheduledplannedstartdate: z.number().nullish(),
  scheduledplannedenddate: z.number().nullish(),
});

export function normaliseScheduledClosure(feature: ArcgisFeature): ScheduledClosureEvent {
  const a = s2Attributes.parse(feature.attributes);
  return {
    eventNumber: a.formattedeventnumber ?? "",
    road: a.road_number ?? "",
    description: a.description ?? "",
    start: a.scheduledplannedstartdate ? new Date(a.scheduledplannedstartdate).toISOString() : null,
    end: a.scheduledplannedenddate ? new Date(a.scheduledplannedenddate).toISOString() : null,
  };
}
