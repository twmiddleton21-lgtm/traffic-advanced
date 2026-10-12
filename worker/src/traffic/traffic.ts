import * as z from "zod";
import { parseTrafficTilePath, TRAFFIC_STATUS_PATH, type TrafficStatus } from "../../../shared/api/traffic.ts";
import { readJson, type ReadableStore } from "../store.ts";
import type { Reservation } from "./usage-ledger.ts";
import type { UsageCommand } from "./usage-object.ts";

/**
 * DEFERRED: not routed in the first release (worker/src/index.ts doesn't import this module; deploy-config.test.ts enforces it).
 *
 * /api/traffic/*: TomTom traffic flow tiles for the Routes map, through a gate that fails closed.
 *
 * A tile is fetched from TomTom only when ALL of these hold, checked in this order:
 *   1. the TomTom key secret (TOMTOM_API_KEY) and the usage counter binding (TRAFFIC_USAGE) exist;
 *   2. the control object `traffic/control.json` in the existing R2 bucket says `enabled: true` and gives the current TomTom
 *      billing period, and now is inside it. This is the kill switch: the owner rewrites the object, no deployment needed. Missing,
 *      unreadable or invalid means off;
 *   3. the usage counter (a Durable Object, usage-object.ts) reserves the request under the monthly cap, the daily cap and any
 *      back-off. If the counter can't be reached, or doesn't answer in time, the answer is no.
 * Otherwise the answer is a 503 that says only that traffic is unavailable: no reason, usage or provider detail.
 *
 * Upstream: TomTom Orbis vector flow tiles, the key in the `TomTom-Api-Key` header (never in a URL, so never in logs). Responses
 * aren't stored or shared: the browser may keep each tile for TomTom's own max-age (capped), marked `private` so no shared cache
 * holds it (TomTom terms 11.4). 429 → everyone backs off for at least 10 minutes; key rejected → 1 hour; outage → 2 minutes.
 */
export interface UsageNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
export interface TrafficEnv {
  SNAPSHOTS: ReadableStore;
  /** Wrangler secret. Never logged, never sent to the browser. */
  TOMTOM_API_KEY?: string;
  TRAFFIC_USAGE?: UsageNamespace;
}
export interface TrafficDeps {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  now: () => number;
}

export const CONTROL_KEY = "traffic/control.json";
const controlSchema = z.object({
  enabled: z.boolean(),
  /** The TomTom billing period now running, copied from the TomTom account. When it ends, traffic stops until it's updated. */
  billingPeriod: z.object({ start: z.iso.datetime(), end: z.iso.datetime() }),
});

const UPSTREAM = "https://api.tomtom.com/maps/orbis/traffic/flow/vector/tile";
const COUNTER_TIMEOUT_MS = 2_000;
const UPSTREAM_TIMEOUT_MS = 8_000;
/** The longest a browser may keep a tile, whatever TomTom allows, so traffic shown is never older than this plus refresh time. */
const MAX_TILE_AGE_S = 300;
const BACKOFF_MS = { rateLimited: 10 * 60_000, keyRejected: 60 * 60_000, outage: 2 * 60_000 } as const;

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
} as const;

const unavailable = (why: string) => {
  // The reason goes to the Worker's logs only; visitors get the same answer whatever it is.
  console.warn(`traffic unavailable: ${why}`);
  return new Response(JSON.stringify({ error: "traffic-unavailable" }), {
    status: 503,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "300", ...SECURITY_HEADERS },
  });
};
const notFound = () => new Response(JSON.stringify({ error: "not-found" }), { status: 404, headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS } });

/** The billing period and UTC day for the counter, or a reason traffic is off. */
async function readControl(env: TrafficEnv, nowMs: number): Promise<{ period: string; day: string } | string> {
  let raw: unknown;
  try {
    raw = await readJson(env.SNAPSHOTS, CONTROL_KEY);
  } catch {
    return "control object unreadable";
  }
  if (raw === null) return "no control object (off by default)";
  const control = controlSchema.safeParse(raw);
  if (!control.success) return "control object invalid";
  if (!control.data.enabled) return "switched off (kill switch)";
  const { start, end } = control.data.billingPeriod;
  if (!(Date.parse(start) <= nowMs && nowMs < Date.parse(end))) return "outside the configured billing period";
  return { period: start, day: new Date(nowMs).toISOString().slice(0, 10) };
}

async function askCounter(env: TrafficEnv, command: UsageCommand): Promise<unknown> {
  const stub = env.TRAFFIC_USAGE!.get(env.TRAFFIC_USAGE!.idFromName("tomtom"));
  const response = await stub.fetch(
    new Request("https://traffic-usage.internal/", { method: "POST", body: JSON.stringify(command), signal: AbortSignal.timeout(COUNTER_TIMEOUT_MS) }),
  );
  if (!response.ok) throw new Error(`counter answered ${response.status}`);
  return response.json();
}

const reservationSchema = z.union([
  z.object({ ok: z.literal(true), monthly: z.number(), daily: z.number(), warning: z.boolean() }),
  z.object({ ok: z.literal(false), reason: z.enum(["monthly-cap", "daily-cap", "backoff"]) }),
]);

async function backOff(env: TrafficEnv, until: number) {
  try {
    await askCounter(env, { op: "backoff", until });
  } catch (e) {
    // This request already failed closed; the next one asks the counter again.
    console.error("traffic: back-off not recorded", e instanceof Error ? e.message : "unknown");
  }
}

export async function handleTraffic(request: Request, env: TrafficEnv, deps: TrafficDeps = { fetch: (i, init) => fetch(i, init), now: () => Date.now() }): Promise<Response> {
  const url = new URL(request.url);
  const tile = parseTrafficTilePath(url.pathname);
  if (!tile && url.pathname !== TRAFFIC_STATUS_PATH) return notFound();
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET", ...SECURITY_HEADERS } });

  if (!env.TOMTOM_API_KEY || !env.TRAFFIC_USAGE) return unavailable("not configured (key secret or usage counter binding missing)");
  const now = deps.now();
  const control = await readControl(env, now);
  if (typeof control === "string") return unavailable(control);

  if (!tile) {
    let available = false;
    try {
      available = z.object({ available: z.boolean() }).parse(await askCounter(env, { op: "status", ...control, now })).available;
    } catch (e) {
      console.error("traffic: usage counter unavailable", e instanceof Error ? e.message : "unknown");
    }
    const body: TrafficStatus = { available };
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SECURITY_HEADERS } });
  }

  let reservation: Reservation;
  try {
    reservation = reservationSchema.parse(await askCounter(env, { op: "reserve", ...control, now }));
  } catch (e) {
    console.error("traffic: usage counter unavailable", e instanceof Error ? e.message : "unknown");
    return unavailable("usage accounting unavailable");
  }
  if (!reservation.ok) return unavailable(reservation.reason);
  if (reservation.warning) console.warn("traffic: TomTom requests this billing period have reached the warning level (80% of the cap)");

  let upstream: Response;
  try {
    upstream = await deps.fetch(`${UPSTREAM}/${tile.z}/${tile.x}/${tile.y}?apiVersion=2`, {
      headers: { "TomTom-Api-Key": env.TOMTOM_API_KEY, Accept: "application/vnd.mapbox-vector-tile" },
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    await backOff(env, now + BACKOFF_MS.outage);
    return unavailable("provider unreachable");
  }

  if (upstream.status === 429) {
    const retryAfter = Number(upstream.headers.get("Retry-After"));
    await backOff(env, now + Math.max(BACKOFF_MS.rateLimited, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0));
    return unavailable("provider rate limit (429)");
  }
  if (upstream.status === 401 || upstream.status === 403) {
    await backOff(env, now + BACKOFF_MS.keyRejected);
    console.error("traffic: TomTom rejected the key");
    return unavailable(`provider refused the key (${upstream.status})`);
  }
  if (upstream.status >= 500) {
    await backOff(env, now + BACKOFF_MS.outage);
    return unavailable(`provider error (${upstream.status})`);
  }
  if (!upstream.ok) return unavailable(`provider answered ${upstream.status}`);

  const maxAge = Number(/max-age=(\d+)/.exec(upstream.headers.get("Cache-Control") ?? "")?.[1] ?? 0);
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/vnd.mapbox-vector-tile",
      // Browser only, never a shared cache; no longer than TomTom allows, and at most MAX_TILE_AGE_S.
      "Cache-Control": maxAge > 0 ? `private, max-age=${Math.min(maxAge, MAX_TILE_AGE_S)}` : "private, no-store",
      ...SECURITY_HEADERS,
    },
  });
}
