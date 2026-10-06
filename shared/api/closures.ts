import * as z from "zod";
import { LABELS } from "../diversion/classify.ts";

/**
 * The closures API contract: what the matcher/API returns and what the UI consumes (SPECIFICATION §5, §10).
 * The classification (A/B/D) is produced by the frozen matcher (shared/diversion) and carried here as data. The UI must
 * never compute or alter it. Wording comes from the matcher's LABELS so the UI can't drift from the spec.
 */

export { LABELS as DIVERSION_LABELS };

const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "ISO date-time");
const lonLat = z.tuple([z.number(), z.number()]);
const line = z.array(lonLat).min(2);

export const directionSchema = z.enum(["northbound", "southbound", "eastbound", "westbound", "clockwise", "anticlockwise"]);
export type Direction = z.infer<typeof directionSchema>;

/** Where the data came from. The UI must show this prominently and never present non-live data as live. */
export const provenanceSchema = z.object({
  kind: z.enum(["live", "development-snapshot", "mock"]),
  /** Short human label, e.g. "Development snapshot". */
  label: z.string(),
  /** When the upstream data was captured (not when this file was generated). */
  capturedAt: isoDateTime,
  sources: z.array(z.string()),
  notes: z.array(z.string()),
});

export const hgvStatusSchema = z.enum(["not-suitable", "check-vehicle", "no-restrictions-recorded"]);
export type HgvStatus = z.infer<typeof hgvStatusSchema>;

export const restrictionSchema = z.object({
  kind: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  source: z.enum(["route-limit", "restriction-point"]),
});

export const officialRouteSchema = z.object({
  routeId: z.string(),
  routeNumber: z.number().nullable(),
  /** NH description, verbatim. */
  description: z.string(),
  classification: z.enum(["Class_1A", "Class_1B", "Class_2A", "Class_2B"]).nullable(),
  hgvStatus: hgvStatusSchema,
  hgvReasons: z.array(z.string()),
  restrictions: z.array(restrictionSchema),
  signageSymbol: z.string().nullable(),
  lengthMiles: z.number().nullable(),
  estimatedTravelTime: z.string().nullable(),
  lastModified: isoDateTime.nullable(),
  geometry: z.array(line),
});
export type OfficialRoute = z.infer<typeof officialRouteSchema>;

/** Class A: NH's own diversion text for the roadworks event, verbatim. */
export const officialTextSchema = z.object({
  label: z.literal(LABELS.A),
  eventNumber: z.string(),
  text: z.string(),
  statements: z.array(z.string()),
  basis: z.enum(["shared-event-id", "own-s2-record"]),
});

/** Class B: an official NH emergency diversion route matched on evidence E1–E8. */
export const matchedRouteSchema = z.object({
  label: z.literal(LABELS.B),
  confidence: z.literal("High — matched by National Highways network position (E1–E8)"),
  stretch: z.object({ id: z.string(), label: z.string(), junctionFrom: z.string(), junctionTo: z.string(), geometry: z.array(line) }),
  routes: z.array(officialRouteSchema).min(1),
  evidence: z.array(z.object({ id: z.enum(["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8"]), detail: z.string() })),
});

/** Class D: no reliable diversion, with the first failing evidence item. */
export const noReliableDiversionSchema = z.object({
  label: z.literal(LABELS.D),
  failedEvidence: z.enum(["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8"]),
  reason: z.string(),
  /** Generic NH diversion wording shown as a note, never as A. */
  genericNote: z.string().nullable(),
});

export const trafficClosureSchema = z
  .object({
    id: z.string(),
    source: z.enum(["nh-s1", "nh-s2"]),
    situationId: z.string(),
    road: z.string(),
    /** All roads the closed carriageway lies on (more than one means it continues onto another road). */
    roads: z.array(z.string()).min(1),
    direction: directionSchema,
    window: z.object({ start: isoDateTime, end: isoDateTime }),
    /** NH's own comments for this closure, verbatim. */
    nhText: z.array(z.string()),
    /** Closed main-carriageway sections, as NH Network Model link descriptions. */
    closedSections: z.array(z.object({ description: z.string(), links: z.number().int().positive() })),
    /** False when NH's own text says this isn't a full carriageway closure (e.g. layby or slip-road works). */
    fullCarriagewayClosure: z.boolean(),
    /** Matcher output. "C" is reserved and never appears in V1. */
    classes: z.array(z.enum(["A", "B", "D"])).min(1),
    officialText: officialTextSchema.nullable(),
    matchedRoute: matchedRouteSchema.nullable(),
    noReliableDiversion: noReliableDiversionSchema.nullable(),
    /** Review state of a B result during P0 (candidates are not confirmed production matches). */
    reviewNote: z.string().nullable(),
    geometry: z.object({ closedCarriageway: z.array(line).min(1) }),
  })
  .superRefine((c, ctx) => {
    // The contract mirrors the matcher's invariants; data that breaks them is rejected at the boundary.
    if (c.classes.includes("A") !== (c.officialText !== null)) ctx.addIssue({ code: "custom", message: "A requires officialText (and vice versa)" });
    if (c.classes.includes("B") !== (c.matchedRoute !== null)) ctx.addIssue({ code: "custom", message: "B requires matchedRoute (and vice versa)" });
    if (c.classes.includes("D") !== (c.noReliableDiversion !== null)) ctx.addIssue({ code: "custom", message: "D requires noReliableDiversion (and vice versa)" });
    if (c.classes.includes("D") && c.classes.length > 1) ctx.addIssue({ code: "custom", message: "D can't be combined with A or B" });
    if (c.source === "nh-s2" && c.classes.includes("B")) ctx.addIssue({ code: "custom", message: "S2-only closures can never be B" });
  });
export type TrafficClosure = z.infer<typeof trafficClosureSchema>;

export const closuresSnapshotSchema = z.object({
  provenance: provenanceSchema,
  generatedAt: isoDateTime,
  closures: z.array(trafficClosureSchema),
});
export type ClosuresSnapshot = z.infer<typeof closuresSnapshotSchema>;
