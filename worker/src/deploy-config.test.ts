import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readWranglerConfig, snapshotBucketName } from "../../scripts/lib/wrangler-config.ts";
import viteConfig from "../../vite.config.ts";

/** wrangler.jsonc must describe the Worker as the code expects it (worker/src/index.ts `Env`), with nothing secret in it. */
const config = readWranglerConfig();

describe("Wrangler deployment config", () => {
  it("deploys the existing Worker entry point", () => {
    expect(config.main).toBe("worker/src/index.ts");
    expect(existsSync(config.main)).toBe(true);
    expect(config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("binds the snapshot store the Worker reads (Env.SNAPSHOTS) to one R2 bucket, and nothing else", () => {
    expect(config.r2_buckets).toEqual([{ binding: "SNAPSHOTS", bucket_name: snapshotBucketName(config) }]);
    for (const service of ["kv_namespaces", "d1_databases", "durable_objects", "queues", "services", "vars"]) expect(config[service], service).toBeUndefined();
  });

  it("serves the built web app as static assets (Env.ASSETS), running Worker code only for /api/*", () => {
    expect(config.assets).toEqual({ directory: "./web/dist", binding: "ASSETS", run_worker_first: ["/api/*"], not_found_handling: "single-page-application" });
    // The assets directory is Vite's build output.
    expect(`./${viteConfig.root}/${viteConfig.build?.outDir}`).toBe(config.assets?.directory);
  });

  it("contains no account IDs, tokens, keys or routes to a real domain", () => {
    expect(config["account_id"]).toBeUndefined();
    expect(config["routes"]).toBeUndefined();
    expect(config["route"]).toBeUndefined();
    // Checked on the parsed values (comments may name the environment variables that hold credentials, never their values).
    expect(JSON.stringify(config)).not.toMatch(/NH_API_KEY|api[_-]?token|secret|password|[0-9a-f]{32}/i);
  });

  it("keeps Wrangler's local state and bundles out of source control", () => {
    expect(readFileSync(".gitignore", "utf8")).toMatch(/^\.wrangler\/$/m);
  });
});
