/**
 * One ingestion run, from National Highways to the Worker's snapshot bucket. Every stage fails closed: if any stage fails, nothing
 * after it runs, the failure is logged in the published store's meta.json, and the snapshot being served stays current.
 *
 *   rules-freeze   refuse to run unless every frozen matcher file matches the P0 freeze (scripts/p0/heldout-lib.ts)
 *   capture        run the existing capture scripts (scripts/capture/), or reuse given capture folders
 *   capture-check  refuse captures that logged problems or have missing records (assertCompleteCapture)
 *   pin            SHA-256 every capture file (hashCapture)
 *   matcher        run the FROZEN matcher via the shared pipeline and map to the contracts (buildApiSnapshots)
 *   re-pin         confirm the capture files didn't change while the matcher read them
 *   publish        contracts, integrity, replacement (incl. the 50% safeguard), read-back; pointer last (worker/src/publish.ts)
 *   upload         copy to R2 with the same checks against what the bucket serves; pointer last (scripts/lib/r2-upload.ts)
 *
 * This file orchestrates only. It contains no matching or classification logic; dependencies are injected so each stage's failure
 * can be tested.
 */
import { recordFailedAttempt, publishSnapshot } from "../../worker/src/publish.ts";
import type { CurrentPointer, WritableStore } from "../../worker/src/store.ts";
import type { Bucket, UploadResult } from "./r2-upload.ts";

export type IngestStage = "rules-freeze" | "capture" | "capture-check" | "pin" | "matcher" | "re-pin" | "publish" | "upload";
export type CaptureKind = "open" | "nh-api";

export interface IngestDeps {
  assertRulesFrozen(): { freezeHash: string; reason: string };
  /** Runs one capture and returns its folder; throws if the capture reported any problem. */
  capture(kind: CaptureKind): Promise<string>;
  assertCompleteCapture(dir: string): Promise<void>;
  /** SHA-256 of every file in a capture folder. */
  hashCapture(dir: string): Record<string, string>;
  /** The capture's own manifest (scripts/lib/capture-store.ts): start/finish times and, per file, source, URL, fetch time, counts. */
  readManifest(dir: string): Promise<CaptureManifestSummary>;
  buildSnapshots(openDir: string, apiDir: string, generatedAt: string): Promise<{ closures: unknown; junctions: unknown; leftOut: string[] }>;
  /** The publication store (data/published locally). */
  store: WritableStore;
  upload(store: WritableStore, bucket: Bucket): Promise<UploadResult>;
  digest(text: string): Promise<string>;
  now(): Date;
  log(line: string): void;
}

export interface CaptureManifestSummary {
  startedAt?: string;
  finishedAt?: string;
  entries: { source: string; file: string; url: string; fetchedAt: string; records?: number; expectedRecords?: number; sourceLastEditDate?: string }[];
}

export interface IngestOptions {
  /** Reuse existing capture folders instead of capturing (no new NH requests). Both or neither. */
  captures?: { openDir: string; apiDir: string };
  /** Where to upload after publishing; null publishes to the store only (dry run). */
  bucket: Bucket | null;
}

export type IngestResult =
  | { ok: true; published: CurrentPointer; upload: UploadResult | null }
  | { ok: false; stage: IngestStage; error: string; servedLocally: string | null };

export async function ingestOnce(deps: IngestDeps, options: IngestOptions): Promise<IngestResult> {
  const attemptAt = deps.now();
  let stage: IngestStage = "rules-freeze";
  const failed = async (error: string): Promise<IngestResult> => {
    const result = await recordFailedAttempt(deps.store, `${stage}: ${error}`, attemptAt);
    deps.log(`FAILED at ${stage}: ${error}. Nothing was published; still serving ${result.current?.version ?? "nothing"}.`);
    return { ok: false, stage, error, servedLocally: result.current?.version ?? null };
  };
  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

  try {
    const freeze = deps.assertRulesFrozen();

    stage = "capture";
    const openDir = options.captures?.openDir ?? (await deps.capture("open"));
    const apiDir = options.captures?.apiDir ?? (await deps.capture("nh-api"));

    stage = "capture-check";
    await deps.assertCompleteCapture(openDir);
    await deps.assertCompleteCapture(apiDir);

    stage = "pin";
    const dirs = [openDir, apiDir];
    const files = dirs.map((d) => deps.hashCapture(d));
    const digests = await Promise.all(files.map((f) => deps.digest(JSON.stringify(f))));
    const name = (dir: string) => dir.replaceAll("\\", "/").split("/").filter(Boolean).pop()!;

    stage = "matcher";
    const built = await deps.buildSnapshots(openDir, apiDir, attemptAt.toISOString());
    for (const line of built.leftOut) deps.log(`Left out: ${line}`);

    stage = "re-pin";
    for (const [i, dir] of dirs.entries()) {
      if ((await deps.digest(JSON.stringify(deps.hashCapture(dir)))) !== digests[i]) throw new Error(`${name(dir)} changed while it was being processed`);
    }

    stage = "publish";
    // Provenance reuses the capture's own manifest and pinning: enough to identify the exact source requests even after the raw
    // capture is gone (CI runners are discarded after each run).
    const captures = await Promise.all(dirs.map(async (dir, i) => [name(dir), { ...(await deps.readManifest(dir)), digest: digests[i]!, files: files[i]! }] as const));
    const published = await publishSnapshot(
      deps.store,
      {
        closures: built.closures,
        junctions: built.junctions,
        pins: { rulesFreezeHash: freeze.freezeHash, captures: Object.fromEntries(captures.map(([n, c]) => [n, c.digest])) },
        provenance: {
          rulesFreeze: { hash: freeze.freezeHash, reason: freeze.reason },
          captures: Object.fromEntries(captures),
          leftOut: built.leftOut,
        },
      },
      // The publication time is taken now, after capture and matching, so publishedAt can never precede capturedAt. (attemptAt,
      // the run's start, still dates the attempt in failure logs.)
      deps.now(),
    );
    // publishSnapshot records its own rejections in meta.json.
    if (!published.ok) {
      deps.log(`FAILED at publish: ${published.error}. Still serving ${published.current?.version ?? "nothing"}.`);
      return { ok: false, stage, error: published.error, servedLocally: published.current?.version ?? null };
    }
    deps.log(`Published ${published.current.version} (${published.current.closures} closures, NH data captured ${published.current.capturedAt}).`);

    stage = "upload";
    if (!options.bucket) return { ok: true, published: published.current, upload: null };
    const uploaded = await deps.upload(deps.store, options.bucket);
    if (!uploaded.ok) {
      await recordFailedAttempt(deps.store, `upload: ${uploaded.error}`, attemptAt);
      deps.log(`FAILED at upload: ${uploaded.error}. ${options.bucket.label} still serves ${uploaded.bucketVersion ?? "nothing"}.`);
      return { ok: false, stage, error: uploaded.error, servedLocally: published.current.version };
    }
    deps.log(uploaded.unchanged ? `${options.bucket.label} already served ${uploaded.version}.` : `${options.bucket.label} now serves ${uploaded.version}.`);
    return { ok: true, published: published.current, upload: uploaded };
  } catch (e) {
    return failed(message(e));
  }
}
