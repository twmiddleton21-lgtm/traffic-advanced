/**
 * Reads wrangler.jsonc (JSON with comments) using TypeScript's own JSONC parser, so scripts and tests use the deployed config
 * rather than copies of its values.
 */
import { readFileSync } from "node:fs";
import ts from "typescript";

export interface WranglerConfig {
  name: string;
  main: string;
  compatibility_date: string;
  assets?: { directory: string; binding?: string; run_worker_first?: boolean | string[]; not_found_handling?: string };
  r2_buckets?: { binding: string; bucket_name: string }[];
  [key: string]: unknown;
}

export function readWranglerConfig(path = "wrangler.jsonc"): WranglerConfig {
  const parsed = ts.parseConfigFileTextToJson(path, readFileSync(path, "utf8"));
  if (parsed.error) throw new Error(`${path}: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n")}`);
  const config: unknown = parsed.config;
  return config as WranglerConfig;
}

/** The R2 bucket bound as SNAPSHOTS (the Worker's snapshot store). */
export function snapshotBucketName(config: WranglerConfig = readWranglerConfig()): string {
  const bucket = config.r2_buckets?.find((b) => b.binding === "SNAPSHOTS");
  if (!bucket) throw new Error("wrangler.jsonc has no R2 bucket bound as SNAPSHOTS");
  return bucket.bucket_name;
}
