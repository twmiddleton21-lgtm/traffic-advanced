import { SNAPSHOT_VERSION_HEADER, type PublishedVersion } from "../../shared/api/version.ts";
import { CURRENT_KEY, currentPointerSchema, readJson, type CurrentPointer, type ReadableStore } from "./store.ts";

/**
 * The read-only API (SPECIFICATION §10), in the Cloudflare Workers module format (`export default { fetch }`).
 *   GET /api/version    which snapshot is published (shared/api/version.ts), a few hundred bytes: the app's cheap freshness check
 *   GET /api/closures   the current ClosuresSnapshot (shared/api/closures.ts), streamed exactly as published
 *   GET /api/junctions  the current JunctionsSnapshot (shared/api/junctions.ts), streamed exactly as published
 *
 * Trust model: snapshots are validated where they are produced, before they can become current. The publication pipeline checks
 * the contracts, integrity, replacement safeguards and a SHA-256 read-back before switching the `current` pointer
 * (worker/src/publish.ts, scripts/lib/r2-upload.ts), and the browser validates every response again (web/src/data/trafficService.ts).
 * So the Worker never parses a snapshot: per request it reads and validates only the ~1 KB pointer, then streams the stored bytes
 * (or answers 304 from the pointer alone). That keeps each request far inside the Workers Free CPU limit (10 ms).
 * It never matches, classifies or edits closures. Freshness travels in the snapshot and in /api/version (capturedAt).
 */
export interface Env {
  SNAPSHOTS: ReadableStore;
  /** Workers Static Assets binding, present when the Worker also serves the web app. */
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  // No Access-Control-Allow-Origin: only our own origin can read the API (same-origin by default).
} as const;
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache", ...SECURITY_HEADERS } as const;

type ErrorCode = "not-found" | "method-not-allowed" | "no-snapshot" | "snapshot-invalid" | "storage-unavailable";

const error = (status: number, code: ErrorCode, message: string, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: code, message }), { status, headers: { ...JSON_HEADERS, ...extra } });
const unavailable = (code: ErrorCode, message: string) => error(503, code, message, { "Retry-After": "60" });

const SNAPSHOT_ROUTES = {
  "/api/closures": (p: CurrentPointer) => p.closuresKey,
  "/api/junctions": (p: CurrentPointer) => p.junctionsKey,
} as const;
type SnapshotRoute = keyof typeof SNAPSHOT_ROUTES;
const ROUTES = new Set<string>(["/api/version", ...Object.keys(SNAPSHOT_ROUTES)]);

/** The publication pointer: the only stored object the Worker parses (about 1 KB). */
async function readPointer(env: Env): Promise<CurrentPointer | Response> {
  try {
    const raw = await readJson(env.SNAPSHOTS, CURRENT_KEY);
    if (raw === null) return unavailable("no-snapshot", "No snapshot has been published yet.");
    const parsed = currentPointerSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    console.error("current pointer failed validation", parsed.error.issues[0]);
    return unavailable("snapshot-invalid", "The published snapshot is unavailable.");
  } catch (e) {
    // Unreadable JSON in the pointer lands here too.
    console.error("snapshot pointer unreadable", e);
    return unavailable("storage-unavailable", "Snapshot storage is unavailable.");
  }
}

const notModified = (request: Request, etag: string) =>
  request.headers.get("If-None-Match") === etag ? new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-cache", ...SECURITY_HEADERS } }) : null;

function serveVersion(request: Request, pointer: CurrentPointer): Response {
  const etag = `"version-${pointer.version}"`;
  const body: PublishedVersion = {
    version: pointer.version,
    capturedAt: pointer.capturedAt,
    publishedAt: pointer.publishedAt,
    closures: pointer.closures,
    closuresSha256: pointer.closuresSha256 ?? null,
    junctionsSha256: pointer.junctionsSha256 ?? null,
  };
  return notModified(request, etag) ?? new Response(request.method === "HEAD" ? null : JSON.stringify(body), { headers: { ...JSON_HEADERS, ETag: etag } });
}

async function serveSnapshot(route: SnapshotRoute, request: Request, env: Env, pointer: CurrentPointer): Promise<Response> {
  const etag = `"${route.slice(5)}-${pointer.version}"`;
  // Unchanged since the client's copy: answered from the pointer alone, without touching the snapshot object.
  const cached = notModified(request, etag);
  if (cached) return cached;
  let object: Awaited<ReturnType<ReadableStore["get"]>>;
  try {
    object = await env.SNAPSHOTS.get(SNAPSHOT_ROUTES[route](pointer));
  } catch (e) {
    console.error("snapshot read failed", e);
    return unavailable("storage-unavailable", "Snapshot storage is unavailable.");
  }
  if (object === null) {
    console.error(`${route}: snapshot ${pointer.version} is missing from storage`);
    return unavailable("snapshot-invalid", "The published snapshot is unavailable.");
  }
  const headers = { ...JSON_HEADERS, ETag: etag, [SNAPSHOT_VERSION_HEADER]: pointer.version };
  if (request.method === "HEAD") {
    await object.body?.cancel();
    return new Response(null, { headers });
  }
  // Streamed verbatim: the bytes the publisher verified by SHA-256, never parsed here.
  return new Response(object.body ?? (await object.text()), { headers });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return env.ASSETS ? env.ASSETS.fetch(request) : error(404, "not-found", "Not found.");
  if (!ROUTES.has(url.pathname)) return error(404, "not-found", "Not found.");
  if (request.method !== "GET" && request.method !== "HEAD") return error(405, "method-not-allowed", "Only GET is supported.", { Allow: "GET, HEAD" });
  const pointer = await readPointer(env);
  if (pointer instanceof Response) return pointer;
  if (url.pathname === "/api/version") return serveVersion(request, pointer);
  return serveSnapshot(url.pathname as SnapshotRoute, request, env, pointer);
}

export default { fetch: handleRequest };
