import * as z from "zod";

/**
 * GET /api/version: which snapshot is published now, in a few hundred bytes, so the app downloads /api/closures and
 * /api/junctions only when the version has actually changed. Derived from the publication pointer (worker/src/store.ts);
 * not a second provenance system.
 */
const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "ISO date-time");
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const publishedVersionSchema = z.object({
  /** The publication version; /api/closures and /api/junctions responses carry the same value in X-Snapshot-Version. */
  version: z.string().regex(/^[\w.-]+$/),
  /** When the closure data was fetched from National Highways: the basis for fresh/delayed/stale (shared/api/freshness.ts). */
  capturedAt: isoDateTime,
  publishedAt: isoDateTime,
  closures: z.number().int().nonnegative(),
  closuresSha256: sha256.nullable(),
  junctionsSha256: sha256.nullable(),
});
export type PublishedVersion = z.infer<typeof publishedVersionSchema>;

/** Response header naming the publication version a snapshot response belongs to. */
export const SNAPSHOT_VERSION_HEADER = "X-Snapshot-Version";
