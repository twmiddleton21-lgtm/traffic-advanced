/**
 * D7 (approved): an S4 stretch can establish Class B only if its own junction labels (JunctionNumberFrom/To) reconcile with the
 * S5 junctions at the ends of its traced route path. Labels are compared, never inferred or repaired. A label that isn't a
 * road + junction number (e.g. "A4130", "WEEFORD ISLAND") can't be reconciled, so the stretch can't establish B.
 * The S4 data itself is untouched and Class A is unaffected.
 */

/** "M5 JUNCTION 3" / "M5 J3" / "M5J3" / "J3" (on road M5) → "M5J3". Null when the label isn't road + junction number. */
export function canonicalJunctionLabel(label: string, road: string): string | null {
  const s = label.toUpperCase().replace(/JUNCTION/g, "J").replace(/[()\s]/g, "");
  const full = /^([ABM]\d+M?)J(\d+[A-Z]?)$/.exec(s);
  if (full) return `${full[1]}J${full[2]}`;
  const bare = /^J(\d+[A-Z]?)$/.exec(s);
  return bare ? `${road.toUpperCase().replace(/[()\s]/g, "")}J${bare[1]}` : null;
}

export type LabelCheck = "reconciled" | "labels-not-reconcilable" | "labels-disagree-with-path";

/**
 * @param fromLabel/toLabel S4 stretch labels.
 * @param startJunctionNames/endJunctionNames S5 junction names at the path's first/last node (a node can belong to several junctions).
 */
export function checkStretchLabels(
  road: string,
  fromLabel: string,
  toLabel: string,
  startJunctionNames: string[],
  endJunctionNames: string[],
): LabelCheck {
  const from = canonicalJunctionLabel(fromLabel, road);
  const to = canonicalJunctionLabel(toLabel, road);
  if (!from || !to) return "labels-not-reconcilable";
  const starts = startJunctionNames.map((n) => canonicalJunctionLabel(n, road));
  const ends = endJunctionNames.map((n) => canonicalJunctionLabel(n, road));
  return starts.includes(from) && ends.includes(to) ? "reconciled" : "labels-disagree-with-path";
}
