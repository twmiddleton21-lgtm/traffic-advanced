/**
 * Copies a validated, locally published snapshot (worker/src/publish.ts) into the Worker's R2 bucket, never replacing the bucket's
 * current good snapshot with a malformed, incomplete or unverified one:
 *   1. the local pointer, snapshots and provenance must match their SHA-256s, pass their contracts and the integrity checks;
 *   2. the candidate must be allowed to replace what the BUCKET serves now (never empty, older, or below the 50% safeguard);
 *   3. snapshot objects (and provenance) are uploaded, read back and compared by SHA-256;
 *   4. only then is current.json uploaded (last); meta.json follows.
 * A failure at any step leaves the bucket's current.json, and so what the Worker serves, untouched.
 * Buckets: the real one through R2's S3 API (r2S3Bucket), the local `wrangler dev` simulation through Wrangler (wranglerBucket).
 */
import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
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
 * The real R2 bucket through R2's S3-compatible API, signed with AWS Signature Version 4 (node:crypto only, no SDK). This works
 * with a bucket-scoped R2 API token ("Object Read & Write" on one bucket): Cloudflare's REST API, which `wrangler r2 object
 * --remote` uses, rejects those tokens. Path-style requests: <endpoint>/<bucket>/<key>, region "auto", service "s3".
 * Credentials are only ever used to sign; they never appear in labels, logs or error messages.
 */
export interface R2S3Credentials {
  /** e.g. https://<account id>.r2.cloudflarestorage.com */
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data, "utf8").digest();
const sha256 = (data: string) => createHash("sha256").update(data, "utf8").digest("hex");

/** RFC 3986 encoding of each path segment ('/' kept), as S3 expects in the canonical URI (single-encoded, not normalised). */
export const encodeS3Key = (key: string) =>
  key
    .split("/")
    .map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");

/** The SigV4 Authorization header for a request with no query string. `headers` are the headers to sign (lower-case names). */
export function signV4(input: {
  method: string;
  path: string;
  headers: Record<string, string>;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  amzDate: string;
}): string {
  const names = Object.keys(input.headers).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(input.headers).map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, " ")]));
  const canonicalHeaders = names.map((h) => `${h}:${lower[h]}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [input.method, input.path, "", canonicalHeaders, signedHeaders, input.payloadHash].join("\n");
  const day = input.amzDate.slice(0, 8);
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", input.amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), input.service), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

export function r2S3Bucket(
  bucketName: string,
  credentials: R2S3Credentials,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  now: () => Date = () => new Date(),
): Bucket {
  const endpoint = credentials.endpoint.replace(/\/+$/, "");
  async function send(method: "GET" | "PUT", key: string, body?: string): Promise<Response> {
    const url = new URL(`${endpoint}/${bucketName}/${encodeS3Key(key)}`);
    const amzDate = now().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const payloadHash = sha256(body ?? "");
    const signed: Record<string, string> = { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
    if (body !== undefined) signed["content-type"] = "application/json";
    const authorization = signV4({ method, path: url.pathname, headers: signed, payloadHash, accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey, region: "auto", service: "s3", amzDate });
    // Host is sent by fetch itself from the URL; the other signed headers are sent explicitly.
    const { host: _host, ...sent } = signed;
    void _host;
    return fetchImpl(url, { method, headers: { ...sent, authorization }, ...(body === undefined ? {} : { body }), signal: AbortSignal.timeout(60_000) });
  }
  /** Status and the S3 error code (e.g. AccessDenied) only: never the request, its headers or credentials. */
  const failure = async (op: string, key: string, response: Response) => {
    const code = /<Code>([^<]{1,64})<\/Code>/.exec(await response.text().catch(() => ""))?.[1];
    return new Error(`R2 ${op} ${key} failed: HTTP ${response.status}${code ? ` ${code}` : ""}`);
  };
  return {
    label: `REMOTE bucket ${bucketName} (R2 S3 API)`,
    async get(key) {
      const response = await send("GET", key);
      if (response.status === 404) return null;
      if (!response.ok) throw await failure("GET", key, response);
      return response.text();
    },
    async put(key, text) {
      const response = await send("PUT", key, text);
      if (!response.ok) throw await failure("PUT", key, response);
    },
  };
}

/** Reads R2_ENDPOINT, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY. Names what is missing, never what is set. */
export function r2S3BucketFromEnv(bucketName: string, env: NodeJS.ProcessEnv = process.env, fetchImpl?: typeof fetch): Bucket {
  const missing = ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].filter((n) => !env[n]?.trim());
  if (missing.length > 0) throw new Error(`--remote needs ${missing.join(", ")} in the environment (R2 S3 API credentials for the bucket)`);
  const endpoint = env["R2_ENDPOINT"]!.trim();
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(endpoint)) throw new Error("R2_ENDPOINT must be an https:// origin such as https://<account id>.r2.cloudflarestorage.com");
  return r2S3Bucket(bucketName, { endpoint, accessKeyId: env["R2_ACCESS_KEY_ID"]!.trim(), secretAccessKey: env["R2_SECRET_ACCESS_KEY"]!.trim() }, fetchImpl);
}

/**
 * The simulated local bucket used by `wrangler dev`, through the project's own Wrangler CLI (no shell; arguments passed exactly).
 * Needs no Cloudflare account. (The real bucket uses the R2 S3 API above.)
 */
export function wranglerBucket(bucketName: string): Bucket {
  const wrangler = join("node_modules", "wrangler", "bin", "wrangler.js");
  const run = (args: string[], input?: string) =>
    execFileSync(process.execPath, [wrangler, "r2", "object", ...args, "--local"], {
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
      ...(input === undefined ? {} : { input }),
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    });
  return {
    label: `local bucket ${bucketName}`,
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
