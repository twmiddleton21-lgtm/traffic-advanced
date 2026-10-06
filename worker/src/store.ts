import * as z from "zod";

/**
 * Snapshot storage (SPECIFICATION §10): versioned, immutable snapshot objects plus a `current` pointer, so a reader always gets a
 * complete, matching pair and a failed or rejected publish never touches what is being served (last known good).
 *
 * The interfaces are the subset of Cloudflare R2's binding API we use (`bucket.get(key)` → object with `text()`, or null;
 * `bucket.put(key, value)`), so an R2 bucket can be bound in production unchanged. Locally a file-backed store implements the
 * same interface (worker/dev/file-store.ts).
 */
export interface StoredObject {
  text(): Promise<string>;
  /** The raw bytes as a stream (R2 object bodies have one), so the Worker can pass a snapshot through without decoding it. */
  readonly body?: ReadableStream<Uint8Array>;
}
export interface ReadableStore {
  get(key: string): Promise<StoredObject | null>;
}
export interface WritableStore extends ReadableStore {
  put(key: string, value: string): Promise<unknown>;
}

export const CURRENT_KEY = "current.json";
export const META_KEY = "meta.json";
export const snapshotKeys = (version: string) => ({
  closures: `snapshots/${version}/closures.json`,
  junctions: `snapshots/${version}/junctions.json`,
  provenance: `snapshots/${version}/provenance.json`,
});

const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "ISO date-time");
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

/** Which snapshot pair is being served. */
export const currentPointerSchema = z.object({
  version: z.string().regex(/^[\w.-]+$/),
  closuresKey: z.string(),
  junctionsKey: z.string(),
  publishedAt: isoDateTime,
  /** When the closure data was fetched from National Highways (the snapshot's provenance.capturedAt). */
  capturedAt: isoDateTime,
  closures: z.number().int().nonnegative(),
  /** SHA-256 of each stored object, checked by read-back before this pointer is written. Optional: older pointers lack them. */
  closuresSha256: sha256Schema.optional(),
  junctionsSha256: sha256Schema.optional(),
  /** What the snapshot was built from: the rules-freeze file hash (frozen matcher) and each capture's file-hash digest. */
  pins: z.object({ rulesFreezeHash: sha256Schema, captures: z.record(z.string(), sha256Schema) }).optional(),
  /** The full provenance record (every capture file's SHA-256, capture times, rules freeze), stored beside the snapshot. */
  provenanceKey: z.string().optional(),
  provenanceSha256: sha256Schema.optional(),
});
export type CurrentPointer = z.infer<typeof currentPointerSchema>;
export type SnapshotPins = NonNullable<CurrentPointer["pins"]>;

/** The refresh log: every publish attempt, including rejected ones, so failures are never silent. */
export const publishMetaSchema = z.object({
  lastAttemptAt: isoDateTime,
  lastSuccessAt: isoDateTime.nullable(),
  /** Why the last attempt was rejected; null when it succeeded. */
  lastError: z.string().nullable(),
  current: currentPointerSchema.nullable(),
});
export type PublishMeta = z.infer<typeof publishMetaSchema>;

export async function readJson(store: ReadableStore, key: string): Promise<unknown> {
  const object = await store.get(key);
  return object === null ? null : (JSON.parse(await object.text()) as unknown);
}
