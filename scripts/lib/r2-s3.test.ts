import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { memoryStore } from "../../worker/src/memory-store.ts";
import { publishSnapshot } from "../../worker/src/publish.ts";
import { CURRENT_KEY } from "../../worker/src/store.ts";
import { encodeS3Key, r2S3Bucket, r2S3BucketFromEnv, signV4, uploadPublished } from "./r2-upload.ts";

/**
 * The remote publisher over R2's S3-compatible API. A fake R2 endpoint checks every request's SigV4 signature, payload hash,
 * scope and path, stores objects, records the operation order, and can fail chosen requests.
 */
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const BUCKET = "traffic-advanced-snapshots";
const CREDS = { endpoint: "https://0123abcd.r2.cloudflarestorage.com", accessKeyId: "TESTACCESSKEYID", secretAccessKey: "test-secret-access-key-not-real" };
const FIXED = new Date("2026-10-06T09:00:00.000Z");

function fakeR2(options: { fail?: (method: string, key: string) => number | undefined; objects?: Map<string, string> } = {}) {
  const objects = options.objects ?? new Map<string, string>();
  const ops: string[] = [];
  const problems: string[] = [];
  const handle = (input: string | URL | Request, init?: RequestInit): Response => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : undefined;
    const prefix = `/${BUCKET}/`;
    if (!url.pathname.startsWith(prefix)) problems.push(`wrong path ${url.pathname}`);
    const key = decodeURIComponent(url.pathname.slice(prefix.length));
    ops.push(`${method} ${key}`);
    // Verify the request exactly as R2 would: recompute the signature from what was sent.
    const amzDate = headers.get("x-amz-date") ?? "";
    const payloadHash = headers.get("x-amz-content-sha256") ?? "";
    if (payloadHash !== sha(body ?? "")) problems.push(`payload hash mismatch on ${method} ${key}`);
    const signed: Record<string, string> = { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
    if (headers.get("content-type")) signed["content-type"] = headers.get("content-type")!;
    const expected = signV4({ method, path: url.pathname, headers: signed, payloadHash, accessKeyId: CREDS.accessKeyId, secretAccessKey: CREDS.secretAccessKey, region: "auto", service: "s3", amzDate });
    if (headers.get("authorization") !== expected) problems.push(`bad signature on ${method} ${key}`);
    if (!/Credential=TESTACCESSKEYID\/\d{8}\/auto\/s3\/aws4_request/.test(headers.get("authorization") ?? "")) problems.push("bad credential scope");
    const failStatus = options.fail?.(method, key);
    if (failStatus) return new Response(`<?xml version="1.0"?><Error><Code>${failStatus === 403 ? "AccessDenied" : "InternalError"}</Code></Error>`, { status: failStatus });
    if (method === "GET") return objects.has(key) ? new Response(objects.get(key)) : new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
    objects.set(key, body ?? "");
    return new Response(null, { status: 200 });
  };
  const fetchImpl: typeof fetch = (input, init) => Promise.resolve(handle(input, init));
  return { fetchImpl, objects, ops, problems };
}

const closures = JSON.parse(readFileSync("web/src/data/dev-snapshot.json", "utf8")) as { provenance: { capturedAt: string } };
const junctions: unknown = JSON.parse(readFileSync("web/src/data/dev-junctions.json", "utf8"));
async function publishedStore(minutesLater = 0) {
  const store = memoryStore();
  const later = { ...closures, provenance: { ...closures.provenance, capturedAt: new Date(Date.parse(closures.provenance.capturedAt) + minutesLater * 60_000).toISOString() } };
  const result = await publishSnapshot(store, { closures: later, junctions, provenance: { note: "test" } }, new Date("2026-10-06T08:00:00Z"));
  if (!result.ok) throw new Error(result.error);
  return { store, pointer: result.current };
}
const quiet = () => undefined;

describe("AWS Signature V4", () => {
  it("matches AWS's official SigV4 test suite (get-vanilla)", () => {
    // aws4_testsuite/get-vanilla, as vendored in botocore: expected Signature=5fa00fa3…3fbf31.
    const authorization = signV4({
      method: "GET",
      path: "/",
      headers: { host: "example.amazonaws.com", "x-amz-date": "20150830T123600Z" },
      payloadHash: sha(""),
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      service: "service",
      amzDate: "20150830T123600Z",
    });
    expect(authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    );
  });

  it("encodes object keys per path segment, keeping '/'", () => {
    expect(encodeS3Key("snapshots/20261006T065331Z-0a7fda8a1d6c/closures.json")).toBe("snapshots/20261006T065331Z-0a7fda8a1d6c/closures.json");
    expect(encodeS3Key("a b/c+d(e)")).toBe("a%20b/c%2Bd%28e%29");
  });
});

describe("remote publication over the R2 S3 API", () => {
  it("performs the exact existing sequence, with the pointer last, every request signed", async () => {
    const { store, pointer } = await publishedStore();
    const r2 = fakeR2();
    const result = await uploadPublished(store, r2S3Bucket(BUCKET, CREDS, r2.fetchImpl, () => FIXED), quiet);
    expect(result).toMatchObject({ ok: true, unchanged: false, version: pointer.version });
    expect(r2.ops).toEqual([
      "GET current.json",
      `PUT ${pointer.closuresKey}`,
      `GET ${pointer.closuresKey}`,
      `PUT ${pointer.junctionsKey}`,
      `GET ${pointer.junctionsKey}`,
      `PUT ${pointer.provenanceKey!}`,
      `GET ${pointer.provenanceKey!}`,
      "PUT current.json",
      "PUT meta.json",
    ]);
    expect(r2.problems).toEqual([]);
    expect(JSON.parse(r2.objects.get(CURRENT_KEY)!)).toEqual(pointer);
    expect(r2.objects.get(pointer.closuresKey)).toBe(await (await store.get(pointer.closuresKey))!.text());
  });

  it("rejected credentials (401 on the first GET): nothing is written", async () => {
    const { store } = await publishedStore();
    const r2 = fakeR2({ fail: () => 401 });
    const result = await uploadPublished(store, r2S3Bucket(BUCKET, CREDS, r2.fetchImpl), quiet);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/R2 GET current\.json failed: HTTP 401/);
    expect(r2.ops).toEqual(["GET current.json"]);
    expect(r2.objects.size).toBe(0);
  });

  it("a failed snapshot PUT stops before the pointer: the bucket keeps serving its current snapshot", async () => {
    const old = await publishedStore();
    const seeded = fakeR2();
    await uploadPublished(old.store, r2S3Bucket(BUCKET, CREDS, seeded.fetchImpl), quiet);
    const before = seeded.objects.get(CURRENT_KEY);
    const next = await publishedStore(30);
    const r2 = fakeR2({ objects: seeded.objects, fail: (m, k) => (m === "PUT" && k.endsWith("junctions.json") ? 403 : undefined) });
    const result = await uploadPublished(next.store, r2S3Bucket(BUCKET, CREDS, r2.fetchImpl), quiet);
    expect(!result.ok && result.error).toMatch(/R2 PUT .*junctions\.json failed: HTTP 403 AccessDenied/);
    expect(r2.ops).not.toContain("PUT current.json");
    expect(r2.objects.get(CURRENT_KEY)).toBe(before);
  });

  it("a read-back mismatch stops before the pointer", async () => {
    const { store } = await publishedStore();
    const r2 = fakeR2();
    const corrupting: typeof fetch = async (input, init) => {
      const response = await r2.fetchImpl(input, init);
      const url = input instanceof Request ? input.url : input.toString();
      return (init?.method ?? "GET") === "GET" && url.endsWith("closures.json") && response.ok ? new Response((await response.text()) + " ") : response;
    };
    const result = await uploadPublished(store, r2S3Bucket(BUCKET, CREDS, corrupting), quiet);
    expect(!result.ok && result.error).toMatch(/Read-back of .*closures\.json/);
    expect(r2.ops).not.toContain("PUT current.json");
  });

  it("a failed pointer PUT leaves the previous pointer in place", async () => {
    const old = await publishedStore();
    const seeded = fakeR2();
    await uploadPublished(old.store, r2S3Bucket(BUCKET, CREDS, seeded.fetchImpl), quiet);
    const before = seeded.objects.get(CURRENT_KEY);
    const next = await publishedStore(30);
    const r2 = fakeR2({ objects: seeded.objects, fail: (m, k) => (m === "PUT" && k === CURRENT_KEY ? 500 : undefined) });
    const result = await uploadPublished(next.store, r2S3Bucket(BUCKET, CREDS, r2.fetchImpl), quiet);
    expect(result.ok).toBe(false);
    expect(r2.objects.get(CURRENT_KEY)).toBe(before);
  });

  it("the replacement safeguards still apply against what the bucket serves (older data refused)", async () => {
    const newer = await publishedStore(60);
    const r2 = fakeR2();
    await uploadPublished(newer.store, r2S3Bucket(BUCKET, CREDS, r2.fetchImpl), quiet);
    const older = await publishedStore(0);
    const result = await uploadPublished(older.store, r2S3Bucket(BUCKET, CREDS, r2.fetchImpl), quiet);
    expect(!result.ok && result.error).toMatch(/older than the data being served/);
  });
});

describe("credentials from the environment", () => {
  it("names missing variables, never values", () => {
    expect(() => r2S3BucketFromEnv(BUCKET, { R2_ENDPOINT: CREDS.endpoint })).toThrow(/R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY/);
    expect(() => r2S3BucketFromEnv(BUCKET, { R2_ENDPOINT: "http://insecure.example", R2_ACCESS_KEY_ID: "x", R2_SECRET_ACCESS_KEY: "y" })).toThrow(/must be an https/);
  });

  it("never puts credentials into the bucket label or error messages", async () => {
    const r2 = fakeR2({ fail: () => 403 });
    const bucket = r2S3BucketFromEnv(BUCKET, { R2_ENDPOINT: CREDS.endpoint, R2_ACCESS_KEY_ID: CREDS.accessKeyId, R2_SECRET_ACCESS_KEY: CREDS.secretAccessKey }, r2.fetchImpl);
    const error = await bucket.get("current.json").then(() => null, (e: unknown) => e as Error);
    for (const text of [bucket.label, error?.message ?? ""]) {
      expect(text).not.toContain(CREDS.secretAccessKey);
      expect(text).not.toContain(CREDS.accessKeyId);
    }
    expect(error?.message).toBe("R2 GET current.json failed: HTTP 403 AccessDenied");
  });
});
