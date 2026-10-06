import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { closuresSnapshotSchema, type ClosuresSnapshot } from "../../shared/api/closures.ts";
import { memoryStore } from "../../worker/src/memory-store.ts";
import { CURRENT_KEY, META_KEY, currentPointerSchema, publishMetaSchema } from "../../worker/src/store.ts";
import { ingestOnce, type IngestDeps } from "./ingest.ts";
import { uploadPublished, type Bucket } from "./r2-upload.ts";

/**
 * Orchestration only: the matcher itself is covered by its own tests on real data. Stages are faked so each one can fail on purpose;
 * the snapshot data is real (the development snapshot exported by the frozen matcher from the Day-1 capture).
 */
const base = closuresSnapshotSchema.parse(JSON.parse(readFileSync("web/src/data/dev-snapshot.json", "utf8")));
const junctions: unknown = JSON.parse(readFileSync("web/src/data/dev-junctions.json", "utf8"));
const later = (minutes: number, closures = base.closures): ClosuresSnapshot => ({
  ...base,
  closures,
  provenance: { ...base.provenance, capturedAt: new Date(Date.parse(base.provenance.capturedAt) + minutes * 60_000).toISOString() },
});
const FREEZE = { freezeHash: "f".repeat(64), reason: "P0 freeze (test)" };
const CAPTURE_FILES: Record<string, Record<string, string>> = {
  "data/raw/2026-10-06T0800Z-open": { "s4/diversion-routes.json": "a".repeat(64), "manifest.json": "b".repeat(64) },
  "data/raw/2026-10-06T0801Z-nh-api": { "s1/s1-planned-page000.json": "c".repeat(64), "manifest.json": "d".repeat(64) },
};

/** An in-memory R2 bucket; `failOn` makes put fail for matching keys. */
function memoryBucket(failOn?: RegExp): Bucket & { objects: Map<string, string> } {
  const objects = new Map<string, string>();
  return {
    label: "test bucket",
    objects,
    get: (key) => Promise.resolve(objects.get(key) ?? null),
    put: (key, text) => (failOn?.test(key) ? Promise.reject(new Error(`R2 refused ${key}`)) : Promise.resolve(void objects.set(key, text))),
  };
}

function deps(overrides: Partial<IngestDeps> = {}, snapshot: ClosuresSnapshot = later(60)) {
  const store = memoryStore();
  const log: string[] = [];
  const capture = vi.fn((kind: string) => Promise.resolve(kind === "open" ? "data/raw/2026-10-06T0800Z-open" : "data/raw/2026-10-06T0801Z-nh-api"));
  const buildSnapshots = vi.fn(() => Promise.resolve({ closures: snapshot, junctions, leftOut: [] as string[] }));
  const d: IngestDeps = {
    assertRulesFrozen: () => FREEZE,
    capture,
    assertCompleteCapture: () => Promise.resolve(),
    hashCapture: (dir) => CAPTURE_FILES[dir] ?? {},
    readManifest: (dir) =>
      Promise.resolve({
        startedAt: "2026-10-06T08:00:00.000Z",
        finishedAt: "2026-10-06T08:02:00.000Z",
        entries: [{ source: dir.endsWith("open") ? "S4" : "S1", file: "x.json", url: "https://example.test/source?page=0", fetchedAt: "2026-10-06T08:00:01.000Z", records: 10, expectedRecords: 10 }],
      }),
    buildSnapshots,
    store,
    upload: (s, b) => uploadPublished(s, b, () => undefined),
    digest: (text) => Promise.resolve(createHash("sha256").update(text).digest("hex")),
    now: () => new Date("2026-10-06T09:00:00Z"),
    log: (line) => void log.push(line),
    ...overrides,
  };
  return { d, store, log, capture, buildSnapshots };
}
interface Provenance {
  rulesFreeze: { hash: string; reason: string };
  captures: Record<string, { startedAt?: string; files: Record<string, string>; entries: { source: string; url: string; fetchedAt: string }[] }>;
}
const pointerIn = (objects: Map<string, string>) => {
  const text = objects.get(CURRENT_KEY);
  return text ? currentPointerSchema.parse(JSON.parse(text)) : null;
};
const metaIn = (store: ReturnType<typeof memoryStore>) => publishMetaSchema.parse(JSON.parse(store.objects.get(META_KEY)!));

/** A bucket already serving `snapshot`, published through the real pipeline. */
async function servingBucket(snapshot: ClosuresSnapshot) {
  const bucket = memoryBucket();
  const first = deps({}, snapshot);
  await ingestOnce(first.d, { bucket });
  return bucket;
}

describe("ingestOnce: successful run", () => {
  it("captures, pins, runs the matcher, publishes and uploads, with the pointer written last", async () => {
    const { d, store, capture } = deps();
    const bucket = memoryBucket();
    const order: string[] = [];
    const tracking: Bucket = { ...bucket, put: (k, t) => (order.push(k), bucket.put(k, t)) };
    const result = await ingestOnce(d, { bucket: tracking });
    expect(result.ok).toBe(true);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(order.indexOf(CURRENT_KEY)).toBeGreaterThan(Math.max(...order.filter((k) => k.startsWith("snapshots/")).map((k) => order.indexOf(k))));
    expect(pointerIn(bucket.objects)?.version).toBe(pointerIn(store.objects)?.version);
    expect(pointerIn(bucket.objects)?.closures).toBe(base.closures.length);
  });

  it("carries provenance: capture times, every capture file's SHA-256, the rules-freeze hash, snapshot hashes, publication time", async () => {
    const { d, store } = deps();
    const bucket = memoryBucket();
    await ingestOnce(d, { bucket });
    const pointer = pointerIn(bucket.objects)!;
    expect(pointer.pins?.rulesFreezeHash).toBe(FREEZE.freezeHash);
    expect(Object.keys(pointer.pins?.captures ?? {})).toEqual(["2026-10-06T0800Z-open", "2026-10-06T0801Z-nh-api"]);
    const provenance = JSON.parse(bucket.objects.get(pointer.provenanceKey!)!) as Provenance;
    expect(provenance.rulesFreeze).toEqual({ hash: FREEZE.freezeHash, reason: FREEZE.reason });
    expect(provenance.captures["2026-10-06T0801Z-nh-api"]?.files).toEqual(CAPTURE_FILES["data/raw/2026-10-06T0801Z-nh-api"]);
    expect(provenance.captures["2026-10-06T0800Z-open"]?.startedAt).toBe("2026-10-06T08:00:00.000Z");
    // The exact source requests survive even when the raw capture is discarded (CI).
    expect(provenance.captures["2026-10-06T0801Z-nh-api"]?.entries[0]).toMatchObject({ source: "S1", url: "https://example.test/source?page=0", fetchedAt: "2026-10-06T08:00:01.000Z" });
    expect(provenance).toMatchObject({ version: pointer.version, closuresSha256: pointer.closuresSha256, junctionsSha256: pointer.junctionsSha256, publishedAt: "2026-10-06T09:00:00.000Z" });
    expect(createHash("sha256").update(bucket.objects.get(pointer.provenanceKey!)!).digest("hex")).toBe(pointer.provenanceSha256);
    expect(store.objects.get(pointer.provenanceKey!)).toBe(bucket.objects.get(pointer.provenanceKey!));
  });

  it("reuses given capture folders without capturing (no new NH requests)", async () => {
    const { d, capture } = deps();
    const result = await ingestOnce(d, { captures: { openDir: "data/raw/2026-10-06T0800Z-open", apiDir: "data/raw/2026-10-06T0801Z-nh-api" }, bucket: null });
    expect(result.ok).toBe(true);
    expect(capture).not.toHaveBeenCalled();
  });

  it("dry run (no bucket): publishes to the store only and uploads nothing", async () => {
    const upload = vi.fn();
    const { d, store } = deps({ upload });
    const result = await ingestOnce(d, { bucket: null });
    expect(result).toMatchObject({ ok: true, upload: null });
    expect(upload).not.toHaveBeenCalled();
    expect(pointerIn(store.objects)).not.toBeNull();
  });
});

describe("ingestOnce: every stage fails closed", () => {
  const expectNothingPublished = (store: ReturnType<typeof memoryStore>, bucket: ReturnType<typeof memoryBucket>) => {
    expect(store.objects.has(CURRENT_KEY)).toBe(false);
    expect(bucket.objects.size).toBe(0);
  };

  it("frozen matcher changed → refuses before capturing anything", async () => {
    const { d, store, capture } = deps({
      assertRulesFrozen: () => {
        throw new Error("Rules changed since the P0 freeze: shared/diversion/evaluate-b.ts");
      },
    });
    const bucket = memoryBucket();
    const result = await ingestOnce(d, { bucket });
    expect(result).toMatchObject({ ok: false, stage: "rules-freeze" });
    expect(capture).not.toHaveBeenCalled();
    expectNothingPublished(store, bucket);
    expect(metaIn(store).lastError).toMatch(/^rules-freeze: Rules changed/);
  });

  it("capture failure → no publication", async () => {
    const { d, store, buildSnapshots } = deps({ capture: () => Promise.reject(new Error("capture-nh-api exited with code 1")) });
    const bucket = memoryBucket();
    expect(await ingestOnce(d, { bucket })).toMatchObject({ ok: false, stage: "capture" });
    expect(buildSnapshots).not.toHaveBeenCalled();
    expectNothingPublished(store, bucket);
  });

  it("incomplete capture (partial upstream failure) → no publication", async () => {
    const { d, store } = deps({ assertCompleteCapture: () => Promise.reject(new Error("s5/links.json has 30000 of 43025 records")) });
    const bucket = memoryBucket();
    expect(await ingestOnce(d, { bucket })).toMatchObject({ ok: false, stage: "capture-check" });
    expectNothingPublished(store, bucket);
  });

  it("matcher / parse failure → no publication", async () => {
    const { d, store } = deps({ buildSnapshots: () => Promise.reject(new Error("Unexpected token in s1-planned-page003.json")) });
    const bucket = memoryBucket();
    expect(await ingestOnce(d, { bucket })).toMatchObject({ ok: false, stage: "matcher" });
    expectNothingPublished(store, bucket);
  });

  it("capture files changing while processed → no publication", async () => {
    let calls = 0;
    const { d, store } = deps({ hashCapture: (dir) => ({ ...CAPTURE_FILES[dir], extra: String(calls++ > 1) }) });
    const bucket = memoryBucket();
    expect(await ingestOnce(d, { bucket })).toMatchObject({ ok: false, stage: "re-pin" });
    expectNothingPublished(store, bucket);
  });

  it("schema failure → no publication", async () => {
    const invalid = { ...later(60), closures: later(60).closures.map((c) => ({ ...c, classes: ["A", "D"] })) };
    const { d, store } = deps({ buildSnapshots: () => Promise.resolve({ closures: invalid, junctions, leftOut: [] }) });
    const bucket = memoryBucket();
    expect(await ingestOnce(d, { bucket })).toMatchObject({ ok: false, stage: "publish" });
    expectNothingPublished(store, bucket);
  });

  it("integrity failure (duplicate closure ids) → no publication", async () => {
    const dup = later(60, [...base.closures, base.closures[0]!]);
    const { d, store } = deps({}, dup);
    const bucket = memoryBucket();
    const result = await ingestOnce(d, { bucket });
    expect(result).toMatchObject({ ok: false, stage: "publish" });
    expect(!result.ok && result.error).toMatch(/duplicate closure id/);
    expectNothingPublished(store, bucket);
  });

  it("abnormal closure-count drop (below 50% of what the bucket serves) → the served snapshot stays current", async () => {
    const bucket = await servingBucket(later(30));
    const before = pointerIn(bucket.objects)!;
    // 7 of 16 closures is below half: rejected by the bucket check even though the fresh local store has nothing to compare against.
    const { d } = deps({}, later(90, base.closures.slice(0, 7)));
    const result = await ingestOnce(d, { bucket });
    expect(result).toMatchObject({ ok: false, stage: "upload" });
    expect(!result.ok && result.error).toMatch(/below 50%/);
    expect(pointerIn(bucket.objects)).toEqual(before);
  });

  it("R2 upload failure → the bucket's current snapshot is untouched", async () => {
    const bucket = await servingBucket(later(30));
    const before = pointerIn(bucket.objects)!;
    const failing = memoryBucket(/closures\.json$/);
    for (const [k, v] of bucket.objects) failing.objects.set(k, v);
    const { d, store } = deps();
    const result = await ingestOnce(d, { bucket: failing });
    expect(result).toMatchObject({ ok: false, stage: "upload" });
    expect(pointerIn(failing.objects)).toEqual(before);
    expect(metaIn(store).lastError).toMatch(/^upload: Upload stopped: R2 refused/);
  });

  it("pointer update failure → the bucket's current snapshot is untouched", async () => {
    const bucket = await servingBucket(later(30));
    const before = pointerIn(bucket.objects)!;
    const failing = memoryBucket(/^current\.json$/);
    for (const [k, v] of bucket.objects) failing.objects.set(k, v);
    const { d } = deps();
    expect(await ingestOnce(d, { bucket: failing })).toMatchObject({ ok: false, stage: "upload" });
    expect(pointerIn(failing.objects)).toEqual(before);
  });
});

describe("uploadPublished: the bucket is only ever switched to a verified snapshot", () => {
  async function publishedStore(snapshot: ClosuresSnapshot) {
    const { d, store } = deps({}, snapshot);
    await ingestOnce(d, { bucket: null });
    return store;
  }

  it("does nothing when the bucket already serves the same version", async () => {
    const store = await publishedStore(later(60));
    const bucket = memoryBucket();
    await uploadPublished(store, bucket, () => undefined);
    const again = await uploadPublished(store, bucket, () => undefined);
    expect(again).toMatchObject({ ok: true, unchanged: true });
  });

  it("refuses data older than what the bucket serves", async () => {
    const bucket = await servingBucket(later(90));
    const result = await uploadPublished(await publishedStore(later(60)), bucket, () => undefined);
    expect(!result.ok && result.error).toMatch(/older than the data being served/);
  });

  it("refuses a tampered local snapshot (SHA-256 mismatch) before touching the bucket", async () => {
    const store = await publishedStore(later(60));
    const pointer = pointerIn(store.objects)!;
    store.objects.set(pointer.closuresKey, store.objects.get(pointer.closuresKey)! + " ");
    const bucket = memoryBucket();
    const result = await uploadPublished(store, bucket, () => undefined);
    expect(!result.ok && result.error).toMatch(/doesn't match the SHA-256/);
    expect(bucket.objects.size).toBe(0);
  });

  it("refuses to switch the pointer when the bucket returns different bytes on read-back", async () => {
    const store = await publishedStore(later(60));
    const corrupting: Bucket & { objects: Map<string, string> } = { ...memoryBucket(), objects: new Map() };
    corrupting.put = (k, t) => Promise.resolve(void corrupting.objects.set(k, k.startsWith("snapshots/") ? t.slice(1) : t));
    corrupting.get = (k) => Promise.resolve(corrupting.objects.get(k) ?? null);
    const result = await uploadPublished(store, corrupting, () => undefined);
    expect(!result.ok && result.error).toMatch(/Read-back/);
    expect(corrupting.objects.has(CURRENT_KEY)).toBe(false);
  });
});

describe("publication time (publishedAt)", () => {
  // The Day-1 snapshot was captured at 12:08:26. The run starts before the capture and publishes after it.
  const clock = (...times: string[]) => {
    let i = 0;
    return () => new Date(times[Math.min(i++, times.length - 1)]!);
  };

  it("is taken when publishing, after capture and matching, so it never precedes capturedAt", async () => {
    const { d, store } = deps({ now: clock("2026-10-05T12:07:00.000Z", "2026-10-05T12:12:00.000Z") }, base);
    const result = await ingestOnce(d, { bucket: null });
    expect(result.ok).toBe(true);
    const pointer = pointerIn(store.objects)!;
    expect(pointer.publishedAt).toBe("2026-10-05T12:12:00.000Z");
    expect(Date.parse(pointer.publishedAt)).toBeGreaterThanOrEqual(Date.parse(pointer.capturedAt));
    const provenance = JSON.parse(store.objects.get(pointer.provenanceKey!)!) as { publishedAt: string };
    expect(provenance.publishedAt).toBe(pointer.publishedAt);
  });

  it("changes nothing else: same snapshot bytes, hashes and version whatever the publication time", async () => {
    const a = deps({ now: clock("2026-10-05T12:07:00.000Z", "2026-10-05T12:12:00.000Z") }, base);
    const b = deps({ now: clock("2026-10-05T12:07:00.000Z", "2026-10-05T12:20:00.000Z") }, base);
    await ingestOnce(a.d, { bucket: null });
    await ingestOnce(b.d, { bucket: null });
    const pa = pointerIn(a.store.objects)!;
    const pb = pointerIn(b.store.objects)!;
    expect([pb.version, pb.closuresSha256, pb.junctionsSha256]).toEqual([pa.version, pa.closuresSha256, pa.junctionsSha256]);
    expect(b.store.objects.get(pb.closuresKey)).toBe(a.store.objects.get(pa.closuresKey));
    expect(b.store.objects.get(pb.junctionsKey)).toBe(a.store.objects.get(pa.junctionsKey));
    expect(pb.publishedAt).not.toBe(pa.publishedAt);
    // Provenance differs only in its publishedAt.
    const strip = (s: ReturnType<typeof memoryStore>, key: string) => ({ ...(JSON.parse(s.objects.get(key)!) as Record<string, unknown>), publishedAt: null });
    expect(strip(b.store, pb.provenanceKey!)).toEqual(strip(a.store, pa.provenanceKey!));
  });
});
