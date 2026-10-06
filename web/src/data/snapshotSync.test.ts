import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { closuresSnapshotSchema, type ClosuresSnapshot } from "../../../shared/api/closures.ts";
import { handleRequest } from "../../../worker/src/index.ts";
import { memoryStore } from "../../../worker/src/memory-store.ts";
import { publishSnapshot } from "../../../worker/src/publish.ts";
import { memorySnapshotCache } from "./snapshotCache.ts";
import { createSnapshotSync } from "./snapshotSync.ts";
import { liveApiSource, TrafficApiError, type LiveTrafficApi } from "./trafficService.ts";

/**
 * The cache-first behaviour end to end: the real Worker handler serving a real published snapshot, the real trafficService client,
 * and a device cache shared between "visits" (each visit is a fresh sync, as after a page reload). Every request is counted.
 */
const base = closuresSnapshotSchema.parse(JSON.parse(readFileSync("web/src/data/dev-snapshot.json", "utf8")));
const junctions: unknown = JSON.parse(readFileSync("web/src/data/dev-junctions.json", "utf8"));
const capturedLater = (minutes: number): ClosuresSnapshot => ({
  ...base,
  provenance: { ...base.provenance, capturedAt: new Date(Date.parse(base.provenance.capturedAt) + minutes * 60_000).toISOString() },
});

let store: ReturnType<typeof memoryStore>;
let requests: string[];
let failing: RegExp | null;
let api: LiveTrafficApi;
const device = { cache: memorySnapshotCache() };

beforeEach(async () => {
  store = memoryStore();
  requests = [];
  failing = null;
  device.cache = memorySnapshotCache();
  await publishSnapshot(store, { closures: base, junctions }, new Date("2026-10-05T13:00:00Z"));
  api = liveApiSource("https://example.test", (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const path = new URL(url).pathname;
    requests.push(path);
    if (failing?.test(path)) return Promise.reject(new TypeError("Failed to fetch"));
    return handleRequest(new Request(url, init), { SNAPSHOTS: store });
  });
});

/** A fresh visit (page load): new in-memory state, same device cache. */
const visit = () =>
  createSnapshotSync({
    kind: "closures",
    schema: closuresSnapshotSchema,
    cache: device.cache,
    getVersion: (s) => api.getVersion(s),
    download: (s) => api.getClosuresDocument(s),
  });
const publish = (snapshot: ClosuresSnapshot, at: string) => publishSnapshot(store, { closures: snapshot, junctions }, new Date(at));

describe("cache-first snapshot sync", () => {
  it("1. first visit with no device copy: checks the version, downloads once, validates and stores it", async () => {
    const result = await visit().sync();
    expect(requests).toEqual(["/api/version", "/api/closures"]);
    expect(result).toMatchObject({ via: "api", refreshError: null });
    expect(result.data).toEqual(base);
    expect(device.cache.docs.get("closures")?.version).toBe(result.version);
  });

  it("2. repeat visit with the same version: only the version check, no snapshot download", async () => {
    await visit().sync();
    requests = [];
    const result = await visit().sync();
    expect(requests).toEqual(["/api/version"]);
    expect(result.data).toEqual(base);
    expect(result.via).toBe("api");
  });

  it("periodic checks within a visit are version checks only", async () => {
    const sync = visit();
    await sync.sync();
    requests = [];
    await sync.sync();
    await sync.sync();
    expect(requests).toEqual(["/api/version", "/api/version"]);
  });

  it("3. after a newer snapshot is published: downloads it, stores it and shows it", async () => {
    await visit().sync();
    await publish(capturedLater(30), "2026-10-05T13:30:00Z");
    requests = [];
    const result = await visit().sync();
    expect(requests).toEqual(["/api/version", "/api/closures"]);
    expect(result.data.provenance.capturedAt).toBe(capturedLater(30).provenance.capturedAt);
    expect(JSON.parse(device.cache.docs.get("closures")!.raw)).toEqual(capturedLater(30));
  });

  it("4. the device copy stays usable when the version check fails (offline): shown, labelled as the device copy", async () => {
    await visit().sync();
    failing = /\/api\/version/;
    const result = await visit().sync();
    expect(result.data).toEqual(base);
    expect(result.via).toBe("device-cache");
    expect(result.confirmedAt).toBeNull();
    expect(result.refreshError).toBeInstanceOf(TrafficApiError);
  });

  it("5. a failed update keeps the last known-good copy, on screen and on the device", async () => {
    await visit().sync();
    const stored = device.cache.docs.get("closures");
    await publish(capturedLater(30), "2026-10-05T13:30:00Z");
    failing = /\/api\/closures/;
    const result = await visit().sync();
    expect(result.data).toEqual(base);
    expect(result.refreshError).toBeInstanceOf(TrafficApiError);
    expect(device.cache.docs.get("closures")).toBe(stored);
  });

  it("5b. a corrupt download is rejected and the copy held is kept", async () => {
    await visit().sync();
    const stored = device.cache.docs.get("closures");
    await publish(capturedLater(30), "2026-10-05T13:30:00Z");
    // Corrupt the published object in place (the Worker streams it unparsed; the browser must catch it).
    const pointer = JSON.parse(store.objects.get("current.json")!) as { closuresKey: string };
    store.objects.set(pointer.closuresKey, '{"provenance": "broken"}');
    const result = await visit().sync();
    expect(result.data).toEqual(base);
    expect((result.refreshError as TrafficApiError).kind).toBe("invalid");
    expect(device.cache.docs.get("closures")).toBe(stored);
  });

  it("6. an older snapshot can never overwrite a newer device copy", async () => {
    const newer = capturedLater(60);
    device.cache.docs.set("closures", { version: "newer-on-device", raw: JSON.stringify(newer) });
    // The server offers the older Day-1 snapshot (as if it were rolled back).
    const result = await visit().sync();
    expect(result.data).toEqual(newer);
    expect(result.refreshError?.message).toMatch(/older data than this device already has/);
    expect(device.cache.docs.get("closures")?.version).toBe("newer-on-device");
  });

  it("a damaged device copy is ignored, never shown, and replaced by a valid download", async () => {
    device.cache.docs.set("closures", { version: "x", raw: "{ not json" });
    const result = await visit().sync();
    expect(result.data).toEqual(base);
    expect(requests).toEqual(["/api/version", "/api/closures"]);
  });

  it("with no device copy and no API there is nothing to show: the error is thrown for the UI's load-error state", async () => {
    failing = /\/api\//;
    await expect(visit().sync()).rejects.toBeInstanceOf(TrafficApiError);
  });
});
