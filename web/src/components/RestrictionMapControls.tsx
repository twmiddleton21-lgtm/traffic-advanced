import { RESTRICTIONS_DISCLAIMER } from "../../../shared/api/restrictions.ts";
import { mapControlsState } from "../restrictions/mapControls.ts";
import type { LayerStatus } from "../restrictions/useRestrictionData.ts";
import { LAYER_TEXT } from "./settings/RestrictionsSection.tsx";

/**
 * On the map while a restriction layer is loading or has failed: each layer's loading or failure state, with Try again. Everything
 * is derived from the layers switched on now (restrictions/mapControls.ts). There is no "Restrictions" button or list: the
 * restriction key, its zoom message, the full disclaimer, each zone's details and the keyboard route to every restriction are in the
 * map's one key (MapKey.tsx), and a marker opens its own details.
 *
 * Until a layer has loaded there is no restriction key, so the disclaimer is shown here, with the loading and failure messages:
 * whatever is on, it is in the page exactly once. Loading and failure messages are never folded away.
 */
export function RestrictionMapControls({ statuses }: { statuses: LayerStatus[] }) {
  const state = mapControlsState(statuses, null);
  if (state.active.length === 0) return null;
  // The map key carries the restriction key, and the disclaimer, as soon as any layer has loaded.
  const keyInMapKey = statuses.some((s) => s.state === "ready");
  if (keyInMapKey && state.loading.length === 0 && state.failed.length === 0) return null;
  return (
    <div className="pointer-events-auto max-h-full w-[min(22rem,calc(100vw-5rem))] overflow-y-auto overscroll-contain rounded-[4px] border border-line bg-surface/95 text-[13px] shadow-sm">
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
  );
}

/** The one restrictions disclaimer element's id (here or in MapKey.tsx, never both). */
export const DISCLAIMER_ID = "restrictions-disclaimer";
