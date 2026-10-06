/**
 * Uploads the snapshot already published and validated in data/published to the Worker's R2 bucket (checks: scripts/lib/r2-upload.ts).
 *   npm run api:upload             → the LOCAL bucket simulation used by `wrangler dev` (no Cloudflare account needed)
 *   npm run api:upload -- --remote → the real bucket (needs `wrangler login` or CLOUDFLARE_API_TOKEN; only at deployment)
 */
import { fileStore } from "../../worker/dev/file-store.ts";
import { uploadPublished, wranglerBucket } from "../lib/r2-upload.ts";
import { snapshotBucketName } from "../lib/wrangler-config.ts";

const bucket = wranglerBucket(snapshotBucketName(), process.argv.includes("--remote") ? "remote" : "local");
const result = await uploadPublished(fileStore(), bucket);
if (!result.ok) {
  console.error(`${result.error}. Nothing more was uploaded; ${bucket.label} still serves ${result.bucketVersion ?? "nothing"}.`);
  process.exitCode = 1;
} else if (!result.unchanged) console.log(`${bucket.label} now serves ${result.version}.`);
