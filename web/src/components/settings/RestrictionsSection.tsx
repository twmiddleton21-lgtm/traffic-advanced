import { RESTRICTIONS_DISCLAIMER } from "../../../../shared/api/restrictions.ts";
import type { LayerEntry } from "../../restrictions/catalog.ts";
import { formatDate } from "../../restrictions/describe.ts";
import type { LayerStatus } from "../../restrictions/useRestrictionData.ts";
import type { RestrictionLayer } from "../../settings/preferences.ts";
import { SettingsSection } from "./SettingsSection.tsx";

export const LAYER_TEXT: Record<RestrictionLayer, { label: string; description: string }> = {
  height: { label: "Height restrictions", description: "Low bridges, tunnels, barriers and other recorded height limits." },
  // Describes this build's only weight source (web/src/restrictions/data.test.ts fails if another kind of weight record appears).
  weight: {
    label: "Weight restrictions",
    description:
      "Weight values National Highways records on its emergency diversion routes. It doesn't record the restriction type, which vehicles it applies to, where it starts and ends, or exemptions, so none is a confirmed lorry limit or limit for all vehicles. Weight limits elsewhere aren't shown.",
  },
  // Vehicle categories from TfL's ULEZ page (tfl.gov.uk/modes/driving/ultra-low-emission-zone, checked 2026-10-09).
  lez: { label: "London Low Emission Zone (LEZ)", description: "TfL's boundary. TfL says lorries over 3.5 tonnes that don't meet the LEZ emissions standard need to pay the LEZ charge." },
  ulez: {
    label: "London Ultra Low Emission Zone (ULEZ)",
    description:
      "TfL's boundary. TfL says the ULEZ applies to cars, motorcycles, vans and specialist vehicles up to and including 3.5 tonnes, and minibuses up to and including 5 tonnes. Lorries over 3.5 tonnes don't pay the ULEZ charge; the LEZ applies to them.",
  },
};

/**
 * One switch per restriction layer that has data in this build (a layer without data has no switch). All off by default; choices are
 * remembered on this device. A layer's data is downloaded only when it is switched on.
 */
export function RestrictionsSection({
  entries,
  enabled,
  statuses,
  onToggle,
}: {
  entries: LayerEntry[];
  enabled: Record<RestrictionLayer, boolean>;
  statuses: Record<RestrictionLayer, LayerStatus>;
  onToggle: (layer: RestrictionLayer, on: boolean) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <SettingsSection title="Road restrictions">
      <p className="mb-3 rounded-[4px] border-l-4 border-sign bg-raised px-3 py-2 text-[14px] font-bold">{RESTRICTIONS_DISCLAIMER}</p>
      <ul className="space-y-2">
        {entries.map((e) => {
          const text = LAYER_TEXT[e.layer];
          const on = enabled[e.layer];
          const status = statuses[e.layer];
          const community = e.sources.some((s) => s.kind === "community");
          const descriptionId = `restriction-${e.layer}-description`;
          return (
            <li key={e.layer} className="rounded-[4px] border border-line">
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-describedby={descriptionId}
                onClick={() => onToggle(e.layer, !on)}
                className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-raised"
              >
                <span className="flex-1 font-bold">{text.label}</span>
                <SwitchGlyph on={on} />
              </button>
              <div id={descriptionId} className="space-y-1 px-3 pb-2 text-[13px]">
                <p>{text.description}</p>
                <p className="text-muted">
                  Sources: {[...new Set(e.sources.map((s) => `${s.authority}${s.kind === "community" ? " (community, unverified)" : ""}`))].join("; ")}.
                </p>
                {community && <p className="font-bold">Includes community records that are not verified.</p>}
                {on && status.state === "loading" && <p role="status">Loading…</p>}
                {on && status.state === "ready" && (
                  <p>
                    Shown on the map{e.layer === "height" || e.layer === "weight" ? " when zoomed in" : ""}. Data downloaded {formatDate(latest(e))}.
                  </p>
                )}
                {on && status.state === "error" && (
                  <p className="font-bold text-stale">
                    {status.error}{" "}
                    <button type="button" onClick={status.retry} className="min-h-12 underline">
                      Try again
                    </button>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </SettingsSection>
  );
}

/** When the newest source in a layer was downloaded for this build. */
const latest = (e: LayerEntry) => e.sources.map((s) => s.fetchedAt).sort().at(-1)!;

function SwitchGlyph({ on }: { on: boolean }) {
  return (
    <span className="flex items-center gap-2 text-[14px]" aria-hidden="true">
      <span>{on ? "On" : "Off"}</span>
      <span className={`flex h-7 w-12 items-center rounded-full border-2 p-0.5 ${on ? "justify-end border-motorway bg-motorway" : "justify-start border-muted bg-bg"}`}>
        <span className={`size-5 rounded-full ${on ? "bg-white" : "bg-muted"}`} />
      </span>
    </span>
  );
}
