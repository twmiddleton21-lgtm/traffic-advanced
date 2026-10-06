import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GEOLOCATE_OPTIONS, locationErrorMessage, stopFollowingOnZoom, type ZoomEvents } from "./location.ts";

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

  it("the follow indicator carries the planning-only safety line", () => {
    expect(readFileSync("web/src/map/MapView.tsx", "utf8")).toMatch(/Following your location[\s\S]{0,200}For planning only\. Do not use while driving\./);
  });
});
