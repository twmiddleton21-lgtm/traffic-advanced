import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closuresSnapshotSchema, type ClosuresSnapshot } from "../../../shared/api/closures.ts";
import type { PublishedVersion } from "../../../shared/api/version.ts";
import { memorySnapshotCache, type SnapshotCache } from "../data/snapshotCache.ts";
import { createSnapshotSync, type Synced } from "../data/snapshotSync.ts";
import { TrafficApiError, type TrafficDataSource } from "../data/trafficService.ts";
import { applyFilters } from "../domain/filters.ts";
import { closuresQuery, deriveClosuresState, fallbackClosuresQuery, REFRESH_INTERVAL_MS, type QueryView } from "./useClosures.ts";

// TanStack Query never schedules refetchInterval when it thinks it runs on a server (no `window`). These tests stand in for the
// browser, so give it one before it loads (hoisted above the imports).
vi.hoisted(() => {
  (globalThis as { window?: unknown }).window ??= globalThis;
});

/**
 * Refresh behaviour through TanStack Query's own QueryClient/QueryObserver (what useQuery runs on), with the query options the app
 * uses and the cache-first sync. The API is scripted; snapshot data is real (later snapshots differ only in capture time).
 */
const base = closuresSnapshotSchema.parse(JSON.parse(readFileSync("web/src/data/dev-snapshot.json", "utf8")));
const capturedLater = (minutes: number): ClosuresSnapshot => ({
  ...base,
  provenance: { ...base.provenance, capturedAt: new Date(Date.parse(base.provenance.capturedAt) + minutes * 60_000).toISOString() },
});
const versionOf = (s: ClosuresSnapshot): PublishedVersion => ({
  version: `v-${s.provenance.capturedAt}`,
  capturedAt: s.provenance.capturedAt,
  publishedAt: s.provenance.capturedAt,
  closures: s.closures.length,
  closuresSha256: null,
  junctionsSha256: null,
});
const unavailable = () => new TrafficApiError("unavailable", "The traffic service can't be reached. Check your connection.");

/** An API that publishes `current` (null = unreachable). Counts version checks and downloads. */
function scriptedApi(cache: SnapshotCache = memorySnapshotCache()) {
  const state = { current: base as ClosuresSnapshot | null, versionChecks: 0, downloads: 0 };
  const sync = createSnapshotSync({
    kind: "closures",
    schema: closuresSnapshotSchema,
    cache,
    getVersion: () => {
      state.versionChecks++;
      return state.current ? Promise.resolve(versionOf(state.current)) : Promise.reject(unavailable());
    },
    download: () => {
      state.downloads++;
      const s = state.current;
      return s ? Promise.resolve({ data: s, version: versionOf(s).version, raw: JSON.stringify(s) }) : Promise.reject(unavailable());
    },
  });
  return { state, sync };
}

let client: QueryClient;
const observers: QueryObserver[] = [];
function observe<T>(options: object) {
  // retry: false keeps tests fast; the app's own retry (1) runs before a failure is reported either way.
  const observer = new QueryObserver(client, { ...options, retry: false } as never);
  observer.subscribe(() => undefined);
  observers.push(observer);
  return () => observer.getCurrentResult() as unknown as QueryView<T>;
}

beforeEach(() => {
  client = new QueryClient();
});
afterEach(() => {
  for (const o of observers.splice(0)) o.destroy();
  client.clear();
  vi.useRealTimers();
});

describe("closure refresh (cache-first)", () => {
  it("loading state, then the snapshot from a first visit's single download", async () => {
    const api = scriptedApi();
    const result = observe<Synced<ClosuresSnapshot>>(closuresQuery(api.sync));
    expect(deriveClosuresState(result(), null)).toMatchObject({ isLoading: true, snapshot: undefined });
    await vi.waitFor(() => expect(result().data).toBeDefined());
    const state = deriveClosuresState(result(), null);
    expect(state).toMatchObject({ via: "api", isLoading: false, refreshError: null, loadError: null });
    expect(state.snapshot).toEqual(base);
    expect(state.lastSuccessAt).toBeGreaterThan(0);
    expect(api.state).toMatchObject({ versionChecks: 1, downloads: 1 });
  });

  it("periodic refresh asks only for the version while nothing changes, and downloads once a new version is published", async () => {
    vi.useFakeTimers();
    const api = scriptedApi();
    const result = observe<Synced<ClosuresSnapshot>>(closuresQuery(api.sync));
    await vi.waitFor(() => expect(result().data).toBeDefined());
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(api.state).toMatchObject({ versionChecks: 3, downloads: 1 });
    api.state.current = capturedLater(5);
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(api.state).toMatchObject({ versionChecks: 4, downloads: 2 });
    expect(result().data?.data.provenance.capturedAt).toBe(capturedLater(5).provenance.capturedAt);
  });

  it("manual refresh runs a check immediately, shows refresh-in-progress, and advances the last-confirmed time", async () => {
    const api = scriptedApi();
    const result = observe<Synced<ClosuresSnapshot>>(closuresQuery(api.sync));
    await vi.waitFor(() => expect(result().data).toBeDefined());
    const first = deriveClosuresState(result(), null);
    await new Promise((r) => setTimeout(r, 5));
    first.refresh();
    expect(deriveClosuresState(result(), null).isRefreshing).toBe(true);
    await vi.waitFor(() => expect(result().isFetching).toBe(false));
    const after = deriveClosuresState(result(), null);
    expect(api.state).toMatchObject({ versionChecks: 2, downloads: 1 });
    expect(after.lastSuccessAt).toBeGreaterThan(first.lastSuccessAt!);
  });

  it("a failed refresh keeps the shown snapshot usable and says the refresh failed", async () => {
    const api = scriptedApi();
    const result = observe<Synced<ClosuresSnapshot>>(closuresQuery(api.sync));
    await vi.waitFor(() => expect(result().data).toBeDefined());
    const confirmed = deriveClosuresState(result(), null).lastSuccessAt;
    api.state.current = null;
    await result().refetch();
    const state = deriveClosuresState(result(), null);
    expect(state.snapshot).toEqual(base);
    expect(state.refreshError).toBeInstanceOf(TrafficApiError);
    expect(state.lastSuccessAt).toBe(confirmed);
    expect(applyFilters(state.snapshot!.closures, "all", "m53j4").map((c) => c.classes)).toEqual([["B"]]);
    // Recovers on the next successful check.
    api.state.current = capturedLater(5);
    state.refresh();
    await vi.waitFor(() => expect(deriveClosuresState(result(), null).refreshError).toBeNull());
    expect(deriveClosuresState(result(), null).snapshot?.provenance.capturedAt).toBe(capturedLater(5).provenance.capturedAt);
  });

  it("a later visit with the API down shows the device copy, labelled as such", async () => {
    const cache = memorySnapshotCache();
    const first = scriptedApi(cache);
    await first.sync.sync();
    const offline = scriptedApi(cache);
    offline.state.current = null;
    const result = observe<Synced<ClosuresSnapshot>>(closuresQuery(offline.sync));
    await vi.waitFor(() => expect(result().data).toBeDefined());
    const state = deriveClosuresState(result(), null);
    expect(state).toMatchObject({ via: "device-cache", lastSuccessAt: null, loadError: null });
    expect(state.snapshot).toEqual(base);
    expect(state.refreshError).toBeInstanceOf(TrafficApiError);
  });
});

describe("development fallback (no API data and no device copy)", () => {
  const devSource: TrafficDataSource = { id: "development-snapshot", getSnapshot: () => Promise.resolve(base), getJunctions: () => Promise.reject(new Error("not used")) };

  it("is shown, and labelled as the fallback, when the API has never answered and nothing is stored", async () => {
    const api = scriptedApi();
    api.state.current = null;
    const apiResult = observe<Synced<ClosuresSnapshot>>(closuresQuery(api.sync));
    await vi.waitFor(() => expect(apiResult().error).not.toBeNull());
    const fallbackResult = observe<ClosuresSnapshot>(fallbackClosuresQuery(devSource));
    await vi.waitFor(() => expect(fallbackResult().data).toBeDefined());
    const state = deriveClosuresState(apiResult(), fallbackResult());
    expect(state).toMatchObject({ via: "development-fallback", lastSuccessAt: null, loadError: null });
    expect(state.refreshError).toBeInstanceOf(TrafficApiError);
  });

  it("never replaces API data that is already shown", () => {
    const synced: Synced<ClosuresSnapshot> = { data: capturedLater(5), version: "v2", via: "api", confirmedAt: 1, refreshError: unavailable(), publishedAt: "2026-10-08T23:26:43.000Z" };
    const state = deriveClosuresState({ data: synced, error: null, isFetching: false, refetch: () => Promise.resolve() }, { data: base, error: null, isFetching: false, refetch: () => Promise.resolve() });
    expect(state.via).toBe("api");
    expect(state.snapshot).toBe(synced.data);
    // The traffic data's own version and publication time, for Settings (never the app's version).
    expect(state).toMatchObject({ version: "v2", publishedAt: "2026-10-08T23:26:43.000Z" });
  });

  it("without a fallback (production builds), nothing to show is a load error, not an empty map", () => {
    const state = deriveClosuresState({ data: undefined, error: unavailable(), isFetching: false, refetch: () => Promise.resolve() }, null);
    expect(state).toMatchObject({ snapshot: undefined, isLoading: false });
    expect(state.loadError).toBeInstanceOf(TrafficApiError);
  });

  it("stays loading while the fallback is still being tried", () => {
    const state = deriveClosuresState(
      { data: undefined, error: unavailable(), isFetching: false, refetch: () => Promise.resolve() },
      { data: undefined, error: null, isFetching: true, refetch: () => Promise.resolve() },
    );
    expect(state).toMatchObject({ isLoading: true, loadError: null });
  });
});

describe("query settings", () => {
  it("checks periodically and retries a failed check once before reporting it", () => {
    const options = closuresQuery(scriptedApi().sync);
    expect(options.refetchInterval).toBe(REFRESH_INTERVAL_MS);
    expect(options.retry).toBe(1);
    expect(options.queryKey).toEqual(["closures", "live-api"]);
  });
});
