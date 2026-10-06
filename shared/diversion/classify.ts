import type { AEvaluation } from "./evaluate-a.ts";
import type { BEvaluation } from "./evaluate-b.ts";

/**
 * Final classification (SPECIFICATION §5.1). C ("Calculated HGV route — not an official diversion") is reserved and
 * not implemented in V1: nothing in this module produces it. A and B are separate claims, kept side by side, never merged.
 */

export type DiversionClass = "A" | "B" | "C" | "D";

export const LABELS = {
  A: "Official diversion information for this roadworks event",
  B: "Official NH diversion — match based on available data",
  C: "Calculated HGV route — not an official diversion",
  D: "No reliable diversion available",
} as const satisfies Record<DiversionClass, string>;

/**
 * Which official NH record a closure comes from (approved decision D3):
 * - `nh-s1`: Road and Lane Closures API (has Network Model link ids, so B is possible);
 * - `nh-s2`: Public Scheduled Road Closures only, with no S1 situation (B is never possible).
 */
export type ClosureSource = "nh-s1" | "nh-s2";

export interface Classification {
  source: ClosureSource;
  classes: Exclude<DiversionClass, "C">[];
  a: AEvaluation;
  b: BEvaluation;
}

export function classify(source: ClosureSource, a: AEvaluation, b: BEvaluation): Classification {
  if (source === "nh-s2" && b.outcome === "B") {
    // Defensive: S2-only closures lack S1/network evidence and must never be B (decision D3).
    throw new Error("Invariant violated: an S2-only closure cannot be classified B.");
  }
  const classes: Exclude<DiversionClass, "C">[] = [];
  if (a.outcome === "A") classes.push("A");
  if (b.outcome === "B") classes.push("B");
  if (classes.length === 0) classes.push("D");
  return { source, classes, a, b };
}
