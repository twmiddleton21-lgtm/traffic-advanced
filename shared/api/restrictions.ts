import * as z from "zod";

/**
 * The restriction data files the app loads when a restriction layer is switched on (docs/RESTRICTIONS.md). They are static,
 * versioned files built by scripts/restrictions/build-restrictions.ts from reviewed downloads; the app validates each file with
 * these schemas and never shows one that fails.
 *
 * The data is incomplete by nature: it holds only what each source records. A location with no record is NOT a location without a
 * restriction. Official and community records are kept apart (`source.kind`), and community records are always shown as unverified.
 */
export const RESTRICTIONS_SCHEMA_VERSION = 1;

/** The exact wording shown wherever restriction data is shown. */
export const RESTRICTIONS_DISCLAIMER =
  "Restrictions data is incomplete. Community-sourced records are unverified. No marker does not mean no restriction. Always follow road signs. This map is not a route check.";

const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "ISO date-time");
const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const httpsUrl = z.url({ protocol: /^https$/ });

export const restrictionSourceSchema = z.object({
  /** Stable source id, used by every record from it. */
  id: z.enum(["nh-s4-diversion-points", "nh-s5-vehicle-restrictions", "tfl-height-restrictions", "osm", "tfl-lez", "tfl-ulez"]),
  name: z.string(),
  /** Who publishes it, e.g. "National Highways", "Transport for London", "OpenStreetMap contributors". */
  authority: z.string(),
  /** Official: published by the responsible authority. Community: crowd-sourced, unverified. */
  kind: z.enum(["official", "community"]),
  licence: z.object({ name: z.string(), url: httpsUrl }),
  /** The attribution the licence requires, verbatim. */
  attribution: z.string(),
  /** Where the data came from (the dataset page or download). */
  url: httpsUrl,
  /** The source's own last-update date for the dataset, when it publishes one; null when it doesn't. */
  datasetDate: isoDateTime.nullable(),
  /** When the file used for this build was downloaded. */
  fetchedAt: isoDateTime,
  /** Records from this source in the file. */
  records: z.number().int().nonnegative(),
  /** Known limitations, shown to users. */
  notes: z.array(z.string()),
});
export type RestrictionSource = z.infer<typeof restrictionSourceSchema>;

/**
 * - height: a height limit or clearance.
 * - weight-structural: a weight limit for all vehicles (in OSM: maxweight, maxweightrating), such as a weak bridge.
 * - weight-goods: an environmental or access weight limit for goods vehicles (in OSM: maxweightrating:hgv, and the older
 *   maxweight:hgv), the UK lorry-symbol sign such as 7.5 t.
 * - weight-unrecorded-type: an official weight limit whose type the source doesn't record (National Highways diversion points).
 */
export const restrictionKindSchema = z.enum(["height", "weight-structural", "weight-goods", "weight-unrecorded-type"]);
export type RestrictionKind = z.infer<typeof restrictionKindSchema>;

export const restrictionPointSchema = z.object({
  /** Unique and stable within the file: "<source>/<the source's own record id>". */
  id: z.string().min(3),
  source: restrictionSourceSchema.shape.id,
  kind: restrictionKindSchema,
  /**
   * The recorded limit, in metres (height) or tonnes (weight). `min` equals `max` for an exact value; a source that records only a
   * band (TfL) gives its range, with `min` null for an open "up to" band.
   */
  limit: z.object({ min: z.number().positive().nullable(), max: z.number().positive() }).refine((l) => l.min === null || l.min <= l.max, "min ≤ max"),
  /** The value exactly as the source wrote it, e.g. "14'6\"", "Between 3.6 and 4.0", "7.5". */
  recorded: z.string(),
  /** Height only: true when the source records a clearance rather than a signed limit (OSM maxheight:physical, or maxheight:signed=no). */
  physical: z.boolean(),
  /** Conditions or exemptions the source records, verbatim (e.g. OSM "none @ destination"). Never interpreted. */
  conditions: z.array(z.string()),
  position: lonLat,
  /** True when the position is only approximate: the source maps the restriction along a stretch of road, not at a point. */
  approximate: z.boolean(),
  /** Length of road the record covers as mapped, when it is a stretch (metres). */
  extentMetres: z.number().nonnegative().nullable(),
  road: z.object({ name: z.string().nullable(), ref: z.string().nullable(), area: z.string().nullable() }),
  /** Official wording or comment from the source, verbatim; null when there is none. */
  sourceText: z.string().nullable(),
  /** Where the source recorded it, in our words (e.g. which official diversion route); null when there is nothing to add. */
  context: z.string().nullable(),
  /** The record's own last-edit time at the source, when it publishes one. */
  lastEdited: isoDateTime.nullable(),
  /** OSM only: the element and the tags the record was read from, so anyone can check it on openstreetmap.org. */
  osm: z.object({ type: z.enum(["node", "way"]), id: z.number().int().positive(), version: z.number().int().positive(), tags: z.record(z.string(), z.string()) }).nullable(),
});
export type RestrictionPoint = z.infer<typeof restrictionPointSchema>;

export const restrictionPointsFileSchema = z
  .object({
    schemaVersion: z.literal(RESTRICTIONS_SCHEMA_VERSION),
    layer: z.enum(["height", "weight"]),
    generatedAt: isoDateTime,
    sources: z.array(restrictionSourceSchema).min(1),
    features: z.array(restrictionPointSchema),
  })
  .superRefine((file, ctx) => {
    const ids = new Set<string>();
    const sources = new Set(file.sources.map((s) => s.id));
    for (const f of file.features) {
      if (ids.has(f.id)) ctx.addIssue({ code: "custom", message: `duplicate id ${f.id}` });
      ids.add(f.id);
      if (!sources.has(f.source)) ctx.addIssue({ code: "custom", message: `${f.id}: source ${f.source} not described` });
      const isHeight = f.kind === "height";
      if (isHeight !== (file.layer === "height")) ctx.addIssue({ code: "custom", message: `${f.id}: ${f.kind} in the ${file.layer} file` });
    }
    for (const s of file.sources) {
      const n = file.features.filter((f) => f.source === s.id).length;
      if (n !== s.records) ctx.addIssue({ code: "custom", message: `${s.id}: ${n} records, source says ${s.records}` });
    }
  });
export type RestrictionPointsFile = z.infer<typeof restrictionPointsFileSchema>;

const ring = z.array(lonLat).min(4);
export const zoneSchema = z.object({
  id: z.enum(["lez", "ulez"]),
  name: z.string(),
  source: restrictionSourceSchema.shape.id,
  /** The polygons of the zone (GeoJSON MultiPolygon coordinates, WGS84). */
  geometry: z.array(z.array(ring).min(1)).min(1),
  /** Who the zone applies to and when, in the authority's own words (verbatim), with where that wording came from. */
  rules: z.array(z.string()).min(1),
  rulesUrl: httpsUrl,
});
export type Zone = z.infer<typeof zoneSchema>;

export const zonesFileSchema = z
  .object({
    schemaVersion: z.literal(RESTRICTIONS_SCHEMA_VERSION),
    generatedAt: isoDateTime,
    sources: z.array(restrictionSourceSchema).min(1),
    zones: z.array(zoneSchema),
  })
  .superRefine((file, ctx) => {
    const sources = new Set(file.sources.map((s) => s.id));
    for (const zone of file.zones) if (!sources.has(zone.source)) ctx.addIssue({ code: "custom", message: `${zone.id}: source not described` });
  });
export type ZonesFile = z.infer<typeof zonesFileSchema>;

/**
 * The catalogue bundled with the app (a few KB): which restriction layers have data, their files, and every source's metadata
 * and attribution. The app shows a layer's switch only when the catalogue lists it, and loads the layer's file only once it is on.
 */
export const restrictionsManifestSchema = z.object({
  schemaVersion: z.literal(RESTRICTIONS_SCHEMA_VERSION),
  generatedAt: isoDateTime,
  layers: z.partialRecord(
    z.enum(["height", "weight", "lez", "ulez"]),
    z.object({ file: z.string().regex(/^[a-z]+\.json$/), records: z.number().int().nonnegative(), sources: z.array(restrictionSourceSchema).min(1) }),
  ),
});
export type RestrictionsManifest = z.infer<typeof restrictionsManifestSchema>;
