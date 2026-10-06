import type { HgvStatus as HgvStatusValue } from "../../../shared/api/closures.ts";

/** The three cautious HGV statuses (decision D5). There is deliberately no "suitable" state. */
const PRESENTATION: Record<HgvStatusValue, { label: string; className: string; icon: string }> = {
  "not-suitable": { label: "Not suitable for HGVs", className: "bg-closure text-white", icon: "⛔" },
  "check-vehicle": { label: "Check against your vehicle", className: "bg-sign text-[#14191e]", icon: "⚠" },
  "no-restrictions-recorded": { label: "No restrictions recorded", className: "border border-line text-ink", icon: "ⓘ" },
};

export function HgvStatus({ status }: { status: HgvStatusValue }) {
  const p = PRESENTATION[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[3px] px-2 py-0.5 text-[13px] font-bold ${p.className}`}>
      <span aria-hidden="true">{p.icon}</span>
      {p.label}
    </span>
  );
}
