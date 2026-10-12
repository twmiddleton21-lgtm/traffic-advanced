import type { Ref } from "react";
import { RESTRICTIONS_DISCLAIMER } from "../../../shared/api/restrictions.ts";
import { mapControlsState, zoomMessage } from "../restrictions/mapControls.ts";
import type { LayerStatus } from "../restrictions/useRestrictionData.ts";
import type { RestrictionLayer } from "../settings/preferences.ts";
import { GroupDot, Plate, ZoneLine } from "./RestrictionGlyphs.tsx";
import { LAYER_TEXT } from "./settings/RestrictionsSection.tsx";

/**
 * On the map while any restriction layer is on: the "Restrictions" button that opens the list of restrictions in view (the keyboard
 * and screen-reader route to every record), showing which layers are on; each layer's loading or failure state; a key, with the zoom
 * message for the loaded height and weight layers only; and the full restrictions disclaimer. Everything is derived from the layers
 * switched on now (restrictions/mapControls.ts).
 *
 * The key folds to one "Restrictions key" line, like the map key (MapView Legend), so it doesn't cover the map; App holds whether
 * it's open, so the choice survives layers being switched. Folded, the disclaimer is hidden visually only (owner decision,
 * 2026-10-12): it stays in the page, word for word, as the folded control's description for screen readers, and it is always shown
 * in "Restrictions in this view". Loading and failure messages are never folded away.
 */
export function RestrictionMapControls({
  statuses,
  zoom,
  onOpenList,
  buttonRef,
  keyOpen,
  onKeyOpenChange,
}: {
  statuses: LayerStatus[];
  zoom: number | null;
  onOpenList: () => void;
  buttonRef: Ref<HTMLButtonElement>;
  keyOpen: boolean;
  onKeyOpenChange: (open: boolean) => void;
}) {
  const state = mapControlsState(statuses, zoom);
  if (state.active.length === 0) return null;
  const message = zoomMessage(state);
  const on = statuses.filter((s) => s.state !== "off");
  const hasKey = on.some((s) => s.state === "ready");
  return (
    <div className="pointer-events-auto flex max-h-full max-w-[min(22rem,calc(100vw-5rem))] flex-col items-end gap-1.5">
      <button
        ref={buttonRef}
        type="button"
        onClick={onOpenList}
        className="flex h-12 shrink-0 items-center gap-2 rounded-[4px] border border-line bg-surface px-3 font-bold shadow-[0_1px_4px_rgb(0_0_0/0.25)] hover:bg-raised"
      >
        <span className="flex items-center gap-1">
          {state.active.map((l) => (
            <LayerChip key={l} layer={l} />
          ))}
        </span>
        Restrictions
        <span className="sr-only">{` (${state.active.map((l) => LAYER_TEXT[l].label.toLowerCase()).join(", ")} on): list what's in view`}</span>
      </button>
      <div className="min-h-0 w-full overflow-y-auto overscroll-contain rounded-[4px] border border-line bg-surface/95 text-[13px] shadow-sm">
        <div role="status" className="space-y-1 px-2.5 *:pt-2">
          {state.loading.length > 0 && <p>Loading {state.loading.map((l) => LAYER_TEXT[l].label.toLowerCase()).join(", ")}…</p>}
          {state.failed.map((s) => (
            <p key={s.layer} className="font-bold text-stale">
              {LAYER_TEXT[s.layer].label}: {s.error}{" "}
              <button type="button" onClick={s.retry} className="min-h-12 underline">
                Try again
              </button>
            </p>
          ))}
        </div>
        {hasKey && (
          <details id="restrictions-key" open={keyOpen} onToggle={(e) => onKeyOpenChange(e.currentTarget.open)} className="group">
            <summary aria-describedby={keyOpen ? undefined : DISCLAIMER_ID} className="flex min-h-12 cursor-pointer select-none items-center justify-between gap-2 px-3 font-bold">
              Restrictions key
              <Chevron />
            </summary>
            <div role="status" className="space-y-1.5 px-2.5 pb-2">
              {message && <p>{message}</p>}
              <MapKey statuses={on} grouped={state.grouped} />
              {state.community && <p className="text-muted">Dashed: community record, unverified.</p>}
            </div>
          </details>
        )}
        {/* The full disclaimer (SPECIFICATION §7.1), one element, outside the live regions so it isn't announced on every change.
            Shown with the key; while the key is folded it is hidden visually but kept, and read out with the folded control. */}
        <p id={DISCLAIMER_ID} className={hasKey && !keyOpen ? "sr-only" : `mx-2.5 mb-2 border-l-4 border-sign pl-2 font-bold ${hasKey ? "" : "mt-2"}`}>
          {RESTRICTIONS_DISCLAIMER}
        </p>
      </div>
    </div>
  );
}

const DISCLAIMER_ID = "restrictions-disclaimer";

/** Points down when the key is folded, up when it's open; the open state is also announced by the summary itself. */
function Chevron() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true">
      <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Which layers are on, at a glance, on the button: the same symbols as the map. */
function LayerChip({ layer }: { layer: RestrictionLayer }) {
  if (layer === "height") return <Plate kind="height" text="" />;
  if (layer === "weight") return <Plate kind="weight-unrecorded-type" text="" />;
  return <ZoneLine zone={layer} />;
}

function MapKey({ statuses, grouped }: { statuses: LayerStatus[]; grouped: ("height" | "weight")[] }) {
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
