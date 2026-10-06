/**
 * The device copy of the last validated snapshots, in the browser's Cache Storage: native (no dependency), stores the raw bytes as
 * they were downloaded, and is the same store the planned PWA service worker uses (SPECIFICATION §10, offline). Each entry records
 * the publication version it belongs to. Storage can be unavailable (private mode, quota, insecure context); then the app simply
 * runs without a device copy.
 */
import { SNAPSHOT_VERSION_HEADER } from "../../../shared/api/version.ts";

export type SnapshotKind = "closures" | "junctions";

export interface CachedDocument {
  version: string;
  raw: string;
}

export interface SnapshotCache {
  read(kind: SnapshotKind): Promise<CachedDocument | null>;
  write(kind: SnapshotKind, doc: CachedDocument): Promise<void>;
}

/** Cache Storage, under a private key path that is never requested from the network. */
export function browserSnapshotCache(name = "ta-snapshots-v1"): SnapshotCache {
  const key = (kind: SnapshotKind) => new URL(`/__ta-device-cache/${kind}`, globalThis.location?.origin ?? "http://localhost").toString();
  const open = () => (typeof caches === "undefined" ? null : caches.open(name));
  return {
    async read(kind) {
      try {
        const response = await (await open())?.match(key(kind));
        const version = response?.headers.get(SNAPSHOT_VERSION_HEADER);
        return response && version ? { version, raw: await response.text() } : null;
      } catch {
        return null;
      }
    },
    async write(kind, doc) {
      try {
        await (await open())?.put(key(kind), new Response(doc.raw, { headers: { "Content-Type": "application/json", [SNAPSHOT_VERSION_HEADER]: doc.version } }));
      } catch {
        // Quota or storage unavailable: the app keeps working from memory for this visit.
      }
    },
  };
}

/** In-memory cache for tests. */
export function memorySnapshotCache(initial: Partial<Record<SnapshotKind, CachedDocument>> = {}): SnapshotCache & { docs: Map<SnapshotKind, CachedDocument> } {
  const docs = new Map(Object.entries(initial) as [SnapshotKind, CachedDocument][]);
  return {
    docs,
    read: (kind) => Promise.resolve(docs.get(kind) ?? null),
    write: (kind, doc) => Promise.resolve(void docs.set(kind, doc)),
  };
}
