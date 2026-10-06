import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { closuresSnapshotSchema } from "../../shared/api/closures.ts";
import { junctionsSnapshotSchema } from "../../shared/api/junctions.ts";
import { publishedVersionSchema } from "../../shared/api/version.ts";
import { handleRequest, type Env } from "./index.ts";
import { memoryStore } from "./memory-store.ts";
import { publishSnapshot } from "./publish.ts";
import { CURRENT_KEY, currentPointerSchema, type ReadableStore } from "./store.ts";

// Real data: the development snapshot and junctions exported from the Day-1 capture.
const closures = closuresSnapshotSchema.parse(JSON.parse(readFileSync("web/src/data/dev-snapshot.json", "utf8")));
const junctions = junctionsSnapshotSchema.parse(JSON.parse(readFileSync("web/src/data/dev-junctions.json", "utf8")));
const get = (path: string, env: Env, init?: RequestInit) => handleRequest(new Request(`https://example.test${path}`, init), env);

let store: ReturnType<typeof memoryStore>;
beforeEach(async () => {
  store = memoryStore();
  await publishSnapshot(store, { closures, junctions }, new Date("2026-10-05T13:00:00Z"));
});
const pointer = () => currentPointerSchema.parse(JSON.parse(store.objects.get(CURRENT_KEY)!));

/** A store that records which keys were read and refuses to hand over snapshot contents. */
function pointerOnlyStore(source: ReturnType<typeof memoryStore>) {
  const reads: string[] = [];
  const s: ReadableStore = {
    get: async (key) => {
      reads.push(key);
      if (key !== CURRENT_KEY) throw new Error(`snapshot object ${key} was read`);
      return source.get(key);
    },
  };
  return { store: s, reads };
}

describe("GET /api/version (the app's cheap freshness check)", () => {
  it("returns the published version, capture/publication times, count and hashes, in a few hundred bytes", async () => {
    const response = await get("/api/version", { SNAPSHOTS: store });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text.length).toBeLessThan(600);
    const p = pointer();
    expect(publishedVersionSchema.parse(JSON.parse(text))).toEqual({
      version: p.version,
      capturedAt: closures.provenance.capturedAt,
      publishedAt: p.publishedAt,
      closures: closures.closures.length,
      closuresSha256: p.closuresSha256,
      junctionsSha256: p.junctionsSha256,
    });
  });

  it("reads only the pointer: the snapshot objects are never opened, let alone parsed", async () => {
    const { store: guarded, reads } = pointerOnlyStore(store);
    expect((await get("/api/version", { SNAPSHOTS: guarded })).status).toBe(200);
    expect(reads).toEqual([CURRENT_KEY]);
  });

  it("answers a repeat check with 304 via its ETag", async () => {
    const etag = (await get("/api/version", { SNAPSHOTS: store })).headers.get("ETag")!;
    expect(etag).toBe(`"version-${pointer().version}"`);
    const again = await get("/api/version", { SNAPSHOTS: store }, { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect(again.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("changes version (and ETag) when a newer snapshot is published", async () => {
    const before = (await get("/api/version", { SNAPSHOTS: store })).headers.get("ETag")!;
    const newer = { ...closures, provenance: { ...closures.provenance, capturedAt: "2026-10-05T12:30:00.000Z" } };
    await publishSnapshot(store, { closures: newer, junctions }, new Date("2026-10-05T13:30:00Z"));
    const after = await get("/api/version", { SNAPSHOTS: store }, { headers: { "If-None-Match": before } });
    expect(after.status).toBe(200);
    expect(publishedVersionSchema.parse(await after.json()).capturedAt).toBe("2026-10-05T12:30:00.000Z");
  });

  it("is a safe 503 when nothing is published", async () => {
    expect((await get("/api/version", { SNAPSHOTS: memoryStore() })).status).toBe(503);
  });
});

describe("GET /api/closures and /api/junctions", () => {
  it("returns the published ClosuresSnapshot unchanged, labelled with its version", async () => {
    const response = await get("/api/closures", { SNAPSHOTS: store });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("X-Snapshot-Version")).toBe(pointer().version);
    expect(closuresSnapshotSchema.parse(await response.json())).toEqual(closures);
  });

  it("serves the stored bytes verbatim, without parsing them (validation happens at publication and in the browser)", async () => {
    const stored = store.objects.get(pointer().closuresKey)!;
    expect(await (await get("/api/closures", { SNAPSHOTS: store })).text()).toBe(stored);
  });

  it("streams the object body when the store provides one (R2), without decoding it to text", async () => {
    const bytes = new TextEncoder().encode(store.objects.get(pointer().closuresKey));
    let textCalled = false;
    const streaming: ReadableStore = {
      get: async (key) => {
        if (key === CURRENT_KEY) return store.get(key);
        return { text: () => ((textCalled = true), Promise.resolve("")), body: new Response(bytes).body! };
      },
    };
    const response = await get("/api/closures", { SNAPSHOTS: streaming });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(textCalled).toBe(false);
  });

  it("carries the capture time and provenance the UI needs to judge staleness, and says it isn't live", async () => {
    const body = closuresSnapshotSchema.parse(await (await get("/api/closures", { SNAPSHOTS: store })).json());
    expect(body.provenance.capturedAt).toBe(closures.provenance.capturedAt);
    expect(body.provenance.kind).toBe("development-snapshot");
  });

  it("preserves A/B/D exactly as the matcher produced them", async () => {
    const body = closuresSnapshotSchema.parse(await (await get("/api/closures", { SNAPSHOTS: store })).json());
    const find = (road: string, situationId: string) => body.closures.find((c) => c.road === road && c.situationId === situationId);
    expect(find("M53", "491297")?.classes).toEqual(["B"]);
    expect(find("M65", "520677")?.classes).toEqual(["B"]);
    expect(find("M54", "515870")?.classes).toEqual(["D"]);
  });

  it("answers a repeat request with 304 from the pointer alone, never opening the 2 MB object", async () => {
    const etag = (await get("/api/closures", { SNAPSHOTS: store })).headers.get("ETag")!;
    expect(etag).toBe(`"closures-${pointer().version}"`);
    const { store: guarded, reads } = pointerOnlyStore(store);
    const again = await get("/api/closures", { SNAPSHOTS: guarded }, { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
    expect(reads).toEqual([CURRENT_KEY]);
  });

  it("serves junctions from the same published version, with their own ETag", async () => {
    const response = await get("/api/junctions", { SNAPSHOTS: store });
    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBe(`"junctions-${pointer().version}"`);
    expect(response.headers.get("X-Snapshot-Version")).toBe(pointer().version);
    expect(junctionsSnapshotSchema.parse(await response.json())).toEqual(junctions);
  });

  it("sends security headers and no CORS grant (our origin only)", async () => {
    const response = await get("/api/closures", { SNAPSHOTS: store });
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Strict-Transport-Security")).toMatch(/max-age=/);
    expect(response.headers.get("Permissions-Policy")).toBeTruthy();
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("safe 503s: the published snapshot genuinely can't be served", () => {
  it("nothing published (never an empty list)", async () => {
    const response = await get("/api/closures", { SNAPSHOTS: memoryStore() });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "no-snapshot" });
  });

  it("the pointer is unreadable or fails its schema", async () => {
    store.objects.set(CURRENT_KEY, '{"version": 42');
    const unreadable = await get("/api/closures", { SNAPSHOTS: store });
    expect(unreadable.status).toBe(503);
    expect(unreadable.headers.get("Retry-After")).toBe("60");
    store.objects.set(CURRENT_KEY, JSON.stringify({ version: "../../etc", closuresKey: "x" }));
    const invalid = await get("/api/closures", { SNAPSHOTS: store });
    expect(invalid.status).toBe(503);
    expect(await invalid.json()).toEqual({ error: "snapshot-invalid", message: "The published snapshot is unavailable." });
  });

  it("the object the pointer names is missing", async () => {
    store.objects.delete(pointer().closuresKey);
    expect((await get("/api/closures", { SNAPSHOTS: store })).status).toBe(503);
  });

  it("storage fails, without leaking internals", async () => {
    const failing = await get("/api/closures", { SNAPSHOTS: { get: () => Promise.reject(new Error("R2 internal detail")) } });
    expect(failing.status).toBe(503);
    expect(await failing.text()).not.toContain("R2 internal detail");
  });
});

describe("routing and methods", () => {
  const assets: Env["ASSETS"] = { fetch: (r) => Promise.resolve(new Response(`asset:${new URL(r.url).pathname}`, { headers: { "Content-Type": "text/html" } })) };

  it("/ and app routes go to the static app; only /api/* runs Worker code", async () => {
    for (const path of ["/", "/closures/491297", "/?closure=491297"]) {
      expect(await (await get(path, { SNAPSHOTS: store, ASSETS: assets })).text()).toBe(`asset:${new URL(path, "https://x").pathname}`);
    }
    expect((await get("/api/closures", { SNAPSHOTS: store, ASSETS: assets })).headers.get("Content-Type")).toBe("application/json; charset=utf-8");
  });

  it("returns 404 for unknown API paths", async () => {
    for (const path of ["/api/nope", "/api/closures/extra", "/api/version/x"]) expect((await get(path, { SNAPSHOTS: store })).status, path).toBe(404);
  });

  it("HEAD answers like GET without a body", async () => {
    for (const path of ["/api/closures", "/api/version"]) {
      const head = await get(path, { SNAPSHOTS: store }, { method: "HEAD" });
      const full = await get(path, { SNAPSHOTS: store });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
      expect(head.headers.get("ETag")).toBe(full.headers.get("ETag"));
    }
  });

  it("only GET and HEAD are allowed", async () => {
    for (const path of ["/api/closures", "/api/version"]) {
      for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
        const response = await get(path, { SNAPSHOTS: store }, { method });
        expect(response.status, `${method} ${path}`).toBe(405);
        expect(response.headers.get("Allow")).toBe("GET, HEAD");
      }
    }
  });

  it("a stale snapshot stays servable, unchanged and never relabelled as live", async () => {
    const old = { ...closures, provenance: { ...closures.provenance, capturedAt: "2026-10-01T06:00:00.000Z" } };
    const staleStore = memoryStore();
    await publishSnapshot(staleStore, { closures: old, junctions }, new Date("2026-10-01T06:05:00Z"));
    const body = closuresSnapshotSchema.parse(await (await get("/api/closures", { SNAPSHOTS: staleStore })).json());
    expect(body.provenance.capturedAt).toBe("2026-10-01T06:00:00.000Z");
    expect(body.provenance.kind).toBe(closures.provenance.kind);
    const version = publishedVersionSchema.parse(await (await get("/api/version", { SNAPSHOTS: staleStore })).json());
    expect(version.capturedAt).toBe("2026-10-01T06:00:00.000Z");
  });
});
