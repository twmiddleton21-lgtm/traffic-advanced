import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { junctionsSnapshotSchema } from "../../../shared/api/junctions.ts";
import { memorySnapshotCache } from "../data/snapshotCache.ts";
import { createSnapshotSync } from "../data/snapshotSync.ts";
import { developmentSnapshotSource, TrafficApiError } from "../data/trafficService.ts";
import { junctionsQuery } from "./useJunctions.ts";

/** Partial failure: junction labels failing must not take the closures down; they're a separate, optional query. */
const failingSync = createSnapshotSync({
  kind: "junctions",
  schema: junctionsSnapshotSchema,
  cache: memorySnapshotCache(),
  getVersion: () => Promise.reject(new TrafficApiError("http", "The traffic service returned an error (503).")),
  download: () => Promise.reject(new Error("not reached")),
});

describe("junction labels", () => {
  it("fall back to the bundled export in development builds when the API can't supply them and nothing is stored", async () => {
    const client = new QueryClient();
    const data = await client.fetchQuery({ ...junctionsQuery(failingSync, developmentSnapshotSource), retry: false });
    expect(data.junctions.length).toBeGreaterThan(500);
  });

  it("fail on their own without a fallback (production), leaving the closure query untouched", async () => {
    const client = new QueryClient();
    await expect(client.fetchQuery({ ...junctionsQuery(failingSync, null), retry: false })).rejects.toBeInstanceOf(TrafficApiError);
    expect(client.getQueryData(["closures", "live-api"])).toBeUndefined();
    expect(junctionsQuery(failingSync, null).queryKey).not.toEqual(["closures", "live-api"]);
  });
});
