import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closuresSnapshotSchema } from "../../../shared/api/closures.ts";
import { junctionsSnapshotSchema } from "../../../shared/api/junctions.ts";
import { handleRequest } from "../index.ts";
import { memoryStore } from "../memory-store.ts";
import { publishSnapshot } from "../publish.ts";
import { CONTROL_KEY, handleTraffic, type TrafficDeps, type TrafficEnv, type UsageNamespace } from "./traffic.ts";
import { DAILY_CAP, memoryLedgerStore, MONTHLY_CAP, MONTHLY_WARNING, reserve, type LedgerStore } from "./usage-ledger.ts";
import { runCommand, sqliteLedgerStore, TrafficUsage, type DurableObjectState } from "./usage-object.ts";

const KEY = "test-key-not-real-0000";
const NOW = Date.parse("2026-10-12T12:00:00Z");
const PERIOD = { start: "2026-10-01T00:00:00Z", end: "2026-11-01T00:00:00Z" };
const TILE = new Uint8Array([0x1a, 0x02, 0x08, 0x01]);
const tileUrl = (z = 10, x = 511, y = 340) => `https://example.test/api/traffic/flow/${z}/${x}/${y}`;

/** The counter as a Durable Object would run it: each command handled whole, after an async hop, like a request to the object. */
function counter(store: LedgerStore = memoryLedgerStore(), behaviour: "ok" | "throw" | "500" | "garbage" | "hang" = "ok") {
  let calls = 0;
  const namespace: UsageNamespace = {
    idFromName: (name) => name,
    get: () => ({
      fetch: async (request: Request) => {
        calls++;
        const body = (await request.json()) as Parameters<typeof runCommand>[1];
        await new Promise((r) => setTimeout(r, Math.random() * 3));
        if (behaviour === "throw") throw new Error("object unreachable");
        if (behaviour === "500") return new Response("x", { status: 500 });
        if (behaviour === "garbage") return Response.json({ ok: "maybe" });
        if (behaviour === "hang") return new Promise<Response>((_, reject) => request.signal.addEventListener("abort", () => reject(new Error("timeout"))));
        return Response.json(runCommand(store, body));
      },
    }),
  };
  return { namespace, store, calls: () => calls };
}

function upstream(respond: () => Response | Promise<Response> = () => new Response(TILE, { headers: { "Cache-Control": "max-age=900", "Content-Type": "application/vnd.mapbox-vector-tile" } })) {
  const requests: { url: string; init: RequestInit }[] = [];
  const deps: TrafficDeps = {
    now: () => NOW,
    fetch: async (url, init) => {
      requests.push({ url, init });
      return respond();
    },
  };
  return { deps, requests };
}

const ABSENT = Symbol("no control object");
type EnvOverrides = { [K in keyof TrafficEnv]?: TrafficEnv[K] | undefined };
function env(overrides: EnvOverrides = {}, control: unknown = { enabled: true, billingPeriod: PERIOD }) {
  const snapshots = memoryStore(control === ABSENT ? {} : { [CONTROL_KEY]: JSON.stringify(control) });
  const c = counter();
  return { env: { SNAPSHOTS: snapshots, TOMTOM_API_KEY: KEY, TRAFFIC_USAGE: c.namespace, ...overrides } as TrafficEnv, snapshots, counter: c };
}

let logs: string[];
beforeEach(() => {
  logs = [];
  const capture = (...args: unknown[]) => void logs.push(args.map(String).join(" "));
  vi.spyOn(console, "warn").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
});
afterEach(() => vi.restoreAllMocks());

const isUnavailable = async (r: Response) => r.status === 503 && ((await r.clone().json()) as { error?: string }).error === "traffic-unavailable";

describe("traffic gate: off unless fully configured (fails closed)", () => {
  it("missing key secret or counter binding: 503, and neither TomTom nor the counter is asked", async () => {
    for (const missing of [{ TOMTOM_API_KEY: undefined }, { TOMTOM_API_KEY: "" }, { TRAFFIC_USAGE: undefined }]) {
      const { env: e, counter: c } = env(missing);
      const u = upstream();
      expect(await isUnavailable(await handleTraffic(new Request(tileUrl()), e, u.deps))).toBe(true);
      expect(u.requests).toHaveLength(0);
      expect(c.calls()).toBe(0);
    }
  });

  it("no control object, an invalid one, switched off, or outside the billing period: 503 with no upstream request", async () => {
    for (const control of [ABSENT, { enabled: "yes" }, { enabled: false, billingPeriod: PERIOD }, { enabled: true, billingPeriod: { start: "2026-09-01T00:00:00Z", end: "2026-10-01T00:00:00Z" } }]) {
      const { env: e, counter: c } = env({}, control);
      const u = upstream();
      expect(await isUnavailable(await handleTraffic(new Request(tileUrl()), e, u.deps))).toBe(true);
      expect(u.requests).toHaveLength(0);
      expect(c.calls()).toBe(0);
    }
  });

  it("kill switch: rewriting the control object stops requests at once, with no deployment", async () => {
    const { env: e, snapshots } = env();
    const u = upstream();
    expect((await handleTraffic(new Request(tileUrl()), e, u.deps)).status).toBe(200);
    await snapshots.put(CONTROL_KEY, JSON.stringify({ enabled: false, billingPeriod: PERIOD }));
    expect(await isUnavailable(await handleTraffic(new Request(tileUrl()), e, u.deps))).toBe(true);
    expect(u.requests).toHaveLength(1);
  });

  it("the visitor's answer never says why, how much is used, or who the provider is", async () => {
    const { env: e } = env({}, { enabled: false, billingPeriod: PERIOD });
    const r = await handleTraffic(new Request(tileUrl()), e, upstream().deps);
    expect(await r.text()).toBe('{"error":"traffic-unavailable"}');
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it("only tiles in the served zoom range and grid are accepted, before any counting", async () => {
    const { env: e, counter: c } = env();
    for (const path of ["/api/traffic/flow/6/10/10", "/api/traffic/flow/14/10/10", "/api/traffic/flow/10/1024/0", "/api/traffic/flow/10/x/1", "/api/traffic/other"]) {
      expect((await handleTraffic(new Request(`https://example.test${path}`), e, upstream().deps)).status).toBe(404);
    }
    expect((await handleTraffic(new Request(tileUrl(), { method: "POST" }), e, upstream().deps)).status).toBe(405);
    expect(c.calls()).toBe(0);
  });
});

describe("traffic gate: serving a tile", () => {
  it("fetches TomTom's Orbis flow tile with the key in a header, never in the URL, and keeps it out of responses and logs", async () => {
    const { env: e } = env();
    const u = upstream();
    const r = await handleTraffic(new Request(tileUrl(10, 511, 340)), e, u.deps);
    expect(r.status).toBe(200);
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(TILE);
    expect(u.requests[0]!.url).toBe("https://api.tomtom.com/maps/orbis/traffic/flow/vector/tile/10/511/340?apiVersion=2");
    expect(u.requests[0]!.url).not.toContain(KEY);
    expect((u.requests[0]!.init.headers as Record<string, string>)["TomTom-Api-Key"]).toBe(KEY);
    expect(u.requests[0]!.init.cache).toBe("no-store");
    expect(JSON.stringify([...r.headers])).not.toContain(KEY);
    expect(logs.join("\n")).not.toContain(KEY);
  });

  it("lets only the browser keep a tile, for TomTom's max-age capped at 5 minutes; never a shared cache", async () => {
    const { env: e } = env();
    const long = await handleTraffic(new Request(tileUrl()), e, upstream().deps);
    expect(long.headers.get("Cache-Control")).toBe("private, max-age=300");
    const short = await handleTraffic(new Request(tileUrl()), e, upstream(() => new Response(TILE, { headers: { "Cache-Control": "max-age=60" } })).deps);
    expect(short.headers.get("Cache-Control")).toBe("private, max-age=60");
    const none = await handleTraffic(new Request(tileUrl()), e, upstream(() => new Response(TILE)).deps);
    expect(none.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("usage counter: caps, warning and concurrency", () => {
  it("counts every upstream request; at the monthly cap, refuses without asking TomTom", async () => {
    const { env: e, counter: c } = env();
    c.store.set(`month:${PERIOD.start}`, MONTHLY_CAP - 1);
    const u = upstream();
    expect((await handleTraffic(new Request(tileUrl()), e, u.deps)).status).toBe(200);
    expect(await isUnavailable(await handleTraffic(new Request(tileUrl()), e, u.deps))).toBe(true);
    expect(u.requests).toHaveLength(1);
    expect(c.store.get(`month:${PERIOD.start}`)).toBe(MONTHLY_CAP);
  });

  it("warns (in the Worker's logs only) exactly once, when the period reaches 120,000", async () => {
    const { env: e, counter: c } = env();
    c.store.set(`month:${PERIOD.start}`, MONTHLY_WARNING - 2);
    for (let i = 0; i < 4; i++) await handleTraffic(new Request(tileUrl()), e, upstream().deps);
    expect(logs.filter((l) => l.includes("warning level"))).toHaveLength(1);
  });

  it("daily cap (UTC day) protects the Worker's daily request allowance; the next day starts afresh", () => {
    const store = memoryLedgerStore();
    store.set("day:2026-10-12", DAILY_CAP);
    expect(reserve(store, PERIOD.start, "2026-10-12", NOW)).toEqual({ ok: false, reason: "daily-cap" });
    expect(reserve(store, PERIOD.start, "2026-10-13", NOW)).toMatchObject({ ok: true, daily: 1 });
  });

  it("many concurrent requests at the cap: exactly the remaining allowance reaches TomTom, never more", async () => {
    const { env: e, counter: c } = env();
    c.store.set(`month:${PERIOD.start}`, MONTHLY_CAP - 5);
    const u = upstream(async () => {
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      return new Response(TILE, { headers: { "Cache-Control": "max-age=60" } });
    });
    const results = await Promise.all(Array.from({ length: 60 }, (_, i) => handleTraffic(new Request(tileUrl(10, i, 340)), e, u.deps)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(5);
    expect(results.filter((r) => r.status === 503)).toHaveLength(55);
    expect(u.requests).toHaveLength(5);
    expect(c.store.get(`month:${PERIOD.start}`)).toBe(MONTHLY_CAP);
  });

  it("a fresh billing period counts from zero (the period comes from the owner's control object, never an assumed date)", () => {
    const store = memoryLedgerStore();
    store.set(`month:${PERIOD.start}`, MONTHLY_CAP);
    expect(reserve(store, "2026-11-01T00:00:00Z", "2026-11-01", NOW)).toMatchObject({ ok: true, monthly: 1 });
  });

  it("counter unreachable, erroring, answering nonsense or too slowly: fail closed, TomTom not asked", async () => {
    for (const behaviour of ["throw", "500", "garbage", "hang"] as const) {
      const c = counter(memoryLedgerStore(), behaviour);
      const { env: e } = env({ TRAFFIC_USAGE: c.namespace });
      const u = upstream();
      expect(await isUnavailable(await handleTraffic(new Request(tileUrl()), e, u.deps)), behaviour).toBe(true);
      expect(u.requests, behaviour).toHaveLength(0);
    }
  }, 10_000);
});

describe("provider failures: back off for everyone, no retry storm", () => {
  it("429: unavailable, then no TomTom request for at least 10 minutes (longer if Retry-After says so)", async () => {
    const { env: e, counter: c } = env();
    const u = upstream(() => new Response(null, { status: 429, headers: { "Retry-After": "1800" } }));
    expect(await isUnavailable(await handleTraffic(new Request(tileUrl()), e, u.deps))).toBe(true);
    expect(c.store.get("backoff-until")).toBe(NOW + 1_800_000);
    const ok = upstream();
    for (let i = 0; i < 20; i++) expect(await isUnavailable(await handleTraffic(new Request(tileUrl()), e, ok.deps))).toBe(true);
    expect(ok.requests).toHaveLength(0);
    // After the back-off, requests go through again.
    const later = { ...ok.deps, now: () => NOW + 1_800_001 };
    expect((await handleTraffic(new Request(tileUrl()), e, later)).status).toBe(200);
  });

  it("outage (5xx, unreachable): 2-minute back-off; key refused (403): 1 hour, logged without the key", async () => {
    for (const [respond, ms] of [
      [() => new Response(null, { status: 503 }), 120_000],
      [() => Promise.reject(new Error("network")), 120_000],
      [() => new Response(null, { status: 403 }), 3_600_000],
    ] as const) {
      const { env: e, counter: c } = env();
      expect(await isUnavailable(await handleTraffic(new Request(tileUrl()), e, upstream(respond).deps))).toBe(true);
      expect(c.store.get("backoff-until")).toBe(NOW + ms);
    }
    expect(logs.join("\n")).not.toContain(KEY);
  });
});

describe("status endpoint", () => {
  it("says only whether traffic is available, and never reserves or requests anything", async () => {
    const { env: e, counter: c } = env();
    const u = upstream();
    const ok = await handleTraffic(new Request("https://example.test/api/traffic/status"), e, u.deps);
    expect(await ok.json()).toEqual({ available: true });
    expect(ok.headers.get("Cache-Control")).toBe("no-store");
    c.store.set(`month:${PERIOD.start}`, MONTHLY_CAP);
    expect(await (await handleTraffic(new Request("https://example.test/api/traffic/status"), e, u.deps)).json()).toEqual({ available: false });
    expect(u.requests).toHaveLength(0);
    expect(c.store.get(`month:${PERIOD.start}`)).toBe(MONTHLY_CAP);
    const off = await handleTraffic(new Request("https://example.test/api/traffic/status"), env({ TOMTOM_API_KEY: undefined }).env, u.deps);
    expect(off.status).toBe(503);
  });
});

describe("the closures API is untouched by traffic", () => {
  it("/api/version and /api/closures work whatever traffic settings the environment has", async () => {
    const store = memoryStore();
    const closures = closuresSnapshotSchema.parse(JSON.parse(readFileSync("web/src/data/dev-snapshot.json", "utf8")));
    const junctions = junctionsSnapshotSchema.parse(JSON.parse(readFileSync("web/src/data/dev-junctions.json", "utf8")));
    await publishSnapshot(store, { closures, junctions }, new Date("2026-10-05T13:00:00Z"));
    for (const extra of [{}, { TOMTOM_API_KEY: KEY, TRAFFIC_USAGE: counter(memoryLedgerStore(), "throw").namespace }]) {
      for (const path of ["/api/version", "/api/closures", "/api/junctions"]) {
        expect((await handleRequest(new Request(`https://example.test${path}`), { SNAPSHOTS: store, ...extra })).status, path).toBe(200);
      }
    }
  });

  it("first release: the Worker doesn't route /api/traffic/* at all (404), even with a key and a counter in its environment", async () => {
    const configured = { SNAPSHOTS: memoryStore({ [CONTROL_KEY]: JSON.stringify({ enabled: true, billingPeriod: PERIOD }) }), TOMTOM_API_KEY: KEY, TRAFFIC_USAGE: counter().namespace };
    for (const url of [tileUrl(), "https://example.test/api/traffic/status"]) {
      const r = await handleRequest(new Request(url), configured);
      expect(r.status, url).toBe(404);
      expect(await r.json()).toMatchObject({ error: "not-found" });
    }
  });
});

describe("the Durable Object's storage (real SQLite statements, via node:sqlite)", () => {
  function sqliteState(): DurableObjectState {
    const db = new DatabaseSync(":memory:");
    return {
      storage: {
        // Like the real sql.exec: the statement runs at once; the cursor holds its rows.
        sql: {
          exec: (q, ...b) => {
            const rows = /^\s*select/i.test(q) ? (db.prepare(q).all(...(b as never[])) as Record<string, unknown>[]) : (db.prepare(q).run(...(b as never[])), []);
            return { toArray: () => rows };
          },
        },
        transactionSync: (fn) => {
          db.exec("BEGIN");
          try {
            const result = fn();
            db.exec("COMMIT");
            return result;
          } catch (e) {
            db.exec("ROLLBACK");
            throw e;
          }
        },
      },
    };
  }

  it("counts, caps and backs off with its SQL table, and rolls a failed transaction back", () => {
    const store = sqliteLedgerStore(sqliteState());
    expect(reserve(store, PERIOD.start, "2026-10-12", NOW)).toEqual({ ok: true, monthly: 1, daily: 1, warning: false });
    store.set(`month:${PERIOD.start}`, MONTHLY_CAP);
    expect(reserve(store, PERIOD.start, "2026-10-12", NOW)).toEqual({ ok: false, reason: "monthly-cap" });
    expect(() =>
      store.transaction(() => {
        store.set("x", 1);
        throw new Error("fail");
      }),
    ).toThrow();
    expect(store.get("x")).toBeUndefined();
  });

  it("answers commands over fetch and rejects malformed ones", async () => {
    const object = new TrafficUsage(sqliteState());
    const send = (body: unknown) => object.fetch(new Request("https://traffic-usage.internal/", { method: "POST", body: JSON.stringify(body) }));
    expect(await (await send({ op: "reserve", period: PERIOD.start, day: "2026-10-12", now: NOW })).json()).toMatchObject({ ok: true, monthly: 1 });
    expect((await send({ op: "reserve", period: PERIOD.start })).status).toBe(400);
    expect((await send("nonsense")).status).toBe(400);
  });
});

describe("boundaries and storage failures (fast checks; the real object is tested in usage-object.workerd.test.ts)", () => {
  it("caps refuse exactly at the limit, never one before", () => {
    const store = memoryLedgerStore();
    store.set(`month:${PERIOD.start}`, MONTHLY_CAP - 1);
    store.set("day:2026-10-12", 0);
    expect(reserve(store, PERIOD.start, "2026-10-12", NOW)).toMatchObject({ ok: true, monthly: MONTHLY_CAP });
    expect(reserve(store, PERIOD.start, "2026-10-12", NOW)).toEqual({ ok: false, reason: "monthly-cap" });
    const daily = memoryLedgerStore();
    daily.set("day:2026-10-12", DAILY_CAP - 1);
    expect(reserve(daily, PERIOD.start, "2026-10-12", NOW)).toMatchObject({ ok: true, daily: DAILY_CAP });
    expect(reserve(daily, PERIOD.start, "2026-10-12", NOW)).toEqual({ ok: false, reason: "daily-cap" });
    // A refusal writes nothing.
    expect(daily.get(`month:${PERIOD.start}`)).toBe(1);
  });

  it("the UTC day turns at 00:00:00Z, whatever the UK clock says (BST midnight is 23:00Z)", async () => {
    const { env: e, counter: c } = env();
    c.store.set("day:2026-10-12", DAILY_CAP);
    const at = (iso: string) => ({ ...upstream().deps, now: () => Date.parse(iso) });
    expect(await isUnavailable(await handleTraffic(new Request(tileUrl()), e, at("2026-10-12T23:00:00Z")))).toBe(true);
    expect(await isUnavailable(await handleTraffic(new Request(tileUrl()), e, at("2026-10-12T23:59:59.999Z")))).toBe(true);
    expect((await handleTraffic(new Request(tileUrl()), e, at("2026-10-13T00:00:00Z"))).status).toBe(200);
    expect(c.store.get("day:2026-10-13")).toBe(1);
  });

  it("the billing period includes its start and excludes its end", async () => {
    const { env: e } = env();
    const at = (ms: number) => ({ ...upstream().deps, now: () => ms });
    expect(await isUnavailable(await handleTraffic(new Request(tileUrl()), e, at(Date.parse(PERIOD.start) - 1)))).toBe(true);
    expect((await handleTraffic(new Request(tileUrl()), e, at(Date.parse(PERIOD.start)))).status).toBe(200);
    expect((await handleTraffic(new Request(tileUrl()), e, at(Date.parse(PERIOD.end) - 1))).status).toBe(200);
    expect(await isUnavailable(await handleTraffic(new Request(tileUrl()), e, at(Date.parse(PERIOD.end))))).toBe(true);
    // Billing periods given without a UTC offset, or reversed, are refused (never guessed).
    for (const billingPeriod of [{ start: "2026-10-01T00:00:00", end: "2026-11-01T00:00:00" }, { start: PERIOD.end, end: PERIOD.start }]) {
      expect(await isUnavailable(await handleTraffic(new Request(tileUrl()), env({}, { enabled: true, billingPeriod }).env, upstream().deps))).toBe(true);
    }
  });

  it("back-off ends exactly at its time and is never shortened", () => {
    const store = memoryLedgerStore();
    runCommand(store, { op: "backoff", until: NOW + 600_000 });
    runCommand(store, { op: "backoff", until: NOW + 60_000 });
    expect(reserve(store, PERIOD.start, "2026-10-12", NOW + 599_999)).toEqual({ ok: false, reason: "backoff" });
    expect(reserve(store, PERIOD.start, "2026-10-12", NOW + 600_000)).toMatchObject({ ok: true });
  });

  it("a storage error inside a reservation rolls it back and fails closed, with no upstream request", async () => {
    const store = memoryLedgerStore();
    let failOn = "";
    const faulty: LedgerStore = {
      ...store,
      set: (k, v) => {
        if (k.startsWith(failOn)) throw new Error("SQLITE_FULL");
        store.set(k, v);
      },
    };
    failOn = "day:"; // the monthly count is written first, then this fails
    expect(() => reserve(faulty, PERIOD.start, "2026-10-12", NOW)).toThrow("SQLITE_FULL");
    expect(store.get(`month:${PERIOD.start}`)).toBeUndefined();
    // The object's exception reaches the Worker as a failed call, as the local runtime shows (usage-object.workerd.test.ts).
    const { env: e } = env({ TRAFFIC_USAGE: counter(faulty).namespace });
    const u = upstream();
    expect(await isUnavailable(await handleTraffic(new Request(tileUrl()), e, u.deps))).toBe(true);
    expect(u.requests).toHaveLength(0);
    // The status check says no, too.
    expect(await (await handleTraffic(new Request("https://example.test/api/traffic/status"), env({ TRAFFIC_USAGE: counter(store, "throw").namespace }).env, u.deps)).json()).toEqual({ available: false });
  });

  it("missing binding: the status endpoint is 503 too, and nothing is counted", async () => {
    const { env: e, counter: c } = env({ TRAFFIC_USAGE: undefined });
    expect(await isUnavailable(await handleTraffic(new Request("https://example.test/api/traffic/status"), e, upstream().deps))).toBe(true);
    expect(c.calls()).toBe(0);
  });
});
