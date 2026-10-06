/** Heights in metres and feet-inches, as on UK bridge signs (e.g. "4.4 m (14′5″)"). Rounds inches down so it never overstates clearance. */
export function formatHeight(metres: number): string {
  const totalInches = Math.floor((metres / 0.0254) + 1e-9);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${metres} m (${feet}′${inches}″)`;
}

/** A recorded NH restriction in plain words. */
export function formatRestriction(r: { kind: string; value: number | null; unit: string }): string {
  if (r.value === null) return `${capitalise(r.kind)} restriction (value not recorded)`;
  if (r.kind === "height") return `Height limit ${formatHeight(r.value)}`;
  if (r.kind === "weight") return `Weight limit ${r.value} t`;
  if (r.kind === "width") return `Width limit ${r.value} m`;
  if (r.kind === "length") return `Length limit ${r.value} m`;
  return `${capitalise(r.kind)} ${r.value} ${r.unit}`;
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** NH route classification in GG 903 terms. */
export function classificationMeaning(c: string | null): string {
  switch (c) {
    case "Class_1A":
      return "Class 1a: to be used by all vehicles";
    case "Class_1B":
      return "Class 1b: to be used by all vehicles, with actions outstanding";
    case "Class_2A":
      return "Class 2a: not to be used by HGVs";
    case "Class_2B":
      return "Class 2b: not to be used by HGVs, with actions outstanding";
    default:
      return "No recognised classification";
  }
}
