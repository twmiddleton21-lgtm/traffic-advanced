import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GEOLOCATE_OPTIONS,
  LAUNCH_RADIUS_METRES,
  locateOnLaunch,
  locationErrorMessage,
  shouldLocateOnLaunch,
  stopFollowingOnZoom,
  zoomForRadius,
  type LaunchControl,
  type LaunchMap,
  type ZoomEvents,
} from "./location.ts";

describe("location error wording", () => {
  it("covers denied, unavailable and timeout, and says the app still works where location can't be fixed by retrying", () => {
    expect(locationErrorMessage(1)).toMatch(/blocked/);
    expect(locationErrorMessage(1)).toMatch(/Everything else still works/);
    expect(locationErrorMessage(2)).toMatch(/isn't available/);
    expect(locationErrorMessage(2)).toMatch(/Everything else still works/);
    expect(locationErrorMessage(3)).toMatch(/took too long.*try again/);
    expect(locationErrorMessage(undefined)).toMatch(/try again/);
    expect(new Set([1, 2, 3, undefined].map(locationErrorMessage)).size).toBe(4);
  });

  it("uses MapLibre's tracking mode (dot, accuracy circle, follow until the user moves the map) with a bounded wait", () => {
    expect(GEOLOCATE_OPTIONS).toMatchObject({ trackUserLocation: true, showUserLocation: true, showAccuracyCircle: true });
    expect(GEOLOCATE_OPTIONS.positionOptions?.timeout).toBeGreaterThan(0);
  });
});

/** A stand-in for the map's event API: records fired events and lets the test emit camera events and set the zooming flag. */
function fakeMap() {
  const listeners: Record<string, ((e: { geolocateSource?: boolean }) => void)[]> = {};
  const fired: string[] = [];
  let zooming = false;
  const map: ZoomEvents = {
    on: (type, l) => (listeners[type] ??= []).push(l),
    isZooming: () => zooming,
    fire: (type) => fired.push(type),
  };
  const emit = (type: "zoomstart" | "zoomend" | "moveend", e: { geolocateSource?: boolean; stillZooming?: boolean } = {}) => {
    if (type === "zoomstart") zooming = true;
    if (type !== "zoomstart" && !e.stillZooming) zooming = false;
    (listeners[type] ?? []).forEach((l) => l(e));
  };
  return { map, fired, emit };
}

describe("manual zoom stops following", () => {
  it("a user zoom (wheel, pinch, buttons, keys) signals 'map moved' once the zoom has finished, not during it", () => {
    const { map, fired, emit } = fakeMap();
    stopFollowingOnZoom(map, () => true);
    emit("zoomstart");
    expect(fired).toEqual([]);
    emit("zoomend");
    expect(fired).toEqual(["movestart"]);
    emit("moveend"); // one signal per zoom
    expect(fired).toEqual(["movestart"]);
  });

  it("still stops following when a position update re-centres the map during the gesture (seen in the browser)", () => {
    const { map, fired, emit } = fakeMap();
    stopFollowingOnZoom(map, () => true);
    emit("zoomstart");
    emit("zoomstart", { geolocateSource: true }); // MapLibre re-centres on a new position mid-gesture
    emit("zoomend", { geolocateSource: true, stillZooming: true }); // ...while the user's zoom is still running
    expect(fired).toEqual([]);
    emit("moveend");
    expect(fired).toEqual(["movestart"]);
  });

  it("the location control's own camera moves never stop following", () => {
    const { map, fired, emit } = fakeMap();
    stopFollowingOnZoom(map, () => true);
    emit("zoomstart", { geolocateSource: true });
    emit("zoomend", { geolocateSource: true });
    emit("moveend", { geolocateSource: true });
    expect(fired).toEqual([]);
  });

  it("does nothing when not following (location off, or already stopped by a pan)", () => {
    const { map, fired, emit } = fakeMap();
    let following = true;
    stopFollowingOnZoom(map, () => following);
    emit("zoomstart");
    following = false; // e.g. the gesture also panned, so MapLibre has already stopped following
    emit("zoomend");
    stopFollowingOnZoom(map, () => false);
    emit("zoomstart");
    emit("moveend");
    expect(fired).toEqual([]);
  });
});

/** Metres covered by half the map's shorter side at a zoom (MapLibre's 512px tiles, Web Mercator). */
const radiusAt = (zoom: number, latitude: number, width: number, height: number) =>
  ((40_075_016.686 * Math.cos((latitude * Math.PI) / 180)) / (512 * 2 ** zoom)) * (Math.min(width, height) / 2);

describe("launch view: about 10 miles around the user", () => {
  it("fits a 10-mile radius into the map's shorter side, for phone and desktop map sizes", () => {
    expect(LAUNCH_RADIUS_METRES).toBeCloseTo(16_093.44, 2);
    for (const [w, h] of [
      [390, 700],
      [1060, 820],
      [1440, 900],
    ] as const) {
      expect(radiusAt(zoomForRadius(52.5, w, h), 52.5, w, h)).toBeCloseTo(LAUNCH_RADIUS_METRES, 0);
    }
    expect(zoomForRadius(52.5, 390, 700)).toBeCloseTo(9.2, 1); // a phone shows less map, so it zooms out further
    expect(zoomForRadius(52.5, 1060, 820)).toBeGreaterThan(zoomForRadius(52.5, 390, 700));
  });

  it("stays within about 8% of 10 miles anywhere in England when the map's centre latitude is used", () => {
    const zoom = zoomForRadius(52.6, 390, 700);
    for (const latitude of [49.95, 55.8]) {
      const miles = radiusAt(zoom, latitude, 390, 700) / 1609.344;
      expect(miles).toBeGreaterThan(9.2);
      expect(miles).toBeLessThan(10.8);
    }
  });

  it("never zooms in past the location control's own limit, even for a tiny or unmeasured map", () => {
    expect(zoomForRadius(52.5, 0, 0)).toBe(14);
    expect(zoomForRadius(52.5, 100_000, 100_000)).toBe(14);
  });
});

describe("asking for location on launch", () => {
  const nav = (geo: boolean, state: PermissionState | Error) =>
    ({
      ...(geo ? { geolocation: {} } : {}),
      permissions: { query: () => (state instanceof Error ? Promise.reject(state) : Promise.resolve({ state })) },
    }) as unknown as Navigator;

  it("asks when allowed or not yet decided; never when blocked (so a 'no' isn't asked again) or unsupported", async () => {
    expect(await shouldLocateOnLaunch(nav(true, "granted"))).toBe(true);
    expect(await shouldLocateOnLaunch(nav(true, "prompt"))).toBe(true);
    expect(await shouldLocateOnLaunch(nav(true, "denied"))).toBe(false);
    expect(await shouldLocateOnLaunch(nav(false, "granted"))).toBe(false);
  });

  it("leaves the decision to the browser where the Permissions API can't answer (older Safari)", async () => {
    expect(await shouldLocateOnLaunch(nav(true, new TypeError("unsupported")))).toBe(true);
  });
});

/** Stand-ins for the map and the location control: record camera calls, triggers and fired events. */
function launchFakes() {
  const mapListeners: Record<string, ((e: { geolocateSource?: boolean }) => void)[]> = {};
  const once: (() => void)[] = [];
  const controlListeners: Record<string, (() => void)[]> = {};
  const view = { center: { lng: -1.5, lat: 52.6 }, zoom: 5.6, bearing: 0, pitch: 0 };
  const calls: string[] = [];
  const state = { moving: false };
  const map: LaunchMap = {
    on: (type, l) => (mapListeners[type] ??= []).push(l),
    once: (_type, l) => once.push(l),
    isMoving: () => state.moving,
    isZooming: () => state.moving,
    fire: (type) => calls.push(type),
    jumpTo: (o) => calls.push(`jumpTo ${JSON.stringify(o)}`),
    getCenter: () => view.center,
    getZoom: () => view.zoom,
    getBearing: () => view.bearing,
    getPitch: () => view.pitch,
    getContainer: () => ({ clientWidth: 390, clientHeight: 700 }),
  };
  const defaults = { maxZoom: 14 };
  const control: LaunchControl = {
    trigger: () => {
      calls.push("trigger");
      (controlListeners["trackuserlocationstart"] ?? []).forEach((l) => l());
      return true;
    },
    on: (type, l) => (controlListeners[type] ??= []).push(l),
    options: { fitBoundsOptions: defaults, zoomToUserAccuracy: false },
  };
  const emitControl = (type: string) => (controlListeners[type] ?? []).forEach((l) => l());
  const move = (e: { geolocateSource?: boolean } = {}) => (mapListeners["move"] ?? []).forEach((l) => l(e));
  const moveEnd = (e: { geolocateSource?: boolean } = {}) => {
    move(e);
    state.moving = false;
    once.splice(0).forEach((l) => l());
  };
  return { map, control, calls, view, state, defaults, emitControl, move, moveEnd };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("showing the user's location on launch", () => {
  it("presses the location button once, frames the user at the 10-mile zoom, then stops following (initial view only)", async () => {
    const f = launchFakes();
    const launch = locateOnLaunch(f.map, f.control, Promise.resolve(true));
    await settle();
    expect(f.calls).toEqual(["trigger"]);
    expect(launch.locating()).toBe(true);
    expect(f.control.options.zoomToUserAccuracy).toBe(true); // the control frames its own accuracy circle...
    expect(f.control.options.fitBoundsOptions?.maxZoom).toBeCloseTo(zoomForRadius(52.6, 390, 700), 6); // ...no closer than 10 miles

    f.state.moving = true; // the control is flying to the user
    f.emitControl("geolocate");
    expect(f.calls).toEqual(["trigger"]); // not while the camera is still moving
    f.moveEnd({ geolocateSource: true });
    expect(f.calls).toEqual(["trigger", "movestart"]); // MapLibre's "the map moved" signal: the dot stays, following stops
    expect(launch.locating()).toBe(false);
    expect(f.control.options.fitBoundsOptions).toBe(f.defaults); // later presses use the usual framing

    f.emitControl("geolocate"); // later position updates leave the camera alone
    expect(f.calls).toEqual(["trigger", "movestart"]);
  });

  it("doesn't ask when the browser has blocked location or has none: the map stays on England and the button still works", async () => {
    const f = launchFakes();
    const launch = locateOnLaunch(f.map, f.control, Promise.resolve(false));
    await settle();
    expect(f.calls).toEqual([]);
    expect(launch.locating()).toBe(false);
    expect(f.control.options.fitBoundsOptions).toBe(f.defaults);
  });

  it("keeps a view the user (or a linked closure) chose while location was being found, instead of snapping to the user", async () => {
    const f = launchFakes();
    locateOnLaunch(f.map, f.control, Promise.resolve(true));
    await settle();
    f.view.center = { lng: -2.2, lat: 53.4 };
    f.view.zoom = 11;
    f.moveEnd(); // a pan or zoom
    f.emitControl("geolocate");
    expect(f.calls).toEqual(["trigger", `jumpTo ${JSON.stringify({ center: { lng: -2.2, lat: 53.4 }, zoom: 11, bearing: 0, pitch: 0 })}`]);
  });

  it("keeps the user's view when the fix arrives in the middle of a drag (seen in the browser)", async () => {
    const f = launchFakes();
    locateOnLaunch(f.map, f.control, Promise.resolve(true));
    await settle();
    f.view.center = { lng: -1.1, lat: 52.9 };
    f.move(); // still dragging: no moveend yet
    f.emitControl("geolocate");
    expect(f.calls).toEqual(["trigger", `jumpTo ${JSON.stringify({ center: { lng: -1.1, lat: 52.9 }, zoom: 5.6, bearing: 0, pitch: 0 })}`]);
  });

  it("doesn't mistake a resize (the camera didn't move) for the user moving the map", async () => {
    const f = launchFakes();
    locateOnLaunch(f.map, f.control, Promise.resolve(true));
    await settle();
    f.moveEnd(); // e.g. the window or layout resized
    f.emitControl("geolocate");
    expect(f.calls).toEqual(["trigger", "movestart"]);
  });

  it("on denied, unavailable or timed-out location, gives up quietly (the control reports the error) and never retries", async () => {
    for (const event of ["error", "outofmaxbounds"]) {
      const f = launchFakes();
      const launch = locateOnLaunch(f.map, f.control, Promise.resolve(true));
      await settle();
      f.emitControl(event);
      expect(launch.locating()).toBe(false);
      expect(f.control.options.fitBoundsOptions).toBe(f.defaults);
      f.emitControl("geolocate"); // a later fix from a manual press is handled by the control as usual
      expect(f.calls).toEqual(["trigger"]);
    }
  });

  it("doesn't undo a press of the location button made before launch location started", async () => {
    const f = launchFakes();
    locateOnLaunch(f.map, f.control, Promise.resolve(true));
    f.emitControl("trackuserlocationstart"); // the user pressed the button first
    await settle();
    expect(f.calls).toEqual([]);
  });

  it("does nothing once the map has gone (cancelled on unmount)", async () => {
    const f = launchFakes();
    locateOnLaunch(f.map, f.control, Promise.resolve(true)).cancel();
    await settle();
    expect(f.calls).toEqual([]);
  });
});

describe("location button touch target", () => {
  it("extends the hit area to at least 48px (29px button + 2 × 10px) without resizing the other map buttons", () => {
    const css = readFileSync("web/src/styles.css", "utf8");
    expect(css).toMatch(/button\.maplibregl-ctrl-geolocate::after\s*\{[^}]*position: absolute;[^}]*inset: -10px;/);
    expect(css).not.toMatch(/maplibregl-ctrl-(?:zoom-in|zoom-out|compass)/);
  });
});

/** Static privacy guard: the user's coordinates stay inside MapLibre's control and the browser. */
const files: string[] = [];
const walk = (dir: string): void => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
  }
};
walk("web/src");

describe("location privacy", () => {
  it("app code never calls the Geolocation API itself or reads coordinates (only MapLibre's GeolocateControl does)", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/navigator\.geolocation|getCurrentPosition|watchPosition/);
      expect(text, file).not.toMatch(/\.coords\b|GeolocationPosition\b|GeolocatePositionEvent/);
      // The control's position events are only ever handled without taking the event, so no coordinates reach app code.
      expect(text, file).not.toMatch(/\.on\(\s*["'](?:geolocate|outofmaxbounds)["'],(?!\s*\(\)\s*=>)/);
    }
  });

  it("only MapView uses the location control, and it neither stores nor sends anything", () => {
    const users = files.filter((f) => /GeolocateControl|GEOLOCATE_OPTIONS/.test(readFileSync(f, "utf8")));
    expect(users.map((f) => f.replace(/\\/g, "/")).sort()).toEqual(["web/src/map/MapView.tsx", "web/src/map/location.ts"]);
    for (const file of users) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/\bfetch\(|sendBeacon|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|caches\.|history\.(?:push|replace)State|location\.(?:hash|search|href)\s*=|console\.(?:log|info|debug)/);
    }
  });

  it("asks for location on launch only through the control, after the map has loaded and the permission check", () => {
    const view = readFileSync("web/src/map/MapView.tsx", "utf8");
    expect(view).toMatch(/locateOnLaunch\(\s*map,\s*geolocate,\s*Promise\.all\(\[shouldLocateOnLaunch\(\), map\.once\("load"\)\]\)/);
  });

  it("the follow indicator carries the planning-only safety line", () => {
    expect(readFileSync("web/src/map/MapView.tsx", "utf8")).toMatch(/Following your location[\s\S]{0,200}For planning only\. Do not use while driving\./);
  });
});
