/**
 * "Show my location" uses MapLibre's own GeolocateControl, which calls only the browser's Geolocation API. The app itself never
 * reads, stores or sends the coordinates: they stay inside the map control (no fetch, URL, storage or logging). Location is asked
 * for only when the user presses the button; everything else works without it.
 *
 * Behaviour (MapLibre tracking mode): the first press asks permission, centres on the user and follows. Any manual pan or zoom
 * stops following, but the dot keeps updating. Pressing again re-centres and follows, and pressing while following turns location
 * off.
 */
import type { GeolocateControlOptions } from "maplibre-gl";

export const GEOLOCATE_OPTIONS: GeolocateControlOptions = {
  positionOptions: { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
  trackUserLocation: true,
  showUserLocation: true,
  showAccuracyCircle: true,
  fitBoundsOptions: { maxZoom: 14 },
};

/** The part of the map that stopFollowingOnZoom uses (a MapLibre Map satisfies it; tests use a stand-in). */
export interface ZoomEvents {
  on(type: "zoomstart" | "zoomend" | "moveend", listener: (e: { geolocateSource?: boolean }) => void): unknown;
  isZooming(): boolean;
  fire(type: "movestart"): unknown;
}

/**
 * MapLibre ends following when the user pans (its "movestart" handler), but deliberately keeps following through a zoom. Our
 * rule is that any zoom we didn't make for the location control (wheel, pinch, double-tap, +/- buttons or keys, or framing a
 * selected closure) also stops following. MapLibre marks its own camera moves with `geolocateSource`. Once such a zoom has
 * finished, a plain "movestart" is fired through the public event API. That is the signal MapLibre already uses for "the user
 * moved the map": the dot keeps updating, the camera no longer re-centres, and pressing the button again re-centres and follows.
 * MapLibre ignores that signal while the map is still zooming (for example, if a position update re-centres the map during the
 * gesture), so it's sent at the first zoomend/moveend when the map has stopped zooming.
 * (Within MapLibre only the location control listens for "movestart"; this app has no listener of its own.)
 */
export function stopFollowingOnZoom(map: ZoomEvents, isFollowing: () => boolean): void {
  let manualZoom = false;
  map.on("zoomstart", (e) => {
    if (!e.geolocateSource && isFollowing()) manualZoom = true;
  });
  const settle = () => {
    if (!manualZoom || map.isZooming()) return;
    manualZoom = false;
    if (isFollowing()) map.fire("movestart");
  };
  map.on("zoomend", settle);
  map.on("moveend", settle);
}

/** Plain wording for the browser's GeolocationPositionError codes (1 denied, 2 unavailable, 3 timeout). */
export function locationErrorMessage(code: number | undefined): string {
  switch (code) {
    case 1:
      return "Location is blocked for this site, so your position can't be shown. Everything else still works. To use it, allow location in your browser's site settings.";
    case 2:
      return "Your position isn't available right now (no signal, or location services are off). Everything else still works.";
    case 3:
      return "Finding your position took too long. Press the location button to try again.";
    default:
      return "Your position couldn't be found. Press the location button to try again.";
  }
}
