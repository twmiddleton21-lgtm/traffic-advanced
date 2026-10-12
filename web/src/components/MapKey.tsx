import type { Ref } from "react";
import { RESTRICTIONS_DISCLAIMER, type RestrictionPointsFile, type ZonesFile } from "../../../shared/api/restrictions.ts";
import type { MapViewArea } from "../map/MapView.tsx";
import { isStale } from "../restrictions/describe.ts";
import { mapControlsState, zoomMessage } from "../restrictions/mapControls.ts";
import type { LayerStatus } from "../restrictions/useRestrictionData.ts";
import type { AppView } from "../routemap/view.ts";
import { GroupDot, Plate, ZoneLine } from "./RestrictionGlyphs.tsx";
import { DISCLAIMER_ID } from "./RestrictionMapControls.tsx";
import { InViewButtons, STALE_RESTRICTIONS_TEXT, type RestrictionSelection } from "./RestrictionsDialog.tsx";
import { ROUTES_OSM_CAVEAT, type RoutesDataLayer } from "../../../shared/api/routes-layers.ts";
import { ROUTES_HIGHLIGHT_STYLE, ROUTES_LAYER_MIN_ZOOM } from "../map/routesOverlayLayers.ts";
import { formatDate } from "../restrictions/describe.ts";
import { isRoutesDataStale, routesKindLabel, routesMarkerText, sectionTitle, STALE_ROUTES_TEXT } from "../routemap/describe.ts";
import { ROUTES_LIST_LIMIT, routesInView } from "../routemap/inView.ts";
import type { RoutesLayerData, RoutesLayerStatus } from "../routemap/useRoutesLayerData.ts";
import { CameraGlyph, RoutesSymbol, SectionGlyph } from "./RoutesGlyphs.tsx";

/** Routes only: the OpenStreetMap layers' statuses, the map's visible area (for the keyboard list), the data's date, and what opens a record. */
export interface RoutesKeyProps {
  /** Every OpenStreetMap layer this build has data for (routemap/catalog.ts), in the panel's order: each always has a key row. */
  available: RoutesDataLayer[];
  /** Which of them are switched on: a row is shown active when on, muted and marked "Off" when off. */
  on: Partial<Record<RoutesDataLayer, boolean>>;
  /** Their load states (any order); a loaded layer's records feed the keyboard list. */
  statuses: RoutesLayerStatus[];
  area: MapViewArea | null;
  now: Date;
  dataAsOf: string | null;
  onSelect: (selection: { layer: RoutesDataLayer; id: string }) => void;
}

/**
 * The map's one key, for the view that's shown. It folds to a single 48 px "Map key" line, so on phones it takes about as little of
 * the map as possible; App holds whether it's open, starting open where there's room (desktop) and folded on phones and tablets, and
 * keeps the choice across view and layer switches.
 *
 * In Closures it also carries the restriction key while any restriction layer has loaded: the restriction symbols, the zoom hint and
 * the full restrictions disclaimer (SPECIFICATION §7.1). Folded, it looks the same whatever is switched on (owner decision,
 * 2026-10-12: no restriction symbols in the folded line); screen readers hear that it includes restrictions. The disclaimer is then
 * hidden visually only (owner decision, 2026-10-12): it stays in the page, word for
 * word, outside the fold, as the folded control's description for screen readers. While restriction layers are on but none has
 * loaded, the disclaimer is shown with their loading and failure messages instead (RestrictionMapControls), so it is always on the
 * page exactly once.
 *
 * There is no separate "Restrictions" button or list popup (owner decision, 2026-10-12), so the opened key also gives each loaded
 * zone a button to its full details (TfL's page and the boundary notes), and holds the keyboard and screen-reader route to every
 * restriction: the restrictions in view as buttons, hidden visually until they have keyboard focus. Both open RestrictionsDialog.
 */
export function MapKey({
  view,
  open,
  onOpenChange,
  restrictions,
  routes,
  rootRef,
  className = "",
}: {
  view: AppView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Closures only: the restriction layers' statuses, the map's visible area (for the keyboard list of restrictions in view), the
   * time (for the out-of-date warning), and what opens a restriction's or a zone's details.
   */
  restrictions?: { statuses: LayerStatus[]; area: MapViewArea | null; now: Date; onSelect: (selection: RestrictionSelection) => void };
  /** Routes only: its OpenStreetMap layers, so the key shows exactly the layers that are on and loaded. */
  routes?: RoutesKeyProps;
  /** The key's outer box, so the Routes view can keep its Layers panel clear of it whatever the key's height (App.tsx). */
  rootRef?: Ref<HTMLDivElement>;
  /** Where it sits on the map (App positions it per view). */
  className?: string;
}) {
  const state = view === "closures" && restrictions ? mapControlsState(restrictions.statuses, restrictions.area?.zoom ?? null) : null;
  const on = restrictions?.statuses.filter((s) => s.state !== "off") ?? [];
  const withRestrictions = state !== null && on.some((s) => s.state === "ready");
  const message = state && withRestrictions ? zoomMessage(state) : null;
  const pointFiles: RestrictionPointsFile[] = on.flatMap((s) => (s.state === "ready" && s.data !== null && "points" in s.data ? [s.data.points] : []));
  const zoneFiles: ZonesFile[] = on.flatMap((s) => (s.state === "ready" && s.data !== null && "zones" in s.data ? [s.data.zones] : []));
  const stale = restrictions ? [...pointFiles, ...zoneFiles].some((f) => isStale(f.generatedAt, restrictions.now)) : false;
  return (
    <div ref={rootRef} className={`pointer-events-auto overflow-y-auto overscroll-contain rounded-[4px] border border-line bg-surface/95 text-[13px] shadow-sm ${className}`}>
      <details id="map-key" open={open} onToggle={(e) => onOpenChange(e.currentTarget.open)} className="group">
        <summary
          aria-describedby={withRestrictions && !open ? DISCLAIMER_ID : undefined}
          className="flex min-h-12 cursor-pointer select-none items-center gap-1.5 px-2.5 font-bold focus-visible:-outline-offset-3!"
        >
          Map key
          {withRestrictions && <span className="sr-only">, including restrictions</span>}
          <Chevron />
        </summary>
        {view === "routes" ? <RoutesKey osm={routes} /> : <ClosuresKey />}
        {withRestrictions && (
          <section aria-label="Restrictions key" className="border-t border-line px-2.5 pb-2 pt-1.5">
            <h3 className="pb-1 font-bold">Restrictions</h3>
            <div role="status" className="space-y-1">
              {message && <p>{message}</p>}
              <RestrictionRows statuses={on} grouped={state.grouped} />
              {state.community && <p className="text-muted">Dashed: community record, unverified.</p>}
            </div>
            {stale && <p className="pt-1 font-bold text-stale">{STALE_RESTRICTIONS_TEXT}</p>}
            {/* Each zone's full details (TfL's page, the boundary notes and their limits), for everyone. */}
            {zoneFiles.length > 0 && (
              <ul className="pt-1">
                {zoneFiles.flatMap((f) => f.zones).map((z) => (
                  <li key={z.id}>
                    <button
                      type="button"
                      onClick={() => restrictions?.onSelect({ kind: "zone", id: z.id })}
                      className="flex min-h-12 w-full items-center gap-1.5 rounded-[4px] text-left font-bold underline decoration-2 underline-offset-2 hover:bg-raised"
                    >
                      <ZoneLine zone={z.id} />
                      {`${z.id.toUpperCase()} details and TfL's page`}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {/* The keyboard and screen-reader route to every restriction (map markers are pointer targets only): hidden until it
                has keyboard focus, so it adds nothing to the key on screen for touch and mouse users. */}
            {pointFiles.length > 0 && (
              <div className="sr-only space-y-1 focus-within:not-sr-only focus-within:pt-2">
                <h4 className="font-bold">Restrictions in this view (keyboard list)</h4>
                <InViewButtons view={restrictions?.area ?? null} points={pointFiles} onSelect={(id) => restrictions?.onSelect({ kind: "point", id })} />
              </div>
            )}
          </section>
        )}
      </details>
      {/* The full disclaimer, one element, outside the fold and the live region: shown under the open key; while the key is
          folded it is hidden visually but kept, and read out with the folded control. */}
      {withRestrictions && (
        <p id={DISCLAIMER_ID} className={open ? "mx-2.5 mb-2 border-l-4 border-sign pl-2 font-bold" : "sr-only"}>
          {RESTRICTIONS_DISCLAIMER}
        </p>
      )}
    </div>
  );
}

/** Points down when the key is folded, up when it's open; the open state is also announced by the summary itself. */
function Chevron() {
  return (
    <svg viewBox="0 0 20 20" className="ml-auto size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true">
      <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RoutesKey({ osm }: { osm: RoutesKeyProps | undefined }) {
  return (
    <>
      <ul className="space-y-1 px-2.5 pb-2">
        <li className="flex items-center gap-2">
          <RoadGlyph className="stroke-[#0b4f9c] dark:stroke-[#4a8fe0]" /> Motorway
        </li>
        <li className="flex items-center gap-2">
          <RoadGlyph className="stroke-[#00703c] dark:stroke-[#2fa66a]" /> Primary route (green-signed A road)
        </li>
        <li className="flex items-center gap-2">
          <JunctionGlyph />
          Junction number (National Highways roads only)
        </li>
      </ul>
      {osm && <RoutesOsmKey osm={osm} />}
    </>
  );
}

/**
 * The Routes OpenStreetMap layers' key: always the full legend, one compact row per layer this build has (the same seven rows
 * whatever is switched on). A layer that is off is muted and marked "Off", never hidden, so the key doesn't change shape as layers
 * are switched. While any layer is on: the road-highlight colours (weight), what "*" and a faint road mean, which layers need more
 * zoom, the community-data caveat once, and the data's date. The keyboard list of records in view is hidden until it has keyboard
 * focus, as in Closures.
 */
function RoutesOsmKey({ osm }: { osm: RoutesKeyProps }) {
  if (osm.available.length === 0) return null;
  const isOn = (l: RoutesDataLayer) => osm.on[l] === true;
  const anyOn = osm.available.some(isOn);
  const restrictionOn = osm.available.some((l) => isOn(l) && RESTRICTION_LAYERS.has(l));
  const ready = osm.statuses.filter((s): s is RoutesLayerStatus & { data: RoutesLayerData } => isOn(s.layer) && s.state === "ready" && s.data !== null);
  // Layers that are on but not drawn at this zoom: say so, so an empty map never reads as nothing being mapped.
  const zoom = osm.area?.zoom ?? null;
  const notYet = zoom === null ? [] : osm.available.filter((l) => isOn(l) && zoom < ROUTES_LAYER_MIN_ZOOM[l]);
  return (
    <section aria-label="Community map data key" className="border-t border-line px-2.5 pb-2 pt-1.5">
      <h3 className="pb-1 font-bold">Community map data</h3>
      <ul className="space-y-1">
        {osm.available.map((l) => (
          <li key={l} className={`flex items-center gap-2 ${isOn(l) ? "" : "text-muted opacity-60"}`}>
            <span className="flex w-7 shrink-0 justify-center">
              <KeySymbol layer={l} />
            </span>
            <span className="flex-1">{KEY_LABELS[l]}</span>
            {!isOn(l) && <span className="text-[11px] font-bold uppercase">Off</span>}
          </li>
        ))}
      </ul>
      {isOn("weight") && (
        <p className="flex items-center gap-1.5 pt-1">
          <RoadSwatch colour={ROUTES_HIGHLIGHT_STYLE["weight-strong"].colour} /> 7.5 t or less
          <RoadSwatch colour={ROUTES_HIGHLIGHT_STYLE["weight-soft"].colour} /> above 7.5 t
        </p>
      )}
      {restrictionOn && <p className="pt-1">Highlighted road: limit mapped along it. Faint road or *: conditions or exemptions apply.</p>}
      {notYet.length > 0 && <p className="pt-1">{`Zoom in to see: ${notYet.map((l) => KEY_LABELS[l].toLowerCase()).join(", ")}.`}</p>}
      {anyOn && <p className="pt-1 font-bold">{ROUTES_OSM_CAVEAT}</p>}
      {anyOn && osm.dataAsOf && <p className="text-muted">{`© OpenStreetMap contributors, ODbL. Data to ${formatDate(osm.dataAsOf)}.`}</p>}
      {anyOn && osm.dataAsOf && isRoutesDataStale(osm.dataAsOf, osm.now) && <p className="font-bold text-stale">{STALE_ROUTES_TEXT}</p>}
      {ready.length > 0 && (
        <div className="sr-only space-y-1 focus-within:not-sr-only focus-within:pt-2">
          <h4 className="font-bold">Community map data in this view (keyboard list)</h4>
          <RoutesInViewButtons osm={osm} layers={ready.map((s) => ({ layer: s.layer, data: s.data }))} />
        </div>
      )}
    </section>
  );
}

const RESTRICTION_LAYERS = new Set<RoutesDataLayer>(["height", "weight", "width-length", "access"]);

/** Short row labels: the key stays a compact legend (the panel has the descriptions). */
const KEY_LABELS: Record<RoutesDataLayer, string> = {
  "speed-cameras": "Speed cameras",
  "average-speed": "Average speed checks",
  "red-light-cameras": "Red-light cameras",
  height: "Height limits",
  weight: "Weight limits",
  "width-length": "Width and length limits",
  access: "Lorry access restrictions",
};

/** One symbol per row, as drawn on the map. */
function KeySymbol({ layer }: { layer: RoutesDataLayer }) {
  switch (layer) {
    case "speed-cameras":
      return <CameraGlyph />;
    case "red-light-cameras":
      return <CameraGlyph redLight />;
    case "average-speed":
      return <SectionGlyph />;
    case "height":
      return <RoutesSymbol kind="height" text="4.4m" />;
    case "weight":
      return <RoutesSymbol kind="weight-goods" text="7.5t" />;
    case "width-length":
      return <RoutesSymbol kind="width" text="2m" />;
    case "access":
      return <RoutesSymbol kind="hgv-access" text="No" />;
  }
}

/** A short stretch of highlighted road, as drawn on the map. */
function RoadSwatch({ colour }: { colour: string }) {
  return (
    <svg viewBox="0 0 20 8" className="h-2 w-5 shrink-0" aria-hidden="true">
      <path d="M1 4 H19" stroke={colour} strokeWidth="4" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

function RoutesInViewButtons({ osm, layers }: { osm: RoutesKeyProps; layers: { layer: RoutesDataLayer; data: RoutesLayerData }[] }) {
  const view = osm.area;
  if (!view) return <p>The map is still loading.</p>;
  // Only the layers drawn at this zoom are listed, as on the map.
  const drawn = layers.filter((l) => view.zoom >= ROUTES_LAYER_MIN_ZOOM[l.layer]);
  if (drawn.length === 0) return <p>Zoom in on the map to list the community map data here.</p>;
  const { items, total } = routesInView(drawn, view.bounds, view.centre);
  return (
    <>
      <p>
        {total === 0
          ? "Nothing is mapped in this view for the layers that are on. That does not mean there is nothing there."
          : total > ROUTES_LIST_LIMIT
            ? `${total} mapped in this view. The ${ROUTES_LIST_LIMIT} nearest the centre are listed; zoom in to narrow the list.`
            : `${total} mapped in this view, nearest the centre first.`}
      </p>
      {items.length > 0 && (
        <ul className="divide-y divide-line rounded-[4px] border border-line">
          {items.map((item) => {
            const id = item.kind === "point" ? item.point.id : item.section.id;
            return (
              <li key={id}>
                <button type="button" onClick={() => osm.onSelect({ layer: item.layer, id })} className="flex min-h-12 w-full items-start gap-3 px-3 py-2 text-left hover:bg-raised">
                  <span className="pt-0.5">{item.kind === "point" ? <RoutesSymbol kind={item.point.kind} text={routesMarkerText(item.point)} /> : <SectionGlyph />}</span>
                  <span>{item.kind === "point" ? routesKindLabel(item.point) : sectionTitle(item.section)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function RoadGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 28 10" className="h-2.5 w-7 shrink-0" aria-hidden="true">
      <path d="M2 5 H26" className={className} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function JunctionGlyph() {
  return (
    <span className="flex w-7" aria-hidden="true">
      <span className="rounded-[3px] border border-white bg-[#14191e] px-1 text-[10px] font-bold leading-[14px] text-white ring-1 ring-[#14191e]">J4</span>
    </span>
  );
}

function ClosuresKey() {
  return (
    <ul className="space-y-1 px-2.5 pb-2">
      <li className="flex items-center gap-2">
        <ClosureGlyph /> Closed carriageway
      </li>
      <li className="flex items-center gap-2">
        <RouteGlyph /> Official diversion route, arrows show the way to drive
      </li>
      <li className="flex items-center gap-2">
        <span className="flex w-7 justify-center gap-1" aria-hidden="true">
          <span className="size-3 rounded-full border-[3px] border-[#14191e] bg-white" />
          <span className="size-3 rounded-full border-[3px] border-white bg-[#14191e] ring-1 ring-[#14191e]" />
        </span>
        Diversion starts / rejoins
      </li>
      <li className="flex items-center gap-2">
        <span className="flex w-7 gap-0.5" aria-hidden="true">
          {["A", "B"].map((x) => (
            <span key={x} className="grid size-3.5 place-items-center rounded-full border border-[#14191e] bg-sign text-[9px] font-bold text-[#14191e]">
              {x}
            </span>
          ))}
        </span>
        Official diversion information
      </li>
      <li className="flex items-center gap-2">
        <span className="flex w-7" aria-hidden="true">
          <span className="grid size-3.5 place-items-center rounded-full border border-[#14191e] bg-unmatched text-[9px] font-bold text-white">D</span>
        </span>
        No reliable diversion
      </li>
      <li className="flex items-center gap-2">
        <span className="flex w-7" aria-hidden="true">
          <span className="rounded-[3px] border border-white bg-[#14191e] px-1 text-[10px] font-bold leading-[14px] text-white ring-1 ring-[#14191e]">J4</span>
        </span>
        Junction number (National Highways)
      </li>
    </ul>
  );
}

/** Matches the closure line on the map: red with a dark casing (style.ts closureLayers). */
function ClosureGlyph() {
  return (
    <svg viewBox="0 0 28 10" className="h-2.5 w-7 shrink-0" aria-hidden="true">
      <path d="M2 5 H26" stroke="#14191e" strokeWidth="6" strokeLinecap="round" />
      <path d="M2 5 H26" stroke="#c8102e" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

function RouteGlyph() {
  return (
    <svg viewBox="0 0 28 10" className="h-2.5 w-7 shrink-0" aria-hidden="true">
      <path d="M1 5 H27" stroke="#14191e" strokeWidth="7" strokeLinecap="round" />
      <path d="M1 5 H27" stroke="#ffd200" strokeWidth="4" strokeLinecap="round" />
      <path d="M11 2 L17 5 L11 8 L12.5 5 Z" fill="#14191e" />
    </svg>
  );
}

function RestrictionRows({ statuses, grouped }: { statuses: LayerStatus[]; grouped: ("height" | "weight")[] }) {
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
