import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createLocationErrors,
  describeLocationError,
  GEOLOCATE_OPTIONS,
  LAUNCH_NOT_FOUND_TEXT,
  LAUNCH_RADIUS_METRES,
  locateOnLaunch,
  locationErrorMessage,
  locationPermission,
  NOT_SHARED_TEXT,
  renewLocationControl,
  shouldLocateOnLaunch,
  stopFollowingOnZoom,
  zoomForRadius,
  type LaunchControl,
  type LaunchMap,
  type LocationNotice,
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
  // Toggles like MapLibre's control (geolocate_control.ts trigger): off starts a new request; waiting or error switches it off.
  const watch = { state: "off" as "off" | "waiting" | "error", requests: 0 };
  const emitControl = (type: string) => (controlListeners[type] ?? []).forEach((l) => l());
  const control: LaunchControl = {
    trigger: () => {
      calls.push("trigger");
      if (watch.state === "off") {
        watch.state = "waiting";
        watch.requests++;
        emitControl("trackuserlocationstart");
      } else {
        watch.state = "off";
        emitControl("trackuserlocationend");
      }
      return true;
    },
    on: (type, l) => (controlListeners[type] ??= []).push(l),
    options: { fitBoundsOptions: defaults, zoomToUserAccuracy: false },
  };
  /** A failed request, left as MapLibre's _onError leaves the control: off after code 1, otherwise in its error state. */
  const fail = (code: number | undefined) => (watch.state = code === 1 ? "off" : "error");
  const move = (e: { geolocateSource?: boolean } = {}) => (mapListeners["move"] ?? []).forEach((l) => l(e));
  const moveEnd = (e: { geolocateSource?: boolean } = {}) => {
    move(e);
    state.moving = false;
    once.splice(0).forEach((l) => l());
  };
  return { map, control, calls, view, state, defaults, emitControl, move, moveEnd, watch, fail };
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

  it("tells a launch error from a later one at the moment it arrives, so the answer survives the launch state finishing", async () => {
    const f = launchFakes();
    const launch = locateOnLaunch(f.map, f.control, Promise.resolve(true));
    await settle();
    f.fail(2);
    // The app's one error listener asks first; anything that looked at the launch state afterwards would see it finished, which is
    // why classification can't be left to a second listener (MapLibre calls listeners in the order they were added).
    expect(launch.noteError(2)).toBe(true);
    expect(launch.locating()).toBe(false);
    expect(launch.noteError(2)).toBe(false); // the same request can't count twice
    f.control.trigger(); // the user presses the button
    f.fail(3);
    expect(launch.noteError(3)).toBe(false); // an error from a press of the button
  });

  it("an error before the launch request starts (or without one) isn't a launch error", async () => {
    const f = launchFakes();
    const launch = locateOnLaunch(f.map, f.control, Promise.resolve(false));
    expect(launch.noteError(2)).toBe(false);
    await settle();
    expect(launch.noteError(1)).toBe(false);
  });

  it("after a launch error 2 or 3 (or unknown), switches the control off, so the next press of the button starts a new request", async () => {
    for (const code of [2, 3, undefined]) {
      const f = launchFakes();
      const launch = locateOnLaunch(f.map, f.control, Promise.resolve(true));
      await settle();
      f.fail(code);
      expect(launch.noteError(code)).toBe(true);
      expect(f.watch).toEqual({ state: "off", requests: 1 }); // out of MapLibre's error state, not watching, and not retried
      expect(f.control.options.fitBoundsOptions).toBe(f.defaults);
      f.control.trigger(); // the user presses the button
      expect(f.watch).toEqual({ state: "waiting", requests: 2 }); // a fresh request, not just a switch-off
    }
  });

  it("after a launch error 1, leaves the control as MapLibre left it (already off) and never retries", async () => {
    const f = launchFakes();
    const launch = locateOnLaunch(f.map, f.control, Promise.resolve(true));
    await settle();
    f.fail(1);
    expect(launch.noteError(1)).toBe(true);
    expect(f.calls).toEqual(["trigger"]);
    expect(f.watch).toEqual({ state: "off", requests: 1 });
  });

  it("gives up quietly when the position is outside the map's limits, and never retries", async () => {
    const f = launchFakes();
    const launch = locateOnLaunch(f.map, f.control, Promise.resolve(true));
    await settle();
    f.emitControl("outofmaxbounds");
    expect(launch.locating()).toBe(false);
    expect(f.control.options.fitBoundsOptions).toBe(f.defaults);
    f.emitControl("geolocate"); // a later fix from a manual press is handled by the control as usual
    expect(f.calls).toEqual(["trigger"]);
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

describe("wording a failed location request", () => {
  it("never interrupts after the launch request: a polite message when no position was found", () => {
    for (const code of [2, 3, undefined]) {
      expect(describeLocationError(code, true, "unknown")).toEqual({ notice: { text: LAUNCH_NOT_FOUND_TEXT, urgent: false }, renewControl: false });
    }
  });

  it("says nothing after the launch request's prompt is answered or dismissed (the user has just decided)", () => {
    expect(describeLocationError(1, true, "denied")).toEqual({ notice: null, renewControl: false });
    for (const permission of ["prompt", "granted", "unknown"] as const) {
      expect(describeLocationError(1, true, permission)).toEqual({ notice: null, renewControl: true });
    }
  });

  it("keeps an assertive, specific message after a press of the location button", () => {
    for (const code of [2, 3, undefined]) {
      expect(describeLocationError(code, false, "unknown")).toEqual({ notice: { text: locationErrorMessage(code), urgent: true }, renewControl: false });
    }
  });

  it("a code 1 while the site's permission is still 'prompt' (a dismissed prompt) isn't called blocked, and the button is renewed", () => {
    for (const permission of ["prompt", "granted", "unknown"] as const) {
      const { notice, renewControl } = describeLocationError(1, false, permission);
      expect(notice).toEqual({ text: NOT_SHARED_TEXT, urgent: true });
      expect(notice?.text).not.toMatch(/blocked|settings/i);
      expect(renewControl).toBe(true);
    }
  });

  it("a code 1 with the permission 'denied' (an explicit block) keeps the blocked message and leaves the button disabled", () => {
    const { notice, renewControl } = describeLocationError(1, false, "denied");
    expect(notice).toEqual({ text: locationErrorMessage(1), urgent: true });
    expect(notice?.text).toMatch(/blocked for this site/);
    expect(notice?.text).toMatch(/site settings/);
    expect(renewControl).toBe(false);
  });

  it("reads the site's permission, or 'unknown' where the browser can't say", async () => {
    const nav = (q: () => Promise<{ state: PermissionState }>) => ({ permissions: { query: q } }) as unknown as Navigator;
    expect(await locationPermission(nav(() => Promise.resolve({ state: "prompt" })))).toBe("prompt");
    expect(await locationPermission(nav(() => Promise.resolve({ state: "denied" })))).toBe("denied");
    expect(await locationPermission(nav(() => Promise.reject(new TypeError("unsupported"))))).toBe("unknown");
    expect(await locationPermission({} as Navigator)).toBe("unknown"); // no Permissions API at all
  });
});

/**
 * The runtime error flow (createLocationErrors) with stand-ins for what MapView supplies. Records what the user would get: the notice
 * (and whether it is assertive), renewals of the control, permission checks and follow changes, in order.
 */
function errorFlow(opts: { noteError?: (code: number | undefined) => boolean; permission?: PermissionState | "unknown" } = {}) {
  const events: string[] = [];
  const notices: (LocationNotice | null)[] = [];
  let answer: (p: PermissionState | "unknown") => void = () => {};
  const deferred = opts.permission === undefined;
  const errors = createLocationErrors({
    noteError: (code) => {
      events.push("noteError");
      return (opts.noteError ?? (() => false))(code);
    },
    permission: () => {
      events.push("permission");
      return deferred ? new Promise((r) => (answer = r)) : Promise.resolve(opts.permission!);
    },
    stopFollowing: () => events.push("stopFollowing"),
    showNotice: (n) => {
      notices.push(n);
      events.push(n ? `notice ${n.urgent ? "alert" : "status"}` : "notice cleared");
    },
    renewControl: (refocus) => events.push(`renew refocus=${refocus}`),
  });
  return { errors, events, notices, answer: (p: PermissionState | "unknown") => answer(p) };
}
const launchError = () => true;
const buttonError = () => false;

describe("the location error flow (createLocationErrors)", () => {
  it("classifies first, then stops following, then answers: launch errors 2, 3 and unknown get a polite message only", async () => {
    for (const code of [2, 3, undefined]) {
      const f = errorFlow({ noteError: launchError, permission: "granted" });
      await f.errors.handle(code);
      expect(f.events).toEqual(["noteError", "stopFollowing", "notice status"]); // no permission check, no renewal
      expect(f.notices).toEqual([{ text: LAUNCH_NOT_FOUND_TEXT, urgent: false }]);
    }
  });

  it("errors 2, 3 and unknown after a press of the button keep the assertive, specific message", async () => {
    for (const code of [2, 3, undefined]) {
      const f = errorFlow({ noteError: buttonError, permission: "granted" });
      await f.errors.handle(code);
      expect(f.events).toEqual(["noteError", "stopFollowing", "notice alert"]);
      expect(f.notices).toEqual([{ text: locationErrorMessage(code), urgent: true }]);
    }
  });

  it("launch code 1: silent either way; the control is renewed (no refocus) only when the prompt wasn't an explicit block", async () => {
    const dismissed = errorFlow({ noteError: launchError, permission: "prompt" });
    await dismissed.errors.handle(1);
    expect(dismissed.events).toEqual(["noteError", "stopFollowing", "permission", "notice cleared", "renew refocus=false"]);
    const blocked = errorFlow({ noteError: launchError, permission: "denied" });
    await blocked.errors.handle(1);
    expect(blocked.events).toEqual(["noteError", "stopFollowing", "permission", "notice cleared"]);
  });

  it("button code 1 with 'prompt' or 'unknown': assertive 'not shared' message, and the control is renewed with focus back on it", async () => {
    for (const permission of ["prompt", "unknown"] as const) {
      const f = errorFlow({ noteError: buttonError, permission });
      await f.errors.handle(1);
      expect(f.events).toEqual(["noteError", "stopFollowing", "permission", "notice alert", "renew refocus=true"]);
      expect(f.notices).toEqual([{ text: NOT_SHARED_TEXT, urgent: true }]);
    }
  });

  it("button code 1 with 'denied': the blocked message, and no renewal (the button stays disabled, nothing asks again)", async () => {
    const f = errorFlow({ noteError: buttonError, permission: "denied" });
    await f.errors.handle(1);
    expect(f.events).toEqual(["noteError", "stopFollowing", "permission", "notice alert"]);
    expect(f.notices[0]?.text).toBe(locationErrorMessage(1));
  });

  it("drops a permission answer that arrives after the map has gone: no message, no renewal", async () => {
    const f = errorFlow({ noteError: buttonError });
    const handled = f.errors.handle(1);
    expect(f.errors.active()).toBe(true);
    f.errors.dispose();
    expect(f.errors.active()).toBe(false); // MapView's delayed focus checks this too
    f.answer("prompt");
    await handled;
    expect(f.events).toEqual(["noteError", "stopFollowing", "permission"]);
  });

  it("drops a permission answer that arrives after a newer request started, so its message can't cover the new one", async () => {
    const f = errorFlow({ noteError: buttonError });
    const handled = f.errors.handle(1);
    f.errors.requestStarted(); // the user pressed the button again
    f.answer("prompt");
    await handled;
    expect(f.events).toEqual(["noteError", "stopFollowing", "permission", "notice cleared"]); // only the new request's clearing
  });

  it("a new request clears the previous message", () => {
    const f = errorFlow();
    f.errors.requestStarted();
    expect(f.notices).toEqual([null]);
  });
});

describe("the location error flow with locateOnLaunch and a MapLibre-like control", () => {
  /** Wires createLocationErrors to the real locateOnLaunch, as MapView does: requestStarted on every start, handle on errors. */
  function wired() {
    const f = launchFakes();
    const launch = locateOnLaunch(f.map, f.control, Promise.resolve(true));
    const notices: (LocationNotice | null)[] = [];
    const renewals: boolean[] = [];
    let permission: PermissionState | "unknown" = "prompt";
    const errors = createLocationErrors({
      noteError: launch.noteError,
      permission: () => Promise.resolve(permission),
      stopFollowing: () => {},
      showNotice: (n) => notices.push(n),
      renewControl: (refocus) => renewals.push(refocus),
    });
    f.control.on("trackuserlocationstart", errors.requestStarted);
    /** A failed request: MapLibre leaves the control in its error state (or off, for code 1), then fires "error". */
    const error = (code: number | undefined) => {
      f.fail(code);
      return errors.handle(code);
    };
    return { f, launch, errors, notices, renewals, error, setPermission: (p: PermissionState | "unknown") => (permission = p) };
  }

  it("a launch timeout is polite and resets the control; the next press is a fresh request whose failure is assertive", async () => {
    const w = wired();
    await settle(); // the launch request starts
    await w.error(3);
    expect(w.notices.at(-1)).toEqual({ text: LAUNCH_NOT_FOUND_TEXT, urgent: false });
    expect(w.f.watch).toEqual({ state: "off", requests: 1 });
    w.f.control.trigger(); // the user presses the button
    expect(w.f.watch).toEqual({ state: "waiting", requests: 2 });
    expect(w.notices.at(-1)).toBeNull(); // the launch message is cleared by the new request
    await w.error(3);
    expect(w.notices.at(-1)).toEqual({ text: locationErrorMessage(3), urgent: true });
    expect(w.renewals).toEqual([]);
  });

  it("a dismissed launch prompt is silent and renews the control; a dismissed press then gets the assertive message", async () => {
    const w = wired();
    await settle();
    await w.error(1);
    expect(w.notices.at(-1)).toBeNull();
    expect(w.renewals).toEqual([false]);
    w.f.control.trigger(); // the user presses the (renewed) button
    await w.error(1);
    expect(w.notices.at(-1)).toEqual({ text: NOT_SHARED_TEXT, urgent: true });
    expect(w.renewals).toEqual([false, true]);
  });

  it("a launch prompt answered with Block is silent and doesn't renew: the button stays disabled", async () => {
    const w = wired();
    w.setPermission("denied");
    await settle();
    await w.error(1);
    expect(w.notices.at(-1)).toBeNull();
    expect(w.renewals).toEqual([]);
  });

  it("renewal through renewLocationControl leaves exactly one control, with the listeners attached to the new one", async () => {
    const corner: string[] = [];
    const host = {
      removeControl: (c: string) => corner.splice(corner.indexOf(c), 1),
      addControl: (c: string) => corner.push(c),
    };
    let made = 1;
    let current = "control 1";
    host.addControl(current);
    const wiredTo: string[] = [];
    const errors = createLocationErrors({
      noteError: () => false,
      permission: () => Promise.resolve("prompt"),
      stopFollowing: () => {},
      showNotice: () => {},
      renewControl: () => {
        current = renewLocationControl(host, current, () => `control ${++made}`);
        wiredTo.push(current); // MapView: wire(geolocate)
      },
    });
    await errors.handle(1);
    await errors.handle(1);
    expect(corner).toEqual(["control 3"]);
    expect(wiredTo).toEqual(["control 2", "control 3"]);
  });
});

describe("renewing the location control after a dismissed prompt", () => {
  it("removes the old control and adds a new one in the same corner", () => {
    const steps: string[] = [];
    const host = { removeControl: (c: string) => steps.push(`remove ${c}`), addControl: (c: string, at: string) => steps.push(`add ${c} ${at}`) };
    expect(renewLocationControl(host, "old", () => "new")).toBe("new");
    expect(steps).toEqual(["remove old", "add new top-right"]);
  });

  // The workaround rests on these facts about the installed MapLibre. If an upgrade changes any of them, revisit renewLocationControl.
  const source = readFileSync("node_modules/maplibre-gl/src/ui/control/geolocate_control.ts", "utf8");
  const between = (from: string, to: string) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
  const onError = between("_onError = ", "_onMoveStart = ");
  const permissionDenied = onError.slice(onError.indexOf("error.code === 1"), onError.indexOf("error.code === 3"));

  it("matches MapLibre: code 1 disables the button and nothing re-enables it", () => {
    expect(permissionDenied).toMatch(/this\._geolocateButton\.disabled = true;/);
    expect(permissionDenied).toMatch(/GeolocateControl\.LocationNotAvailable/);
    expect(source.match(/_geolocateButton\.disabled = false/g)).toHaveLength(1); // only in the first setup (_finishSetupUI)
  });

  it("matches MapLibre: code 1 clears the watch without lowering the watch count, so a re-enabled button would misbehave", () => {
    expect(permissionDenied).toMatch(/this\._clearWatch\(\);/);
    expect(permissionDenied).not.toMatch(/numberOfWatches/);
    expect(between("_clearWatch(): void", "\n    }\n")).not.toMatch(/numberOfWatches/); // nor does clearing the watch
    expect(source).toMatch(/if \(numberOfWatches > 1\) \{\s*positionOptions = \{maximumAge: 600000, timeout: 0\};\s*noTimeout = true;/);
    expect(onError).toMatch(/error\.code === 3 && noTimeout[\s\S]{0,400}return;/); // that timeout's error is swallowed
  });

  it("matches MapLibre: removing the control resets the watch count, and switching it off (trigger) lowers it", () => {
    expect(between("onRemove(): void", "_isOutOfMapMaxBounds")).toMatch(/numberOfWatches = 0;/);
    expect(between("trigger(): boolean", "_clearWatch(): void")).toMatch(/case 'ACTIVE_ERROR':[\s\S]{0,200}numberOfWatches--;[\s\S]{0,120}this\._watchState = 'OFF';/);
  });

  it("matches MapLibre: the support check that enables a new control is worked out once and reused", () => {
    const support = readFileSync("node_modules/maplibre-gl/src/util/geolocation_support.ts", "utf8");
    expect(support).toMatch(/if \(supportsGeolocation !== undefined && !forceRecalculation\) \{\s*return supportsGeolocation;/);
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

  // MapView itself can't run in Node (it needs a DOM and WebGL), so only its glue to the tested flow is checked here: the behaviour
  // is tested above through createLocationErrors, locateOnLaunch and renewLocationControl.
  it("MapView routes every location error through the tested flow, from the control's only error listener", () => {
    const view = readFileSync("web/src/map/MapView.tsx", "utf8");
    const location = readFileSync("web/src/map/location.ts", "utf8");
    expect(view).toMatch(/createLocationErrors\(\{\s*noteError: launch\.noteError,\s*permission: locationPermission,/);
    expect(view.match(/\.on\("error", \(e\) =>/g)).toHaveLength(1);
    expect(view).toMatch(/control\.on\("error", \(e\) => void errors\.handle\(e\.code\)\);/);
    expect(view).toMatch(/control\.on\("trackuserlocationstart", \(\) => \{\s*errors\.requestStarted\(\);/);
    expect(location).not.toMatch(/\.on\("error"/); // locateOnLaunch is asked (noteError); it doesn't listen
    expect(view).toMatch(/return \(\) => \{\s*errors\.dispose\(\);/);
    // The notice's role comes from the flow: "alert" only after a press of the button.
    expect(view).toMatch(/role=\{locationNotice\.urgent \? "alert" : "status"\}/);
    expect(view.match(/role="alert"/g)).toBeNull();
  });

  it("MapView renews with the same options and re-attaches its listeners to the new control", () => {
    const view = readFileSync("web/src/map/MapView.tsx", "utf8");
    expect(view).toMatch(/geolocate = renewLocationControl<GeolocateControl>\(map, geolocate, \(\) => new GeolocateControl\(GEOLOCATE_OPTIONS\)\);\s*wire\(geolocate\);/);
    expect(view.match(/new GeolocateControl\(GEOLOCATE_OPTIONS\)/g)).toHaveLength(2); // the first control and its renewals
  });

  it("the follow indicator carries the planning-only safety line", () => {
    expect(readFileSync("web/src/map/MapView.tsx", "utf8")).toMatch(/Following your location[\s\S]{0,200}For planning only\. Do not use while driving\./);
  });
});
