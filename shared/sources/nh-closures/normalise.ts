import * as z from "zod";
import type { LonLat } from "../../geo/distance.ts";
import { normaliseGuid, normaliseRoad } from "../nh-arcgis/normalise.ts";
import type { MergedSituation } from "./merge.ts";

/**
 * Normalises merged S1 `sitRoadOrCarriagewayOrLaneManagement` records (field meanings verified 2026-10-05,
 * docs/P0-REPORT.md). Only fields needed for classification are kept. Unknown values are kept as-is, never guessed.
 */

/**
 * S1 linearElementType. Seen 2026-10-05: aCarriageway, bCarriageway, a/bCarriagewayEntrySlip, a/bCarriagewayExitSlip, other.
 * Kept open so unknown values parse; only the two main-carriageway values count as main carriageway.
 */
export type ElementType = string;

export const isMainCarriageway = (type: ElementType): boolean => type === "aCarriageway" || type === "bCarriageway";

export interface ClosureElement {
  linkId: string;
  road: string;
  type: ElementType;
  /** S1 `directionOnLinearSection`, e.g. northBound, clockwise. */
  direction: string;
  /** Operational lanes on this element's carriageway; null when S1 gives no impact for it (treated as not closed). */
  operationalLanes: number | null;
  /**
   * Affected section of the link in metres from the link's digitised start (S1 fromPoint/toPoint distanceAlong). Null when S1
   * gives no position (then the whole link is assumed). Compare with the link's geometric length, not S5 SHAPE__Length (Web Mercator).
   */
  fromMetres: number | null;
  toMetres: number | null;
  /** Geometry of the location group this element belongs to, in [lon, lat]. */
  points: LonLat[];
}

export interface ClosureRecord {
  situationId: string;
  recordId: string;
  managementType: string;
  validityStatus: string;
  start: string;
  end: string;
  comments: string[];
  elements: ClosureElement[];
}

const lineStringSchema = z.looseObject({ locGmlLineString: z.looseObject({ posList: z.string() }) });
const carriagewaySchema = z.looseObject({
  carriageway: z.looseObject({ value: z.string(), extendedValueG: z.string().optional() }).optional(),
  carriagewayExtensionG: z
    .looseObject({ impactOnCarriageway: z.looseObject({ numberOfOperationalLanes: z.number().optional() }).optional() })
    .optional(),
});
const distanceSchema = z.looseObject({ locDistanceFromLinearElementStart: z.looseObject({ distanceAlong: z.number() }).optional() }).optional();
const linearElementSchema = z.looseObject({
  directionOnLinearSection: z.string().optional(),
  fromPoint: distanceSchema,
  toPoint: distanceSchema,
  linearElement: z.looseObject({
    locLinearElementByCode: z.looseObject({
      roadName: z.string(),
      linearElementIdentifier: z.string(),
      linearElementByCodeExtensionG: z.looseObject({ linearElementType: z.string().optional() }).optional(),
    }),
  }),
});
const locationSchema = z.looseObject({
  locLinearLocation: z
    .looseObject({
      gmlLineString: lineStringSchema.optional(),
      supplementaryPositionalDescription: z.looseObject({ carriageway: z.array(carriagewaySchema).optional() }).optional(),
    })
    .optional(),
  locSingleRoadLinearLocation: z.looseObject({ linearWithinLinearElement: z.array(linearElementSchema).optional() }).optional(),
});
const recordSchema = z.looseObject({
  idG: z.string(),
  roadOrCarriagewayOrLaneManagementType: z.looseObject({ value: z.string() }),
  validity: z.looseObject({
    validityStatus: z.string(),
    validityTimeSpecification: z.looseObject({ overallStartTime: z.string(), overallEndTime: z.string() }),
  }),
  generalPublicComment: z.array(z.looseObject({ comment: z.string() })).optional(),
  locationReference: z.looseObject({
    locLocationGroupByList: z.looseObject({ locationContainedInGroup: z.array(locationSchema) }).optional(),
  }),
});

/** S1 posList is "lat lon lat lon …" (verified), the reverse of GeoJSON order. */
export function parsePosList(posList: string): LonLat[] {
  const values = posList.trim().split(/\s+/).map(Number);
  const points: LonLat[] = [];
  for (let i = 0; i + 1 < values.length; i += 2) points.push([values[i + 1]!, values[i]!]);
  return points;
}

/** Which carriageway impact applies to an element: main elements ↔ dual/single carriageway, slips ↔ slip roads. */
function carriagewayKindFor(type: ElementType): "main" | "slip" {
  return isMainCarriageway(type) ? "main" : "slip";
}

function operationalLanesFor(type: ElementType, carriageways: z.infer<typeof carriagewaySchema>[]): number | null {
  const wanted = carriagewayKindFor(type);
  for (const cw of carriageways) {
    const kind = cw.carriageway?.extendedValueG ?? cw.carriageway?.value ?? "";
    const isSlip = /slip/i.test(kind);
    if ((wanted === "slip") !== isSlip) continue;
    const lanes = cw.carriagewayExtensionG?.impactOnCarriageway?.numberOfOperationalLanes;
    if (lanes !== undefined) return lanes;
  }
  return null;
}

export function normaliseSituation(situation: MergedSituation): { records: ClosureRecord[]; skipped: string[] } {
  const records: ClosureRecord[] = [];
  const skipped: string[] = [];
  for (const { type, record } of situation.records.values()) {
    if (type !== "sitRoadOrCarriagewayOrLaneManagement") continue;
    const parsed = recordSchema.safeParse(record);
    if (!parsed.success) {
      skipped.push(record.idG);
      continue;
    }
    const r = parsed.data;
    // A record with a single location may omit the group list (documented). Treat that as one group.
    const groups =
      r.locationReference.locLocationGroupByList?.locationContainedInGroup ?? [locationSchema.parse(r.locationReference)];
    const elements: ClosureElement[] = [];
    for (const group of groups) {
      const points = group.locLinearLocation?.gmlLineString ? parsePosList(group.locLinearLocation.gmlLineString.locGmlLineString.posList) : [];
      const carriageways = group.locLinearLocation?.supplementaryPositionalDescription?.carriageway ?? [];
      for (const le of group.locSingleRoadLinearLocation?.linearWithinLinearElement ?? []) {
        const code = le.linearElement.locLinearElementByCode;
        const elementType = code.linearElementByCodeExtensionG?.linearElementType ?? "unknown";
        elements.push({
          linkId: normaliseGuid(code.linearElementIdentifier),
          road: normaliseRoad(code.roadName),
          type: elementType,
          direction: le.directionOnLinearSection ?? "unknown",
          operationalLanes: operationalLanesFor(elementType, carriageways),
          fromMetres: le.fromPoint?.locDistanceFromLinearElementStart?.distanceAlong ?? null,
          toMetres: le.toPoint?.locDistanceFromLinearElementStart?.distanceAlong ?? null,
          points,
        });
      }
    }
    records.push({
      situationId: situation.id,
      recordId: r.idG,
      managementType: r.roadOrCarriagewayOrLaneManagementType.value,
      validityStatus: r.validity.validityStatus,
      start: r.validity.validityTimeSpecification.overallStartTime,
      end: r.validity.validityTimeSpecification.overallEndTime,
      comments: (r.generalPublicComment ?? []).map((c) => c.comment),
      elements,
    });
  }
  return { records, skipped };
}
