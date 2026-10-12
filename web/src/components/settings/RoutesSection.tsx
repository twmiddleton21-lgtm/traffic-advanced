import type { RoutesLayerSwitches } from "../../map/viewLayers.ts";
import type { JunctionLoad } from "../../routemap/junctionLabels.ts";
import { JunctionNumbersSwitch, ROUTES_SCOPE_TEXT } from "../RoutesMapControls.tsx";
import { SettingsSection } from "./SettingsSection.tsx";

/**
 * Settings for the Routes view: only what Routes has (junction numbers, for this visit). Closure and restriction settings are the
 * Closures view's and aren't shown here.
 */
export function RoutesSection({
  layers,
  onToggle,
  junctions,
  onRetry,
}: {
  layers: RoutesLayerSwitches;
  onToggle: (layer: keyof RoutesLayerSwitches, on: boolean) => void;
  junctions: JunctionLoad;
  onRetry: () => void;
}) {
  return (
    <SettingsSection title="Route map">
      <p className="mb-3 rounded-[4px] border-l-4 border-sign bg-raised px-3 py-2 text-[14px] font-bold">{ROUTES_SCOPE_TEXT}</p>
      <JunctionNumbersSwitch idPrefix="routes-settings" on={layers.junctions} onToggle={(on) => onToggle("junctions", on)} load={junctions} />
      {junctions.state === "loading" && (
        <p className="mt-2 text-[14px]" role="status">
          Loading junction numbers…
        </p>
      )}
      {junctions.state === "error" && (
        <p className="mt-2 text-[14px] font-bold text-stale">
          Junction numbers couldn&apos;t be loaded.{" "}
          <button type="button" onClick={onRetry} className="min-h-12 underline">
            Try again
          </button>
        </p>
      )}
    </SettingsSection>
  );
}
