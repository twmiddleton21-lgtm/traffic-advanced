import { useQuery } from "@tanstack/react-query";
import { routesHighlightsFileSchema, type RoutesHighlightsFile } from "../../../shared/api/routes-highlights.ts";
import type { RoutesDataLayer } from "../../../shared/api/routes-layers.ts";
import { getRoutesLayerFile } from "../data/trafficService.ts";
import type { RoutesLayerEntry } from "./catalog.ts";

/**
 * A restriction layer's road highlighting (shared/api/routes-highlights.ts): fetched only while the layer is on, then kept for the
 * visit like the marker file. Optional: if it is missing or fails, the layer's markers still show and nothing else changes.
 */
export const routesHighlightsKey = (layer: RoutesDataLayer, url: string | null) => ["routes-roads", layer, url] as const;

export function useRoutesHighlights(entry: RoutesLayerEntry | undefined, enabled: boolean): RoutesHighlightsFile | null {
  const url = entry?.roadsUrl ?? null;
  const query = useQuery({
    queryKey: routesHighlightsKey(entry?.layer ?? "height", url),
    enabled: enabled && url !== null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
    queryFn: ({ signal }) => getRoutesLayerFile(url!, routesHighlightsFileSchema, signal),
  });
  return enabled ? (query.data ?? null) : null;
}
