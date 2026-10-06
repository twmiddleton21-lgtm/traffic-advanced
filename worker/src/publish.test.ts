import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { closuresSnapshotSchema, type ClosuresSnapshot } from "../../shared/api/closures.ts";
import { junctionsSnapshotSchema } from "../../shared/api/junctions.ts";
import { memoryStore } from "./memory-store.ts";
import { integrityProblems, publishSnapshot, PUBLISH_RULES, recordFailedAttempt, replacementProblem, sha256Hex } from "./publish.ts";
import { CURRENT_KEY, META_KEY, currentPointerSchema, publishMetaSchema } from "./store.ts";

// Real data: the contract-valid development snapshot exported from the Day-1 capture by the frozen matcher.
const closures = closuresSnapshotSchema.parse(JSON.parse(readFileSync("web/src/data/dev-snapshot.json", "utf8")));
const junctions: unknown = JSON.parse(readFileSync("web/src/data/dev-junctions.json", "utf8"));
const later = (snapshot: ClosuresSnapshot, minutes: number, changes: Partial<ClosuresSnapshot> = {}): ClosuresSnapshot => ({
  ...snapshot,
  provenance: { ...snapshot.provenance, capturedAt: new Date(Date.parse(snapshot.provenance.capturedAt) + minutes * 60_000).toISOString() },
  ...changes,
});
const t0 = new Date("2026-10-05T13:00:00Z");

let store: ReturnType<typeof memoryStore>;
beforeEach(() => {
  store = memoryStore();
});
const pointer = () => currentPointerSchema.parse(JSON.parse(store.objects.get(CURRENT_KEY)!));
const meta = () => publishMetaSchema.parse(JSON.parse(store.objects.get(META_KEY)!));

describe("publishSnapshot (last known good)", () => {
  it("publishes a valid pair: versioned objects first, then the current pointer, and logs the success", async () => {
    const result = await publishSnapshot(store, { closures, junctions }, t0);
    expect(result.ok).toBe(true);
    const p = pointer();
    expect(p.capturedAt).toBe(closures.provenance.capturedAt);
    expect(p.closures).toBe(closures.closures.length);
    expect(JSON.parse(store.objects.get(p.closuresKey)!)).toEqual(closures);
    expect(store.objects.has(p.junctionsKey)).toBe(true);
    expect(meta()).toMatchObject({ lastSuccessAt: t0.toISOString(), lastError: null });
  });

  it("stores the matcher's output unchanged (A/B/D, evidence and review notes are carried, never recomputed)", async () => {
    await publishSnapshot(store, { closures, junctions }, t0);
    const stored = closuresSnapshotSchema.parse(JSON.parse(store.objects.get(pointer().closuresKey)!));
    expect(stored.closures.map((c) => [c.id, c.classes, c.reviewNote, c.matchedRoute?.evidence])).toEqual(
      closures.closures.map((c) => [c.id, c.classes, c.reviewNote, c.matchedRoute?.evidence]),
    );
  });

  it("rejects a snapshot that fails the contract and keeps serving the last good one", async () => {
    await publishSnapshot(store, { closures, junctions }, t0);
    const before = pointer();
    // B without its matched route breaks a contract invariant.
    const broken = later(closures, 5, { closures: closures.closures.map((c) => (c.classes.includes("B") ? { ...c, matchedRoute: null } : c)) });
    const result = await publishSnapshot(store, { closures: broken, junctions }, new Date(t0.getTime() + 300_000));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/failed the contract/);
    expect(pointer()).toEqual(before);
    expect(meta().lastSuccessAt).toBe(t0.toISOString());
    expect(meta().lastError).toMatch(/failed the contract/);
  });

  it("rejects invalid junctions too, publishing nothing", async () => {
    const result = await publishSnapshot(store, { closures, junctions: { junctions: "not a list" } }, t0);
    expect(result.ok).toBe(false);
    expect(store.objects.has(CURRENT_KEY)).toBe(false);
  });

  it("never replaces closures with an empty snapshot (an upstream failure must not become 'no closures')", async () => {
    await publishSnapshot(store, { closures, junctions }, t0);
    const result = await publishSnapshot(store, { closures: later(closures, 5, { closures: [] }), junctions }, t0);
    expect(!result.ok && result.error).toMatch(/empty snapshot/);
    expect(pointer().closures).toBe(closures.closures.length);
  });

  it("never replaces newer data with data captured earlier", async () => {
    await publishSnapshot(store, { closures: later(closures, 10), junctions }, t0);
    const result = await publishSnapshot(store, { closures, junctions }, t0);
    expect(!result.ok && result.error).toMatch(/older than the data being served/);
  });

  it("publishes a newer capture as a new version", async () => {
    await publishSnapshot(store, { closures, junctions }, t0);
    const first = pointer().version;
    const result = await publishSnapshot(store, { closures: later(closures, 5), junctions }, t0);
    expect(result.ok).toBe(true);
    expect(pointer().version).not.toBe(first);
  });

  it("records a failed refresh (e.g. an incomplete upstream capture) without touching what is served", async () => {
    await publishSnapshot(store, { closures, junctions }, t0);
    const before = pointer();
    const result = await recordFailedAttempt(store, "Snapshot build failed: capture recorded 1 problem(s)", new Date(t0.getTime() + 60_000));
    expect(result.current).toEqual(before);
    expect(pointer()).toEqual(before);
    expect(meta()).toMatchObject({ lastSuccessAt: t0.toISOString(), lastError: "Snapshot build failed: capture recorded 1 problem(s)" });
  });
});

describe("integrity, replacement and verification checks before a snapshot becomes current", () => {
  const junctionsParsed = junctionsSnapshotSchema.parse(junctions);
  const withClosures = (f: (cs: ClosuresSnapshot["closures"]) => ClosuresSnapshot["closures"]): ClosuresSnapshot => ({ ...closures, closures: f(closures.closures) });
  const rejects = async (candidate: { closures: unknown; junctions: unknown }, pattern: RegExp) => {
    await publishSnapshot(store, { closures, junctions }, t0);
    const before = pointer();
    const result = await publishSnapshot(store, candidate, t0);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(pattern);
    expect(pointer()).toEqual(before);
  };

  it("rejects duplicate closure ids", async () => {
    await rejects({ closures: withClosures((cs) => [...cs, cs[0]!]), junctions }, /duplicate closure id/);
  });

  it("rejects a closure that ends before it starts", async () => {
    await rejects({ closures: withClosures((cs) => cs.map((c, i) => (i === 0 ? { ...c, window: { start: c.window.end, end: c.window.start } } : c))), junctions }, /ends before it starts/);
  });

  it("rejects a B route with no geometry (it couldn't be drawn)", async () => {
    const stripped = withClosures((cs) =>
      cs.map((c) => (c.matchedRoute ? { ...c, matchedRoute: { ...c.matchedRoute, routes: c.matchedRoute.routes.map((r) => ({ ...r, geometry: [] })) } } : c)),
    );
    await rejects({ closures: stripped, junctions }, /has no geometry/);
  });

  it("rejects mock data and duplicate junction names", () => {
    expect(integrityProblems({ ...closures, provenance: { ...closures.provenance, kind: "mock" } }, junctionsParsed)).toContain("mock data can't be published");
    const dup = { ...junctionsParsed, junctions: [...junctionsParsed.junctions, junctionsParsed.junctions[0]!] };
    expect(integrityProblems(closures, dup).join()).toMatch(/duplicate junction/);
    expect(integrityProblems(closures, junctionsParsed)).toEqual([]);
  });

  it("rejects an abnormal drop in closures (likely a partial upstream failure), but allows normal change", () => {
    const current = { capturedAt: "2026-10-05T12:00:00Z", closures: 700 };
    expect(PUBLISH_RULES.minRetainedFraction).toBe(0.5);
    expect(replacementProblem(current, { capturedAt: "2026-10-05T12:05:00Z", closures: 349 })).toMatch(/below 50%/);
    expect(replacementProblem(current, { capturedAt: "2026-10-05T12:05:00Z", closures: 350 })).toBeNull();
    expect(replacementProblem(current, { capturedAt: "2026-10-05T12:05:00Z", closures: 900 })).toBeNull();
    expect(replacementProblem(null, { capturedAt: "2026-10-05T12:05:00Z", closures: 1 })).toBeNull();
  });

  it("does not write the pointer if a stored object can't be read back intact", async () => {
    const lossy = memoryStore();
    const truncating = { ...lossy, put: (key: string, value: string) => lossy.put(key, key.startsWith("snapshots/") ? value.slice(0, -10) : value) };
    const result = await publishSnapshot(truncating, { closures, junctions }, t0);
    expect(!result.ok && result.error).toMatch(/Read-back of .* didn't match/);
    expect(lossy.objects.has(CURRENT_KEY)).toBe(false);
  });

  it("records each object's SHA-256 and the build pins in the pointer", async () => {
    const pins = { rulesFreezeHash: "a".repeat(64), captures: { "2026-10-05T1208Z-nh-api": "b".repeat(64) } };
    await publishSnapshot(store, { closures, junctions, pins }, t0);
    const p = pointer();
    expect(p.closuresSha256).toBe(await sha256Hex(store.objects.get(p.closuresKey)!));
    expect(p.junctionsSha256).toBe(await sha256Hex(store.objects.get(p.junctionsKey)!));
    expect(p.pins).toEqual(pins);
  });
});

describe("50% snapshot-drop safeguard on the publication path (owner-approved 2026-10-05)", () => {
  // Real data: the served snapshot has 16 closures, so the boundary is 8 (exactly half is accepted; fewer is rejected).
  const served = closures.closures.length;
  const candidate = (count: number, minutes: number) => later(closures, minutes, { closures: closures.closures.slice(0, count) });

  it("states the threshold and comparison in plain sight", () => {
    expect(served).toBe(16);
    expect(PUBLISH_RULES).toEqual({ minRetainedFraction: 0.5 });
  });

  it("accepts a candidate just above the threshold (9 of 16)", async () => {
    await publishSnapshot(store, { closures, junctions }, t0);
    expect((await publishSnapshot(store, { closures: candidate(9, 5), junctions }, t0)).ok).toBe(true);
    expect(pointer().closures).toBe(9);
  });

  it("accepts a candidate at exactly the threshold (8 of 16)", async () => {
    await publishSnapshot(store, { closures, junctions }, t0);
    expect((await publishSnapshot(store, { closures: candidate(8, 5), junctions }, t0)).ok).toBe(true);
  });

  it("rejects a candidate below the threshold (7 of 16) and leaves the current pointer untouched", async () => {
    await publishSnapshot(store, { closures, junctions }, t0);
    const before = store.objects.get(CURRENT_KEY);
    const result = await publishSnapshot(store, { closures: candidate(7, 5), junctions }, new Date(t0.getTime() + 300_000));
    expect(!result.ok && result.error).toMatch(/Rejected 7 closures replacing 16: below 50%/);
    expect(store.objects.get(CURRENT_KEY)).toBe(before);
    expect(meta()).toMatchObject({ lastSuccessAt: t0.toISOString(), lastError: expect.stringMatching(/below 50%/) as unknown });
  });
});

describe("publication time", () => {
  it("rejects a publication time earlier than the capture time and leaves the current pointer untouched", async () => {
    await publishSnapshot(store, { closures, junctions }, t0);
    const before = store.objects.get(CURRENT_KEY);
    const newer = later(closures, 30); // captured 12:38:26
    const result = await publishSnapshot(store, { closures: newer, junctions }, new Date("2026-10-05T12:30:00Z"));
    expect(!result.ok && result.error).toMatch(/earlier than the capture time/);
    expect(store.objects.get(CURRENT_KEY)).toBe(before);
  });

  it("writes the given publication time to the pointer", async () => {
    await publishSnapshot(store, { closures, junctions }, t0);
    expect(pointer().publishedAt).toBe(t0.toISOString());
  });
});
