import type { TrafficClosure } from "../../../shared/api/closures.ts";
import { confirmedJunctions, directionLabel, formatWindow } from "../domain/filters.ts";
import { DiversionBadges } from "./DiversionBadge.tsx";
import { RoadShield } from "./RoadShield.tsx";

interface Props {
  closures: TrafficClosure[];
  /** No closures at all on the chosen day (not just none matching the filters). */
  emptyDay: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClearFilters: () => void;
}

export function ClosureList({ closures, emptyDay, selectedId, onSelect, onClearFilters }: Props) {
  if (emptyDay) {
    // A quiet day is a valid answer, not an error.
    return (
      <div className="px-4 py-10 text-center" role="status">
        <p className="font-bold">No closures scheduled for this day</p>
        <p className="mt-1 text-[14px] text-muted">Choose another date to see its closures.</p>
      </div>
    );
  }
  if (closures.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="font-bold">No closures match these filters.</p>
        <button type="button" onClick={onClearFilters} className="mt-3 rounded-[4px] border border-line px-3 py-1.5 font-bold hover:bg-raised">
          Show all closures
        </button>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line" aria-label="Closures">
      {closures.map((c) => (
        <li key={c.id}>
          <ClosureRow closure={c} selected={c.id === selectedId} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}

function ClosureRow({ closure: c, selected, onSelect }: { closure: TrafficClosure; selected: boolean; onSelect: (id: string) => void }) {
  const junctions = confirmedJunctions(c);
  return (
    <button
      type="button"
      onClick={() => onSelect(c.id)}
      aria-current={selected ? "true" : undefined}
      className={`grid w-full grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 px-4 py-3 text-left ${
        selected ? "bg-raised shadow-[inset_4px_0_0_var(--ta-sign)]" : "hover:bg-raised/60"
      }`}
    >
      <span className="row-span-2 pt-0.5">
        <RoadShield road={c.road} />
      </span>
      <span className="min-w-0">
        <span className="font-bold">{directionLabel(c.direction)}</span>
        <span className="text-muted">
          {junctions ? ` ${junctions.from} to ${junctions.to}` : ""}
          {c.roads.length > 1 ? ` continues onto ${c.roads.slice(1).join(", ")}` : ""}
        </span>
        <span className="mt-0.5 block truncate text-[14px] text-muted" title={c.nhText[0]}>
          {c.nhText[0] ?? "No NH description"}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <DiversionBadges classes={c.classes} />
        <span className="text-[13px] text-muted">{formatWindow(c.window)}</span>
      </span>
    </button>
  );
}
