import * as z from "zod";

/**
 * The Routes map's optional layers (docs/ROUTES-MAP.md): OpenStreetMap cameras and road restrictions, as static, versioned files
 * built by scripts/routes-layers/build-routes-layers.ts from one dated Geofabrik extract. The app validates every file with these
 * schemas and never shows one that fails.
 *
 * These are NOT the Closures view's restriction files (shared/api/restrictions.ts), which they never change or share. Everything
 * here is community data: it holds only what OpenStreetMap contributors have mapped. A road with no record is NOT a road without a
 * camera or a restriction, conditions and exemptions are kept verbatim and never evaluated, and nothing here is a route check.
 */
export const ROUTES_LAYERS_SCHEMA_VERSION = 1;

/** The community-data caveat shown with these layers (wording approved with the Routes layers plan, 2026-10-12). */
export const ROUTES_OSM_CAVEAT = "Community data from OpenStreetMap: incomplete and may be wrong or out of date. No marker does not mean no camera or restriction.";

/** The layers, in the order the Layers panel lists them. Each has its own file and its own switch. */
export const ROUTES_DATA_LAYERS = ["speed-cameras", "average-speed", "red-light-cameras", "height", "weight", "width-length", "access"] as const;
export type RoutesDataLayer = (typeof ROUTES_DATA_LAYERS)[number];
export type RoutesPointLayer = Exclude<RoutesDataLayer, "average-speed">;

const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "ISO date-time");
const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const httpsUrl = z.url({ protocol: /^https$/ });

/** Where the data came from: one dated OpenStreetMap extract, under the ODbL. */
export const routesSourceSchema = z.object({
  name: z.literal("OpenStreetMap"),
  /** The attribution the ODbL and the OSMF attribution guidelines ask for, linked to `copyrightUrl`. */
  attribution: z.literal("© OpenStreetMap contributors"),
  copyrightUrl: z.literal("https://www.openstreetmap.org/copyright"),
  licence: z.object({ name: z.literal("Open Database License (ODbL) 1.0"), url: z.literal("https://opendatacommons.org/licenses/odbl/1-0/") }),
  /** The dated extract the build read: Geofabrik's URL, our SHA-256 of the file, and when we downloaded it. */
  extract: z.object({ url: httpsUrl, file: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/), fetchedAt: isoDateTime }),
  /** The moment the extract's OSM data runs to (its replication timestamp): the data's own date, shown as "OpenStreetMap data to …". */
  dataAsOf: isoDateTime,
  /** Known limitations of this layer's data, shown to users. */
  notes: z.array(z.string()),
});
export type RoutesSource = z.infer<typeof routesSourceSchema>;

/** The OSM element(s) a record was read from, so anyone can check it on openstreetmap.org. */
const osmRefSchema = z.object({ type: z.enum(["node", "way", "relation"]), id: z.number().int().positive(), version: z.number().int().nonnegative() });
export type OsmRef = z.infer<typeof osmRefSchema>;

/** A tag exactly as mapped. */
const recordedTagSchema = z.object({ key: z.string(), value: z.string() });

/** What each point record is. */
export const routesPointKindSchema = z.enum([
  // A fixed speed camera (highway=speed_camera, or the device of an enforcement relation for speed).
  "speed-camera",
  // A red-light camera: the device of an enforcement relation with enforcement=traffic_signals.
  "red-light-camera",
  // maxheight (signed) or maxheight:physical (clearance).
  "height",
  // maxweightrating:hgv / maxweight:hgv: the lorry-symbol (goods vehicle) limit.
  "weight-goods",
  // maxweight / maxweightrating: a limit for all vehicles.
  "weight-structural",
  // maxwidth (signed) or maxwidth:physical.
  "width",
  // maxlength.
  "length",
  // hgv=no / destination / delivery / discouraged, or the same under conditions (hgv:conditional).
  "hgv-access",
]);
export type RoutesPointKind = z.infer<typeof routesPointKindSchema>;

const LAYER_KINDS: Record<RoutesPointLayer, readonly RoutesPointKind[]> = {
  "speed-cameras": ["speed-camera"],
  "red-light-cameras": ["red-light-camera"],
  height: ["height"],
  weight: ["weight-goods", "weight-structural"],
  "width-length": ["width", "length"],
  access: ["hgv-access"],
};

/** The value a record shows: a measured limit, or a lorry access rule as mapped. Null when nothing readable is mapped (cameras). */
export const routesValueSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("measure"), amount: z.number().positive(), unit: z.enum(["m", "t", "mph"]) }),
    z.object({ type: z.literal("access"), access: z.enum(["no", "destination", "delivery", "discouraged"]) }),
  ])
  .nullable();
export type RoutesValue = z.infer<typeof routesValueSchema>;

export const routesPointSchema = z.object({
  /** Unique and stable within the file: "osm/<type>/<id>/<kind>". */
  id: z.string().min(3),
  kind: routesPointKindSchema,
  value: routesValueSchema,
  /** The tags the value was read from, exactly as mapped (e.g. maxheight = 14'6"). */
  recorded: z.array(recordedTagSchema),
  /** True when the value applies only under the conditions listed (it was mapped only in a :conditional tag). */
  conditionalOnly: z.boolean(),
  /** Conditions and exemptions as mapped, verbatim ("maxweightrating:hgv: none @ destination"). Never evaluated. */
  conditions: z.array(z.string()),
  /** Height and width: true when it is a measured clearance rather than a signed limit (maxheight:physical, maxheight:signed=no). */
  physical: z.boolean(),
  /**
   * Cameras only. `travelBearings`: compass bearings of the traffic the camera's enforcement relations check, from each relation's
   * own "from" and "to" points. `mapped`: the camera's direction tag verbatim, whose meaning varies between mappers. Null when
   * neither is mapped.
   */
  direction: z.object({ travelBearings: z.array(z.number().int().min(0).max(359)), mapped: z.string().nullable() }).nullable(),
  /** Cameras only: what the enforcement relations naming this device enforce. */
  partOf: z.array(z.enum(["maxspeed", "average_speed", "traffic_signals"])),
  position: lonLat,
  /** True when the record is mapped along a stretch of road and shown at its middle. */
  approximate: z.boolean(),
  extentMetres: z.number().nonnegative().nullable(),
  road: z.object({ name: z.string().nullable(), ref: z.string().nullable() }),
  /** The newest last-edit time among the elements read. */
  lastEdited: isoDateTime.nullable(),
  osm: z.array(osmRefSchema).min(1),
});
export type RoutesPoint = z.infer<typeof routesPointSchema>;

/** An average speed check section: the road between its mapped start and end, in the direction of travel it checks. */
export const routesSectionSchema = z.object({
  id: z.string().min(3),
  /** The road from the start point to the end point, in travel order. */
  line: z.array(lonLat).min(2),
  lengthMetres: z.number().positive(),
  /** The speed limit on the relation, when it is mapped readably in mph. */
  value: z.object({ type: z.literal("measure"), amount: z.number().positive(), unit: z.literal("mph") }).nullable(),
  recorded: z.array(recordedTagSchema),
  /** Bearing from the start point to the end point. */
  travelBearing: z.number().int().min(0).max(359),
  road: z.object({ name: z.string().nullable(), ref: z.string().nullable() }),
  lastEdited: isoDateTime.nullable(),
  osm: z.array(osmRefSchema).min(1),
});
export type RoutesSection = z.infer<typeof routesSectionSchema>;

const uniqueIds = (ids: string[], ctx: z.core.$RefinementCtx) => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) ctx.addIssue({ code: "custom", message: `duplicate id ${id}` });
    seen.add(id);
  }
};

export const routesPointsFileSchema = z
  .object({
    schemaVersion: z.literal(ROUTES_LAYERS_SCHEMA_VERSION),
    layer: z.enum(["speed-cameras", "red-light-cameras", "height", "weight", "width-length", "access"]),
    generatedAt: isoDateTime,
    source: routesSourceSchema,
    features: z.array(routesPointSchema),
  })
  .superRefine((file, ctx) => {
    uniqueIds(
      file.features.map((f) => f.id),
      ctx,
    );
    for (const f of file.features) {
      if (!LAYER_KINDS[file.layer].includes(f.kind)) ctx.addIssue({ code: "custom", message: `${f.id}: ${f.kind} in the ${file.layer} file` });
      const camera = f.kind === "speed-camera" || f.kind === "red-light-camera";
      // Every restriction has a value; a camera's speed limit may be unmapped.
      if (!camera && f.value === null) ctx.addIssue({ code: "custom", message: `${f.id}: no value` });
      if ((f.kind === "hgv-access") !== (f.value?.type === "access") && f.value !== null) ctx.addIssue({ code: "custom", message: `${f.id}: value type doesn't match ${f.kind}` });
      const unit = f.value?.type === "measure" ? f.value.unit : null;
      const expected = { "speed-camera": "mph", "red-light-camera": "mph", height: "m", width: "m", length: "m", "weight-goods": "t", "weight-structural": "t", "hgv-access": null }[f.kind];
      if (unit !== null && unit !== expected) ctx.addIssue({ code: "custom", message: `${f.id}: ${unit} for ${f.kind}` });
      if (!camera && f.direction !== null) ctx.addIssue({ code: "custom", message: `${f.id}: direction on a restriction` });
    }
  });
export type RoutesPointsFile = z.infer<typeof routesPointsFileSchema>;

export const routesSectionsFileSchema = z
  .object({
    schemaVersion: z.literal(ROUTES_LAYERS_SCHEMA_VERSION),
    layer: z.literal("average-speed"),
    generatedAt: isoDateTime,
    source: routesSourceSchema,
    sections: z.array(routesSectionSchema),
  })
  .superRefine((file, ctx) =>
    uniqueIds(
      file.sections.map((s) => s.id),
      ctx,
    ),
  );
export type RoutesSectionsFile = z.infer<typeof routesSectionsFileSchema>;

/**
 * The catalogue bundled with the app (a few KB): which layers have data, their files, record counts and the source. The app offers
 * a layer's switch only when the catalogue lists it, and downloads the layer's file only once it is switched on.
 */
export const routesManifestSchema = z.object({
  schemaVersion: z.literal(ROUTES_LAYERS_SCHEMA_VERSION),
  generatedAt: isoDateTime,
  dataAsOf: isoDateTime,
  layers: z.partialRecord(z.enum(ROUTES_DATA_LAYERS), z.object({ file: z.string().regex(/^[a-z-]+\.json$/), records: z.number().int().nonnegative(), notes: z.array(z.string()) })),
});
export type RoutesManifest = z.infer<typeof routesManifestSchema>;
