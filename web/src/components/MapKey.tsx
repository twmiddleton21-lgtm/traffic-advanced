import { RESTRICTIONS_DISCLAIMER } from "../../../shared/api/restrictions.ts";
import { mapControlsState, zoomMessage } from "../restrictions/mapControls.ts";
import type { LayerStatus } from "../restrictions/useRestrictionData.ts";
import type { AppView } from "../routemap/view.ts";
import { GroupDot, Plate, ZoneLine } from "./RestrictionGlyphs.tsx";
import { DISCLAIMER_ID, LayerChip } from "./RestrictionMapControls.tsx";

/**
 * The map's one key, for the view that's shown. It folds to a single 48 px "Map key" line, so on phones it takes about as little of
 * the map as possible; App holds whether it's open, starting open where there's room (desktop) and folded on phones and tablets, and
 * keeps the choice across view and layer switches.
 *
 * In Closures it also carries the restriction key while any restriction layer has loaded: the restriction symbols, the zoom hint and
 * the full restrictions disclaimer (SPECIFICATION §7.1). Folded, the summary shows the restriction symbols that are on, so it's clear
 * the key includes them; the disclaimer is then hidden visually only (owner decision, 2026-10-12): it stays in the page, word for
 * word, outside the fold, as the folded control's description for screen readers. While restriction layers are on but none has
 * loaded, the disclaimer is shown with their loading and failure messages instead (RestrictionMapControls), so it is always on the
 * page exactly once.
 */
export function MapKey({
  view,
  open,
  onOpenChange,
  restrictions,
  className = "",
}: {
  view: AppView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Closures only: the restriction layers' statuses and the map's zoom. */
  restrictions?: { statuses: LayerStatus[]; zoom: number | null };
  /** Where it sits on the map (App positions it per view). */
  className?: string;
}) {
  const state = view === "closures" && restrictions ? mapControlsState(restrictions.statuses, restrictions.zoom) : null;
  const on = restrictions?.statuses.filter((s) => s.state !== "off") ?? [];
  const withRestrictions = state !== null && on.some((s) => s.state === "ready");
  const message = state && withRestrictions ? zoomMessage(state) : null;
  return (
    <div className={`pointer-events-auto overflow-y-auto overscroll-contain rounded-[4px] border border-line bg-surface/95 text-[13px] shadow-sm ${className}`}>
      <details id="map-key" open={open} onToggle={(e) => onOpenChange(e.currentTarget.open)} className="group">
        <summary
          aria-describedby={withRestrictions && !open ? DISCLAIMER_ID : undefined}
          className="flex min-h-12 cursor-pointer select-none items-center gap-1.5 px-2.5 font-bold focus-visible:-outline-offset-3!"
        >
          Map key
          {withRestrictions && (
            <>
              <span className="flex items-center gap-1" aria-hidden="true">
                {state.active.map((l) => (
                  <LayerChip key={l} layer={l} />
                ))}
              </span>
              <span className="sr-only">, including restrictions</span>
            </>
          )}
          <Chevron />
        </summary>
        {view === "routes" ? <RoutesKey /> : <ClosuresKey />}
        {withRestrictions && (
          <section aria-label="Restrictions key" className="border-t border-line px-2.5 pb-2 pt-1.5">
            <h3 className="pb-1 font-bold">Restrictions</h3>
            <div role="status" className="space-y-1">
              {message && <p>{message}</p>}
              <RestrictionRows statuses={on} grouped={state.grouped} />
              {state.community && <p className="text-muted">Dashed: community record, unverified.</p>}
            </div>
          </section>
        )}
      </details>
      {/* The full disclaimer, one element, outside the fold and the live region: shown under the open key; while the key is
          folded it is hidden visually but kept, and read out with the folded control. */}
      {withRestrictions && (
        <p id={DISCLAIMER_ID} className={open ? "mx-2.5 mb-2 border-l-4 border-sign pl-2 font-bold" : "sr-only"}>
          {RESTRICTIONS_DISCLAIMER}
        </p>
      )}
    </div>
  );
}

/** Points down when the key is folded, up when it's open; the open state is also announced by the summary itself. */
function Chevron() {
  return (
    <svg viewBox="0 0 20 20" className="ml-auto size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true">
      <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RoutesKey() {
  return (
    <ul className="space-y-1 px-2.5 pb-2">
      <li className="flex items-center gap-2">
        <RoadGlyph className="stroke-[#0b4f9c] dark:stroke-[#4a8fe0]" /> Motorway
      </li>
      <li className="flex items-center gap-2">
        <RoadGlyph className="stroke-[#00703c] dark:stroke-[#2fa66a]" /> Primary route (green-signed A road)
      </li>
      <li className="flex items-center gap-2">
        <JunctionGlyph />
        Junction number (National Highways roads only)
      </li>
    </ul>
  );
}

function RoadGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 28 10" className="h-2.5 w-7 shrink-0" aria-hidden="true">
      <path d="M2 5 H26" className={className} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function JunctionGlyph() {
  return (
    <span className="flex w-7" aria-hidden="true">
      <span className="rounded-[3px] border border-white bg-[#14191e] px-1 text-[10px] font-bold leading-[14px] text-white ring-1 ring-[#14191e]">J4</span>
    </span>
  );
}

function ClosuresKey() {
  return (
    <ul className="space-y-1 px-2.5 pb-2">
      <li className="flex items-center gap-2">
        <ClosureGlyph /> Closed carriageway
      </li>
      <li className="flex items-center gap-2">
        <RouteGlyph /> Official diversion route, arrows show the way to drive
      </li>
      <li className="flex items-center gap-2">
        <span className="flex w-7 justify-center gap-1" aria-hidden="true">
          <span className="size-3 rounded-full border-[3px] border-[#14191e] bg-white" />
          <span className="size-3 rounded-full border-[3px] border-white bg-[#14191e] ring-1 ring-[#14191e]" />
        </span>
        Diversion starts / rejoins
      </li>
      <li className="flex items-center gap-2">
        <span className="flex w-7 gap-0.5" aria-hidden="true">
          {["A", "B"].map((x) => (
            <span key={x} className="grid size-3.5 place-items-center rounded-full border border-[#14191e] bg-sign text-[9px] font-bold text-[#14191e]">
              {x}
            </span>
          ))}
        </span>
        Official diversion information
      </li>
      <li className="flex items-center gap-2">
        <span className="flex w-7" aria-hidden="true">
          <span className="grid size-3.5 place-items-center rounded-full border border-[#14191e] bg-unmatched text-[9px] font-bold text-white">D</span>
        </span>
        No reliable diversion
      </li>
      <li className="flex items-center gap-2">
        <span className="flex w-7" aria-hidden="true">
          <span className="rounded-[3px] border border-white bg-[#14191e] px-1 text-[10px] font-bold leading-[14px] text-white ring-1 ring-[#14191e]">J4</span>
        </span>
        Junction number (National Highways)
      </li>
    </ul>
  );
}

/** Matches the closure line on the map: red with a dark casing (style.ts closureLayers). */
function ClosureGlyph() {
  return (
    <svg viewBox="0 0 28 10" className="h-2.5 w-7 shrink-0" aria-hidden="true">
      <path d="M2 5 H26" stroke="#14191e" strokeWidth="6" strokeLinecap="round" />
      <path d="M2 5 H26" stroke="#c8102e" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

function RouteGlyph() {
  return (
    <svg viewBox="0 0 28 10" className="h-2.5 w-7 shrink-0" aria-hidden="true">
      <path d="M1 5 H27" stroke="#14191e" strokeWidth="7" strokeLinecap="round" />
      <path d="M1 5 H27" stroke="#ffd200" strokeWidth="4" strokeLinecap="round" />
      <path d="M11 2 L17 5 L11 8 L12.5 5 Z" fill="#14191e" />
    </svg>
  );
}

function RestrictionRows({ statuses, grouped }: { statuses: LayerStatus[]; grouped: ("height" | "weight")[] }) {
  const shown = new Set(statuses.filter((s) => s.state === "ready").map((s) => s.layer));
  // Only kinds that are actually loaded get a key row, so the key never suggests lorry or structural limits that aren't mapped.
  const kinds = new Set(statuses.flatMap((s) => (s.state === "ready" && s.data !== null && "points" in s.data ? s.data.points.features.map((p) => p.kind) : [])));
  const row = "flex items-start gap-1.5";
  return (
    <ul className="space-y-1">
      {shown.has("height") && (
        <li className={row}>
          <Plate kind="height" text="4.4m" /> Height restriction
        </li>
      )}
      {shown.has("weight") && (
        <>
          {kinds.has("weight-goods") && (
            <li className={row}>
              <Plate kind="weight-goods" text="7.5t" /> Lorry weight limit
            </li>
          )}
          {kinds.has("weight-structural") && (
            <li className={row}>
              <Plate kind="weight-structural" text="18t" /> Weight limit, all vehicles
            </li>
          )}
          {kinds.has("weight-unrecorded-type") && (
            <li className={row}>
              <Plate kind="weight-unrecorded-type" text="7.5t" />
              <span>Weight value on a National Highways diversion route. Type, scope and exemptions not recorded.</span>
            </li>
          )}
        </>
      )}
      {grouped.map((l) => (
        <li key={`group-${l}`} className={row}>
          <GroupDot layer={l} /> {`Group of nearby ${l} restrictions, with how many`}
        </li>
      ))}
      {shown.has("lez") && (
        <li className={row}>
          <ZoneLine zone="lez" /> LEZ boundary
        </li>
      )}
      {shown.has("ulez") && (
        <li className={row}>
          <ZoneLine zone="ulez" /> ULEZ boundary
        </li>
      )}
    </ul>
  );
}
