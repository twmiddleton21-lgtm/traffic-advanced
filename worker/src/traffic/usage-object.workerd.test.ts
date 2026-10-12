import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DAILY_CAP, MONTHLY_CAP, MONTHLY_WARNING } from "./usage-ledger.ts";

/**
 * The usage counter as Cloudflare would run it: the real TrafficUsage class (and its ledger) in the LOCAL Workers runtime (workerd,
 * started through the installed Wrangler), with real Durable Object SQLite storage, real `transactionSync`, and real concurrent
 * requests to one object. The Worker under test is workerd-harness.ts, with a config written to a temporary directory that binds
 * only local simulations (no Cloudflare account, no remote bindings, wrangler.jsonc untouched) and never calls TomTom.
 *
 * What this can't show: Cloudflare's production placement and its one-instance-worldwide guarantee (documented, not testable
 * locally), and production latency (the gate's 2-second counter timeout).
 */

process.env["WRANGLER_SEND_METRICS"] = "false";
const { unstable_startWorker } = await import("wrangler");

const PERIOD = { start: "2026-10-01T00:00:00Z", end: "2026-11-01T00:00:00Z" };
const NOON = Date.parse("2026-10-12T12:00:00Z");
const reserveCmd = (day = "2026-10-12", now = NOON, period = PERIOD.start) => ({ op: "reserve", period, day, now });

type Worker = Awaited<ReturnType<typeof unstable_startWorker>>;
// A short directory: on Windows the local runtime fails every Durable Object call ("internal error") once its SQLite file path
// passes 260 characters, which a deep directory such as the project's own would.
const dir = mkdtempSync(join(tmpdir(), "ta-traffic-usage-"));
const configPath = join(dir, "wrangler.jsonc");
writeFileSync(
  configPath,
  JSON.stringify({
    name: "traffic-usage-local-test",
    main: resolve("worker/src/traffic/workerd-harness.ts"),
    compatibility_date: "2026-10-01",
    // The binding and migration proposed for wrangler.jsonc, plus the test-only seedable class.
    durable_objects: {
      bindings: [
        { name: "TRAFFIC_USAGE", class_name: "TrafficUsage" },
        { name: "SEEDABLE_USAGE", class_name: "SeedableTrafficUsage" },
      ],
    },
    migrations: [{ tag: "v1", new_sqlite_classes: ["TrafficUsage", "SeedableTrafficUsage"] }],
    r2_buckets: [{ binding: "SNAPSHOTS", bucket_name: "local-test-only" }],
    // A fake key, as a plain local variable (in production it's a Wrangler secret). The harness never calls TomTom with it.
    vars: { TOMTOM_API_KEY: "test-key-not-real-0000" },
  }),
);
const start = () => unstable_startWorker({ config: configPath, dev: { watch: false, server: { port: 0 }, inspector: false, persist: join(dir, "state"), logLevel: "error" } });

let worker: Worker;
beforeAll(async () => {
  worker = await start();
  await worker.ready;
}, 60_000);
afterAll(async () => {
  await worker?.dispose();
});

const post = async <T = unknown>(path: string, body: unknown): Promise<T> => {
  const response = await worker.fetch(`http://harness${path}`, { method: "POST", body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`harness ${path} answered ${response.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text) as T;
};
type Answer = { ok?: boolean; monthly?: number; daily?: number; warning?: boolean; reason?: string; status?: number; thrown?: string; available?: boolean };
const burst = (name: string, n: number, command: unknown, seedable = false) => post<Answer[]>("/burst", { name, n, command, seedable });
let objects = 0;
/** A fresh object (its own name) for each test, so counts never leak between tests. */
const fresh = () => `test-${++objects}-${Date.now()}`;

describe("TrafficUsage in the local Workers runtime (real Durable Object, real SQLite storage)", () => {
  // Bursts are spread over several concurrent Worker requests, as many visitors would be. Kept to about 1,000 in flight: under
  // Vitest, the local runtime drops the connection on much larger bursts (5,060 at once passed outside Vitest; see
  // docs/LIVE-TRAFFIC-RESEARCH.md, "Local Durable Object validation").
  const spread = async (name: string, requests: number, perRequest: number, command: unknown, seedable = false) =>
    (await Promise.all(Array.from({ length: requests }, () => burst(name, perRequest, command, seedable)))).flat();

  it("1,000 reservations at once on one unseeded object: every count 1..1,000 handed out exactly once", async () => {
    const name = fresh();
    const answers = await spread(name, 10, 100, reserveCmd());
    expect(answers.every((a) => a.ok === true)).toBe(true);
    // Serialised: no count lost or doubled.
    expect(answers.map((a) => a.daily).sort((a, b) => a! - b!)).toEqual(Array.from({ length: 1000 }, (_, i) => i + 1));
    expect(answers.map((a) => a.monthly).sort((a, b) => a! - b!)).toEqual(Array.from({ length: 1000 }, (_, i) => i + 1));
  }, 60_000);

  it("daily cap: with 60 left, 1,000 at once get exactly 60; the next UTC day starts afresh", async () => {
    const name = fresh();
    await post("/seed", { name, seedable: true, key: "day:2026-10-12", value: DAILY_CAP - 60 });
    const answers = await spread(name, 10, 100, reserveCmd(), true);
    expect(answers.filter((a) => a.ok === true).map((a) => a.daily).sort((a, b) => a! - b!)).toEqual(Array.from({ length: 60 }, (_, i) => DAILY_CAP - 59 + i));
    expect(answers.filter((a) => a.reason === "daily-cap")).toHaveLength(940);
    // The billing period carries on counting.
    expect((await burst(name, 1, reserveCmd("2026-10-13", Date.parse("2026-10-13T00:00:00Z")), true))[0]).toEqual({ ok: true, monthly: 61, daily: 1, warning: false });
  }, 60_000);

  it("monthly cap: with 5 left, 60 at once get exactly 5; the warning fires exactly once", async () => {
    const name = fresh();
    await post("/seed", { name, seedable: true, key: `month:${PERIOD.start}`, value: MONTHLY_CAP - 5 });
    const answers = await spread(name, 6, 10, reserveCmd(), true);
    expect(answers.filter((a) => a.ok === true).map((a) => a.monthly).sort()).toEqual([149_996, 149_997, 149_998, 149_999, 150_000]);
    expect(answers.filter((a) => a.reason === "monthly-cap")).toHaveLength(55);

    const warned = fresh();
    await post("/seed", { name: warned, seedable: true, key: `month:${PERIOD.start}`, value: MONTHLY_WARNING - 3 });
    const w = await burst(warned, 10, reserveCmd(), true);
    expect(w.filter((a) => a.warning === true)).toEqual([{ ok: true, monthly: MONTHLY_WARNING, daily: 3, warning: true }]);
    // A new billing period counts from zero.
    expect((await burst(name, 1, reserveCmd("2026-11-01", Date.parse("2026-11-01T00:00:00Z"), "2026-11-01T00:00:00Z"), true))[0]).toMatchObject({ ok: true, monthly: 1 });
  }, 30_000);

  it("back-off: refuses until the moment it ends, and is never shortened", async () => {
    const name = fresh();
    expect(await burst(name, 1, { op: "backoff", until: NOON + 600_000 })).toEqual([{ ok: true }]);
    expect(await burst(name, 1, { op: "backoff", until: NOON + 60_000 })).toEqual([{ ok: true }]);
    expect((await burst(name, 1, reserveCmd("2026-10-12", NOON + 599_999)))[0]).toEqual({ ok: false, reason: "backoff" });
    expect((await burst(name, 1, { op: "status", period: PERIOD.start, day: "2026-10-12", now: NOON + 599_999 }))[0]).toEqual({ available: false });
    expect((await burst(name, 1, reserveCmd("2026-10-12", NOON + 600_000)))[0]).toMatchObject({ ok: true, monthly: 1 });
  });

  it("status reserves nothing; malformed commands are refused", async () => {
    const name = fresh();
    const status = await burst(name, 20, { op: "status", period: PERIOD.start, day: "2026-10-12", now: NOON });
    expect(status.every((a) => a.available === true)).toBe(true);
    expect((await burst(name, 1, reserveCmd()))[0]).toMatchObject({ monthly: 1, daily: 1 });
    for (const bad of [{ op: "reserve", period: PERIOD.start }, { op: "reserve", period: PERIOD.start, day: "12/10/2026", now: NOON }, { op: "delete" }, "nonsense"]) {
      expect(await burst(name, 1, bad)).toEqual([{ status: 400 }]);
    }
  });

  it("a storage error fails closed: the request errors, and the gate makes no upstream request", async () => {
    const name = fresh();
    await post("/break", { name, seedable: true });
    const [answer] = await burst(name, 1, reserveCmd(), true);
    expect(answer!.ok).toBeUndefined();
    expect(answer!.thrown ?? answer!.status).toBeDefined();
    await post("/control", { control: { enabled: true, billingPeriod: PERIOD } });
    expect(await post("/gate", { name, seedable: true, now: NOON, n: 3 })).toEqual({ statuses: [503, 503, 503], upstreamCalls: 0 });
  });

  it("counts survive the runtime restarting (durable storage, not memory)", async () => {
    const name = fresh();
    await burst(name, 7, reserveCmd());
    await worker.dispose();
    worker = await start();
    await worker.ready;
    expect((await burst(name, 1, reserveCmd()))[0]).toEqual({ ok: true, monthly: 8, daily: 8, warning: false });
  }, 60_000);
});

describe("the whole gate in the local Workers runtime (local R2 control object, real counter, fake TomTom)", () => {
  const gate = (name: string, now: number, extra: Record<string, unknown> = {}) =>
    post<{ statuses: number[]; upstreamCalls: number }>("/gate", { name, now, seedable: true, ...extra });

  it("60 tile requests at once with 5 left under the monthly cap: 5 served, 55 refused, 5 upstream requests", async () => {
    const name = fresh();
    await post("/control", { control: { enabled: true, billingPeriod: PERIOD } });
    await post("/seed", { name, seedable: true, key: `month:${PERIOD.start}`, value: MONTHLY_CAP - 5 });
    const { statuses, upstreamCalls } = await gate(name, NOON, { n: 60 });
    expect(statuses.filter((s) => s === 200)).toHaveLength(5);
    expect(statuses.filter((s) => s === 503)).toHaveLength(55);
    expect(upstreamCalls).toBe(5);
  }, 30_000);

  it("UTC day boundary: at the daily cap, refused until 00:00:00Z, then served", async () => {
    const name = fresh();
    await post("/control", { control: { enabled: true, billingPeriod: PERIOD } });
    await post("/seed", { name, seedable: true, key: "day:2026-10-12", value: DAILY_CAP });
    expect(await gate(name, Date.parse("2026-10-12T23:59:59.999Z"))).toEqual({ statuses: [503], upstreamCalls: 0 });
    expect(await gate(name, Date.parse("2026-10-13T00:00:00.000Z"))).toEqual({ statuses: [200], upstreamCalls: 1 });
  });

  it("billing period: served from its first millisecond, refused from its end; kill switch stops at once", async () => {
    const name = fresh();
    await post("/control", { control: { enabled: true, billingPeriod: PERIOD } });
    expect(await gate(name, Date.parse(PERIOD.start) - 1)).toEqual({ statuses: [503], upstreamCalls: 0 });
    expect(await gate(name, Date.parse(PERIOD.start))).toEqual({ statuses: [200], upstreamCalls: 1 });
    expect(await gate(name, Date.parse(PERIOD.end) - 1)).toEqual({ statuses: [200], upstreamCalls: 1 });
    expect(await gate(name, Date.parse(PERIOD.end))).toEqual({ statuses: [503], upstreamCalls: 0 });
    await post("/control", { control: { enabled: false, billingPeriod: PERIOD } });
    expect(await gate(name, NOON)).toEqual({ statuses: [503], upstreamCalls: 0 });
  });

  it("a 429 from upstream is recorded in the real object: everyone backs off for 10 minutes", async () => {
    const name = fresh();
    await post("/control", { control: { enabled: true, billingPeriod: PERIOD } });
    expect(await gate(name, NOON, { upstreamStatus: 429 })).toEqual({ statuses: [503], upstreamCalls: 1 });
    expect(await gate(name, NOON + 599_999, { n: 10 })).toEqual({ statuses: Array(10).fill(503), upstreamCalls: 0 });
    expect(await gate(name, NOON + 600_000)).toEqual({ statuses: [200], upstreamCalls: 1 });
  });
});
