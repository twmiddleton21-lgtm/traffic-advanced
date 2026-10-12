import { TRAFFIC_MIN_ZOOM, TRAFFIC_UNAVAILABLE_TEXT } from "../../../../shared/api/traffic.ts";
import { SwitchGlyph } from "../../components/settings/RestrictionsSection.tsx";
import { formatTime } from "../../domain/dataStatus.ts";
import { TRAFFIC_BANDS } from "./layers.ts";
import type { TrafficState } from "./traffic.ts";

/**
 * DEFERRED (not in the first release; README.md here). The Routes view's live traffic controls. None of this wording has been
 * approved: TomTom's terms, attribution and the use of its name are unresolved (docs/LIVE-TRAFFIC-RESEARCH.md).
 */

/** Where the traffic comes from, shown with its switch (for the owner's review). */
export const TRAFFIC_SOURCE_TEXT = "From TomTom, not National Highways. Road closures are in the Closures view.";

/**
 * The live traffic switch (off by default), its state and, while on, the congestion key. Designed to sit on the map's Routes panel
 * and in Settings while Routes is shown, with one state held by App. The unavailable message is the only one visitors would see when
 * traffic can't be shown, whatever the reason.
 */
export function TrafficSwitch({
  idPrefix,
  on,
  onToggle,
  state,
  updatedAt,
  unavailableShownElsewhere = false,
}: {
  idPrefix: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  state: TrafficState;
  updatedAt: number | null;
  /** The map panel says it above its fold, so it isn't repeated under the switch. */
  unavailableShownElsewhere?: boolean;
}) {
  const descriptionId = `${idPrefix}-traffic-description`;
  return (
    <div className="rounded-[4px] border border-line">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={descriptionId}
        onClick={() => onToggle(!on)}
        className="flex min-h-12 w-full items-center gap-3 px-3 py-1.5 text-left text-[14px] hover:bg-raised"
      >
        <span className="flex-1 font-bold">Live traffic</span>
        <SwitchGlyph on={on} />
      </button>
      <div id={descriptionId} className="space-y-1 px-3 pb-2 text-[13px]">
        <p>{`Congestion on main roads, shown from zoom ${TRAFFIC_MIN_ZOOM}. ${TRAFFIC_SOURCE_TEXT}`}</p>
        {on && state === "checking" && <p role="status">Checking live traffic…</p>}
        {on && state === "unavailable" && !unavailableShownElsewhere && <p className="font-bold">{TRAFFIC_UNAVAILABLE_TEXT}</p>}
        {on && state === "available" && (
          <>
            {updatedAt !== null && <p>{`Traffic fetched at ${formatTime(updatedAt)}. Refreshed every 10 minutes while shown.`}</p>}
            <TrafficKey />
          </>
        )}
      </div>
    </div>
  );
}

/** The congestion key: the map's own colours and widths (layers.ts TRAFFIC_BANDS), each named in words. */
export function TrafficKey() {
  return (
    <ul className="space-y-1 pt-1" aria-label="Traffic key">
      {[...TRAFFIC_BANDS].reverse().map((b) => (
        <li key={b.label} className="flex items-center gap-2">
          <svg viewBox="0 0 28 10" className="h-2.5 w-7 shrink-0" aria-hidden="true">
            <path d="M2 5 H26" stroke={b.colour} strokeWidth={3 * b.width} strokeLinecap="round" />
          </svg>
          {b.label}
        </li>
      ))}
      <li className="flex items-center gap-2">
        <svg viewBox="0 0 28 10" className="h-2.5 w-7 shrink-0" aria-hidden="true">
          <path d="M2 5 H26" stroke="currentColor" strokeWidth="3" strokeDasharray="4.5 3" />
        </svg>
        Closed (reported by TomTom)
      </li>
    </ul>
  );
}
