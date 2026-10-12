import { ROUTES_OSM_CAVEAT, type RoutesDataLayer } from "../../../shared/api/routes-layers.ts";
import type { JunctionLoad } from "../routemap/junctionLabels.ts";
import { ROUTES_LAYER_MIN_ZOOM, ZOOM_LEVEL_WORDS } from "../map/routesOverlayLayers.ts";
import type { RoutesLayerSwitches } from "../map/viewLayers.ts";
import type { RoutesLayerEntry } from "../routemap/catalog.ts";
import { isRoutesDataStale, ROUTES_LAYER_TEXT, STALE_ROUTES_TEXT } from "../routemap/describe.ts";
import type { RoutesLayerStatus } from "../routemap/useRoutesLayerData.ts";
import { formatDate } from "../restrictions/describe.ts";
import { SwitchGlyph } from "./settings/RestrictionsSection.tsx";

/** The OpenStreetMap layers this build has data for, their load states, and the data's date. */
export interface RoutesOsmLayers {
  entries: RoutesLayerEntry[];
  statuses: Record<RoutesDataLayer, RoutesLayerStatus>;
  /** When the OpenStreetMap data runs to (the extract's own date); null when no layer has data. */
  dataAsOf: string | null;
  now: Date;
  /** The map's zoom now (null while it loads), so a layer that is on but not drawn yet can say to zoom in. */
  zoom: number | null;
}

const GROUPS: { title: string; layers: RoutesDataLayer[] }[] = [
  { title: "Cameras", layers: ["speed-cameras", "average-speed", "red-light-cameras"] },
  { title: "Road limits", layers: ["height", "weight", "width-length", "access"] },
];
const osmLink = "font-bold underline decoration-2 underline-offset-2";

/** What the Routes view is not, shown with its layers and its settings (wording approved by the owner 2026-10-12, docs/ROUTES-MAP.md; don't change it silently). */
export const ROUTES_SCOPE_TEXT = "Routes is for route awareness only. It doesn't plan routes, check whether roads suit your vehicle, or give directions. Always follow road signs.";
/** Shown with the Routes layers while no live traffic is connected (wording approved by the owner 2026-10-12, docs/ROUTES-MAP.md). */
export const NO_TRAFFIC_TEXT = "Live traffic isn't connected yet. Road closures are in the Closures view.";

/**
 * The Routes view's Layers control, at the top left of the map, and the one place its layers are switched on and off. Folded, it is
 * a square map button (layers icon and "Layers") in the manner of a map app's layers control; open, a panel under it shows each
 * layer's switch, what it covers and its data's state, then the scope and not-connected notes. It opens and closes on its own, never
 * with the map key; closing it changes no switch and loads nothing (App holds the switches). Every switch is independent. Loading
 * and failure messages stay outside the fold, under the button, so they are seen with the panel folded.
 */
export function RoutesMapControls({
  layers,
  onToggle,
  junctions,
  onRetry,
  osm,
  open,
  onOpenChange,
}: {
  layers: RoutesLayerSwitches;
  onToggle: (layer: keyof RoutesLayerSwitches, on: boolean) => void;
  junctions: JunctionLoad;
  onRetry: () => void;
  osm?: RoutesOsmLayers;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const statuses = osm ? osm.entries.map((e) => osm.statuses[e.layer]) : [];
  return (
    // The Layers button is a fixed control and never scrolls. Opened, only the panel's own box scrolls, inside its border (as the
    // Closures list and the map key do), when it is taller than the room above the map key. p-px keeps the button's border in view.
    // The box is capped two ways: as a shrinking flex item of <details>, and (where <details> ignores flex) at the container's height
    // less the button (100cqh: App.tsx makes the Layers container a size container).
    <div className={`pointer-events-auto flex max-h-full min-h-0 flex-col items-start gap-1.5 p-px ${open ? "w-[min(20rem,calc(100vw-5.5rem))]" : ""}`}>
      <details id="routes-layers" open={open} onToggle={(e) => onOpenChange(e.currentTarget.open)} className="group flex min-h-0 w-full flex-col">
        <summary className="flex size-14 shrink-0 cursor-pointer select-none flex-col items-center justify-center gap-0.5 rounded-[4px] border border-line bg-surface text-[12px] font-bold shadow-[0_1px_4px_rgb(0_0_0/0.25)] hover:bg-raised group-open:bg-raised focus-visible:-outline-offset-3!">
          <LayersIcon />
          Layers
        </summary>
        <div className="mt-1.5 max-h-[calc(100cqh-4.25rem)] min-h-0 space-y-2 overflow-y-auto overscroll-contain rounded-[4px] border border-line bg-surface p-3 text-[13px] shadow-sm">
          <JunctionNumbersSwitch idPrefix="routes-map" on={layers.junctions} onToggle={(on) => onToggle("junctions", on)} load={junctions} />
          {osm && osm.entries.length > 0 && <OsmLayerSwitches osm={osm} layers={layers} onToggle={onToggle} />}
          <p className="border-l-4 border-sign pl-2 font-bold">{ROUTES_SCOPE_TEXT}</p>
          <p>{NO_TRAFFIC_TEXT}</p>
        </div>
      </details>
      {/* Outside the fold, so it is seen with the panel folded; an empty box isn't drawn. */}
      <div role="status" className="w-max max-w-full shrink-0 space-y-1 rounded-[4px] border border-line bg-surface/95 px-3 py-1 text-[13px] shadow-sm empty:hidden">
        {junctions.state === "loading" && <p className="py-1">Loading junction numbers…</p>}
        {junctions.state === "error" && (
          <p className="font-bold text-stale">
            Junction numbers couldn't be loaded.{" "}
            <button type="button" onClick={onRetry} className="min-h-12 underline">
              Try again
            </button>
          </p>
        )}
        {statuses
          .filter((s) => s.state === "loading")
          .map((s) => (
            <p key={s.layer} className="py-1">{`Loading ${ROUTES_LAYER_TEXT[s.layer].label.toLowerCase()}…`}</p>
          ))}
        {statuses
          .filter((s) => s.state === "error")
          .map((s) => (
            <p key={s.layer} className="font-bold text-stale">
              {`${ROUTES_LAYER_TEXT[s.layer].label} couldn't be loaded.`}{" "}
              <button type="button" onClick={s.retry} className="min-h-12 underline">
                Try again
              </button>
            </p>
          ))}
      </div>
    </div>
  );
}

/** The OpenStreetMap layers' switches, in groups, with the community-data caveat, the source and the data's date. */
export function OsmLayerSwitches({ osm, layers, onToggle }: { osm: RoutesOsmLayers; layers: RoutesLayerSwitches; onToggle: (layer: keyof RoutesLayerSwitches, on: boolean) => void }) {
  const available = new Set(osm.entries.map((e) => e.layer));
  return (
    <section aria-labelledby="routes-osm-title" className="space-y-2">
      <h3 id="routes-osm-title" className="pt-1 text-[14px] font-bold">
        Community map data
      </h3>
      <p className="border-l-4 border-sign pl-2 font-bold">{ROUTES_OSM_CAVEAT}</p>
      {GROUPS.map((g) => {
        const shown = g.layers.filter((l) => available.has(l));
        if (shown.length === 0) return null;
        return (
          <div key={g.title} role="group" aria-label={g.title} className="space-y-1.5">
            <h4 className="font-bold text-muted">{g.title}</h4>
            {shown.map((l) => (
              <RoutesLayerSwitch key={l} layer={l} on={layers[l] === true} onToggle={(on) => onToggle(l, on)} status={osm.statuses[l]} records={osm.entries.find((e) => e.layer === l)!.records} zoom={osm.zoom} />
            ))}
          </div>
        );
      })}
      <p className="text-muted">
        Source:{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className={osmLink}>
          © OpenStreetMap contributors
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        , Open Database License (ODbL) 1.0.{osm.dataAsOf ? ` OpenStreetMap data to ${formatDate(osm.dataAsOf)}.` : ""}
      </p>
      {osm.dataAsOf && isRoutesDataStale(osm.dataAsOf, osm.now) && <p className="font-bold text-stale">{STALE_ROUTES_TEXT}</p>}
    </section>
  );
}

/** One OpenStreetMap layer's switch, with what it covers and its data's state. Off by default; it never changes another switch. */
export function RoutesLayerSwitch({
  layer,
  on,
  onToggle,
  status,
  records,
  zoom = null,
}: {
  layer: RoutesDataLayer;
  on: boolean;
  onToggle: (on: boolean) => void;
  status: RoutesLayerStatus;
  records: number;
  zoom?: number | null;
}) {
  const from = ROUTES_LAYER_MIN_ZOOM[layer];
  const descriptionId = `routes-layer-${layer}-description`;
  const text = ROUTES_LAYER_TEXT[layer];
  return (
    <div className="rounded-[4px] border border-line">
      <button type="button" role="switch" aria-checked={on} aria-describedby={descriptionId} onClick={() => onToggle(!on)} className="flex min-h-12 w-full items-center gap-3 px-3 py-1.5 text-left text-[14px] hover:bg-raised">
        <span className="flex-1 font-bold">{text.label}</span>
        <SwitchGlyph on={on} />
      </button>
      <div id={descriptionId} className="space-y-1 px-3 pb-2 text-[13px]">
        <p>{text.description}</p>
        <p className="text-muted">{`Shown when zoomed in to ${ZOOM_LEVEL_WORDS[from]} level.`}</p>
        {on && status.state === "ready" && zoom !== null && zoom < from && <p className="font-bold">Zoom in on the map to see them.</p>}
        {status.state === "ready" && <p>{records === 0 ? "None are mapped in this data." : `${records.toLocaleString("en-GB")} mapped in England.`}</p>}
        {status.state === "loading" && <p>Loading…</p>}
        {status.state === "error" && <p className="font-bold text-stale">Couldn&apos;t be loaded.</p>}
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
