import type { Ref } from "react";
import { RESTRICTION_MIN_ZOOM } from "../map/restrictionLayers.ts";
import type { LayerStatus } from "../restrictions/useRestrictionData.ts";
import { LAYER_TEXT } from "./settings/RestrictionsSection.tsx";

/**
 * On the map while any restriction layer is on: a "Restrictions" button that opens the list of restrictions in view (the keyboard
 * and screen-reader route to every record), each layer's loading or failure state, a zoom hint, and a key for what is shown.
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
  const on = statuses.filter((s) => s.state !== "off");
  if (on.length === 0) return null;
  const loading = on.filter((s) => s.state === "loading");
  const failed = on.filter((s) => s.state === "error");
  const points = on.some((s) => (s.layer === "height" || s.layer === "weight") && s.state === "ready");
  const zoomHint = points && zoom !== null && zoom < RESTRICTION_MIN_ZOOM;
  const community = on.some((s) => s.state === "ready" && s.data !== null && "points" in s.data && s.data.points.sources.some((src) => src.kind === "community"));
  return (
    <div className="pointer-events-auto flex max-w-[min(22rem,calc(100vw-5rem))] flex-col items-start gap-1.5">
      <button
        ref={buttonRef}
        type="button"
        onClick={onOpenList}
        className="flex h-12 items-center gap-2 rounded-[4px] border border-line bg-surface px-3 font-bold shadow-[0_1px_4px_rgb(0_0_0/0.25)] hover:bg-raised"
      >
        <span className="rounded-[3px] border-2 border-closure bg-white px-1 text-[11px] leading-4 text-[#14191e]" aria-hidden="true">
          4.4m
        </span>
        Restrictions
      </button>
      <div className="rounded-[4px] bg-surface px-2 py-1 text-[13px] shadow" role="status">
        {loading.length > 0 && <p>Loading {loading.map((s) => LAYER_TEXT[s.layer].label.toLowerCase()).join(", ")}…</p>}
        {failed.map((s) => (
          <p key={s.layer} className="font-bold text-stale">
            {LAYER_TEXT[s.layer].label}: {s.error}{" "}
            <button type="button" onClick={s.retry} className="min-h-12 underline">
              Try again
            </button>
          </p>
        ))}
        {zoomHint && <p>Zoom in to see height and weight restrictions.</p>}
        <MapKey statuses={on} />
        <p className="text-muted">Incomplete.{community ? " Dashed: community record, unverified." : ""}</p>
      </div>
    </div>
  );
}

function MapKey({ statuses }: { statuses: LayerStatus[] }) {
  const shown = new Set(statuses.filter((s) => s.state === "ready").map((s) => s.layer));
  // Only kinds that are actually loaded get a key row, so the key never suggests lorry or structural limits that aren't mapped.
  const kinds = new Set(statuses.flatMap((s) => (s.state === "ready" && s.data !== null && "points" in s.data ? s.data.points.features.map((p) => p.kind) : [])));
  const plate = "inline-block rounded-[3px] border-2 bg-white px-1 text-[11px] leading-4 text-[#14191e]";
  return (
    <ul className="space-y-0.5">
      {shown.has("height") && (
        <li>
          <span className={`${plate} border-closure`}>4.4m</span> Height restriction
        </li>
      )}
      {shown.has("weight") && (
        <>
          {kinds.has("weight-goods") && (
            <li>
              <span className={`${plate} border-closure`}>
                <LorryGlyph /> 7.5t
              </span>{" "}
              Lorry weight limit
            </li>
          )}
          {kinds.has("weight-structural") && (
            <li>
              <span className={`${plate} border-closure`}>
                <BridgeGlyph /> 18t
              </span>{" "}
              Weight limit, all vehicles
            </li>
          )}
          {kinds.has("weight-unrecorded-type") && (
            <li>
              <span className={`${plate} border-unmatched`}>7.5t</span> Weight value on a National Highways diversion route. Type, scope and
              exemptions not recorded.
            </li>
          )}
        </>
      )}
      {shown.has("lez") && (
        <li>
          <span className="inline-block w-6 border-t-[3px] border-dashed border-[#1b7d3a] align-middle" aria-hidden="true" /> LEZ boundary
        </li>
      )}
      {shown.has("ulez") && (
        <li>
          <span className="inline-block w-6 border-t-[3px] border-[#2453a6] align-middle" aria-hidden="true" /> ULEZ boundary
        </li>
      )}
    </ul>
  );
}

/** The lorry and bridge glyphs drawn on the map plates (web/src/map/images.ts), for the key. */
function LorryGlyph() {
  return (
    <svg viewBox="0 0 16 12" className="inline size-3.5 align-[-2px]" aria-hidden="true">
      <rect x="1" y="2" width="8" height="6" fill="currentColor" />
      <rect x="9.5" y="4" width="3.5" height="4" fill="currentColor" />
      <circle cx="3.5" cy="9.5" r="1.6" fill="currentColor" />
      <circle cx="10.5" cy="9.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

function BridgeGlyph() {
  return (
    <svg viewBox="0 0 16 12" className="inline size-3.5 align-[-2px]" aria-hidden="true">
      <rect x="1" y="2" width="14" height="2" fill="currentColor" />
      <path d="M2 11 Q8 3 14 11" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </svg>
  );
}
