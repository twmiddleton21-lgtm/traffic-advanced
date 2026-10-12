import type { JunctionLoad } from "../routemap/junctionLabels.ts";
import type { RoutesLayerSwitches } from "../map/viewLayers.ts";
import { SwitchGlyph } from "./settings/RestrictionsSection.tsx";

/** What the Routes view is not, shown with its layers and its settings (wording approved by the owner 2026-10-12, docs/ROUTES-MAP.md; don't change it silently). */
export const ROUTES_SCOPE_TEXT = "Routes is for route awareness only. It doesn't plan routes, check whether roads suit your vehicle, or give directions. Always follow road signs.";
/** Shown with the Routes layers while no live traffic is connected (wording approved by the owner 2026-10-12, docs/ROUTES-MAP.md). */
export const NO_TRAFFIC_TEXT = "Live traffic isn't connected yet. Road closures are in the Closures view.";

/**
 * The Routes view's layer panel, beside the map key at the top left of the map: its own switch, the junction data's state, what
 * the layer covers, the scope and not-connected notes, and room for future overlays. Folded, it is one 48 px line as compact as the
 * map key; open, it widens to show its contents. The junction data's loading and failure messages stay outside the fold.
 */
export function RoutesMapControls({
  layers,
  onToggle,
  junctions,
  onRetry,
  open,
  onOpenChange,
}: {
  layers: RoutesLayerSwitches;
  onToggle: (layer: keyof RoutesLayerSwitches, on: boolean) => void;
  junctions: JunctionLoad;
  onRetry: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <div className={`pointer-events-auto flex max-h-full flex-col ${open ? "w-[min(20rem,calc(100vw-5.5rem))]" : "max-w-full"}`}>
      <div className="min-h-0 overflow-y-auto overscroll-contain rounded-[4px] border border-line bg-surface/95 text-[13px] shadow-sm">
        <div role="status" className="space-y-1 px-3 *:pt-2">
          {junctions.state === "loading" && <p>Loading junction numbers…</p>}
          {junctions.state === "error" && (
            <p className="font-bold text-stale">
              Junction numbers couldn't be loaded.{" "}
              <button type="button" onClick={onRetry} className="min-h-12 underline">
                Try again
              </button>
            </p>
          )}
        </div>
        <details id="routes-layers" open={open} onToggle={(e) => onOpenChange(e.currentTarget.open)} className="group">
          <summary className="flex min-h-12 cursor-pointer select-none items-center justify-between gap-1.5 px-2.5 font-bold focus-visible:-outline-offset-3!">
            Route map layers
            <Chevron />
          </summary>
          <div className="space-y-2 px-3 pb-3">
            <JunctionNumbersSwitch idPrefix="routes-map" on={layers.junctions} onToggle={(on) => onToggle("junctions", on)} load={junctions} />
            <p className="border-l-4 border-sign pl-2 font-bold">{ROUTES_SCOPE_TEXT}</p>
            <p>{NO_TRAFFIC_TEXT}</p>
          </div>
        </details>
      </div>
    </div>
  );
}

/**
 * The Routes view's junction-number switch, with what it covers and its data's state. The same switch (one state, held by App)
 * is on the map's Routes panel and in Settings while Routes is shown; `idPrefix` keeps their ids apart.
 */
export function JunctionNumbersSwitch({ idPrefix, on, onToggle, load }: { idPrefix: string; on: boolean; onToggle: (on: boolean) => void; load: JunctionLoad }) {
  const descriptionId = `${idPrefix}-junctions-description`;
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
        <span className="flex-1 font-bold">Junction numbers</span>
        <SwitchGlyph on={on} />
      </button>
      <div id={descriptionId} className="space-y-1 px-3 pb-2 text-[13px]">
        <p>Motorways and the A roads National Highways runs, in England (one on the Severn crossing). Other roads&apos; junctions aren&apos;t numbered here. Shown from zoom 8.</p>
        {load.state === "ready" && <p>{`${load.count} junctions labelled.`}</p>}
        {load.state === "empty" && <p className="font-bold">No junction numbers are in the current data.</p>}
        <p className="text-muted">Source: National Highways Network Model, Open Government Licence v3.0.</p>
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true">
      <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
