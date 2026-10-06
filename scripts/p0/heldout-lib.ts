/**
 * Pure logic for the P0 held-out false-positive evaluation (SPECIFICATION §13.1 criteria 12–16).
 * No I/O here, so selection and scoring are unit-tested independently of captures.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fingerprint, FROZEN_FILES } from "./freeze-rules.ts";

export const FREEZE_FILE = "fixtures/p0/rules-freeze.json";

/** Throws unless every frozen classification file matches the recorded freeze. Returns the freeze file's own hash. */
export function assertRulesFrozen(): { freezeHash: string; reason: string } {
  const raw = readFileSync(FREEZE_FILE, "utf8");
  const freeze = JSON.parse(raw) as { reason: string; files: Record<string, string> };
  const changed = FROZEN_FILES.filter((f) => freeze.files[f] !== fingerprint(f));
  if (changed.length > 0) throw new Error(`Rules changed since the P0 freeze: ${changed.join(", ")}. Held-out evaluation refused.`);
  return { freezeHash: createHash("sha256").update(raw.replace(/\r\n/g, "\n")).digest("hex"), reason: freeze.reason };
}

/**
 * SHA-256 of every file in a capture directory (excluding its git-ignored analysis/ outputs), so a held-out set is pinned to
 * the exact capture it came from. Paths use forward slashes.
 */
export function hashCapture(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) {
        if (relative(dir, path) !== "analysis") walk(path);
      } else {
        out[relative(dir, path).replaceAll("\\", "/")] = createHash("sha256").update(readFileSync(path)).digest("hex");
      }
    }
  };
  walk(dir);
  return out;
}

/** Files whose content differs from (or is missing versus) a recorded capture manifest. */
export function captureChanges(dir: string, recorded: Record<string, string>): string[] {
  const now = hashCapture(dir);
  const keys = new Set([...Object.keys(now), ...Object.keys(recorded)]);
  return [...keys].filter((k) => now[k] !== recorded[k]).sort();
}

/** Deterministic PRNG (mulberry32) so a selection can be reproduced from its recorded seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unbiased seeded Fisher–Yates shuffle (returns a new array). */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const random = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export interface Candidate {
  key: string;
  outcome: "B" | "D";
  /** First failing evidence item for D; "" for B. */
  failed: string;
}

/**
 * Selects the held-out set: EVERY B, then D items drawn round-robin across failing-evidence strata in a seeded random order
 * until `target` is reached (or the eligible population runs out). Keys are sorted first so the result depends only on the
 * population and the seed, never on input order.
 */
export function selectHeldOut(population: Candidate[], target: number, seed: number): { selected: string[]; shortfall: number } {
  const sorted = [...population].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const selected = sorted.filter((c) => c.outcome === "B").map((c) => c.key);
  const random = seededRandom(seed);
  const strata = new Map<string, string[]>();
  for (const c of sorted.filter((x) => x.outcome === "D")) strata.set(c.failed, [...(strata.get(c.failed) ?? []), c.key]);
  for (const keys of strata.values()) {
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [keys[i], keys[j]] = [keys[j]!, keys[i]!];
    }
  }
  const order = [...strata.keys()].sort();
  while (selected.length < target && order.some((s) => (strata.get(s)?.length ?? 0) > 0)) {
    for (const s of order) {
      const next = strata.get(s)?.shift();
      if (next && selected.length < target) selected.push(next);
    }
  }
  return { selected, shortfall: Math.max(0, target - selected.length) };
}

/** Ground truth recorded by a reviewer: the correct official stretch for this closure-direction, none, or unsure (disputed). */
export type GroundTruth = { kind: "stretch"; stretchId: string } | { kind: "no-correct-stretch" } | { kind: "unsure" };

export function parseGroundTruth(value: string | null): GroundTruth | null {
  if (value === null || value.trim() === "") return null;
  if (value === "no-correct-stretch") return { kind: "no-correct-stretch" };
  if (value === "unsure") return { kind: "unsure" };
  const m = /^stretch:([0-9a-f-]{36})$/.exec(value.trim().toLowerCase());
  if (m) return { kind: "stretch", stretchId: m[1]! };
  throw new Error(`Unrecognised ground truth "${value}". Use "stretch:<guid>", "no-correct-stretch" or "unsure".`);
}

export type Verdict = "true-positive" | "false-positive" | "false-negative" | "true-negative";

/** Scores one item. A B pointing at any stretch other than the ground truth (including "none") is a false positive. */
export function score(outcome: { outcome: "B"; stretchId: string } | { outcome: "D" }, truth: Exclude<GroundTruth, { kind: "unsure" }>): Verdict {
  if (outcome.outcome === "B") return truth.kind === "stretch" && truth.stretchId === outcome.stretchId ? "true-positive" : "false-positive";
  return truth.kind === "stretch" ? "false-negative" : "true-negative";
}

/** One-sided exact (Clopper–Pearson) 95% upper bound on a rate after `failures` in `n` trials. */
export function upperBound95(failures: number, n: number): number {
  if (n <= 0) return 1;
  if (failures >= n) return 1;
  if (failures === 0) return 1 - Math.pow(0.05, 1 / n);
  const cdf = (p: number): number => {
    let sum = 0;
    let term = Math.pow(1 - p, n);
    for (let k = 0; k <= failures; k++) {
      sum += term;
      term *= ((n - k) / (k + 1)) * (p / (1 - p));
    }
    return sum;
  };
  let lo = failures / n;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) > 0.05) lo = mid;
    else hi = mid;
  }
  return hi;
}
