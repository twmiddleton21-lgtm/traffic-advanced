import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { createElement as h, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RESTRICTIONS_DISCLAIMER, restrictionPointsFileSchema } from "../../../shared/api/restrictions.ts";
import { RestrictionMapControls } from "../components/RestrictionMapControls.tsx";
import { RESTRICTION_MIN_ZOOM, RESTRICTION_OVERVIEW_ZOOM, restrictionFeatures } from "../map/restrictionLayers.ts";
import type { RestrictionLayer } from "../settings/preferences.ts";
import { mapControlsState, zoomMessage } from "./mapControls.ts";
import { forgetFailedLoad, type LayerData, type LayerStatus } from "./useRestrictionData.ts";

/**
 * The map's restriction controls as the switches change (real shipped data). Each step is the statuses App passes after a switch:
 * a layer switched off is "off" (useRestrictionData), so nothing about it may remain on screen.
 */
const file = (layer: "height" | "weight") => restrictionPointsFileSchema.parse(JSON.parse(readFileSync(`web/src/restrictions/data/${layer}.json`, "utf8")));
const height = file("height");
const weight = file("weight");
const retry = vi.fn();
const status = (layer: RestrictionLayer, state: LayerStatus["state"], data: LayerData | null = null, error: string | null = null): LayerStatus => ({ layer, state, data, error, retry });
const ready = (layer: "height" | "weight") => status(layer, "ready", { layer, points: layer === "height" ? height : weight });
const off = (layer: RestrictionLayer) => status(layer, "off");
const props = (statuses: LayerStatus[], zoom: number, keyOpen = true, onKeyOpenChange: (open: boolean) => void = () => undefined) => ({ statuses, zoom, onOpenList: () => undefined, buttonRef: null, keyOpen, onKeyOpenChange });
const render = (statuses: LayerStatus[], zoom: number, keyOpen = true) => renderToStaticMarkup(h(RestrictionMapControls, props(statuses, zoom, keyOpen)));
// Everything in the live regions (the loading and failure messages, and the key with its zoom message).
const liveRegion = (html: string) => [...html.matchAll(/<div role="status"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1]).join("");
const keyPart = (html: string) => /<details[^>]*>[\s\S]*?<\/details>/.exec(html)?.[0] ?? "";
const outsideKey = (html: string) => html.replace(keyPart(html), "");
// The one disclaimer element: its class (shown, or "sr-only" while the key is folded) and its exact text.
const disclaimer = (html: string) => /<p id="restrictions-disclaimer" class="([^"]*)">([^<]*)<\/p>/.exec(html);
const isOpen = (html: string) => /<details[^>]*\sopen=""/.test(html);
const grouped = 9;

describe("restriction map controls as layers are switched", () => {
  it("height and weight on, zoomed out: one message naming both, and the disclaimer", () => {
    const html = render([ready("height"), ready("weight"), off("lez"), off("ulez")], grouped);
    expect(liveRegion(html)).toContain("Circles group nearby height and weight restrictions.");
    expect(html.split(RESTRICTIONS_DISCLAIMER).length - 1).toBe(1);
  });

  it("height switched off with weight still on: no height message, key row or button chip remains (the reported bug)", () => {
    const html = render([off("height"), ready("weight"), off("lez"), off("ulez")], grouped);
    expect(liveRegion(html)).toContain("Circles group nearby weight restrictions.");
    expect(html).not.toMatch(/height/i);
    expect(html).toContain("Weight value on a National Highways diversion route.");
    expect(html.split(RESTRICTIONS_DISCLAIMER).length - 1).toBe(1);
    // The old fixed message, whatever was on.
    expect(html).not.toContain("Zoom in to see height and weight restrictions.");
  });

  it("height switched off while loading or after failing: its loading and error messages go with it", () => {
    const loading = render([status("height", "loading"), ready("weight")], 14);
    expect(loading).toContain("Loading height restrictions…");
    const failed = render([status("height", "error", null, "Restriction data can't be loaded."), ready("weight")], 14);
    expect(failed).toContain("Height restrictions: Restriction data can");
    for (const html of [render([off("height"), ready("weight")], 14)]) {
      expect(html).not.toContain("Loading height");
      expect(html).not.toContain("Height restrictions:");
      expect(html).not.toContain("Try again");
    }
  });

  it("zoom messages only for loaded height or weight layers, and only where markers are grouped or not drawn", () => {
    const weightOnly = [ready("weight")];
    expect(zoomMessage(mapControlsState(weightOnly, RESTRICTION_OVERVIEW_ZOOM - 1))).toBe("Zoom in to see weight restrictions.");
    expect(zoomMessage(mapControlsState(weightOnly, RESTRICTION_MIN_ZOOM - 1))).toMatch(/^Circles group nearby weight restrictions/);
    expect(zoomMessage(mapControlsState(weightOnly, RESTRICTION_MIN_ZOOM))).toBeNull();
    // Still loading, or zones only: no zoom message.
    expect(zoomMessage(mapControlsState([status("height", "loading")], grouped))).toBeNull();
    expect(zoomMessage(mapControlsState([status("lez", "ready", null)], grouped))).toBeNull();
  });

  it("zones only: no height or weight wording, disclaimer kept", () => {
    const html = render([off("height"), off("weight"), status("lez", "ready", null), status("ulez", "ready", null)], grouped);
    expect(html).not.toMatch(/height|weight/i);
    expect(html.split(RESTRICTIONS_DISCLAIMER).length - 1).toBe(1);
  });

  it("every layer off: nothing at all", () => {
    expect(render([off("height"), off("weight"), off("lez"), off("ulez")], grouped)).toBe("");
    expect(mapControlsState([off("height")], grouped).active).toEqual([]);
  });

  it("Try again calls the failed layer's own retry", () => {
    const own = vi.fn();
    const state = mapControlsState([{ ...status("height", "error", null, "x"), retry: own }, ready("weight")], 14);
    expect(state.failed.map((s) => s.layer)).toEqual(["height"]);
    state.failed[0]!.retry();
    expect(own).toHaveBeenCalledOnce();
  });
});

describe("the restrictions key folds like the map key", () => {
  const both = [ready("height"), ready("weight"), off("lez"), off("ulez")];

  it("folded: only the compact control is seen; the hint, key and disclaimer are kept, not removed", () => {
    const html = render(both, grouped, false);
    expect(isOpen(html)).toBe(false);
    expect(keyPart(html)).toMatch(/<summary[^>]*>Restrictions key/);
    // The guidance is still there, inside the folded key: reopening shows it again.
    expect(keyPart(html)).toContain("Circles group nearby height and weight restrictions.");
    expect(keyPart(html)).toContain("Height restriction");
    // The disclaimer: still in the page once, word for word, hidden visually only, and the folded control's description.
    expect(html.split(RESTRICTIONS_DISCLAIMER).length - 1).toBe(1);
    expect(disclaimer(html)?.[1]).toBe("sr-only");
    expect(disclaimer(html)?.[2]).toBe(RESTRICTIONS_DISCLAIMER);
    expect(keyPart(html)).toMatch(/<summary aria-describedby="restrictions-disclaimer"/);
  });

  it("reopened: the same key and hint, and the exact disclaimer shown again", () => {
    const html = render(both, grouped, true);
    expect(isOpen(html)).toBe(true);
    const folded = keyPart(render(both, grouped, false));
    expect(keyPart(html).replace(' open=""', "")).toBe(folded.replace(' aria-describedby="restrictions-disclaimer"', ""));
    expect(disclaimer(html)?.[1]).not.toMatch(/sr-only/);
    expect(disclaimer(html)?.[1]).toMatch(/\bborder-sign\b/);
    expect(disclaimer(html)?.[2]).toBe(RESTRICTIONS_DISCLAIMER);
    expect(html.split(RESTRICTIONS_DISCLAIMER).length - 1).toBe(1);
  });

  it("the disclaimer is exactly the approved wording", () => {
    expect(RESTRICTIONS_DISCLAIMER).toBe(
      "Restrictions data is incomplete. Community-sourced records are unverified. No marker does not mean no restriction. Always follow road signs. This map is not a route check.",
    );
  });

  it("the summary is a 48 px target and the key is reached by keyboard (a native summary)", () => {
    expect(render(both, grouped)).toMatch(/<summary class="[^"]*\bmin-h-12\b/);
    expect(render(both, grouped, false)).toMatch(/<summary aria-describedby="restrictions-disclaimer" class="[^"]*\bmin-h-12\b/);
  });

  it("loading and failure messages are never folded away", () => {
    const html = render([status("height", "error", null, "Restriction data can't be loaded."), status("weight", "loading"), off("lez"), off("ulez")], 14, false);
    expect(outsideKey(html)).toContain("Height restrictions: Restriction data can");
    expect(outsideKey(html)).toContain("Try again");
    expect(outsideKey(html)).toContain("Loading weight restrictions…");
    // Nothing loaded yet, so there is no key to fold; the disclaimer is shown, not hidden.
    expect(keyPart(html)).toBe("");
    expect(html.split(RESTRICTIONS_DISCLAIMER).length - 1).toBe(1);
    expect(disclaimer(html)?.[1]).not.toMatch(/sr-only/);
  });

  it("opening or folding it reports the new state to App, which holds it", () => {
    const changed = vi.fn();
    const details = findElement(RestrictionMapControls(props(both, grouped, true, changed)), "details");
    const onToggle = (details.props as { onToggle: (e: { currentTarget: { open: boolean } }) => void }).onToggle;
    onToggle({ currentTarget: { open: false } });
    onToggle({ currentTarget: { open: true } });
    expect(changed.mock.calls).toEqual([[false], [true]]);
    // App keeps the choice across layer switches, starting open where there's room and folded on phones, like the map key.
    const app = readFileSync("web/src/App.tsx", "utf8");
    expect(app).toMatch(/const \[restrictionKeyOpen, setRestrictionKeyOpen\] = useState\(wide\);/);
    expect(app).toMatch(/keyOpen=\{restrictionKeyOpen\}\s+onKeyOpenChange=\{setRestrictionKeyOpen\}/);
    expect(readFileSync("web/src/map/MapView.tsx", "utf8")).toMatch(/useState\(\(\) => window\.matchMedia\(WIDE_QUERY\)\.matches\)/);
  });

  it("stays folded while layers are switched, and its contents follow the layers on now", () => {
    // Each step is what App renders after a switch, with the key folded by the user before the first.
    const steps: [LayerStatus[], RegExp | null, RegExp | null][] = [
      [both, /height and weight/, null],
      [[off("height"), ready("weight"), off("lez"), off("ulez")], /Circles group nearby weight restrictions\./, /height/i],
      [[off("height"), ready("weight"), status("lez", "ready", null), off("ulez")], /LEZ boundary/, /height/i],
      [[ready("height"), off("weight"), off("lez"), off("ulez")], /Circles group nearby height restrictions\./, /weight/i],
    ];
    for (const [statuses, shown, gone] of steps) {
      const html = render(statuses, grouped, false);
      expect(isOpen(html)).toBe(false);
      if (shown) expect(keyPart(html)).toMatch(shown);
      if (gone) expect(keyPart(html)).not.toMatch(gone);
      // The layer chips on the button stay; the disclaimer stays once, folded with the key.
      expect(html).toMatch(/Restrictions<span class="sr-only"> \(/);
      expect(html.split(RESTRICTIONS_DISCLAIMER).length - 1).toBe(1);
      expect(disclaimer(html)?.[1]).toBe("sr-only");
    }
    // Every layer off: nothing on the map. Switched on again, the key is as the user left it (App's state), folded or open.
    expect(render([off("height"), off("weight"), off("lez"), off("ulez")], grouped, false)).toBe("");
    expect(isOpen(render([ready("weight")], grouped, false))).toBe(false);
    expect(isOpen(render([ready("weight")], grouped, true))).toBe(true);
  });
});

function findElement(node: ReactNode, type: string): ReactElement {
  const found: ReactElement[] = [];
  const walk = (n: ReactNode) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isValidElement(n)) return;
    if (n.type === type) found.push(n);
    walk((n.props as { children?: ReactNode }).children);
  };
  walk(node);
  if (found.length !== 1) throw new Error(`expected one <${type}>, found ${found.length}`);
  return found[0]!;
}

describe("switching a layer off forgets a failed load", () => {
  it("removes an errored query, so switching on again starts a fresh load; loaded data is kept", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const failedKey = ["restrictions", "height", "/assets/height.json"];
    await client.prefetchQuery({ queryKey: failedKey, queryFn: () => Promise.reject(new Error("offline")) });
    expect(client.getQueryState(failedKey)?.status).toBe("error");
    forgetFailedLoad(client, "height", "/assets/height.json");
    expect(client.getQueryState(failedKey)).toBeUndefined();

    const loadedKey = ["restrictions", "weight", "/assets/weight.json"];
    await client.prefetchQuery({ queryKey: loadedKey, queryFn: () => Promise.resolve({ layer: "weight", points: weight }) });
    forgetFailedLoad(client, "weight", "/assets/weight.json");
    expect(client.getQueryState(loadedKey)?.status).toBe("success");
  });
});

describe("weight restrictions reach the map (real record)", () => {
  // National Highways DiversionPoint on the M56 J10–J9 diversion route, seen rendered in the browser check (2026-10-12).
  const id = "nh-s4-diversion-points/8ee38316-90f6-4e85-9108-95a6df9613d9";

  it("is in the shipped file and becomes a marker with its value, plate and exact position", () => {
    const record = weight.features.find((p) => p.id === id);
    expect(record).toMatchObject({ kind: "weight-unrecorded-type", limit: { min: 7.5, max: 7.5 }, position: [-2.550786, 53.347575] });
    const marker = restrictionFeatures(weight).features.find((f) => f.properties.id === id);
    expect(marker?.geometry.coordinates).toEqual([-2.550786, 53.347575]);
    expect(marker?.properties).toMatchObject({ text: "7.5t", icon: "ta-r-weight-unrecorded-type", community: false });
  });

  it("every shipped weight record becomes a marker (none is dropped on the way to the map)", () => {
    const markers = restrictionFeatures(weight).features;
    const represented = new Set(markers.map((f) => f.properties.id));
    expect(markers.reduce((n, f) => n + f.properties.records, 0)).toBe(weight.features.length);
    expect(represented.has(id)).toBe(true);
  });
});
