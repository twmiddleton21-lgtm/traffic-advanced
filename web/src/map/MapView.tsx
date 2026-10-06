import { GeolocateControl, Map as MapLibreMap, NavigationControl, ScaleControl, setWorkerUrl, type ErrorEvent, type GeoJSONSource } from "maplibre-gl";
// MapLibre 6 ships its worker as a separate module; Vite must bundle it via ?worker&url (MapLibre docs, "ESM > Vite").
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);
import { useEffect, useRef, useState } from "react";
import type { TrafficClosure } from "../../../shared/api/closures.ts";
import type { Junction } from "../../../shared/api/junctions.ts";
import { addMapImages } from "./images.ts";
import { GEOLOCATE_OPTIONS, locationErrorMessage, stopFollowingOnZoom } from "./location.ts";
import { closureBounds, closureLines, closureMarkers, confirmedJunctionNames, diversionEnds, ENGLAND_BOUNDS, junctionPoints, selectedRouteLines } from "./layers.ts";
import { baseLabelAdjustments, confirmedJunctionFilter, overlayLayers, roadEmphasisBeforeId, roadEmphasisLayers, selectedFilter, type Theme } from "./style.ts";

/** OpenFreeMap: free, no key, commercial use allowed, attribution included in the style (docs/DATA-SOURCES.md S10). */
const STYLE_URL = { light: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" } as const;

interface Props {
  closures: TrafficClosure[];
  selected: TrafficClosure | null;
  junctions: Junction[];
  onSelect: (id: string) => void;
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
  const [locationError, setLocationError] = useState<string | null>(null);

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibreMap({
      container: container.current,
      style: STYLE_URL[theme],
      bounds: ENGLAND_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      // Phones: the attribution collapses to an (i) button so it doesn't cover the bottom of the small map.
      attributionControl: { compact: !window.matchMedia("(min-width: 768px)").matches, customAttribution: "Closures, diversions and junctions: National Highways, Open Government Licence v3.0" },
    });
    map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(new ScaleControl({ unit: "imperial" }), "bottom-right");
    // "Show my location": stacks under the zoom/compass buttons. Asks for location only when pressed.
    const geolocate = new GeolocateControl(GEOLOCATE_OPTIONS);
    map.addControl(geolocate, "top-right");
    // Mirrors MapLibre's follow lock for the map's own handlers; React state drives the indicator.
    let isFollowing = false;
    const follow = (on: boolean) => {
      isFollowing = on;
      setFollowing(on);
    };
    geolocate.on("trackuserlocationstart", () => {
      setLocationError(null);
      follow(true);
      // Zoom in to the user's area on the first fix only if the map is zoomed out; otherwise keep the user's zoom.
      geolocate.options.zoomToUserAccuracy = map.getZoom() < 10;
    });
    // After the first fix, position updates only re-centre: they never undo a zoom the user chose. (The event's position is
    // deliberately not read.)
    geolocate.on("geolocate", () => (geolocate.options.zoomToUserAccuracy = false));
    geolocate.on("userlocationfocus", () => follow(true));
    // A manual pan or zoom stops following (MapLibre's "background" state); pressing the button again re-centres and follows.
    geolocate.on("userlocationlostfocus", () => follow(false));
    geolocate.on("trackuserlocationend", () => follow(false));
    geolocate.on("error", (e) => {
      follow(false);
      setLocationError(locationErrorMessage(e.code));
    });
    stopFollowingOnZoom(map, () => isFollowing);
    map.on("style.load", () => installLayers(map, latest));
    // MapLibre opens compact attribution at first; on phones start it closed (still one tap away on the (i) button).
    map.once("load", () => container.current?.querySelector(".maplibregl-compact-show")?.classList.remove("maplibregl-compact-show"));
    registerInteractions(map, latest);
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
    // On wide screens the detail panel (440px) covers the right of the map, so frame the closure in the visible part.
    // On phones the panel sits below the map instead, so the map needs no allowance for it.
    const panel = window.matchMedia("(min-width: 768px)").matches ? 440 : 0;
    const edge = panel ? 60 : 32;
    // Extra room at the bottom for the map key and attribution.
    if (bounds) map.fitBounds(bounds, { padding: { top: edge, bottom: edge + 24, left: edge, right: edge + panel }, maxZoom: 12, duration: 600 });
  }, [selected]);

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" aria-label="Map of closures" role="region" />
      <div className="pointer-events-none absolute left-3 right-14 top-3 flex flex-col items-start gap-2">
        {baseMapError && <p className="rounded-[4px] bg-surface px-3 py-2 text-[14px] shadow">The base map couldn't load. The closures list still works.</p>}
        {following && (
          <p role="status" className="rounded-[4px] border-2 border-[#1a73e8] bg-surface px-3 py-2 text-[14px] shadow">
            <span className="font-bold">Following your location.</span> Move or zoom the map to stop.
            <span className="block text-[13px]">For planning only. Do not use while driving.</span>
          </p>
        )}
        {locationError && (
          <div role="alert" className="pointer-events-auto flex max-w-md items-start gap-2 rounded-[4px] bg-surface py-1 pl-3 pr-1 text-[14px] shadow">
            <p className="py-2">{locationError}</p>
            <button type="button" onClick={() => setLocationError(null)} className="min-h-12 min-w-12 shrink-0 rounded-[4px] px-2 font-bold underline">
              Dismiss
            </button>
          </div>
        )}
      </div>
      <Legend />
    </div>
  );
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
  for (const id of ["selected-closure-halo", "selected-closure-line", "selected-marker", "selected-marker-label"]) map.setFilter(id, filter);
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
  // Open by default where there's room; on phones the key starts closed so it doesn't cover the map.
  const [open] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  return (
    <details open={open} className="absolute bottom-8 left-3 max-w-[calc(100%-1.5rem)] rounded-[4px] border border-line bg-surface/95 text-[13px] shadow-sm">
      <summary className="cursor-pointer select-none px-3 py-2 font-bold">Map key</summary>
      <ul className="space-y-1.5 px-3 pb-2.5">
        <li className="flex items-center gap-2">
          <span className="h-1 w-7 rounded bg-closure" aria-hidden="true" /> Closed carriageway
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

function RouteGlyph() {
  return (
    <svg viewBox="0 0 28 10" className="h-2.5 w-7 shrink-0" aria-hidden="true">
      <path d="M1 5 H27" stroke="#14191e" strokeWidth="7" strokeLinecap="round" />
      <path d="M1 5 H27" stroke="#ffd200" strokeWidth="4" strokeLinecap="round" />
      <path d="M11 2 L17 5 L11 8 L12.5 5 Z" fill="#14191e" />
    </svg>
  );
}
