/**
 * Uploads the snapshot already published and validated in data/published to the Worker's R2 bucket (checks: scripts/lib/r2-upload.ts).
 *   npm run api:upload             → the LOCAL bucket simulation used by `wrangler dev` (no Cloudflare account needed)
 *   npm run api:upload -- --remote → the real bucket through R2's S3 API (needs R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)
 */
import { fileStore } from "../../worker/dev/file-store.ts";
import { r2S3BucketFromEnv, uploadPublished, wranglerBucket } from "../lib/r2-upload.ts";
import { snapshotBucketName } from "../lib/wrangler-config.ts";

const bucket = process.argv.includes("--remote") ? r2S3BucketFromEnv(snapshotBucketName()) : wranglerBucket(snapshotBucketName());
const result = await uploadPublished(fileStore(), bucket);
if (!result.ok) {
  console.error(`${result.error}. Nothing more was uploaded; ${bucket.label} still serves ${result.bucketVersion ?? "nothing"}.`);
  process.exitCode = 1;
} else if (!result.unchanged) console.log(`${bucket.label} now serves ${result.version}.`);
