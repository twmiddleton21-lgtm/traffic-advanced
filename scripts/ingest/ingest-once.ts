/**
 * Runs ingestion once: NH capture → capture check → pin → FROZEN matcher → publish (data/published) → upload to R2.
 * See scripts/lib/ingest.ts for the stages; every stage fails closed and the served snapshot stays current on any failure.
 *
 *   npm run ingest:once                                   capture now, publish, upload to the LOCAL bucket (wrangler dev; no account)
 *   npm run ingest:once -- --open <dir> --api <dir>       reuse existing captures (no new NH requests)
 *   npm run ingest:once -- --dry-run                      everything up to publish, in a temporary copy of the store; no upload
 *   npm run ingest:once -- --no-upload                    publish into data/published only (upload later with npm run api:upload)
 *   npm run ingest:once -- --remote                       upload to the REAL bucket (needs Cloudflare credentials; deployment only)
 * A new capture needs NH_API_KEY (.dev.vars locally, or the environment in CI). The key is never printed or saved.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_PUBLISHED_DIR, fileStore } from "../../worker/dev/file-store.ts";
import { ingestOnce, type CaptureKind, type CaptureManifestSummary } from "../lib/ingest.ts";
import { uploadPublished, wranglerBucket } from "../lib/r2-upload.ts";
import { assertCompleteCapture, buildApiSnapshots } from "../lib/snapshot-builder.ts";
import { snapshotBucketName } from "../lib/wrangler-config.ts";
import { assertRulesFrozen, hashCapture } from "../p0/heldout-lib.ts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = flag("--dry-run");
const remote = flag("--remote");
const noUpload = dryRun || flag("--no-upload");
if (noUpload && remote) throw new Error("--remote can't be combined with --dry-run or --no-upload");
const openDir = value("--open");
const apiDir = value("--api");
if (Boolean(openDir) !== Boolean(apiDir)) throw new Error("Give both --open and --api to reuse captures, or neither to capture now");

/** Runs an existing capture script unchanged and returns the folder named by its "Manifest:" line. Any problem fails the run. */
function capture(kind: CaptureKind): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join("scripts", "capture", `capture-${kind === "open" ? "open" : "nh-api"}.ts`)], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      process.stdout.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const manifest = /Manifest: (.+manifest\.json)/.exec(out)?.[1]?.trim();
      if (code !== 0) return reject(new Error(`capture-${kind} exited with code ${code} (problems are listed above and in its manifest)`));
      if (!manifest || !existsSync(manifest)) return reject(new Error(`capture-${kind} did not report a manifest`));
      resolve(dirname(manifest));
    });
  });
}

let storeDir = value("--store") ?? DEFAULT_PUBLISHED_DIR;
if (dryRun) {
  // A throwaway copy, so the replacement checks still compare against what is currently published.
  const copy = mkdtempSync(join(tmpdir(), "ta-ingest-dry-run-"));
  if (existsSync(storeDir)) cpSync(storeDir, copy, { recursive: true });
  storeDir = copy;
}

const result = await ingestOnce(
  {
    assertRulesFrozen,
    capture,
    assertCompleteCapture,
    hashCapture,
    readManifest: (dir) => {
      const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as CaptureManifestSummary;
      // Only the documented fields; URLs carry query parameters only (the NH key travels in a header and is never saved).
      const entries = (m.entries ?? []).map(({ source, file, url, fetchedAt, records, expectedRecords, sourceLastEditDate }) => ({
        source,
        file,
        url,
        fetchedAt,
        ...(records === undefined ? {} : { records }),
        ...(expectedRecords === undefined ? {} : { expectedRecords }),
        ...(sourceLastEditDate === undefined ? {} : { sourceLastEditDate }),
      }));
      return Promise.resolve({ ...(m.startedAt ? { startedAt: m.startedAt } : {}), ...(m.finishedAt ? { finishedAt: m.finishedAt } : {}), entries });
    },
    buildSnapshots: buildApiSnapshots,
    store: fileStore(storeDir),
    upload: (store, bucket) => uploadPublished(store, bucket),
    digest: (text) => Promise.resolve(createHash("sha256").update(text).digest("hex")),
    now: () => new Date(),
    log: (line) => console.log(line),
  },
  {
    ...(openDir && apiDir ? { captures: { openDir, apiDir } } : {}),
    bucket: noUpload ? null : wranglerBucket(snapshotBucketName(), remote ? "remote" : "local"),
  },
);
if (dryRun) console.log(`Dry run: published into ${storeDir}; nothing was uploaded.`);
process.exitCode = result.ok ? 0 : 1;
