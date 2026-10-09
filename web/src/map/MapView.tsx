import { GeolocateControl, Map as MapLibreMap, NavigationControl, ScaleControl, setWorkerUrl, type ErrorEvent, type GeoJSONSource } from "maplibre-gl";
// MapLibre 6 ships its worker as a separate module; Vite must bundle it via ?worker&url (MapLibre docs, "ESM > Vite").
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);
import { useEffect, useRef, useState } from "react";
import type { TrafficClosure } from "../../../shared/api/closures.ts";
import type { Junction } from "../../../shared/api/junctions.ts";
import { WIDE_QUERY } from "../hooks/useWideLayout.ts";
import { addMapImages } from "./images.ts";
import {
  createLocationErrors,
  GEOLOCATE_OPTIONS,
  locateOnLaunch,
  locationPermission,
  renewLocationControl,
  shouldLocateOnLaunch,
  stopFollowingOnZoom,
  type LocationNotice,
} from "./location.ts";
import { closureBounds, closureLines, closureMarkers, confirmedJunctionNames, diversionEnds, ENGLAND_BOUNDS, junctionPoints, selectedRouteLines } from "./layers.ts";
import { baseLabelAdjustments, confirmedJunctionFilter, overlayLayers, roadEmphasisBeforeId, roadEmphasisLayers, selectedFilter, type Theme } from "./style.ts";

/** OpenFreeMap: free, no key, commercial use allowed, attribution included in the style (docs/DATA-SOURCES.md S10). */
const STYLE_URL = { light: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" } as const;

interface Props {
  closures: TrafficClosure[];
  selected: TrafficClosure | null;
  junctions: Junction[];
  onSelect: (id: string) => void;
  /** Called whenever the map has finished rendering (MapLibre "idle"): the app's signal that the first view is ready. */
  onIdle?: () => void;
  theme: Theme;
}
type Latest = { current: Props };

export function MapView(props: Props) {
  const { closures, selected, junctions, theme } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const styleTheme = useRef(theme);
  const latest = useRef(props);
  // Keep the latest props for map callbacks (written after render, never during it).
  useEffect(() => {
    latest.current = props;
  });
  const [baseMapError, setBaseMapError] = useState(false);
  // Location UI state only: whether the map is following the user, and the last error. Never the coordinates (see location.ts).
  const [following, setFollowing] = useState(false);
  const [locationNotice, setLocationNotice] = useState<LocationNotice | null>(null);

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibreMap({
      container: container.current,
      style: STYLE_URL[theme],
      bounds: ENGLAND_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      // At every size the attribution folds to an (i) button, so it doesn't cover the bottom of the map (see foldAttributionLater).
      attributionControl: { compact: true, customAttribution: "Closures, diversions and junctions: National Highways, Open Government Licence v3.0" },
    });
    map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(new ScaleControl({ unit: "imperial" }), "bottom-right");
    // "Show my location": stacks under the zoom/compass buttons. Pressed once for the user on launch (see location.ts).
    let geolocate = new GeolocateControl(GEOLOCATE_OPTIONS);
    map.addControl(geolocate, "top-right");
    const launch = locateOnLaunch(
      map,
      geolocate,
      Promise.all([shouldLocateOnLaunch(), map.once("load")]).then(([ok]) => ok),
    );
    // Mirrors MapLibre's follow lock for the map's own handlers; React state drives the indicator (not shown for the launch view,
    // which stops following as soon as it is set).
    let isFollowing = false;
    const follow = (on: boolean) => {
      isFollowing = on;
      setFollowing(on && !launch.locating());
    };
    // Launch versus button errors, permission state, stale results and renewal: see createLocationErrors.
    const errors = createLocationErrors({
      noteError: launch.noteError,
      permission: locationPermission,
      stopFollowing: () => follow(false),
      showNotice: setLocationNotice,
      renewControl: (refocus) => renew(refocus),
    });
    const wire = (control: GeolocateControl) => {
      control.on("trackuserlocationstart", () => {
        errors.requestStarted();
        follow(true);
        // Zoom in to the user's area on the first fix only if the map is zoomed out; otherwise keep the user's zoom.
        control.options.zoomToUserAccuracy = map.getZoom() < 10;
      });
      // After the first fix, position updates only re-centre: they never undo a zoom the user chose. (The event's position is
      // deliberately not read.)
      control.on("geolocate", () => (control.options.zoomToUserAccuracy = false));
      control.on("userlocationfocus", () => follow(true));
      // A manual pan or zoom stops following (MapLibre's "background" state); pressing the button again re-centres and follows.
      control.on("userlocationlostfocus", () => follow(false));
      control.on("trackuserlocationend", () => follow(false));
      // The control's only error listener.
      control.on("error", (e) => void errors.handle(e.code));
    };
    // After a dismissed prompt the button must work again: a fresh control (see renewLocationControl). Focus goes back to the button
    // only if the user had just pressed it; MapLibre enables the new button once its support check resolves, so focus waits a turn.
    const renew = (refocus: boolean) => {
      geolocate = renewLocationControl<GeolocateControl>(map, geolocate, () => new GeolocateControl(GEOLOCATE_OPTIONS));
      wire(geolocate);
      if (refocus) setTimeout(() => errors.active() && container.current?.querySelector<HTMLButtonElement>("button.maplibregl-ctrl-geolocate")?.focus(), 0);
    };
    wire(geolocate);
    stopFollowingOnZoom(map, () => isFollowing);
    map.on("style.load", () => installLayers(map, latest));
    const stopFolding = foldAttributionLater(map, container.current);
    registerInteractions(map, latest);
    map.on("idle", () => latest.current.onIdle?.());
    map.on("error", (e: ErrorEvent) => {
      // Tile/style failures leave the list usable; tell the user rather than failing silently.
      if (/style|tile|source/i.test(e.error.message)) setBaseMapError(true);
      // Registering a listener replaces MapLibre's own console report, so keep errors (e.g. invalid layers) visible to developers.
      console.error(e.error);
    });
    mapRef.current = map;
    // MapLibre only listens for window resizes; layout changes (panels, breakpoints) also resize the container.
    // The entries are passed on so a resize isn't mistaken for the user moving the map (which would stop location follow).
    const observer = new ResizeObserver((entries) => map.resize(entries));
    observer.observe(container.current);
    return () => {
      errors.dispose();
      launch.cancel();
      stopFolding();
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; theme changes are handled below
  }, []);

  // Theme: swap the base style; layers and images are re-installed on "style.load". Skipped when the style already matches
  // (including the first render), and not diffed, so the new style starts clean instead of half-keeping our layers.
  useEffect(() => {
    if (!mapRef.current || styleTheme.current === theme) return;
    styleTheme.current = theme;
    mapRef.current.setStyle(STYLE_URL[theme], { diff: false });
  }, [theme]);

  // Data and selection.
  useEffect(() => {
    const map = mapRef.current;
    // Our sources exist once installLayers has run. (isStyleLoaded() stays false while tiles load, which would drop updates.)
    if (!map?.getSource("closures")) return;
    updateData(map, closures, selected, junctions);
  }, [closures, selected, junctions]);

  // Frame the selected closure with its whole diversion, start to rejoin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    const bounds = closureBounds(selected);
    if (bounds) map.fitBounds(bounds, { padding: detailPadding(map.getContainer()), maxZoom: 12, duration: 600 });
  }, [selected]);

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" aria-label="Map of closures" role="region" />
      <div className="pointer-events-none absolute left-[max(0.75rem,env(safe-area-inset-left))] right-14 top-[calc(0.75rem+var(--ta-map-top-inset,0px))] flex flex-col items-start gap-2">
        {baseMapError && <p className="rounded-[4px] bg-surface px-3 py-2 text-[14px] shadow">The base map couldn't load. The closures list still works.</p>}
        {following && (
          <p role="status" className="rounded-[4px] border-2 border-[#1a73e8] bg-surface px-3 py-2 text-[14px] shadow">
            <span className="font-bold">Following your location.</span> Move or zoom the map to stop.
            <span className="block text-[13px]">For planning only. Do not use while driving.</span>
          </p>
        )}
        {locationNotice && (
          // After a press of the location button the message is assertive; after the launch request it never interrupts.
          <div
            role={locationNotice.urgent ? "alert" : "status"}
            className="pointer-events-auto flex max-w-md items-start gap-2 rounded-[4px] bg-surface py-1 pl-3 pr-1 text-[14px] shadow"
          >
            <p className="py-2">{locationNotice.text}</p>
            <button type="button" onClick={() => setLocationNotice(null)} className="min-h-12 min-w-12 shrink-0 rounded-[4px] px-2 font-bold underline">
              Dismiss
            </button>
          </div>
        )}
      </div>
      <Legend />
    </div>
  );
}

/** How long the map credits stay open once the map is in view: the OSMF attribution guidelines allow folding them after five seconds. */
const ATTRIBUTION_SHOWN_MS = 5000;

/**
 * The map credits and licences (OpenStreetMap/OpenMapTiles/OpenFreeMap, National Highways OGL) open when the map first comes into
 * view, then fold to MapLibre's (i) button after ATTRIBUTION_SHOWN_MS, or sooner when the map is dragged (MapLibre does that). Both
 * are collapse triggers the OSMF attribution guidelines allow; folded, the credits are one tap away. The countdown starts at the
 * first render once the splash has gone (index.html keeps #root inert until then), so the credits are seen. Folding removes the
 * same class MapLibre's own drag handler removes, so the (i) button opens and closes them as before.
 */
function foldAttributionLater(map: MapLibreMap, container: HTMLElement): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let observer: MutationObserver | undefined;
  const fold = () => container.querySelector(".maplibregl-compact-show")?.classList.remove("maplibregl-compact-show");
  const root = container.closest("#root");
  map.once("idle", () => {
    const countdown = () => (timer = setTimeout(fold, ATTRIBUTION_SHOWN_MS));
    if (!root?.hasAttribute("inert")) return countdown();
    observer = new MutationObserver(() => {
      if (root.hasAttribute("inert")) return;
      observer?.disconnect();
      countdown();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["inert"] });
  });
  return () => {
    clearTimeout(timer);
    observer?.disconnect();
  };
}

/**
 * Map padding that frames a selected closure in the part of the map its details panel leaves visible (App.tsx positions the panel):
 * desktop, a 440px panel on the right; phone or tablet held sideways, a panel on the right; held upright, a sheet over the lower 58%.
 */
function detailPadding(container: HTMLElement) {
  const { clientWidth: width, clientHeight: height } = container;
  // Extra room at the bottom for the map key and attribution.
  if (window.matchMedia(WIDE_QUERY).matches) return { top: 60, bottom: 84, left: 60, right: 60 + 440 };
  if (window.matchMedia("(orientation: landscape)").matches) return { top: 32, bottom: 56, left: 32, right: 32 + Math.min(440, width * 0.58) };
  // Clear of the Closures button above and the map buttons on the right.
  return { top: 76, bottom: 24 + height * 0.58, left: 32, right: 56 };
}

function installLayers(map: MapLibreMap, latest: Latest) {
  const { closures, selected, junctions, theme } = latest.current;
  addMapImages(map);

  const style = map.getStyle();
  const { hide, minzoom } = baseLabelAdjustments(style);
  for (const id of hide) map.setLayoutProperty(id, "visibility", "none");
  for (const { id, zoom } of minzoom) map.setLayerZoomRange(id, zoom, 24);
  // Road emphasis goes over the base roads but under the base map's labels, so place names stay readable.
  const beforeId = roadEmphasisBeforeId(style);
  for (const layer of roadEmphasisLayers(theme)) map.addLayer(layer, beforeId);

  map.addSource("closures", { type: "geojson", data: closureLines(closures) });
  map.addSource("markers", { type: "geojson", data: closureMarkers(closures) });
  map.addSource("selected-route", { type: "geojson", data: selectedRouteLines(selected) });
  map.addSource("route-ends", { type: "geojson", data: diversionEnds(selected) });
  map.addSource("junctions", { type: "geojson", data: junctionPoints(junctions) });

  // Bottom → top; see style.ts for why this order is the label priority.
  for (const layer of overlayLayers()) map.addLayer(layer);
  applySelection(map, selected);
}

/** Layer-scoped handlers survive style swaps in MapLibre, so they're registered once, not on every "style.load". */
function registerInteractions(map: MapLibreMap, latest: Latest) {
  for (const layer of ["marker", "closure-line", "selected-marker"]) {
    map.on("click", layer, (e) => {
      const id = e.features?.[0]?.properties?.["id"] as string | undefined;
      if (id) latest.current.onSelect(id);
    });
    map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
  }
}

function applySelection(map: MapLibreMap, selected: TrafficClosure | null) {
  const filter = selectedFilter(selected?.id ?? null);
  for (const id of ["selected-closure-casing", "selected-closure-line", "selected-marker", "selected-marker-label"]) map.setFilter(id, filter);
  map.setFilter("ta-junction-confirmed", confirmedJunctionFilter(confirmedJunctionNames(selected)));
}

function updateData(map: MapLibreMap, closures: TrafficClosure[], selected: TrafficClosure | null, junctions: Junction[]) {
  void map.getSource<GeoJSONSource>("closures")?.setData(closureLines(closures));
  void map.getSource<GeoJSONSource>("markers")?.setData(closureMarkers(closures));
  void map.getSource<GeoJSONSource>("selected-route")?.setData(selectedRouteLines(selected));
  void map.getSource<GeoJSONSource>("route-ends")?.setData(diversionEnds(selected));
  void map.getSource<GeoJSONSource>("junctions")?.setData(junctionPoints(junctions));
  applySelection(map, selected);
}

function Legend() {
  // Open by default where there's room; on phones and tablets the key starts closed so it doesn't cover the map.
  const [open] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  return (
    <details
      open={open}
      className="absolute bottom-[calc(2rem+env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] max-w-[calc(100%-1.5rem)] rounded-[4px] border border-line bg-surface/95 text-[13px] shadow-sm"
    >
      <summary className="flex min-h-11 cursor-pointer select-none items-center px-3 font-bold lg:min-h-0 lg:py-2">Map key</summary>
      <ul className="space-y-1.5 px-3 pb-2.5">
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
    </details>
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
