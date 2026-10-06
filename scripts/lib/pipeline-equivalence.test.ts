import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureChanges, hashCapture } from "../p0/heldout-lib.ts";
import { describeBResults, runMatcher, summariseRun } from "./matcher-pipeline.ts";

/**
 * Proves the held-out tools and normal analysis run the SAME frozen matcher pipeline and can't silently diverge.
 * Uses fixtures/p0/mini-capture: real Day-1 data trimmed to 4 situations, whose outcomes were verified equal to the full
 * Day-1 run when it was extracted (scripts/fixtures/extract-mini-capture.ts).
 */

const ROOT = process.cwd();
const source = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const expected = JSON.parse(source("fixtures/p0/mini-capture/expected.json")) as {
  openDirName: string;
  nhApiDirName: string;
  classes: Record<string, number>;
  outcomes: Record<string, string>;
};

/** Matcher internals that only the shared pipeline may call. */
const MATCHER_INTERNALS = /\b(evaluateB|evaluateA|groupClosures|buildStretchIndex|buildNetwork|classify|classifyS2Only|mergeS1Pages|normaliseSituation)\s*\(/;

describe("static: one pipeline, no duplicated matcher logic", () => {
  for (const script of ["scripts/analysis/run-matcher.ts", "scripts/p0/heldout-build.ts"]) {
    it(`${script} runs the matcher and summarises only through scripts/lib/matcher-pipeline.ts`, () => {
      const text = source(script);
      expect(text).toMatch(/import \{[^}]*\brunMatcher\b[^}]*\bsummariseRun\b[^}]*\} from "\.\.\/lib\/matcher-pipeline\.ts"/);
      expect(text).not.toMatch(MATCHER_INTERNALS);
      expect(text).not.toMatch(/from "\.\.\/\.\.\/shared\/diversion\/(evaluate-b|closure-groups|classify|s2-only)\.ts"/);
      expect(text).not.toMatch(/from "\.\.\/\.\.\/shared\/network\/graph\.ts"/);
    });
  }

  it("the held-out evaluator never runs the matcher: it only scores stored outcomes", () => {
    const text = source("scripts/p0/heldout-evaluate.ts");
    expect(text).not.toMatch(/runMatcher|matcher-pipeline/);
    expect(text).not.toMatch(MATCHER_INTERNALS);
  });
});

// Unpack the gzipped mini capture into a temp folder with the real capture folder names.
const work = join(tmpdir(), `traffic-advanced-equivalence-${process.pid}`);
const openDir = join(work, expected.openDirName);
const apiDir = join(work, expected.nhApiDirName);

beforeAll(() => {
  rmSync(work, { recursive: true, force: true });
  const base = join(ROOT, "fixtures/p0/mini-capture");
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".gz")) {
        const target = join(work, relative(base, path).replace(/\.gz$/, ""));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, gunzipSync(readFileSync(path)));
      }
    }
  };
  walk(base);
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("runtime: the shared pipeline on real data", () => {
  it("reproduces the outcomes verified against the full Day-1 run", async () => {
    const run = await runMatcher(openDir, apiDir);
    const outcomes = Object.fromEntries(run.results.map((r) => [r.key, r.b.outcome === "B" ? `B:${r.b.stretchId}` : `D:${r.b.failed}`]));
    expect(outcomes).toEqual(expected.outcomes);
    expect(summariseRun(run).classes).toEqual(expected.classes);
    expect(describeBResults(run).map((b) => b.key).sort()).toEqual(Object.keys(expected.outcomes).filter((k) => expected.outcomes[k]!.startsWith("B:")).sort());
  });
});

describe("end to end: run-matcher.ts and heldout-build.ts produce identical summaries", () => {
  it("both scripts, run on the same capture, report the same totals, B candidates and D reasons", () => {
    const node = process.execPath;
    execFileSync(node, ["scripts/analysis/run-matcher.ts", openDir, apiDir], { cwd: ROOT, stdio: "pipe" });
    execFileSync(node, ["scripts/p0/heldout-build.ts", openDir, apiDir, "--dry-run", "--target", "10"], { cwd: ROOT, stdio: "pipe" });
    const analysis = JSON.parse(readFileSync(join(apiDir, "analysis", "matcher-results.json"), "utf8")) as Record<string, unknown>;
    const heldout = JSON.parse(readFileSync(join(apiDir, "analysis", "heldout-dryrun", "run-summary.json"), "utf8")) as Record<string, unknown>;
    expect(heldout["summary"]).toEqual(analysis["summary"]);
    expect(heldout["bResults"]).toEqual(analysis["bResults"]);
    expect(heldout["dReasons"]).toEqual(analysis["dReasons"]);
    expect(heldout["dataset"]).toBe("development-dry-run (NOT held-out evidence)");
    expect(analysis["dataset"]).toBe("analysis");
  }, 120_000);
});

describe("capture pinning", () => {
  it("detects any change to a pinned capture file, and ignores the analysis/ outputs", () => {
    const manifest = hashCapture(apiDir);
    expect(Object.keys(manifest).some((k) => k.startsWith("analysis/"))).toBe(false);
    expect(captureChanges(apiDir, manifest)).toEqual([]);
    const page = join(apiDir, "s1", "s1-planned-page000.json");
    writeFileSync(page, readFileSync(page, "utf8") + " ");
    expect(captureChanges(apiDir, manifest)).toEqual(["s1/s1-planned-page000.json"]);
  });
});
