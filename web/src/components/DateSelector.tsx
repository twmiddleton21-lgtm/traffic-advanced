import { useRef, useState, useSyncExternalStore } from "react";
import { addDays, dayCount, dayIndex, dayLabels, daysFrom, visibleStart, type DayKey, type DayRange } from "../domain/closureDates.ts";

/** Seven dates from Tailwind's `md` width (48rem) up, three on phones. Keep in step with the `md:` classes below. */
const SEVEN_QUERY = "(min-width: 48rem)";
const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(SEVEN_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

interface Props {
  /** The days on offer, from yesterday (domain/closureDates.ts selectableRange). Only the shown run is ever turned into dates. */
  range: DayRange;
  selected: DayKey;
  today: DayKey;
  onSelect: (day: DayKey) => void;
  /** Set while the closures drawer is open as a modal on phones and tablets. */
  inert?: boolean;
}

/**
 * Which day's closures the map and list show. A row of date buttons (seven on wider screens, three on phones with the chosen day
 * in the middle) between previous/next day buttons. One choice from a set, so the same radio pattern as the filter chips.
 */
export function DateSelector({ range, selected, today, onSelect, inert }: Props) {
  const seven = useSyncExternalStore(subscribe, () => window.matchMedia(SEVEN_QUERY).matches);
  const total = dayCount(range);
  const index = Math.min(Math.max(0, dayIndex(range, selected)), total - 1);
  const size = Math.min(seven ? 7 : 3, total);
  // Desktop keeps the row still while the chosen day is in view; phones keep the chosen day in the middle.
  const [start, setStart] = useState(0);
  const shownStart = visibleStart(total, size, index, seven ? "keep" : "center", start);
  if (shownStart !== start) setStart(shownStart);
  const shown = daysFrom(range, shownStart, size);

  // An arrow that becomes disabled can't keep focus: move it to the chosen date instead of losing it.
  const group = useRef<HTMLDivElement>(null);
  const step = (by: -1 | 1) => {
    const next = index + by;
    onSelect(addDays(selected, by));
    if (next === 0 || next === total - 1) requestAnimationFrame(() => group.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };

  return (
    <div
      inert={inert}
      className="flex items-center gap-1.5 border-b border-line bg-surface py-1.5 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] lg:gap-2"
    >
      <StepButton direction="previous" disabled={index === 0} onClick={() => step(-1)} />
      <div ref={group} role="radiogroup" aria-label="Show closures on" className="flex min-w-0 flex-1 justify-center gap-1.5 lg:gap-2">
        {shown.map((day) => {
          const label = dayLabels(day);
          const checked = day === selected;
          const isToday = day === today;
          return (
            <button
              key={day}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${isToday ? "Today, " : ""}${label.full}`}
              onClick={() => onSelect(day)}
              className={`flex min-h-12 min-w-0 flex-1 basis-0 flex-col items-center justify-center rounded-[4px] border px-1 leading-tight md:max-w-40 ${
                checked ? "border-ink bg-ink text-bg shadow-[inset_0_-4px_0_var(--ta-sign)]" : "border-line text-ink hover:bg-raised"
              }`}
            >
              <span className={`text-[13px] ${checked ? "font-bold" : isToday ? "font-bold text-ink" : "text-muted"}`}>
                {isToday ? (
                  "Today"
                ) : (
                  <>
                    <span className="lg:hidden">{label.weekdayShort}</span>
                    <span className="max-lg:hidden">{label.weekday}</span>
                  </>
                )}
              </span>
              <span className="text-[15px] font-bold tabular-nums">
                <span className="lg:hidden">{label.dateShort}</span>
                <span className="max-lg:hidden">{label.date}</span>
              </span>
            </button>
          );
        })}
      </div>
      <StepButton direction="next" disabled={index === total - 1} onClick={() => step(1)} />
    </div>
  );
}

function StepButton({ direction, disabled, onClick }: { direction: "previous" | "next"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "previous" ? "Previous day" : "Next day"}
      className="grid size-12 shrink-0 place-items-center rounded-[4px] border border-line text-ink hover:bg-raised disabled:cursor-not-allowed disabled:border-transparent disabled:text-muted disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
        <path d={direction === "previous" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
