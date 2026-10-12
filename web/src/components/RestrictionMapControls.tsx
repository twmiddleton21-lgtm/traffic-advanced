import type { Ref } from "react";
import { RESTRICTIONS_DISCLAIMER } from "../../../shared/api/restrictions.ts";
import { mapControlsState } from "../restrictions/mapControls.ts";
import type { LayerStatus } from "../restrictions/useRestrictionData.ts";
import type { RestrictionLayer } from "../settings/preferences.ts";
import { Plate, ZoneLine } from "./RestrictionGlyphs.tsx";
import { LAYER_TEXT } from "./settings/RestrictionsSection.tsx";

/**
 * On the map while any restriction layer is on: the "Restrictions" button that opens the list of restrictions in view (the keyboard
 * and screen-reader route to every record), showing which layers are on, and each layer's loading or failure state. Everything is
 * derived from the layers switched on now (restrictions/mapControls.ts).
 *
 * The restriction key itself, with its zoom message and the full disclaimer, is part of the map's one key (MapKey.tsx) once a layer
 * has loaded. Until then there is no key, so the disclaimer is shown here, with the loading and failure messages: whatever is on, it
 * is in the page exactly once. Loading and failure messages are never folded away.
 */
export function RestrictionMapControls({
  statuses,
  zoom,
  onOpenList,
  buttonRef,
}: {
  statuses: LayerStatus[];
  zoom: number | null;
  onOpenList: () => void;
  buttonRef: Ref<HTMLButtonElement>;
}) {
  const state = mapControlsState(statuses, zoom);
  if (state.active.length === 0) return null;
  // The map key carries the restriction key, and the disclaimer, as soon as any layer has loaded.
  const keyInMapKey = statuses.some((s) => s.state === "ready");
  const showBox = state.loading.length > 0 || state.failed.length > 0 || !keyInMapKey;
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
      {showBox && (
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
          {/* The full disclaimer (SPECIFICATION §7.1) while there is no key to carry it, outside the live region. */}
          {!keyInMapKey && (
            <p id={DISCLAIMER_ID} className="m-2.5 border-l-4 border-sign pl-2 font-bold">
              {RESTRICTIONS_DISCLAIMER}
            </p>
          )}
          {keyInMapKey && <div className="h-2" />}
        </div>
      )}
    </div>
  );
}

/** The one restrictions disclaimer element's id (here or in MapKey.tsx, never both). */
export const DISCLAIMER_ID = "restrictions-disclaimer";

/** Which layers are on, at a glance, on the button and the folded map key: the same symbols as the map. */
export function LayerChip({ layer }: { layer: RestrictionLayer }) {
  if (layer === "height") return <Plate kind="height" text="" />;
  if (layer === "weight") return <Plate kind="weight-unrecorded-type" text="" />;
  return <ZoneLine zone={layer} />;
}
