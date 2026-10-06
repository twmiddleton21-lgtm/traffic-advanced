import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { closuresSnapshotSchema } from "../../../shared/api/closures.ts";
import { handleRequest } from "../../../worker/src/index.ts";
import { memoryStore } from "../../../worker/src/memory-store.ts";
import { publishSnapshot } from "../../../worker/src/publish.ts";
import { freshnessLine } from "../domain/dataStatus.ts";
import { applyFilters } from "../domain/filters.ts";
import { selectedRouteLines } from "../map/layers.ts";
import { developmentFallback, developmentSnapshotSource, liveApiSource, trafficService, TrafficApiError } from "./trafficService.ts";

const devSnapshot = JSON.parse(readFileSync("web/src/data/dev-snapshot.json", "utf8")) as unknown;
const devJunctions = JSON.parse(readFileSync("web/src/data/dev-junctions.json", "utf8")) as unknown;

/** A fetch that answers every request with `response()`. */
const answering = (response: () => Response | Promise<Response>): typeof fetch => () => Promise.resolve(response());
const jsonResponse = (body: unknown, status = 200, version: string | null = "v-test") =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...(version ? { "X-Snapshot-Version": version } : {}) } });
const urlOf = (input: string | URL | Request): string => (input instanceof Request ? input.url : input.toString());
const api = (fetchImpl: typeof fetch, timeoutMs?: number) => liveApiSource("https://example.test", fetchImpl, timeoutMs);
const failure = async (promise: Promise<unknown>): Promise<TrafficApiError> => {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(TrafficApiError);
  return error as TrafficApiError;
};

describe("trafficService (Worker API)", () => {
  it("is the API source; the UI no longer reads bundled files by default", () => {
    expect(trafficService.id).toBe("live-api");
  });

  it("accepts a successful, contract-valid response", async () => {
    const snapshot = await api(answering(() => jsonResponse(devSnapshot))).getSnapshot();
    expect(snapshot).toEqual(closuresSnapshotSchema.parse(devSnapshot));
  });

  it("requests our own /api/closures and /api/junctions only", async () => {
    const urls: string[] = [];
    const source = api((input) => {
      urls.push(urlOf(input));
      return Promise.resolve(jsonResponse(urlOf(input).endsWith("/api/closures") ? devSnapshot : devJunctions));
    });
    await source.getSnapshot();
    await source.getJunctions();
    expect(urls).toEqual(["https://example.test/api/closures", "https://example.test/api/junctions"]);
  });

  it("rejects a response that fails the contract, rather than showing it", async () => {
    // A B closure without its matched route breaks a contract invariant.
    const broken = structuredClone(devSnapshot) as { closures: { classes: string[]; matchedRoute: unknown }[] };
    for (const c of broken.closures) if (c.classes.includes("B")) c.matchedRoute = null;
    expect((await failure(api(answering(() => jsonResponse(broken))).getSnapshot())).kind).toBe("invalid");
  });

  it("rejects an incomplete snapshot (closures missing) and an empty object", async () => {
    const incomplete = { ...(devSnapshot as Record<string, unknown>) };
    delete incomplete["closures"];
    expect((await failure(api(answering(() => jsonResponse(incomplete))).getSnapshot())).kind).toBe("invalid");
    expect((await failure(api(answering(() => jsonResponse({}))).getSnapshot())).kind).toBe("invalid");
  });

  it("accepts a stale but valid snapshot unchanged, and the UI marks it stale rather than dropping it", async () => {
    const snapshot = await api(answering(() => jsonResponse(devSnapshot))).getSnapshot();
    const capturedAt = Date.parse(snapshot.provenance.capturedAt);
    expect(snapshot.closures.length).toBeGreaterThan(0);
    expect(freshnessLine(snapshot.provenance.capturedAt, new Date(capturedAt + 2 * 3_600_000))).toMatchObject({ freshness: "stale" });
    expect(freshnessLine(snapshot.provenance.capturedAt, new Date(capturedAt + 5 * 60_000))).toMatchObject({ freshness: "fresh" });
  });

  it("rejects malformed JSON", async () => {
    const error = await failure(api(answering(() => new Response('{"provenance": {', { status: 200, headers: { "X-Snapshot-Version": "v1" } }))).getSnapshot());
    expect(error.kind).toBe("malformed");
  });

  it("rejects a snapshot response that doesn't say which published version it is", async () => {
    expect((await failure(api(answering(() => jsonResponse(devSnapshot, 200, null))).getSnapshot())).kind).toBe("invalid");
  });

  it("reads the published version from /api/version, and labels downloads with the version the Worker stamped on them", async () => {
    const version = { version: "20261005T120826Z-abc", capturedAt: "2026-10-05T12:08:26.087Z", publishedAt: "2026-10-05T13:00:00.000Z", closures: 16, closuresSha256: null, junctionsSha256: null };
    const source = api((input) => Promise.resolve(urlOf(input).endsWith("/api/version") ? jsonResponse(version, 200, null) : jsonResponse(devSnapshot, 200, "20261005T120826Z-abc")));
    expect(await source.getVersion()).toEqual(version);
    const doc = await source.getClosuresDocument();
    expect(doc.version).toBe("20261005T120826Z-abc");
    expect(JSON.parse(doc.raw)).toEqual(devSnapshot);
  });

  it("rejects an invalid version response", async () => {
    expect((await failure(api(answering(() => jsonResponse({ version: "../x" }, 200, null))).getVersion())).kind).toBe("invalid");
  });

  it("reports an HTTP error (e.g. 503 with nothing published) without using the body", async () => {
    const error = await failure(api(answering(() => jsonResponse({ error: "no-snapshot" }, 503))).getSnapshot());
    expect(error.kind).toBe("http");
    expect(error.message).toContain("503");
  });

  it("reports the API as unavailable when the network fails", async () => {
    const error = await failure(api(() => Promise.reject(new TypeError("Failed to fetch"))).getSnapshot());
    expect(error.kind).toBe("unavailable");
  });

  it("times out a request that never answers", async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason as Error)));
    const error = await failure(api(hanging, 20).getSnapshot());
    expect(error.kind).toBe("timeout");
  });

  it("passes a cancellation through as a cancellation, not an API failure", async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason as Error)));
    const controller = new AbortController();
    const pending = api(hanging).getSnapshot(controller.signal);
    controller.abort();
    const error = await pending.then(() => null, (e: unknown) => e);
    expect(error).not.toBeInstanceOf(TrafficApiError);
  });
});

describe("API → trafficService → UI data contract (end to end, real snapshot data)", () => {

  it("the UI receives exactly what the matcher published, and its views work on it unchanged", async () => {
    const store = memoryStore();
    await publishSnapshot(store, { closures: devSnapshot, junctions: devJunctions }, new Date("2026-10-05T13:00:00Z"));
    // The browser's fetch, answered by the Worker handler itself.
    const source = api((input, init) => handleRequest(new Request(urlOf(input), init), { SNAPSHOTS: store }));

    const snapshot = await source.getSnapshot();
    expect(snapshot).toEqual(closuresSnapshotSchema.parse(devSnapshot));
    expect((await source.getJunctions()).junctions.length).toBeGreaterThan(500);

    // UI views consume it without change: search, A/B/D filters and the directional diversion line.
    const m53 = applyFilters(snapshot.closures, "all", "m53j4");
    expect(m53.map((c) => c.classes)).toEqual([["B"]]);
    expect(applyFilters(snapshot.closures, "B", "").every((c) => c.classes.includes("B"))).toBe(true);
    expect(applyFilters(snapshot.closures, "D", "").map((c) => c.road)).toContain("M54");
    const route = selectedRouteLines(m53[0]!).features.find((f) => f.properties.kind === "route");
    expect(route?.properties.directional).toBe(true);
  });

  it("a 503 from the Worker (nothing published) reaches the UI as an error, not as an empty closure list", async () => {
    const source = api((input, init) => handleRequest(new Request(urlOf(input), init), { SNAPSHOTS: memoryStore() }));
    expect((await failure(source.getSnapshot())).kind).toBe("http");
  });
});

describe("development fallback", () => {
  it("exists in development builds and serves the bundled snapshot, clearly marked as not live", async () => {
    expect(developmentFallback).toBe(developmentSnapshotSource);
    const snapshot = await developmentSnapshotSource.getSnapshot();
    expect(snapshot.provenance.kind).toBe("development-snapshot");
    expect(snapshot.provenance.notes.join(" ")).toMatch(/not live/i);
  });

  it("contains the agreed review examples, with the frozen matcher's outcomes", async () => {
    const { closures } = await developmentSnapshotSource.getSnapshot();
    const find = (road: string, direction: string, situationId: string) =>
      closures.find((c) => c.road === road && c.direction === direction && c.situationId === situationId);
    expect(find("M53", "southbound", "491297")?.classes).toEqual(["B"]);
    expect(find("M65", "eastbound", "520677")?.classes).toEqual(["B"]);
    expect(find("M54", "eastbound", "515870")?.classes).toEqual(["D"]);
    expect(closures.some((c) => c.classes.includes("A"))).toBe(true);
  });

  it("marks every B as a candidate pending review, not a confirmed match", async () => {
    const { closures } = await developmentSnapshotSource.getSnapshot();
    for (const c of closures.filter((x) => x.classes.includes("B"))) expect(c.reviewNote).toMatch(/candidate pending owner review/i);
  });
});
