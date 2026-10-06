import type { TrafficClosure } from "../../../shared/api/closures.ts";
import { FILTERS, matchesSearch, type FilterId } from "../domain/filters.ts";

interface Props {
  closures: TrafficClosure[];
  query: string;
  active: FilterId;
  onChange: (id: FilterId) => void;
}

/** Filter chips with live counts. Definitions come from domain/filters.ts and are shown as tooltips. */
export function FilterBar({ closures, query, active, onChange }: Props) {
  const searched = closures.filter((c) => matchesSearch(c, query));
  return (
    <div role="radiogroup" aria-label="Filter closures" className="flex flex-wrap gap-1.5">
      {FILTERS.map((f) => {
        const selected = f.id === active;
        const count = searched.filter(f.matches).length;
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={selected}
            title={f.description}
            onClick={() => onChange(f.id)}
            className={`h-11 rounded-[4px] border px-2.5 text-[14px] font-bold tabular-nums lg:h-8 ${
              selected ? "border-ink bg-ink text-bg" : "border-line text-ink hover:bg-raised"
            }`}
          >
            {f.label} <span className={selected ? "opacity-80" : "text-muted"}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
