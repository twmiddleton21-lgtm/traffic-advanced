/**
 * Publishes a snapshot from EXISTING captures into data/published without uploading it: the ingestion pipeline
 * (scripts/lib/ingest.ts) with given capture folders and no bucket. Upload afterwards with `npm run api:upload`.
 * Usage: npm run api:publish -- data/raw/<open capture> data/raw/<nh-api capture>
 */
import { spawnSync } from "node:child_process";

const [openDir, apiDir] = process.argv.slice(2);
if (!openDir || !apiDir) throw new Error("Usage: publish-snapshot.ts <open capture> <nh-api capture>");
process.exitCode = spawnSync(process.execPath, ["scripts/ingest/ingest-once.ts", "--open", openDir, "--api", apiDir, "--no-upload"], { stdio: "inherit" }).status ?? 1;
