import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { routesPointsFileSchema, routesSectionsFileSchema, type RoutesDataLayer, type RoutesPointsFile, type RoutesSectionsFile } from "../../../shared/api/routes-layers.ts";
import { getRoutesLayerFile } from "../data/trafficService.ts";
import type { RoutesLayerEntry } from "./catalog.ts";

export type RoutesLayerData = { kind: "points"; file: RoutesPointsFile } | { kind: "sections"; file: RoutesSectionsFile };

export interface RoutesLayerStatus {
  layer: RoutesDataLayer;
  state: "off" | "loading" | "ready" | "error";
  data: RoutesLayerData | null;
  error: string | null;
  retry: () => void;
}

export const routesQueryKey = (layer: RoutesDataLayer, url: string | undefined) => ["routes-layer", layer, url] as const;

/** Switching a layer off forgets a failed load, so switching it on again starts a fresh load instead of showing the old error. */
export function forgetFailedRoutesLoad(client: QueryClient, layer: RoutesDataLayer, url: string | undefined): void {
  const key = routesQueryKey(layer, url);
  if (client.getQueryState(key)?.status === "error") client.removeQueries({ queryKey: key, exact: true });
}

/** Downloads and validates one layer's file (a static file from our own origin, through trafficService.ts with the same checks as the restriction files). */
export async function loadRoutesLayer(entry: RoutesLayerEntry, signal?: AbortSignal, fetchImpl?: typeof fetch): Promise<RoutesLayerData> {
  return entry.layer === "average-speed"
    ? { kind: "sections", file: await getRoutesLayerFile(entry.url, routesSectionsFileSchema, signal, fetchImpl) }
    : { kind: "points", file: await getRoutesLayerFile(entry.url, routesPointsFileSchema, signal, fetchImpl) };
}

/**
 * One Routes layer's data. Nothing is fetched while the layer is off; once loaded, the file is kept for the visit (it is versioned
 * and content-hashed, so it can't change under the same URL): switching the layer off and on, or opening and closing the Layers
 * panel, never downloads it again. A failure is shown and can be retried; it never affects the map, closures or other layers.
 */
export function useRoutesLayerData(entry: RoutesLayerEntry | undefined, layer: RoutesDataLayer, enabled: boolean): RoutesLayerStatus {
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled) forgetFailedRoutesLoad(client, layer, entry?.url);
  }, [client, enabled, layer, entry?.url]);
  const query = useQuery({
    queryKey: routesQueryKey(layer, entry?.url),
    enabled: enabled && entry !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
    queryFn: ({ signal }) => loadRoutesLayer(entry!, signal),
  });
  const retry = () => void query.refetch();
  if (!enabled || !entry) return { layer, state: "off", data: null, error: null, retry };
  if (query.data) return { layer, state: "ready", data: query.data, error: null, retry };
  if (query.error) return { layer, state: "error", data: null, error: query.error.message, retry };
  return { layer, state: "loading", data: null, error: null, retry };
}
