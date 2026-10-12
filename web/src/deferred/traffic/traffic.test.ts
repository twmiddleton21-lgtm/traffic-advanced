import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { LineLayerSpecification } from "maplibre-gl";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseTrafficTilePath, TRAFFIC_MAX_ZOOM, TRAFFIC_MIN_ZOOM, TRAFFIC_UNAVAILABLE_TEXT } from "../../../../shared/api/traffic.ts";
import { TRAFFIC_BANDS, TRAFFIC_LAYER_IDS, TRAFFIC_SOURCE, trafficLayers, trafficSource } from "./layers.ts";
import { getTrafficStatus } from "./status.ts";
import { TrafficKey, TrafficSwitch } from "./TrafficControls.tsx";
import { TRAFFIC_REFRESH_MS, trafficReducer, trafficUpdatedAt, type TrafficState } from "./traffic.ts";

/**
 * DEFERRED live traffic (README.md here): kept working and tested so it can be picked up later, but not in the first release.
 * The app's own tests (ui-safety.test.ts, routemap.test.ts, worker/src/deploy-config.test.ts) prove none of it is reachable.
 */
const appFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return p.replaceAll("\\", "/") === "web/src/deferred" ? [] : appFiles(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : [];
  });

describe("deferred: kept out of the first release", () => {
  it("nothing in the app imports it", () => {
    const importers = appFiles("web/src").filter((f) => /from "[^"]*deferred\//.test(readFileSync(f, "utf8")));
    expect(importers).toEqual([]);
  });
});

describe("deferred traffic state: asked once per switch-on, never retried on its own", () => {
  const run = (events: Parameters<typeof trafficReducer>[1][]) => events.reduce<TrafficState>(trafficReducer, "off");

  it("off → checking → available; a failed check or a tile error → unavailable", () => {
    expect(run(["activate"])).toBe("checking");
    expect(run(["activate", "status-available"])).toBe("available");
    expect(run(["activate", "status-unavailable"])).toBe("unavailable");
    expect(run(["activate", "status-available", "tile-error"])).toBe("unavailable");
  });

  it("unavailable stays unavailable (no retry storm) until switched off and on", () => {
    expect(run(["activate", "status-unavailable", "tile-error", "status-available"])).toBe("unavailable");
    expect(run(["activate", "status-unavailable", "deactivate"])).toBe("off");
    expect(run(["activate", "status-unavailable", "deactivate", "activate", "status-available"])).toBe("available");
    // A late answer for a check that was abandoned changes nothing.
    expect(run(["activate", "deactivate", "status-available"])).toBe("off");
  });

  it("the status check: only a clear yes from our Worker counts; errors, 503 and nonsense are no", async () => {
    const answer = (r: Response | Error) => vi.fn<typeof fetch>(() => (r instanceof Error ? Promise.reject(r) : Promise.resolve(r)));
    const signal = new AbortController().signal;
    const yes = answer(Response.json({ available: true }));
    expect(await getTrafficStatus(signal, yes)).toBe(true);
    expect(yes).toHaveBeenCalledWith("/api/traffic/status", { signal, cache: "no-store" });
    expect(await getTrafficStatus(signal, answer(Response.json({ available: false })))).toBe(false);
    expect(await getTrafficStatus(signal, answer(Response.json({ error: "traffic-unavailable" }, { status: 503 })))).toBe(false);
    expect(await getTrafficStatus(signal, answer(Response.json({ available: "yes" })))).toBe(false);
    expect(await getTrafficStatus(signal, answer(new Error("offline")))).toBe(false);
  });

  it("refreshes every 10 minutes at most; the time shown is the later of the switch-on check and the last refresh", () => {
    expect(TRAFFIC_REFRESH_MS).toBe(600_000);
    expect(trafficUpdatedAt(1000, null)).toBe(1000);
    expect(trafficUpdatedAt(1000, 5000)).toBe(5000);
    expect(trafficUpdatedAt(9000, 5000)).toBe(9000);
    const src = readFileSync("web/src/deferred/traffic/traffic.ts", "utf8");
    expect(src).toMatch(/if \(!shown\) return;/);
    expect(src).toMatch(/if \(document\.visibilityState === "visible"\)/);
  });
});

describe("deferred traffic tiles", () => {
  it("come only from our Worker, from zoom 7 to 13 (stretched beyond, so zooming in further costs nothing)", () => {
    expect(trafficSource(3)).toEqual({ type: "vector", tiles: ["/api/traffic/flow/{z}/{x}/{y}?r=3"], minzoom: 7, maxzoom: 13 });
    expect([TRAFFIC_MIN_ZOOM, TRAFFIC_MAX_ZOOM]).toEqual([7, 13]);
    expect(parseTrafficTilePath("/api/traffic/flow/13/4095/2722")).toEqual({ z: 13, x: 4095, y: 2722 });
    expect(parseTrafficTilePath("/api/traffic/flow/13/8192/0")).toBeNull();
  });

  it("start hidden, so no tile would be fetched until traffic is shown", () => {
    for (const l of trafficLayers) {
      expect((l.layout as { visibility?: string }).visibility, l.id).toBe("none");
      expect((l as LineLayerSpecification).source).toBe(TRAFFIC_SOURCE);
      expect((l as LineLayerSpecification)["source-layer"]).toBe("Traffic flow");
    }
    expect(TRAFFIC_LAYER_IDS).toEqual(["routes-traffic", "routes-traffic-closed"]);
  });

  it("congestion bands by TomTom's relative speed, each a different colour AND width, named in the key", () => {
    expect(new Set(TRAFFIC_BANDS.map((b) => b.colour)).size).toBe(4);
    expect(new Set(TRAFFIC_BANDS.map((b) => b.width)).size).toBe(4);
    const key = renderToStaticMarkup(h(TrafficKey));
    for (const b of TRAFFIC_BANDS) expect(key).toContain(b.label);
    expect(key).toContain("Closed (reported by TomTom)");
    const paint = (trafficLayers[0] as LineLayerSpecification).paint!;
    expect(JSON.stringify(paint["line-color"])).toBe(JSON.stringify(["step", ["to-number", ["get", "relative_speed"], 1], "#7a0019", 0.25, "#d7191c", 0.5, "#f28c00", 0.75, "#1a9850"]));
  });

  it("zoom-dependent widths keep the zoom input at the top of an interpolate (MapLibre rejects it anywhere else)", () => {
    for (const l of trafficLayers) {
      const width = (l as LineLayerSpecification).paint!["line-width"] as unknown[];
      expect(width.slice(0, 3), l.id).toEqual(["interpolate", ["linear"], ["zoom"]]);
      expect(JSON.stringify(width.slice(3)), l.id).not.toContain('["zoom"]');
    }
  });
});

describe("deferred traffic switch", () => {
  const render = (state: TrafficState, on = true, unavailableShownElsewhere = false) =>
    renderToStaticMarkup(h(TrafficSwitch, { idPrefix: "t", on, onToggle: () => undefined, state, updatedAt: null, unavailableShownElsewhere }));

  it("says traffic is unavailable, and nothing about why, when it can't be shown", () => {
    expect(TRAFFIC_UNAVAILABLE_TEXT).toBe("Live traffic is temporarily unavailable due to maintenance. Please try again later.");
    expect(render("unavailable")).toContain(TRAFFIC_UNAVAILABLE_TEXT);
    expect(render("unavailable")).not.toMatch(/\b(quota|cap|limit|429)\b|TomTom request/i);
    expect(render("unavailable", true, true)).not.toContain(TRAFFIC_UNAVAILABLE_TEXT);
    for (const s of ["checking", "available", "off"] as const) expect(render(s)).not.toContain(TRAFFIC_UNAVAILABLE_TEXT);
  });
});
