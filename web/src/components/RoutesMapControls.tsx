import type { JunctionLoad } from "../routemap/junctionLabels.ts";
import type { RoutesLayerSwitches } from "../map/viewLayers.ts";
import { SwitchGlyph } from "./settings/RestrictionsSection.tsx";

/** What the Routes view is not, shown with its layers and its settings (wording approved by the owner 2026-10-12, docs/ROUTES-MAP.md; don't change it silently). */
export const ROUTES_SCOPE_TEXT = "Routes is for route awareness only. It doesn't plan routes, check whether roads suit your vehicle, or give directions. Always follow road signs.";
/** Shown with the Routes layers while no live traffic is connected (wording approved by the owner 2026-10-12, docs/ROUTES-MAP.md). */
export const NO_TRAFFIC_TEXT = "Live traffic isn't connected yet. Road closures are in the Closures view.";

/**
 * The Routes view's Layers control, at the top left of the map. Folded, it is a square map button (layers icon and "Layers") in
 * the manner of a map app's layers control; open, a panel under it shows the layer switch, what the layer covers, and the scope and
 * not-connected notes, with room for future overlays. It opens and closes on its own, never with the map key. The junction data's
 * loading and failure messages stay outside the fold, under the button.
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
    // Scrolls as a whole if the open panel is taller than the map; p-px keeps the button's border inside the scroll box.
    <div className={`pointer-events-auto flex max-h-full flex-col items-start gap-1.5 overflow-y-auto overscroll-contain p-px ${open ? "w-[min(20rem,calc(100vw-5.5rem))]" : ""}`}>
      <details id="routes-layers" open={open} onToggle={(e) => onOpenChange(e.currentTarget.open)} className="group w-full">
        <summary className="flex size-14 cursor-pointer select-none flex-col items-center justify-center gap-0.5 rounded-[4px] border border-line bg-surface text-[12px] font-bold shadow-[0_1px_4px_rgb(0_0_0/0.25)] hover:bg-raised group-open:bg-raised focus-visible:-outline-offset-3!">
          <LayersIcon />
          Layers
        </summary>
        <div className="mt-1.5 space-y-2 rounded-[4px] border border-line bg-surface/95 p-3 text-[13px] shadow-sm">
          <JunctionNumbersSwitch idPrefix="routes-map" on={layers.junctions} onToggle={(on) => onToggle("junctions", on)} load={junctions} />
          <p className="border-l-4 border-sign pl-2 font-bold">{ROUTES_SCOPE_TEXT}</p>
          <p>{NO_TRAFFIC_TEXT}</p>
        </div>
      </details>
      {/* Outside the fold, so it is seen with the panel folded; an empty box isn't drawn. */}
      <div role="status" className="w-max max-w-full space-y-1 rounded-[4px] border border-line bg-surface/95 px-3 py-1 text-[13px] shadow-sm empty:hidden">
        {junctions.state === "loading" && <p className="py-1">Loading junction numbers…</p>}
        {junctions.state === "error" && (
          <p className="font-bold text-stale">
            Junction numbers couldn't be loaded.{" "}
            <button type="button" onClick={onRetry} className="min-h-12 underline">
              Try again
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

/** Three stacked sheets: the usual map "layers" symbol. */
function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 2 8l10 5 10-5-10-5Z" />
        <path d="m2 12.5 10 5 10-5" />
        <path d="m2 17 10 5 10-5" />
      </g>
    </svg>
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
