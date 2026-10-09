import type { ZodType } from "zod";
import { closuresSnapshotSchema, type ClosuresSnapshot } from "../../../shared/api/closures.ts";
import { junctionsSnapshotSchema, type JunctionsSnapshot } from "../../../shared/api/junctions.ts";
import { publishedVersionSchema, SNAPSHOT_VERSION_HEADER, type PublishedVersion } from "../../../shared/api/version.ts";

/**
 * The ONE data-access boundary for the UI:
 *   UI → trafficService → our Worker API (/api/version, /api/closures, /api/junctions) → snapshots published from the frozen matcher.
 * The app is cache-first (web/src/data/snapshotSync.ts): it asks /api/version and downloads a snapshot only when the version changed.
 * Every source returns the contracts in shared/api/, validated with Zod before the UI sees them, so a bad response can never
 * reach the map. In development builds only, the bundled development snapshot is the fallback when the API is unavailable.
 */
export interface TrafficDataSource {
  readonly id: "development-snapshot" | "live-api";
  getSnapshot(signal?: AbortSignal): Promise<ClosuresSnapshot>;
  /** Numbered junctions from the NH Network Model, for map context only. */
  getJunctions(signal?: AbortSignal): Promise<JunctionsSnapshot>;
}

export type TrafficApiErrorKind = "unavailable" | "timeout" | "http" | "malformed" | "invalid";

/** Why a request failed, in words a driver can act on. Never contains upstream payloads. */
export class TrafficApiError extends Error {
  readonly kind: TrafficApiErrorKind;
  constructor(kind: TrafficApiErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TrafficApiError";
    this.kind = kind;
  }
}

export const REQUEST_TIMEOUT_MS = 15_000;

/** A validated snapshot plus the publication version it belongs to and its raw text (what the device cache stores). */
export interface SnapshotDocument<T> {
  data: T;
  version: string;
  raw: string;
}

/** The Worker API, with the version check and versioned downloads the cache-first sync uses. */
export interface LiveTrafficApi extends TrafficDataSource {
  readonly id: "live-api";
  getVersion(signal?: AbortSignal): Promise<PublishedVersion>;
  getClosuresDocument(signal?: AbortSignal): Promise<SnapshotDocument<ClosuresSnapshot>>;
  getJunctionsDocument(signal?: AbortSignal): Promise<SnapshotDocument<JunctionsSnapshot>>;
}

/** Turns stored or received text into contract-valid data, or throws the error the UI shows. */
export function parseDocument<T>(raw: string, schema: ZodType<T>): T {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    throw new TrafficApiError("malformed", "The traffic service sent a response that couldn't be read.", { cause: e });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new TrafficApiError("invalid", "The traffic service sent data that failed validation, so it wasn't used.", { cause: parsed.error });
  return parsed.data;
}

/** The Worker API. `fetchImpl` is injectable for tests; the browser's fetch is used otherwise. */
export function liveApiSource(baseUrl: string, fetchImpl: typeof fetch = (...args) => fetch(...args), timeoutMs = REQUEST_TIMEOUT_MS): LiveTrafficApi {
  async function request(path: string, signal?: AbortSignal): Promise<Response> {
    const timeout = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(new URL(path, baseUrl), { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: { Accept: "application/json" } });
    } catch (e) {
      // A cancelled query (component unmounted, newer request) is not an API failure.
      if (signal?.aborted) throw e;
      if (timeout.aborted) throw new TrafficApiError("timeout", `The traffic service didn't respond within ${Math.round(timeoutMs / 1000)} seconds.`, { cause: e });
      throw new TrafficApiError("unavailable", "The traffic service can't be reached. Check your connection.", { cause: e });
    }
    if (!response.ok) throw new TrafficApiError("http", `The traffic service returned an error (${response.status}).`);
    return response;
  }
  async function readText(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch (e) {
      throw new TrafficApiError("malformed", "The traffic service sent a response that couldn't be read.", { cause: e });
    }
  }
  async function document<T>(path: string, schema: ZodType<T>, signal?: AbortSignal): Promise<SnapshotDocument<T>> {
    const response = await request(path, signal);
    const version = response.headers.get(SNAPSHOT_VERSION_HEADER);
    if (!version) throw new TrafficApiError("invalid", "The traffic service didn't say which version it sent, so it wasn't used.");
    const raw = await readText(response);
    return { data: parseDocument(raw, schema), version, raw };
  }
  return {
    id: "live-api",
    getVersion: async (signal) => parseDocument(await readText(await request("/api/version", signal)), publishedVersionSchema),
    getClosuresDocument: (signal) => document("/api/closures", closuresSnapshotSchema, signal),
    getJunctionsDocument: (signal) => document("/api/junctions", junctionsSnapshotSchema, signal),
    getSnapshot: async (signal) => (await document("/api/closures", closuresSnapshotSchema, signal)).data,
    getJunctions: async (signal) => (await document("/api/junctions", junctionsSnapshotSchema, signal)).data,
  };
}

/**
 * Frozen exports from the P0 development capture (scripts/dev/export-ui-snapshot.ts, export-ui-junctions.ts). Not live, and
 * marked as such in their provenance. The JSON is only imported in development, so production builds don't contain it.
 */
const NOT_IN_PRODUCTION = "The development snapshot is not available in production builds.";
export const developmentSnapshotSource: TrafficDataSource = {
  id: "development-snapshot",
  // `import.meta.env.DEV ? … : null` is replaced at build time, so production builds drop these imports entirely.
  async getSnapshot() {
    const raw: unknown = import.meta.env.DEV ? (await import("./dev-snapshot.json")).default : null;
    if (raw === null) throw new Error(NOT_IN_PRODUCTION);
    return closuresSnapshotSchema.parse(raw);
  },
  async getJunctions() {
    const raw: unknown = import.meta.env.DEV ? (await import("./dev-junctions.json")).default : null;
    if (raw === null) throw new Error(NOT_IN_PRODUCTION);
    return junctionsSnapshotSchema.parse(raw);
  },
};

// The API is served from the app's own origin (Workers Static Assets in production, the Vite dev/preview server locally).
export const trafficService: LiveTrafficApi = liveApiSource(globalThis.location?.origin ?? "http://localhost");

/** Development only: used when the API can't supply any data at all. Never replaces data the API has already supplied. */
export const developmentFallback: TrafficDataSource | null = import.meta.env.DEV ? developmentSnapshotSource : null;

/**
 * A restriction data file (web/src/restrictions/catalog.ts): a static, content-hashed file from our own origin, fetched only when its
 * layer is switched on, and validated before the map sees it. The request carries no viewport or location: it is the whole file.
 */
export async function getRestrictionFile<T>(url: string, schema: ZodType<T>, signal?: AbortSignal, fetchImpl: typeof fetch = (...args) => fetch(...args), timeoutMs = 30_000): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(new URL(url, globalThis.location?.origin ?? "http://localhost"), { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  } catch (e) {
    if (signal?.aborted) throw e;
    if (timeout.aborted) throw new TrafficApiError("timeout", `Restriction data didn't load within ${Math.round(timeoutMs / 1000)} seconds.`, { cause: e });
    throw new TrafficApiError("unavailable", "Restriction data can't be loaded. Check your connection.", { cause: e });
  }
  if (!response.ok) throw new TrafficApiError("http", `Restriction data couldn't be loaded (error ${response.status}).`);
  let body: unknown;
  try {
    body = await response.json();
  } catch (e) {
    throw new TrafficApiError("malformed", "Restriction data couldn't be read, so it isn't shown.", { cause: e });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new TrafficApiError("invalid", "Restriction data failed validation, so it isn't shown.", { cause: parsed.error });
  return parsed.data;
}
