/**
 * Records SHA-256 fingerprints of every file that decides a diversion classification, freezing the rules for P0 evaluation
 * (frozen by the owner on 2026-10-05, after decisions D1–D9). shared/diversion/rules-freeze.test.ts fails if any of them changes.
 *
 * Re-run ONLY with the owner's explicit approval of a rule change: node scripts/p0/freeze-rules.ts "<reason and approval reference>"
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

export const FROZEN_FILES = [
  "shared/diversion/rules.ts",
  "shared/diversion/evaluate-b.ts",
  "shared/diversion/evaluate-a.ts",
  "shared/diversion/closure-groups.ts",
  "shared/diversion/stretch-index.ts",
  "shared/diversion/stretch-labels.ts",
  "shared/diversion/s2-only.ts",
  "shared/diversion/classify.ts",
  "shared/network/graph.ts",
  "shared/geo/distance.ts",
  "shared/sources/nh-closures/merge.ts",
  "shared/sources/nh-closures/normalise.ts",
  "shared/sources/nh-arcgis/normalise.ts",
] as const;

/** Line endings are normalised so a checkout's CRLF/LF setting can't break the freeze. */
export const fingerprint = (path: string): string =>
  createHash("sha256").update(readFileSync(path, "utf8").replace(/\r\n/g, "\n")).digest("hex");

const reason = process.argv[2];
if (process.argv[1]?.endsWith("freeze-rules.ts")) {
  if (!reason) throw new Error('Give the reason and approval reference, e.g. "P0 freeze after D1-D9 (owner, 2026-10-05)".');
  const freeze = {
    frozenAt: new Date().toISOString(),
    reason,
    files: Object.fromEntries(FROZEN_FILES.map((f) => [f, fingerprint(f)])),
  };
  writeFileSync("fixtures/p0/rules-freeze.json", JSON.stringify(freeze, null, 2) + "\n");
  console.log(`Frozen ${FROZEN_FILES.length} files: ${reason}`);
}
