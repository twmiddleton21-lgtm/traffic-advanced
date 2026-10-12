import type { Feature, FeatureCollection, MultiPolygon, Point } from "geojson";
import type { ExpressionSpecification, LayerSpecification } from "maplibre-gl";
import type { RestrictionPoint, RestrictionPointsFile, RestrictionSource, ZonesFile } from "../../../shared/api/restrictions.ts";
import { markerText } from "../restrictions/describe.ts";
import { groupPoints } from "../restrictions/group.ts";
import type { RestrictionLayer } from "../settings/preferences.ts";

/**
 * Restriction overlays as plain data (tested without a browser). Each layer has its own source and its own map layers, shown or
 * hidden with `visibility` only, so switching one never touches closures, diversions, junctions, the selection or another layer.
 *
 * Order (see overlayLayers in style.ts): the London zones go under everything we draw, so closures and routes stay on top; height
 * and weight markers go above road numbers (their labels must win a collision with a road shield) but under the selected closure's
 * diversion, its labels and its junctions.
 */
export const RESTRICTION_SOURCES: Record<RestrictionLayer, string> = { height: "restrictions-height", weight: "restrictions-weight", lez: "zone-lez", ulez: "zone-ulez" };

/**
 * Each restriction is its own marker from this zoom. Below it, nearby markers are grouped into a count (MapLibre's GeoJSON
 * clustering) so the map stays readable; a restriction with no near neighbour keeps its own marker at every zoom, so the sparse
 * National Highways records outside London can be found without already knowing where they are.
 */
export const RESTRICTION_MIN_ZOOM = 12;

/** Below this zoom no height or weight markers or groups are drawn at all (a whole-country view would be noise). */
export const RESTRICTION_OVERVIEW_ZOOM = 6;

/** Clustering for the height and weight sources: groups dissolve at RESTRICTION_MIN_ZOOM. */
export const POINT_SOURCE_CLUSTER = { cluster: true, clusterMaxZoom: RESTRICTION_MIN_ZOOM - 1, clusterRadius: 44 } as const;

/** Group colours: the plate border of each layer's markers (images.ts), so a group reads as "heights" or "weights". */
export const POINT_LAYER_COLOURS = { height: "#c8102e", weight: "#5b6770" } as const;

export const ZONE_COLOURS = { lez: "#1b7d3a", ulez: "#2453a6" } as const;

export interface RestrictionFeatureProps {
  /** The restriction's id: its representative record's id (group.ts). */
  id: string;
  /** How many source records this one marker stands for (the same restriction recorded on several NH diversion routes). */
  records: number;
  /** Icon: the kind's plate, dashed for community records. */
  icon: string;
  text: string;
  community: boolean;
  /** Lower draws (and wins label collisions) first: official before community, and lower limits first. */
  sort: number;
}

export function iconFor(kind: RestrictionPoint["kind"], community: boolean): string {
  return `ta-r-${kind}${community ? "-community" : ""}`;
}

/** One marker per restriction: records of the same restriction at the same place (group.ts) share one marker. */
export function restrictionFeatures(file: RestrictionPointsFile): FeatureCollection<Point, RestrictionFeatureProps> {
  const kindOf = new Map<string, RestrictionSource["kind"]>(file.sources.map((s) => [s.id, s.kind]));
  return {
    type: "FeatureCollection",
    features: groupPoints(file.features).map(
      ({ point: p, records }): Feature<Point, RestrictionFeatureProps> => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.position[0], p.position[1]] },
        properties: {
          id: p.id,
          records: records.length,
          icon: iconFor(p.kind, kindOf.get(p.source) === "community"),
          text: markerText(p),
          community: kindOf.get(p.source) === "community",
          sort: (kindOf.get(p.source) === "community" ? 1000 : 0) + p.limit.max,
        },
      }),
    ),
  };
}

export function zoneFeatures(file: ZonesFile): FeatureCollection<MultiPolygon, { id: string; name: string }> {
  return {
    type: "FeatureCollection",
    features: file.zones.map((z) => ({ type: "Feature", geometry: { type: "MultiPolygon", coordinates: z.geometry.map((poly) => poly.map((ring) => ring.map(([x, y]) => [x, y]))) }, properties: { id: z.id, name: z.name } })),
  };
}

export const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

const hidden = { visibility: "none" } as const;
const FONT_BOLD = ["Noto Sans Bold"];

/** Zone fills, boundaries and labels, below the closures. Same boundary for both zones (TfL), so the ULEZ line sits inside the LEZ line. */
export function zoneLayers(): LayerSpecification[] {
  const label = (zone: "lez" | "ulez", text: string, offset: number): LayerSpecification => ({
    id: `zone-${zone}-label`,
    type: "symbol",
    source: RESTRICTION_SOURCES[zone],
    minzoom: 9,
    layout: {
      ...hidden,
      "symbol-placement": "line",
      "symbol-spacing": 500,
      "text-field": text,
      "text-font": FONT_BOLD,
      "text-size": 12,
      "text-offset": [0, offset],
      "text-keep-upright": true,
    },
    paint: { "text-color": ZONE_COLOURS[zone], "text-halo-color": "#ffffff", "text-halo-width": 2 },
  });
  return [
    { id: "zone-lez-fill", type: "fill", source: RESTRICTION_SOURCES.lez, layout: hidden, paint: { "fill-color": ZONE_COLOURS.lez, "fill-opacity": 0.06 } },
    { id: "zone-ulez-fill", type: "fill", source: RESTRICTION_SOURCES.ulez, layout: hidden, paint: { "fill-color": ZONE_COLOURS.ulez, "fill-opacity": 0.06 } },
    {
      id: "zone-lez-line",
      type: "line",
      source: RESTRICTION_SOURCES.lez,
      layout: { ...hidden, "line-join": "round" },
      paint: { "line-color": ZONE_COLOURS.lez, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2, 14, 4], "line-dasharray": [3, 1.5] },
    },
    {
      id: "zone-ulez-line",
      type: "line",
      source: RESTRICTION_SOURCES.ulez,
      layout: { ...hidden, "line-join": "round" },
      // Offset to one side of the LEZ line, so both lines stay visible on the shared boundary.
      paint: { "line-color": ZONE_COLOURS.ulez, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.5, 14, 3], "line-offset": ["interpolate", ["linear"], ["zoom"], 8, 2.5, 14, 4.5] },
    },
    label("lez", "LEZ boundary", -1),
    label("ulez", "ULEZ boundary", 1),
  ];
}

const isGroup: ExpressionSpecification = ["has", "point_count"];

/**
 * Height or weight markers: groups of nearby restrictions (a ring in the layer's colour with the count) below RESTRICTION_MIN_ZOOM,
 * and a sign-style plate with the recorded value for every restriction not in a group, plus the selection ring.
 */
export function pointLayers(layer: "height" | "weight"): LayerSpecification[] {
  const source = RESTRICTION_SOURCES[layer];
  const size: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 6, 11, 12, 12, 16, 13];
  return [
    {
      id: `restriction-${layer}-group`,
      type: "circle",
      source,
      minzoom: RESTRICTION_OVERVIEW_ZOOM,
      filter: isGroup,
      layout: hidden,
      paint: {
        "circle-color": "#ffffff",
        "circle-radius": ["step", ["get", "point_count"], 13, 10, 16, 100, 20],
        "circle-stroke-color": POINT_LAYER_COLOURS[layer],
        "circle-stroke-width": 3,
      },
    },
    {
      id: `restriction-${layer}-group-count`,
      type: "symbol",
      source,
      minzoom: RESTRICTION_OVERVIEW_ZOOM,
      filter: isGroup,
      layout: { ...hidden, "text-field": ["get", "point_count_abbreviated"], "text-font": FONT_BOLD, "text-size": 12, "text-allow-overlap": true },
      paint: { "text-color": "#14191e" },
    },
    {
      id: `restriction-${layer}`,
      type: "symbol",
      source,
      minzoom: RESTRICTION_OVERVIEW_ZOOM,
      filter: ["!", isGroup],
      layout: {
        ...hidden,
        "symbol-sort-key": ["get", "sort"],
        "icon-image": ["get", "icon"],
        "icon-text-fit": "both",
        "icon-text-fit-padding": [3, 5, 3, 5],
        "text-field": ["get", "text"],
        "text-font": FONT_BOLD,
        "text-size": size,
        "text-padding": 2,
      },
      paint: { "text-color": "#14191e" },
    },
    {
      id: `restriction-${layer}-selected`,
      type: "circle",
      source,
      filter: ["==", ["get", "id"], "__none__"],
      layout: hidden,
      paint: { "circle-radius": 22, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#1a73e8", "circle-stroke-width": 4 },
    },
  ];
}

/** Every map layer belonging to a restriction layer, for switching it on and off. */
export function layerIds(layer: RestrictionLayer): string[] {
  if (layer === "lez" || layer === "ulez") return [`zone-${layer}-fill`, `zone-${layer}-line`, `zone-${layer}-label`];
  return [`restriction-${layer}-group`, `restriction-${layer}-group-count`, `restriction-${layer}`, `restriction-${layer}-selected`];
}

/** The map credit for a restriction source, shown in MapLibre's attribution while its layer is on. */
export function sourceAttribution(sources: RestrictionSource[]): string {
  return sources.map((s) => `${s.authority}: ${s.attribution} (${s.licence.name})`).join(" · ");
}
