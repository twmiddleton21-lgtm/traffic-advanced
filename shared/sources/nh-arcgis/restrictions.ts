import * as z from "zod";
import type { RestrictionPoint } from "../../api/restrictions.ts";

/**
 * National Highways restriction records (official, OGL), read from an existing open-data capture (scripts/capture/capture-open.ts):
 * - S4 DiversionPoint: height and weight restrictions NH records along its emergency diversion routes.
 * - S5 Vehicle_Restriction: height restrictions on NH's own network (18 records when checked).
 * Limited coverage by design: only what NH records for its network and diversion routes. Not used by the matcher.
 */
const arcgisPoint = z.object({ x: z.number(), y: z.number() });

const diversionPointSchema = z.object({
  attributes: z.object({
    GUID: z.string().uuid(),
    DiversionRouteID: z.string().min(1),
    RestrictionType: z.string().nullable(),
    MeasureValue: z.number().nullable(),
    MeasureUnit: z.string().nullable(),
  }),
  geometry: arcgisPoint,
});

const vehicleRestrictionSchema = z.object({
  attributes: z.object({
    vehicleid: z.string().uuid(),
    restriction: z.string(),
    description: z.string(),
    measure: z.number().nullable(),
    unitofmeasure: z.string().nullable(),
    last_edited_date: z.number().nullable(),
  }),
  geometry: arcgisPoint,
});

type Skipped = { record: string; reason: string };
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const inEngland = (x: number, y: number) => x > -6.5 && x < 2 && y > 49.8 && y < 56;

const base = {
  physical: false,
  conditions: [],
  approximate: false,
  extentMetres: null,
  road: { name: null, ref: null, area: null },
  lastEdited: null,
  osm: null,
} as const;

/**
 * S4 diversion points. Heights in metres and weights in tonnes are used. Heights recorded in "feet" are skipped: their values are
 * decimals (e.g. 14.3), which could mean 14.3 ft or 14 ft 3 in, so they can't be read reliably. Width and length are not shown
 * (no layer for them yet). NH doesn't record whether a weight limit is structural or for goods vehicles, so neither is assumed.
 */
export function readDiversionPoints(features: unknown[]): { points: RestrictionPoint[]; skipped: Skipped[] } {
  const points: RestrictionPoint[] = [];
  const skipped: Skipped[] = [];
  for (const raw of features) {
    const parsed = diversionPointSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.push({ record: "?", reason: "invalid record" });
      continue;
    }
    const { attributes: a, geometry: g } = parsed.data;
    const value = a.MeasureValue;
    const unit = a.MeasureUnit?.toLowerCase() ?? null;
    const type = a.RestrictionType?.toLowerCase() ?? null;
    const reject = (reason: string) => skipped.push({ record: a.GUID, reason });
    if (!inEngland(g.x, g.y)) reject("position outside England");
    else if (value === null || !(value > 0)) reject("no value");
    else if (type === "height" && unit === "feet") reject("height in decimal feet is ambiguous");
    else if (type === "height" && unit === "metres") {
      if (value < 1.5 || value > 7) reject(`implausible height ${value} m`);
      else points.push(point(a.GUID, "height", value, `${value} m`, g, a.DiversionRouteID));
    } else if (type === "weight" && unit === "tonnes") {
      if (value > 100) reject(`implausible weight ${value} t`);
      else points.push(point(a.GUID, "weight-unrecorded-type", value, `${value} tonnes`, g, a.DiversionRouteID));
    } else reject(`not shown: ${type ?? "no type"} in ${unit ?? "no unit"}`);
  }
  points.sort((x, y) => (x.id < y.id ? -1 : 1));
  return { points, skipped };
}

function point(guid: string, kind: RestrictionPoint["kind"], value: number, recorded: string, g: { x: number; y: number }, route: string): RestrictionPoint {
  return {
    ...base,
    conditions: [],
    id: `nh-s4-diversion-points/${guid}`,
    source: "nh-s4-diversion-points",
    kind,
    limit: { min: value, max: value },
    recorded,
    position: [round6(g.x), round6(g.y)],
    road: { name: null, ref: null, area: null },
    sourceText: null,
    context: `Recorded on National Highways emergency diversion route ${route}`,
  };
}

/** S5 vehicle restrictions: maximum-height records ("MH") are used, with NH's own description verbatim. */
export function readVehicleRestrictions(features: unknown[]): { points: RestrictionPoint[]; skipped: Skipped[] } {
  const points: RestrictionPoint[] = [];
  const skipped: Skipped[] = [];
  for (const raw of features) {
    const parsed = vehicleRestrictionSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.push({ record: "?", reason: "invalid record" });
      continue;
    }
    const { attributes: a, geometry: g } = parsed.data;
    if (a.restriction !== "MH") skipped.push({ record: a.vehicleid, reason: `not shown: restriction type ${a.restriction}` });
    else if (a.measure === null || a.unitofmeasure !== "M" || a.measure < 1.5 || a.measure > 7) skipped.push({ record: a.vehicleid, reason: "no usable height in metres" });
    else if (!inEngland(g.x, g.y)) skipped.push({ record: a.vehicleid, reason: "position outside England" });
    else
      points.push({
        ...base,
        conditions: [],
        id: `nh-s5-vehicle-restrictions/${a.vehicleid}`,
        source: "nh-s5-vehicle-restrictions",
        kind: "height",
        limit: { min: a.measure, max: a.measure },
        recorded: `${a.measure} m`,
        position: [round6(g.x), round6(g.y)],
        road: { name: null, ref: null, area: null },
        sourceText: a.description,
        context: "On the National Highways network",
        lastEdited: a.last_edited_date === null ? null : new Date(a.last_edited_date).toISOString(),
      });
  }
  points.sort((x, y) => (x.id < y.id ? -1 : 1));
  return { points, skipped };
}
