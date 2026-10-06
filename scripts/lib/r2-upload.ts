/**
 * Copies a validated, locally published snapshot (worker/src/publish.ts) into the Worker's R2 bucket, never replacing the bucket's
 * current good snapshot with a malformed, incomplete or unverified one:
 *   1. the local pointer, snapshots and provenance must match their SHA-256s, pass their contracts and the integrity checks;
 *   2. the candidate must be allowed to replace what the BUCKET serves now (never empty, older, or below the 50% safeguard);
 *   3. snapshot objects (and provenance) are uploaded, read back and compared by SHA-256;
 *   4. only then is current.json uploaded (last); meta.json follows.
 * A failure at any step leaves the bucket's current.json, and so what the Worker serves, untouched.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { closuresSnapshotSchema } from "../../shared/api/closures.ts";
import { junctionsSnapshotSchema } from "../../shared/api/junctions.ts";
import { integrityProblems, replacementProblem, sha256Hex } from "../../worker/src/publish.ts";
import { CURRENT_KEY, currentPointerSchema, META_KEY, type CurrentPointer, type ReadableStore } from "../../worker/src/store.ts";

/** The bucket operations the upload needs: text in, text out, null for a missing key. */
export interface Bucket {
  readonly label: string;
  get(key: string): Promise<string | null>;
  put(key: string, text: string): Promise<void>;
}

export type UploadResult = { ok: true; version: string; unchanged: boolean } | { ok: false; error: string; bucketVersion: string | null };

const text = async (store: ReadableStore, key: string): Promise<string> => {
  const object = await store.get(key);
  if (!object) throw new Error(`${key} is missing from the published store`);
  return object.text();
};

export async function uploadPublished(local: ReadableStore, bucket: Bucket, log: (line: string) => void = console.log): Promise<UploadResult> {
  let bucketVersion: string | null = null;
  const fail = (error: string): UploadResult => ({ ok: false, error, bucketVersion });
  try {
    // 1. The local candidate.
    const pointer: CurrentPointer = currentPointerSchema.parse(JSON.parse(await text(local, CURRENT_KEY)));
    if (!pointer.closuresSha256 || !pointer.junctionsSha256) return fail("The published pointer has no SHA-256s (published before pinning); publish again");
    const objects: [string, string, string][] = [
      [pointer.closuresKey, await text(local, pointer.closuresKey), pointer.closuresSha256],
      [pointer.junctionsKey, await text(local, pointer.junctionsKey), pointer.junctionsSha256],
    ];
    if (pointer.provenanceKey && pointer.provenanceSha256) objects.push([pointer.provenanceKey, await text(local, pointer.provenanceKey), pointer.provenanceSha256]);
    for (const [key, body, expected] of objects) if ((await sha256Hex(body)) !== expected) return fail(`Local ${key} doesn't match the SHA-256 in its pointer`);
    const problems = integrityProblems(closuresSnapshotSchema.parse(JSON.parse(objects[0]![1])), junctionsSnapshotSchema.parse(JSON.parse(objects[1]![1])));
    if (problems.length > 0) return fail(`Snapshot failed integrity checks: ${problems.slice(0, 5).join("; ")}`);

    // 2. What the bucket serves now.
    const currentText = await bucket.get(CURRENT_KEY);
    const current = currentText === null ? null : currentPointerSchema.safeParse(JSON.parse(currentText));
    if (current && !current.success) return fail(`${bucket.label}: current.json is unreadable; fix it by hand before uploading`);
    bucketVersion = current?.data?.version ?? null;
    if (bucketVersion === pointer.version) {
      log(`${bucket.label} already serves ${pointer.version}; nothing to upload.`);
      return { ok: true, version: pointer.version, unchanged: true };
    }
    const refused = replacementProblem(current?.data ?? null, pointer);
    if (refused) return fail(refused);

    // 3. Snapshot objects, verified by read-back.
    for (const [key, body, expected] of objects) {
      log(`Uploading ${key} to ${bucket.label}`);
      await bucket.put(key, body);
      const stored = await bucket.get(key);
      if (stored === null || (await sha256Hex(stored)) !== expected) return fail(`Read-back of ${key} from ${bucket.label} didn't match`);
    }

    // 4. The pointer last, then the refresh log.
    log(`Switching ${bucket.label} to ${pointer.version}`);
    await bucket.put(CURRENT_KEY, JSON.stringify(pointer));
    const meta = await local.get(META_KEY);
    if (meta) await bucket.put(META_KEY, await meta.text());
    return { ok: true, version: pointer.version, unchanged: false };
  } catch (e) {
    return fail(`Upload stopped: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * The Worker's R2 bucket through the project's own Wrangler CLI (no shell; arguments passed exactly). "local" is the simulated
 * bucket used by `wrangler dev` and needs no Cloudflare account; "remote" is the real bucket and needs `wrangler login` or
 * CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID.
 */
export function wranglerBucket(bucketName: string, target: "local" | "remote"): Bucket {
  const wrangler = join("node_modules", "wrangler", "bin", "wrangler.js");
  const run = (args: string[], input?: string) =>
    execFileSync(process.execPath, [wrangler, "r2", "object", ...args, `--${target}`], {
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
      ...(input === undefined ? {} : { input }),
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    });
  return {
    label: `${target === "remote" ? "REMOTE" : "local"} bucket ${bucketName}`,
    get: (key) => {
      try {
        return Promise.resolve(run(["get", `${bucketName}/${key}`, "--pipe"]).toString("utf8"));
      } catch (e) {
        if (String((e as { stderr?: Buffer }).stderr ?? "").includes("The specified key does not exist")) return Promise.resolve(null);
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      }
    },
    put: (key, body) => {
      run(["put", `${bucketName}/${key}`, "--pipe", "--content-type", "application/json"], body);
      return Promise.resolve();
    },
  };
}
