import { DIVERSION_LABELS } from "../../../shared/api/closures.ts";

type DiversionClass = "A" | "B" | "D";

const SHORT: Record<DiversionClass, string> = {
  A: "Official diversion info",
  B: "Official route matched",
  D: "No reliable diversion",
};

/**
 * Shows a matcher classification exactly as given. Shape + letter + words, never colour alone.
 * A and B use the temporary-diversion-sign yellow; D is a muted outline.
 */
export function DiversionBadge({ cls, variant = "short" }: { cls: DiversionClass; variant?: "short" | "full" }) {
  const text = variant === "full" ? DIVERSION_LABELS[cls] : SHORT[cls];
  const signed = cls !== "D";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[3px] px-1.5 py-0.5 text-[13px] font-bold leading-tight ${
        signed ? "bg-sign text-[#14191e]" : "border border-unmatched text-muted"
      }`}
      title={DIVERSION_LABELS[cls]}
    >
      <span
        aria-hidden="true"
        className={`grid size-[18px] place-items-center text-[12px] ${signed ? "rounded-[2px] bg-[#14191e] text-sign" : "rounded-full border border-current"}`}
      >
        {cls}
      </span>
      <span>{text}</span>
    </span>
  );
}

export function DiversionBadges({ classes }: { classes: DiversionClass[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {classes.map((c) => (
        <DiversionBadge key={c} cls={c} />
      ))}
    </span>
  );
}
