import { RESTRICTION_MIN_ZOOM, RESTRICTION_OVERVIEW_ZOOM } from "../map/restrictionLayers.ts";
import type { RestrictionLayer } from "../settings/preferences.ts";
import type { LayerStatus } from "./useRestrictionData.ts";

type PointLayer = "height" | "weight";

/**
 * What the map's restriction controls show, derived only from the layers that are switched on now. Nothing here remembers a layer
 * after it is switched off, so a height message can't outlive the Height switch (a weight-only map once still said "Zoom in to see
 * height and weight restrictions").
 */
export interface MapControlsState {
  /** Switched on, in display order; empty means the controls aren't shown. */
  active: RestrictionLayer[];
  loading: RestrictionLayer[];
  failed: LayerStatus[];
  /** Loaded point layers whose markers are grouped at this zoom. */
  grouped: PointLayer[];
  /** Loaded point layers that draw nothing at this zoom (whole-country view). */
  tooFar: PointLayer[];
  /** A loaded layer has community (unverified) records, which have dashed markers. */
  community: boolean;
}

const ORDER: RestrictionLayer[] = ["height", "weight", "lez", "ulez"];

export function mapControlsState(statuses: LayerStatus[], zoom: number | null): MapControlsState {
  const on = ORDER.flatMap((l) => statuses.filter((s) => s.layer === l && s.state !== "off"));
  const readyPoints = on.filter((s): s is LayerStatus & { layer: PointLayer } => (s.layer === "height" || s.layer === "weight") && s.state === "ready" && s.data !== null).map((s) => s.layer);
  return {
    active: on.map((s) => s.layer),
    loading: on.filter((s) => s.state === "loading").map((s) => s.layer),
    failed: on.filter((s) => s.state === "error"),
    grouped: zoom !== null && zoom >= RESTRICTION_OVERVIEW_ZOOM && zoom < RESTRICTION_MIN_ZOOM ? readyPoints : [],
    tooFar: zoom !== null && zoom < RESTRICTION_OVERVIEW_ZOOM ? readyPoints : [],
    community: on.some((s) => s.state === "ready" && s.data !== null && "points" in s.data && s.data.points.sources.some((src) => src.kind === "community")),
  };
}

const NAMES: Record<PointLayer, string> = { height: "height", weight: "weight" };
const names = (layers: PointLayer[]) => layers.map((l) => NAMES[l]).join(" and ");

/** The zoom message for the loaded height or weight layers only, or null when every marker is drawn individually. */
export function zoomMessage(state: MapControlsState): string | null {
  if (state.tooFar.length > 0) return `Zoom in to see ${names(state.tooFar)} restrictions.`;
  if (state.grouped.length > 0) return `Circles group nearby ${names(state.grouped)} restrictions. Zoom in, or select a circle, to see each value.`;
  return null;
}
