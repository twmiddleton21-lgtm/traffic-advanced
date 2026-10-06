import { queryOptions, useQuery } from "@tanstack/react-query";
import { closuresSnapshotSchema, type ClosuresSnapshot } from "../../../shared/api/closures.ts";
import { browserSnapshotCache } from "../data/snapshotCache.ts";
import { createSnapshotSync, type SnapshotSync, type Synced } from "../data/snapshotSync.ts";
import { developmentFallback, developmentSnapshotSource, trafficService, type TrafficDataSource } from "../data/trafficService.ts";

/**
 * Closure data for the UI, cache-first (web/src/data/snapshotSync.ts): the device copy shows immediately, and each check (on load,
 * every minute, or on Refresh) asks only /api/version; the 2 MB snapshot is downloaded only when the published version changed.
 * A failed check or download keeps the data already shown, so a dead API can't turn the map into "no closures". In development
 * builds only, the bundled development snapshot is shown if there is neither API data nor a device copy.
 */

/** A version check is a few hundred bytes (and usually a 304), so checking every minute is cheap. */
export const REFRESH_INTERVAL_MS = 60_000;

export const closuresSync: SnapshotSync<ClosuresSnapshot> = createSnapshotSync({
  kind: "closures",
  schema: closuresSnapshotSchema,
  cache: browserSnapshotCache(),
  getVersion: (signal) => trafficService.getVersion(signal),
  download: (signal) => trafficService.getClosuresDocument(signal),
});

export function closuresQuery(sync: SnapshotSync<ClosuresSnapshot>) {
  return queryOptions({
    queryKey: ["closures", "live-api"],
    queryFn: ({ signal }) => sync.sync(signal),
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS / 2,
    retry: 1,
  });
}

export function fallbackClosuresQuery(fallback: TrafficDataSource) {
  return queryOptions({
    queryKey: ["closures", fallback.id],
    queryFn: () => fallback.getSnapshot(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

/** The parts of a query result the UI state depends on. */
export interface QueryView<T> {
  data: T | undefined;
  error: Error | null;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}

export interface ClosuresState {
  snapshot: ClosuresSnapshot | undefined;
  /** Where the shown data came from: confirmed by the API, the device copy (unconfirmed this visit), or the dev fallback. */
  via: "api" | "device-cache" | "development-fallback" | undefined;
  /** Nothing to show yet, still trying. */
  isLoading: boolean;
  /** A check or download is running while data is shown. */
  isRefreshing: boolean;
  /** When the shown data was last confirmed to be the published version (ms since epoch); null if not this visit. */
  lastSuccessAt: number | null;
  /** The latest check or download failed; the shown data is the copy already held (or the development fallback). */
  refreshError: Error | null;
  /** No data at all could be loaded. */
  loadError: Error | null;
  refresh: () => void;
}

export function deriveClosuresState(api: QueryView<Synced<ClosuresSnapshot>>, fallback: QueryView<ClosuresSnapshot> | null): ClosuresState {
  const refresh = () => void api.refetch();
  if (api.data) {
    const s = api.data;
    return { snapshot: s.data, via: s.via, isLoading: false, isRefreshing: api.isFetching, lastSuccessAt: s.confirmedAt, refreshError: s.refreshError ?? api.error, loadError: null, refresh };
  }
  if (fallback?.data) {
    return { snapshot: fallback.data, via: "development-fallback", isLoading: false, isRefreshing: api.isFetching, lastSuccessAt: null, refreshError: api.error, loadError: null, refresh };
  }
  // Without data, the API's failure is final only once the fallback (if any) has failed too.
  const failed = api.error !== null && (fallback === null || fallback.error !== null);
  return { snapshot: undefined, via: undefined, isLoading: !failed, isRefreshing: false, lastSuccessAt: null, refreshError: null, loadError: failed ? api.error : null, refresh };
}

export function useClosures(sync: SnapshotSync<ClosuresSnapshot> = closuresSync, fallback: TrafficDataSource | null = developmentFallback): ClosuresState {
  const api = useQuery(closuresQuery(sync));
  const backup = useQuery({ ...fallbackClosuresQuery(fallback ?? developmentSnapshotSource), enabled: fallback !== null && api.isError && api.data === undefined });
  return deriveClosuresState(api, fallback ? backup : null);
}
