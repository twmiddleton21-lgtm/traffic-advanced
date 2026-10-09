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

/**
 * Plain wording for the browser's GeolocationPositionError codes (1 denied, 2 unavailable, 3 timeout). Code 1 here means location
 * is blocked for the site; describeLocationError decides when a code 1 was only a dismissed prompt.
 */
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

/** The browser's location permission for this site, or "unknown" where the Permissions API can't say (older Safari). */
export async function locationPermission(nav: Navigator = navigator): Promise<PermissionState | "unknown"> {
  try {
    return (await nav.permissions.query({ name: "geolocation" })).state;
  } catch {
    return "unknown";
  }
}

/**
 * Whether to ask for location on launch: not when the browser has no geolocation, nor when it already reports location as blocked
 * for this site (so a "no" is never asked again). Where the Permissions API can't say (older Safari), the browser decides.
 */
export async function shouldLocateOnLaunch(nav: Navigator = navigator): Promise<boolean> {
  if (!("geolocation" in nav)) return false;
  return (await locationPermission(nav)) !== "denied";
}

/** A location message: `urgent` ones answer a press of the location button (role="alert"); others are polite (role="status"). */
export interface LocationNotice {
  text: string;
  urgent: boolean;
}

/** After a dismissed (or unanswered) prompt: nothing is blocked, so the user isn't sent to site settings. */
export const NOT_SHARED_TEXT = "Your position wasn't shared, so it isn't shown. Everything else still works. Press the location button to try again.";
/** After the launch request finds no position (unavailable or timed out): brief, and never interrupting. */
export const LAUNCH_NOT_FOUND_TEXT = "Your position couldn't be found. Press the location button to try again.";

/**
 * What a failed location request means for the user. `duringLaunch` is whether the app asked on launch (locateOnLaunch's noteError)
 * rather than the user pressing the button. `permission` matters only for code 1 (permission denied): browsers report both an
 * explicit "Block" (the site's permission becomes "denied") and a dismissed prompt (it stays "prompt") as code 1.
 *
 * - Launch errors never interrupt: no message for code 1 (the user has just answered the browser's own prompt), a polite one for
 *   the rest.
 * - Errors after a press of the button keep the assertive, specific message.
 * - `renewControl`: after a code 1 that isn't an explicit block, the location button must work again (see renewLocationControl).
 */
export function describeLocationError(
  code: number | undefined,
  duringLaunch: boolean,
  permission: PermissionState | "unknown",
): { notice: LocationNotice | null; renewControl: boolean } {
  if (code === 1) {
    const blocked = permission === "denied";
    if (duringLaunch) return { notice: null, renewControl: !blocked };
    return { notice: { text: blocked ? locationErrorMessage(1) : NOT_SHARED_TEXT, urgent: true }, renewControl: !blocked };
  }
  if (duringLaunch) return { notice: { text: LAUNCH_NOT_FOUND_TEXT, urgent: false }, renewControl: false };
  return { notice: { text: locationErrorMessage(code), urgent: true }, renewControl: false };
}

/** What the location error flow needs from the map view (MapView supplies the real ones; tests use stand-ins). */
export interface LocationErrorDeps {
  /** locateOnLaunch's noteError: whether this error ended the launch request. */
  noteError: (code: number | undefined) => boolean;
  /** The site's location permission (locationPermission); asked only for code 1. */
  permission: () => Promise<PermissionState | "unknown">;
  stopFollowing: () => void;
  showNotice: (notice: LocationNotice | null) => void;
  /** Replace the control so the button works again (renewLocationControl); `refocus` after a press of the button. */
  renewControl: (refocus: boolean) => void;
}

/**
 * The location control's error flow, in one place: MapView calls `requestStarted` on every "trackuserlocationstart" and `handle`
 * from its only "error" listener, and `dispose` on unmount.
 * - Classification comes first (noteError), before anything can finish the launch state, so it never depends on listener order.
 * - Only code 1 waits for the permission check, to tell an explicit block from a dismissed prompt (describeLocationError).
 * - A result that arrives after a newer request started, or after the map has gone, is dropped: no stale message, no renewal.
 * - Nothing here retries a request; renewal only makes the button usable again.
 */
export function createLocationErrors(deps: LocationErrorDeps): {
  requestStarted: () => void;
  handle: (code: number | undefined) => Promise<void>;
  dispose: () => void;
  active: () => boolean;
} {
  let requests = 0;
  let disposed = false;
  return {
    requestStarted: () => {
      requests++;
      deps.showNotice(null);
    },
    handle: async (code) => {
      const duringLaunch = deps.noteError(code);
      deps.stopFollowing();
      const request = requests;
      const permission = code === 1 ? await deps.permission() : "unknown";
      if (disposed || request !== requests) return;
      const { notice, renewControl } = describeLocationError(code, duringLaunch, permission);
      deps.showNotice(notice);
      if (renewControl) deps.renewControl(!duringLaunch);
    },
    dispose: () => {
      disposed = true;
    },
    active: () => !disposed,
  };
}

/** The parts of the map that renewLocationControl uses (a MapLibre Map satisfies it; tests use a stand-in). */
export interface ControlHost<C> {
  removeControl(control: C): unknown;
  addControl(control: C, position: "top-right"): unknown;
}

/**
 * Replaces the location control with a fresh one in the same place, so the button works again after a code 1 that wasn't an
 * explicit block (a dismissed prompt). Why replace rather than re-enable (MapLibre 6.12, geolocate_control.ts; location.test.ts
 * checks these points against the installed version):
 * - On code 1, `_onError` disables the button and relabels it "Location not available", and nothing re-enables it.
 * - It also clears its watch without decrementing the module's watch count, so a re-enabled button's next press would be treated as
 *   a second watch (`maximumAge: 600000, timeout: 0`, with that timeout's error swallowed) and usually fail silently.
 * - Removing the control (public removeControl, then onRemove) resets that count, and a new control starts enabled ("Find my
 *   location"): its support check reuses the first result, made while the permission wasn't "denied".
 * The caller re-attaches its listeners to the returned control.
 */
export function renewLocationControl<C>(map: ControlHost<C>, old: C, create: () => C): C {
  map.removeControl(old);
  const fresh = create();
  map.addControl(fresh, "top-right");
  return fresh;
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
  on(type: "geolocate" | "outofmaxbounds" | "trackuserlocationstart", listener: () => void): unknown;
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
 * - Errors: the app's single error listener on the control calls `noteError` first. It answers whether the error ended the launch
 *   request, decided before the launch state is finished, so the answer never depends on the order listeners run in (an earlier
 *   design had its own listener here, which finished the state before the app's listener could ask). Nothing is retried. After a
 *   launch error other than code 1, the control is switched off (its own toggle), so it leaves MapLibre's error state, stops
 *   watching (a late fix can't move the map) and the next press of the button starts a fresh request. (On code 1 MapLibre has
 *   already switched it off.)
 * - Pressing the button before launch location starts cancels it, so the press isn't undone.
 */
export function locateOnLaunch(
  map: LaunchMap,
  control: LaunchControl,
  ready: Promise<boolean>,
): { locating: () => boolean; noteError: (code: number | undefined) => boolean; cancel: () => void } {
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

  const noteError = (code: number | undefined) => {
    if (state !== "locating") return false;
    finish();
    if (code !== 1) control.trigger();
    return true;
  };

  return { locating: () => state === "locating", noteError, cancel: finish };
}
