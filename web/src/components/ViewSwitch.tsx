import type { JSX } from "react";
import type { AppView } from "../routemap/view.ts";

const VIEWS: { view: AppView; label: string; Icon: () => JSX.Element }[] = [
  { view: "closures", label: "Closures", Icon: ClosuresIcon },
  { view: "routes", label: "Routes", Icon: RoutesIcon },
];

/**
 * Closures / Routes: a two-part switch in the header. The chosen view is a filled plate in the ink colour (it inverts with the
 * theme), with bold text and aria-pressed, so it never relies on colour alone. Each part is a plain button: Tab reaches both and
 * Enter or Space chooses, so it works with a keyboard, a TV remote's D-pad and touch (48 px tall).
 */
export function ViewSwitch({ view, onChange, className = "" }: { view: AppView; onChange: (view: AppView) => void; className?: string }) {
  return (
    <div role="group" aria-label="Map view" className={`flex h-12 shrink-0 rounded-[6px] border border-line bg-raised p-1 ${className}`}>
      {VIEWS.map(({ view: v, label, Icon }) => {
        const chosen = v === view;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={chosen}
            onClick={() => onChange(v)}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[4px] px-3 text-[14px] transition-colors motion-reduce:transition-none ${
              chosen ? "bg-ink font-bold text-surface shadow-[0_1px_3px_rgb(0_0_0/0.3)]" : "text-muted hover:bg-surface hover:text-ink"
            }`}
          >
            <Icon />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A road-closed sign: a bar across a circle. */
function ClosuresIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-[18px] shrink-0" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M5.5 10h9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** A road between two places. */
function RoutesIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-[18px] shrink-0" aria-hidden="true">
      <circle cx="5" cy="15" r="2.2" fill="currentColor" />
      <circle cx="15" cy="5" r="2.2" fill="currentColor" />
      <path d="M6.5 13.5C9 11 7 9 10 7.5s3-1 3.6-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.1 3.4" />
    </svg>
  );
}
