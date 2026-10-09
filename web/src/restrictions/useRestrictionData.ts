import { useQuery } from "@tanstack/react-query";
import { restrictionPointsFileSchema, zonesFileSchema, type RestrictionPointsFile, type ZonesFile } from "../../../shared/api/restrictions.ts";
import { getRestrictionFile } from "../data/trafficService.ts";
import type { RestrictionLayer } from "../settings/preferences.ts";
import type { LayerEntry } from "./catalog.ts";

export type LayerData = { layer: "height" | "weight"; points: RestrictionPointsFile } | { layer: "lez" | "ulez"; zones: ZonesFile };

export interface LayerStatus {
  layer: RestrictionLayer;
  state: "off" | "loading" | "ready" | "error";
  data: LayerData | null;
  error: string | null;
  retry: () => void;
}

/**
 * One restriction layer's data. Nothing is fetched while the layer is off; once loaded, the file is kept for the visit (it is a
 * versioned static file, so it can't change under the same URL). A failure is shown and can be retried; it never affects closures.
 */
export function useRestrictionData(entry: LayerEntry | undefined, layer: RestrictionLayer, enabled: boolean): LayerStatus {
  const query = useQuery({
    queryKey: ["restrictions", layer, entry?.url],
    enabled: enabled && entry !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
    queryFn: async ({ signal }): Promise<LayerData> =>
      layer === "lez" || layer === "ulez"
        ? { layer, zones: await getRestrictionFile(entry!.url, zonesFileSchema, signal) }
        : { layer, points: await getRestrictionFile(entry!.url, restrictionPointsFileSchema, signal) },
  });
  const retry = () => void query.refetch();
  if (!enabled || !entry) return { layer, state: "off", data: null, error: null, retry };
  if (query.data) return { layer, state: "ready", data: query.data, error: null, retry };
  if (query.error) return { layer, state: "error", data: null, error: query.error.message, retry };
  return { layer, state: "loading", data: null, error: null, retry };
}
