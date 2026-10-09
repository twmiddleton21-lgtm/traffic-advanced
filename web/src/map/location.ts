/**
 * "Show my location" uses MapLibre's own GeolocateControl, which calls only the browser's Geolocation API. The app itself never
 * reads, stores or sends the coordinates: they stay inside the map control (no fetch, URL, storage or logging). Everything works
 * without location.
 *
 * On launch the control is pressed once for the user (locateOnLaunch), unless the browser already says location is blocked: the
 * browser asks permission as usual, and the first fix centres the map on the user at about a 10-mile radius. That's the initial
 * view only: the map then stops following, while the dot keeps updating.
 *
 * Behaviour of the button (MapLibre tracking mode): the first press asks permission, centres on the user and follows. Any manual
 * pan or zoom stops following, but the dot keeps updating. Pressing again re-centres and follows, and pressing while following
 * turns location off.
 */
import type { FitBoundsOptions, GeolocateControlOptions, JumpToOptions } from "maplibre-gl";

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

/** The launch view: about 10 miles around the user. */
export const LAUNCH_RADIUS_METRES = 10 * 1609.344;
/** Web Mercator world width at zoom 0 in MapLibre's 512px tiles, in metres per pixel at the equator. */
const METRES_PER_PIXEL_AT_ZOOM_0 = 40_075_016.686 / 512;

/**
 * The zoom at which `radiusMetres` around a point at `latitude` just fits the map's shorter side (half of it each way), capped at
 * the location control's own maximum zoom.
 */
export function zoomForRadius(latitude: number, width: number, height: number, radiusMetres = LAUNCH_RADIUS_METRES): number {
  const halfSide = Math.min(width, height) / 2;
  const maxZoom = GEOLOCATE_OPTIONS.fitBoundsOptions?.maxZoom ?? 14;
  if (!(halfSide > 0)) return maxZoom;
  const zoom = Math.log2((METRES_PER_PIXEL_AT_ZOOM_0 * Math.cos((latitude * Math.PI) / 180) * halfSide) / radiusMetres);
  return Math.min(Math.max(zoom, 0), maxZoom);
}

/**
 * Whether to ask for location on launch: not when the browser has no geolocation, nor when it already reports location as blocked
 * for this site (so a "no" is never asked again). Where the Permissions API can't say (older Safari), the browser decides.
 */
export async function shouldLocateOnLaunch(nav: Navigator = navigator): Promise<boolean> {
  if (!("geolocation" in nav)) return false;
  try {
    return (await nav.permissions.query({ name: "geolocation" })).state !== "denied";
  } catch {
    return true;
  }
}

/** The parts of the map and the location control that locateOnLaunch uses (MapLibre's satisfy them; tests use stand-ins). */
export interface LaunchMap {
  on(type: "move", listener: (e: { geolocateSource?: boolean }) => void): unknown;
  once(type: "moveend", listener: () => void): unknown;
  isMoving(): boolean;
  isZooming(): boolean;
  fire(type: "movestart"): unknown;
  jumpTo(options: JumpToOptions): unknown;
  getCenter(): { lat: number; lng: number };
  getZoom(): number;
  getBearing(): number;
  getPitch(): number;
  getContainer(): { clientWidth: number; clientHeight: number };
}
export interface LaunchControl {
  trigger(): boolean;
  on(type: "geolocate" | "error" | "outofmaxbounds" | "trackuserlocationstart", listener: () => void): unknown;
  options: { zoomToUserAccuracy?: boolean; fitBoundsOptions?: FitBoundsOptions };
}

/**
 * Shows the user's location once `ready` resolves true (the map has loaded and shouldLocateOnLaunch agreed), as if they had pressed
 * the location button, and then stops following so the first fix sets the initial view only.
 *
 * - The view: the control frames its own accuracy circle (coordinates stay inside it), capped at the 10-mile zoom. The latitude
 *   used is the map's centre over England at launch, which keeps the radius within about 8% of 10 miles across England.
 * - If the map was moved before the first fix (the user panned or zoomed, even mid-drag, or a linked closure was framed), that view
 *   is kept.
 * - Errors (denied at the prompt, unavailable, timed out) are reported by the control's usual error event; nothing is retried.
 * - Pressing the button before launch location starts cancels it, so the press isn't undone.
 */
export function locateOnLaunch(map: LaunchMap, control: LaunchControl, ready: Promise<boolean>): { locating: () => boolean; cancel: () => void } {
  let state: "waiting" | "locating" | "done" = "waiting";
  let triggering = false;
  let kept: JumpToOptions | null = null;
  const defaults = control.options.fitBoundsOptions ?? {};
  const finish = () => {
    state = "done";
    control.options.fitBoundsOptions = defaults;
  };

  // Recorded on every move, so a drag still under way when the fix arrives counts too. Compared by camera, not by event: resizes
  // (window, layout) also fire move events, without moving the camera.
  const camera = () => ({ center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
  const key = (c: ReturnType<typeof camera>) => [c.center.lng, c.center.lat, c.zoom, c.bearing, c.pitch].map((n) => n.toFixed(6)).join();
  const launchView = key(camera());
  map.on("move", (e) => {
    if (state === "done" || e.geolocateSource) return;
    const now = camera();
    kept = key(now) === launchView ? null : now;
  });
  control.on("trackuserlocationstart", () => {
    if (!triggering) finish();
  });
  control.on("error", () => state === "locating" && finish());
  control.on("outofmaxbounds", () => state === "locating" && finish());
  control.on("geolocate", () => {
    if (state !== "locating") return;
    finish();
    // A camera move that isn't the control's stops following (as a manual pan does).
    if (kept) return void map.jumpTo(kept);
    const release = () => (map.isZooming() ? map.once("moveend", release) : map.fire("movestart"));
    if (map.isMoving()) map.once("moveend", release);
    else release();
  });

  void ready.then((ok) => {
    if (!ok || state !== "waiting") return finish();
    const { clientWidth, clientHeight } = map.getContainer();
    control.options.fitBoundsOptions = { ...defaults, maxZoom: zoomForRadius(map.getCenter().lat, clientWidth, clientHeight) };
    state = "locating";
    triggering = true;
    const started = control.trigger();
    triggering = false;
    control.options.zoomToUserAccuracy = true;
    if (!started) finish();
  });

  return { locating: () => state === "locating", cancel: finish };
}
