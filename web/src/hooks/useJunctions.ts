import { queryOptions, useQuery } from "@tanstack/react-query";
import { junctionsSnapshotSchema, type JunctionsSnapshot } from "../../../shared/api/junctions.ts";
import { browserSnapshotCache } from "../data/snapshotCache.ts";
import { createSnapshotSync, type SnapshotSync } from "../data/snapshotSync.ts";
import { developmentFallback, trafficService, type TrafficDataSource } from "../data/trafficService.ts";

/**
 * Junction labels are map context: if they fail to load the map still works, just without junction numbers. Cache-first like the
 * closures: checked once per visit, downloaded only when the published version changed. In development builds only, the bundled
 * export is the fallback when there's neither API data nor a device copy.
 */
export const junctionsSync: SnapshotSync<JunctionsSnapshot> = createSnapshotSync({
  kind: "junctions",
  schema: junctionsSnapshotSchema,
  cache: browserSnapshotCache(),
  getVersion: (signal) => trafficService.getVersion(signal),
  download: (signal) => trafficService.getJunctionsDocument(signal),
});

export function junctionsQuery(sync: SnapshotSync<JunctionsSnapshot>, fallback: TrafficDataSource | null) {
  return queryOptions({
    queryKey: ["junctions", "live-api"],
    queryFn: async ({ signal }): Promise<JunctionsSnapshot> => {
      try {
        return (await sync.sync(signal)).data;
      } catch (e) {
        if (!fallback || signal.aborted) throw e;
        return fallback.getJunctions();
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
}

export function useJunctions() {
  return useQuery(junctionsQuery(junctionsSync, developmentFallback));
}
