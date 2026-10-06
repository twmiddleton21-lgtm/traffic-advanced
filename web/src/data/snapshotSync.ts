/**
 * Cache-first snapshot sync: one call = one freshness check.
 *   first visit      no device copy  → /api/version → download → validate → store on the device → show
 *   repeat visit     device copy     → show it → /api/version → same version → nothing downloaded
 *   after publishing device copy     → /api/version → newer version → download → validate → store → show the new data
 * Never throws away good data: a failed check or download keeps the copy already held (and says so via `refreshError`), and data
 * captured earlier than the copy held is refused, so an older snapshot can never replace a newer one. Only throws when there is
 * nothing at all to show. It never classifies or edits closures; validation uses the shared API contracts.
 */
import type { ZodType } from "zod";
import type { PublishedVersion } from "../../../shared/api/version.ts";
import type { SnapshotCache, SnapshotKind } from "./snapshotCache.ts";
import { parseDocument, TrafficApiError, type SnapshotDocument } from "./trafficService.ts";

type Snapshot = { provenance: { capturedAt: string } };

export interface Synced<T> {
  data: T;
  version: string;
  /** "api": confirmed as the published version; "device-cache": the device copy, not (yet) confirmed this visit. */
  via: "api" | "device-cache";
  /** When the shown data was last confirmed to be the published version (ms since epoch); null if not this visit. */
  confirmedAt: number | null;
  /** The latest check or download failed; the shown data is the copy already held. */
  refreshError: Error | null;
}

export interface SnapshotSync<T> {
  sync(signal?: AbortSignal): Promise<Synced<T>>;
}

export function createSnapshotSync<T extends Snapshot>(options: {
  kind: SnapshotKind;
  schema: ZodType<T>;
  cache: SnapshotCache;
  getVersion(signal?: AbortSignal): Promise<PublishedVersion>;
  download(signal?: AbortSignal): Promise<SnapshotDocument<T>>;
  now?: () => number;
}): SnapshotSync<T> {
  const now = options.now ?? Date.now;
  let held: { version: string; data: T } | null = null;
  let confirmedAt: number | null = null;
  let deviceCopyRead = false;

  const result = (refreshError: Error | null): Synced<T> => ({
    data: held!.data,
    version: held!.version,
    via: confirmedAt === null ? "device-cache" : "api",
    confirmedAt,
    refreshError,
  });

  async function readDeviceCopy(): Promise<void> {
    deviceCopyRead = true;
    const cached = await options.cache.read(options.kind);
    if (!cached) return;
    try {
      // A damaged or outdated-format device copy is ignored, never shown.
      held = { version: cached.version, data: parseDocument(cached.raw, options.schema) };
    } catch {
      held = null;
    }
  }

  return {
    async sync(signal) {
      if (!deviceCopyRead) await readDeviceCopy();

      let published: PublishedVersion;
      try {
        published = await options.getVersion(signal);
      } catch (e) {
        if (held && !signal?.aborted) return result(e as Error);
        throw e;
      }
      if (held?.version === published.version) {
        confirmedAt = now();
        return result(null);
      }

      let doc: SnapshotDocument<T>;
      try {
        doc = await options.download(signal);
      } catch (e) {
        if (held && !signal?.aborted) return result(e as Error);
        throw e;
      }
      if (held && Date.parse(doc.data.provenance.capturedAt) < Date.parse(held.data.provenance.capturedAt)) {
        return result(new TrafficApiError("invalid", "The traffic service offered older data than this device already has, so it wasn't used."));
      }
      // The download names its own version (X-Snapshot-Version): if a newer one was published since the check, that is what arrived.
      held = { version: doc.version, data: doc.data };
      confirmedAt = now();
      await options.cache.write(options.kind, { version: doc.version, raw: doc.raw });
      return result(null);
    },
  };
}
