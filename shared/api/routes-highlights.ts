import * as z from "zod";
import { routesSourceSchema } from "./routes-layers.ts";

/**
 * Road highlighting for the Routes map's restriction layers (docs/ROUTES-MAP.md): the roads a restriction record was mapped on, so
 * the map can show where a limit applies along the road, as HGV navigation apps do, while that layer is switched on.
 *
 * Built by scripts/routes-layers/build-highlights.ts from the SAME records as the layer's marker file and the same extract: one line
 * per record that OpenStreetMap maps on a road (a way). Records mapped on a single point (a bridge or a barrier node) have no road to
 * highlight and keep their marker only. Nothing is inferred: a road is coloured only when a record of that layer was read from it,
 * with the record's own value and conditions. It is never a route check, and an unhighlighted road is not a clear road.
 */
export const ROUTES_HIGHLIGHTS_SCHEMA_VERSION = 1;

export const ROUTES_HIGHLIGHT_LAYERS = ["height", "weight", "width-length", "access"] as const;
export type RoutesHighlightLayer = (typeof ROUTES_HIGHLIGHT_LAYERS)[number];

/**
 * How a road is drawn:
 * - weight-strong: a weight limit of 7.5 t or less (the common lorry limit), drawn in a strong warning colour;
 * - weight-soft: a weight limit above 7.5 t, drawn in a softer warning colour;
 * - height, width-length, access: one style each.
 */
export const routesHighlightCategorySchema = z.enum(["weight-strong", "weight-soft", "height", "width-length", "access"]);
export type RoutesHighlightCategory = z.infer<typeof routesHighlightCategorySchema>;

const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const routesHighlightRoadSchema = z.object({
  /** The id of the record in the layer's marker file this road belongs to (e.g. "osm/way/123/weight-goods"). */
  id: z.string().min(3),
  category: routesHighlightCategorySchema,
  /** True when the record has conditions or exemptions, or applies only under conditions: drawn fainter, the marker carries "*". */
  conditional: z.boolean(),
  /** The road as mapped, in order. */
  line: z.array(lonLat).min(2),
});
export type RoutesHighlightRoad = z.infer<typeof routesHighlightRoadSchema>;

const CATEGORIES: Record<RoutesHighlightLayer, readonly RoutesHighlightCategory[]> = {
  weight: ["weight-strong", "weight-soft"],
  height: ["height"],
  "width-length": ["width-length"],
  access: ["access"],
};

export const routesHighlightsFileSchema = z
  .object({
    schemaVersion: z.literal(ROUTES_HIGHLIGHTS_SCHEMA_VERSION),
    layer: z.enum(ROUTES_HIGHLIGHT_LAYERS),
    generatedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "ISO date-time"),
    source: routesSourceSchema,
    roads: z.array(routesHighlightRoadSchema),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const r of file.roads) {
      if (seen.has(r.id)) ctx.addIssue({ code: "custom", message: `duplicate road ${r.id}` });
      seen.add(r.id);
      if (!CATEGORIES[file.layer].includes(r.category)) ctx.addIssue({ code: "custom", message: `${r.id}: ${r.category} in the ${file.layer} file` });
    }
  });
export type RoutesHighlightsFile = z.infer<typeof routesHighlightsFileSchema>;

/** The highlight file for a layer sits beside its marker file: "<layer>-roads.json". */
export const highlightFileName = (layer: RoutesHighlightLayer) => `${layer}-roads.json`;

/** Weight limits at or below this are the strong warning colour (7.5 t is the common lorry limit). */
export const STRONG_WEIGHT_LIMIT_TONNES = 7.5;
