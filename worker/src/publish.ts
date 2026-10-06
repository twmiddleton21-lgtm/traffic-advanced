import { closuresSnapshotSchema, type ClosuresSnapshot } from "../../shared/api/closures.ts";
import { junctionsSnapshotSchema, type JunctionsSnapshot } from "../../shared/api/junctions.ts";
import {
  CURRENT_KEY,
  currentPointerSchema,
  META_KEY,
  publishMetaSchema,
  readJson,
  snapshotKeys,
  type CurrentPointer,
  type PublishMeta,
  type SnapshotPins,
  type WritableStore,
} from "./store.ts";

/**
 * Publishes a matcher-produced snapshot pair for the API, keeping the last known good (CLAUDE.md "Data"). A candidate becomes
 * current only after it passes, in order:
 *   1. its contracts (shared/api), which mirror the matcher's A/B/D invariants;
 *   2. integrity checks the schemas can't express (unique ids, time windows, drawable B routes, unique junction names, not mock data);
 *   3. replacement checks against what is served (never empty-for-full, never older, never an abnormal drop in closures);
 *   4. a read-back of every written object, compared by SHA-256.
 * Only then is the `current` pointer written (last), so readers never see a half-published or unverified pair.
 * Every attempt, accepted or rejected, is recorded in meta.json. Nothing here classifies: A/B/D come from the frozen matcher.
 * Used by scripts/publish/publish-snapshot.ts now, and by any future scheduled ingest.
 */
export type PublishFailure = { ok: false; error: string; current: CurrentPointer | null };
export type PublishResult = { ok: true; current: CurrentPointer } | PublishFailure;

/**
 * Publication safeguards (approved by the owner on 2026-10-05). Publication safety only: NOT a matcher rule, and it never changes a
 * classification.
 *
 * minRetainedFraction: a candidate snapshot is REJECTED when its closure count is strictly less than this fraction of the closure
 * count currently being served (candidate < current × 0.5). Exactly half is accepted. On rejection the currently served snapshot
 * stays current and the attempt is logged in meta.json. It guards against partial upstream failures (SPECIFICATION §10: a refresh
 * that "drops record counts abnormally"), e.g. an NH API that returns only some pages.
 */
export const PUBLISH_RULES = { minRetainedFraction: 0.5 } as const;

async function readCurrent(store: WritableStore): Promise<CurrentPointer | null> {
  const parsed = currentPointerSchema.safeParse(await readJson(store, CURRENT_KEY));
  return parsed.success ? parsed.data : null;
}

async function readMeta(store: WritableStore): Promise<PublishMeta | null> {
  const parsed = publishMetaSchema.safeParse(await readJson(store, META_KEY));
  return parsed.success ? parsed.data : null;
}

/** Records a failed refresh (e.g. an incomplete upstream capture) without touching what is being served. */
export async function recordFailedAttempt(store: WritableStore, error: string, attemptAt: Date): Promise<PublishFailure> {
  const [current, meta] = await Promise.all([readCurrent(store), readMeta(store)]);
  const next: PublishMeta = { lastAttemptAt: attemptAt.toISOString(), lastSuccessAt: meta?.lastSuccessAt ?? null, lastError: error, current };
  await store.put(META_KEY, JSON.stringify(next));
  return { ok: false, error, current };
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Structural problems a contract-valid snapshot pair can still have. Empty when the pair is sound. */
export function integrityProblems(closures: ClosuresSnapshot, junctions: JunctionsSnapshot): string[] {
  const problems: string[] = [];
  if (closures.provenance.kind === "mock") problems.push("mock data can't be published");
  const ids = new Set<string>();
  for (const c of closures.closures) {
    if (ids.has(c.id)) problems.push(`duplicate closure id ${c.id}`);
    ids.add(c.id);
    if (Date.parse(c.window.end) < Date.parse(c.window.start)) problems.push(`closure ${c.id} ends before it starts`);
    for (const r of c.matchedRoute?.routes ?? []) if (r.geometry.length === 0) problems.push(`B route ${r.routeId} on closure ${c.id} has no geometry`);
  }
  const names = new Set<string>();
  for (const j of junctions.junctions) {
    if (names.has(j.name)) problems.push(`duplicate junction ${j.name}`);
    names.add(j.name);
  }
  return problems;
}

/** Why a candidate must not replace the snapshot being served, or null if it may. */
export function replacementProblem(current: Pick<CurrentPointer, "capturedAt" | "closures"> | null, candidate: { capturedAt: string; closures: number }): string | null {
  if (!current) return null;
  if (current.closures > 0 && candidate.closures === 0) return `Rejected an empty snapshot that would replace ${current.closures} closures`;
  if (Date.parse(candidate.capturedAt) < Date.parse(current.capturedAt)) {
    return `Rejected data captured at ${candidate.capturedAt}, older than the data being served (${current.capturedAt})`;
  }
  if (candidate.closures < current.closures * PUBLISH_RULES.minRetainedFraction) {
    return `Rejected ${candidate.closures} closures replacing ${current.closures}: below ${PUBLISH_RULES.minRetainedFraction * 100}% of the current count, likely a partial upstream failure`;
  }
  return null;
}

export async function publishSnapshot(
  store: WritableStore,
  input: { closures: unknown; junctions: unknown; pins?: SnapshotPins; provenance?: Record<string, unknown> },
  attemptAt: Date,
): Promise<PublishResult> {
  const closures = closuresSnapshotSchema.safeParse(input.closures);
  if (!closures.success) return recordFailedAttempt(store, `Closures snapshot failed the contract: ${closures.error.issues[0]?.message ?? "invalid"}`, attemptAt);
  const junctions = junctionsSnapshotSchema.safeParse(input.junctions);
  if (!junctions.success) return recordFailedAttempt(store, `Junctions snapshot failed the contract: ${junctions.error.issues[0]?.message ?? "invalid"}`, attemptAt);
  const problems = integrityProblems(closures.data, junctions.data);
  if (problems.length > 0) return recordFailedAttempt(store, `Snapshot failed integrity checks: ${problems.slice(0, 5).join("; ")}`, attemptAt);

  const current = await readCurrent(store);
  const count = closures.data.closures.length;
  const capturedAt = closures.data.provenance.capturedAt;
  // attemptAt becomes publishedAt: a publication can't predate the data it publishes (that would mean a wrong clock or a mix-up).
  if (attemptAt.getTime() < Date.parse(capturedAt)) {
    return recordFailedAttempt(store, `Publication time ${attemptAt.toISOString()} is earlier than the capture time ${capturedAt}; check the clock`, attemptAt);
  }
  const refused = replacementProblem(current, { capturedAt, closures: count });
  if (refused) return recordFailedAttempt(store, refused, attemptAt);

  const closuresText = JSON.stringify(closures.data);
  const junctionsText = JSON.stringify(junctions.data);
  const [closuresSha256, junctionsSha256] = await Promise.all([sha256Hex(closuresText), sha256Hex(junctionsText)]);
  const version = `${capturedAt.replace(/[-:]/g, "").replace(/\.\d+/, "")}-${(await sha256Hex(closuresSha256 + junctionsSha256)).slice(0, 12)}`;
  const keys = snapshotKeys(version);
  // Provenance: what produced this snapshot (capture file SHA-256s, rules-freeze hash, …) plus the snapshot's own identity.
  const provenanceText = input.provenance
    ? JSON.stringify({ ...input.provenance, version, closuresSha256, junctionsSha256, publishedAt: attemptAt.toISOString() })
    : null;
  const provenanceSha256 = provenanceText === null ? null : await sha256Hex(provenanceText);
  await store.put(keys.closures, closuresText);
  await store.put(keys.junctions, junctionsText);
  if (provenanceText !== null) await store.put(keys.provenance, provenanceText);
  // The pointer may only name objects that are verifiably in the store, byte for byte.
  const written: (readonly [string, string])[] = [
    [keys.closures, closuresSha256],
    [keys.junctions, junctionsSha256],
    ...(provenanceSha256 === null ? [] : [[keys.provenance, provenanceSha256] as const]),
  ];
  for (const [key, expected] of written) {
    const object = await store.get(key);
    const actual = object ? await sha256Hex(await object.text()) : "missing";
    if (actual !== expected) return recordFailedAttempt(store, `Read-back of ${key} didn't match what was written (${actual.slice(0, 12)})`, attemptAt);
  }
  const pointer: CurrentPointer = {
    version,
    closuresKey: keys.closures,
    junctionsKey: keys.junctions,
    publishedAt: attemptAt.toISOString(),
    capturedAt,
    closures: count,
    closuresSha256,
    junctionsSha256,
    ...(input.pins ? { pins: input.pins } : {}),
    ...(provenanceSha256 === null ? {} : { provenanceKey: keys.provenance, provenanceSha256 }),
  };
  await store.put(CURRENT_KEY, JSON.stringify(pointer));
  const meta: PublishMeta = { lastAttemptAt: attemptAt.toISOString(), lastSuccessAt: attemptAt.toISOString(), lastError: null, current: pointer };
  await store.put(META_KEY, JSON.stringify(meta));
  return { ok: true, current: pointer };
}
