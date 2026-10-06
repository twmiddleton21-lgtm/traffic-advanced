import * as z from "zod";

/**
 * Minimal shapes of ArcGIS REST FeatureServer responses (f=json), validated at the boundary.
 * Attributes stay `unknown` here; each source adapter validates its own attribute schema.
 */

export const arcgisErrorSchema = z.object({
  error: z.object({
    code: z.number(),
    message: z.string(),
    details: z.array(z.string()).optional(),
  }),
});

export const arcgisGeometrySchema = z.union([
  z.object({ x: z.number(), y: z.number() }),
  z.object({ paths: z.array(z.array(z.array(z.number()))) }),
  z.object({ rings: z.array(z.array(z.array(z.number()))) }),
]);

export const arcgisFeatureSchema = z.object({
  attributes: z.record(z.string(), z.unknown()),
  geometry: arcgisGeometrySchema.nullish(),
});

export const arcgisQueryPageSchema = z.object({
  features: z.array(arcgisFeatureSchema),
  exceededTransferLimit: z.boolean().optional(),
});

export const arcgisCountSchema = z.object({ count: z.number().int().nonnegative() });

export const arcgisLayerInfoSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  geometryType: z.string().nullish(),
  objectIdField: z.string().optional(),
  maxRecordCount: z.number().optional(),
  editingInfo: z
    .looseObject({
      lastEditDate: z.number().optional(),
      dataLastEditDate: z.number().optional(),
    })
    .optional(),
  fields: z.array(z.looseObject({ name: z.string(), type: z.string() })).optional(),
});

export type ArcgisFeature = z.infer<typeof arcgisFeatureSchema>;
export type ArcgisLayerInfo = z.infer<typeof arcgisLayerInfoSchema>;
