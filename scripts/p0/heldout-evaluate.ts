/**
 * P0 held-out evaluation (SPECIFICATION §13.1 criteria 13–16). Joins the completed BLIND worksheet with the separately stored
 * frozen-matcher outcomes and scores them. Refuses to score if:
 *   - the classification rules changed since the set was built (freeze hash mismatch);
 *   - any item lacks a review, or an owner-sample / "unsure" / disputed item lacks the owner's review;
 *   - the set is a dry run (unless --dry-run is passed).
 * Where the owner's review differs from the first review, the owner's is the ground truth and the item is listed as disputed.
 * Writes report.json and report.md next to the worksheet.
 * Usage: node scripts/p0/heldout-evaluate.ts <held-out dir> [--dry-run]
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { assertRulesFrozen, captureChanges, parseGroundTruth, score, upperBound95, type GroundTruth, type Verdict } from "./heldout-lib.ts";

interface Review {
  groundTruth: string | null;
  reviewer: string | null;
  reviewedAt: string | null;
  notes: string;
}
interface Item {
  id: string;
  key: string;
  nhComments: string[];
  ownerSample: boolean;
  review: Review;
  ownerReview: Review;
}
type Outcome = { b: { outcome: "B"; stretchId: string; stretchLabel: string } | { outcome: "D"; failed: string; reason: string } };

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
if (!dir) throw new Error("Usage: heldout-evaluate.ts <held-out dir> [--dry-run]");
const allowDryRun = args.includes("--dry-run");

const selection = JSON.parse(await readFile(join(dir, "selection.json"), "utf8")) as {
  dryRun: boolean;
  shortfall: number;
  target: number;
  dataset: string;
  captures: { openDir: string; nhApiDir: string };
  captureManifest: { open: Record<string, string>; nhApi: Record<string, string> };
  rulesFreeze: { hash: string };
};
const { items } = JSON.parse(await readFile(join(dir, "worksheet.json"), "utf8")) as { items: Item[] };
const { outcomes, rulesFreeze } = JSON.parse(await readFile(join(dir, "matcher-outcomes.json"), "utf8")) as {
  outcomes: Record<string, Outcome>;
  rulesFreeze: { hash: string };
};

if (selection.dryRun && !allowDryRun) throw new Error("This is a dry-run set. It is not evidence; pass --dry-run only to test the tooling.");
const { freezeHash } = assertRulesFrozen();
if (freezeHash !== selection.rulesFreeze.hash || freezeHash !== rulesFreeze.hash) {
  throw new Error("The rules freeze changed after this held-out set was built. Rebuild is not allowed to tune on held-out data; ask the owner.");
}

// The capture must be exactly the one the set was built from (if it is still on disk).
for (const [dirPath, manifest] of [
  [selection.captures.openDir, selection.captureManifest.open],
  [selection.captures.nhApiDir, selection.captureManifest.nhApi],
] as const) {
  if (!existsSync(dirPath)) {
    console.warn(`Capture ${dirPath} is not on disk, so its integrity can't be re-verified (manifest kept in selection.json).`);
    continue;
  }
  const changed = captureChanges(dirPath, manifest);
  if (changed.length > 0) throw new Error(`Capture ${dirPath} changed since the held-out set was built: ${changed.slice(0, 5).join(", ")}`);
}

const problems: string[] = [];
const disputed: { id: string; first: string | null; owner: string | null }[] = [];
const truths = new Map<string, Exclude<GroundTruth, { kind: "unsure" }>>();
for (const item of items) {
  const first = parseGroundTruth(item.review.groundTruth);
  const owner = parseGroundTruth(item.ownerReview.groundTruth);
  if (!first) {
    problems.push(`${item.id}: not reviewed`);
    continue;
  }
  const needsOwner = item.ownerSample || first.kind === "unsure";
  if (needsOwner && !owner) {
    problems.push(`${item.id}: needs the owner's review${first.kind === "unsure" ? ' (first review "unsure")' : ""}`);
    continue;
  }
  if (owner && item.ownerReview.groundTruth !== item.review.groundTruth) {
    disputed.push({ id: item.id, first: item.review.groundTruth, owner: item.ownerReview.groundTruth });
  }
  const final = owner ?? first;
  if (final.kind === "unsure") {
    problems.push(`${item.id}: still "unsure" after owner review`);
    continue;
  }
  truths.set(item.key, final);
}
if (problems.length > 0) {
  console.error(`Evaluation refused: ${problems.length} item(s) incomplete.\n- ${problems.slice(0, 20).join("\n- ")}${problems.length > 20 ? "\n- …" : ""}`);
  process.exitCode = 1;
} else {
  const verdicts = items.map((item) => {
    const o = outcomes[item.key];
    if (!o) throw new Error(`${item.id}: no matcher outcome stored for ${item.key}`);
    const b = o.b.outcome === "B" ? { outcome: "B" as const, stretchId: o.b.stretchId } : { outcome: "D" as const };
    return { id: item.id, key: item.key, verdict: score(b, truths.get(item.key)!), outcome: o.b, comment: item.nhComments[0] ?? "" };
  });
  const n = verdicts.length;
  const count = (v: Verdict) => verdicts.filter((x) => x.verdict === v).length;
  const fp = count("false-positive");
  const predictedB = verdicts.filter((v) => v.outcome.outcome === "B").length;
  const report = {
    dataset: selection.dataset,
    captures: selection.captures,
    dryRun: selection.dryRun,
    reviewed: n,
    target: selection.target,
    shortfall: selection.shortfall,
    truePositives: count("true-positive"),
    falsePositives: fp,
    falseNegatives: count("false-negative"),
    trueNegatives: count("true-negative"),
    predictedB,
    fpRateUpper95AmongAllReviewed: upperBound95(fp, n),
    fpRateUpper95AmongPredictedB: upperBound95(fp, predictedB),
    disputed,
    falsePositiveItems: verdicts.filter((v) => v.verdict === "false-positive"),
    falseNegativeItems: verdicts.filter((v) => v.verdict === "false-negative").map((v) => ({ ...v, reason: v.outcome.outcome === "D" ? v.outcome.failed : "" })),
    criteria: {
      atLeastTargetReviewed: n >= selection.target && selection.shortfall === 0,
      zeroFalsePositives: fp === 0,
    },
  };
  const pass = report.criteria.atLeastTargetReviewed && report.criteria.zeroFalsePositives && !selection.dryRun;
  const md = [
    `# Held-out evaluation${selection.dryRun ? " (DRY RUN: not evidence)" : ""}`,
    "",
    `Reviewed ${n} closure-directions (target ${selection.target}, shortfall ${selection.shortfall}).`,
    "",
    `| True positive | False positive | False negative | True negative | Predicted B |`,
    `|---|---|---|---|---|`,
    `| ${report.truePositives} | **${fp}** | ${report.falseNegatives} | ${report.trueNegatives} | ${predictedB} |`,
    "",
    `95% upper bound on the false-positive rate: ${(report.fpRateUpper95AmongAllReviewed * 100).toFixed(2)}% of reviewed items; ` +
      `${(report.fpRateUpper95AmongPredictedB * 100).toFixed(1)}% of predicted B (n=${predictedB}).`,
    "",
    `Disputed (first review vs owner): ${disputed.length}. Criteria: ≥ target reviewed ${report.criteria.atLeastTargetReviewed ? "✅" : "❌"} · zero false positives ${report.criteria.zeroFalsePositives ? "✅" : "❌"}.`,
    "",
    `**Result: ${pass ? "PASS" : selection.dryRun ? "DRY RUN (no result)" : "FAIL: per SPECIFICATION §13.1(21), B is disabled for V1 unless the owner decides otherwise"}**`,
  ].join("\n");
  await writeFile(join(dir, "report.json"), JSON.stringify(report, null, 2));
  await writeFile(join(dir, "report.md"), md + "\n");
  console.log(md);
}
