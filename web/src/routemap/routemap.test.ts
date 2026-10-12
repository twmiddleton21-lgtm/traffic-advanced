import { readFileSync } from "node:fs";
import { createElement as h, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { junctionsSnapshotSchema, type Junction } from "../../../shared/api/junctions.ts";
import { RESTRICTIONS_DISCLAIMER } from "../../../shared/api/restrictions.ts";
import { APP_VERSION } from "../app/version.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { MapKey } from "../components/MapKey.tsx";
import { JunctionNumbersSwitch, NO_TRAFFIC_TEXT, ROUTES_SCOPE_TEXT, RoutesMapControls } from "../components/RoutesMapControls.tsx";
import { SettingsDialog } from "../components/settings/SettingsDialog.tsx";
import { ViewSwitch } from "../components/ViewSwitch.tsx";
import { availableLayers } from "../restrictions/catalog.ts";
import { ROUTES_JUNCTION_SOURCE, ROUTES_LAYER_IDS } from "../map/routesLayers.ts";
import { overlayLayers } from "../map/style.ts";
import { CLOSURES_LAYER_IDS, DEFAULT_ROUTES_LAYERS, ROUTES_OVERLAY_LAYER_IDS, viewLayerVisibility } from "../map/viewLayers.ts";
import { ROUTES_DATA_LAYERS } from "../../../shared/api/routes-layers.ts";
import { junctionLabels, junctionLoad, type JunctionLoad } from "./junctionLabels.ts";
import { createViewCameras, readView, withView, type AppView } from "./view.ts";

const app = readFileSync("web/src/App.tsx", "utf8");
const mapView = readFileSync("web/src/map/MapView.tsx", "utf8");
// Real junction labels: the development export of the NH Network Model (OGL v3.0), the same builder the API publisher uses.
const realJunctions = junctionsSnapshotSchema.parse(JSON.parse(readFileSync("web/src/data/dev-junctions.json", "utf8"))).junctions;

describe("Closures / Routes view state", () => {
  it("opens Closures by default; only ?view=routes opens Routes", () => {
    expect(readView("")).toBe("closures");
    expect(readView("?closure=520677")).toBe("closures");
    expect(readView("?view=routes")).toBe("routes");
    for (const odd of ["?view=Routes", "?view=", "?view=closures", "?view=traffic"]) expect(readView(odd)).toBe("closures");
    expect(app).toMatch(/useState<AppView>\(\(\) => readView\(window\.location\.search\)\)/);
  });

  it("is kept in the URL beside the selected closure, which is never dropped by a switch", () => {
    const routes = withView("https://example.test/?closure=520677%7CeastBound", "routes");
    expect(routes.searchParams.get("view")).toBe("routes");
    expect(routes.searchParams.get("closure")).toBe("520677|eastBound");
    const back = withView(routes.href, "closures");
    expect(back.searchParams.has("view")).toBe(false);
    expect(back.searchParams.get("closure")).toBe("520677|eastBound");
  });

  it("keeps each view's map position: Closures comes back exactly where it was", () => {
    const cameras = createViewCameras();
    const closuresCam = { center: [-2.55, 53.35] as [number, number], zoom: 12, bearing: 0, pitch: 0 };
    const routesCam = { center: [-0.12, 51.5] as [number, number], zoom: 9, bearing: 0, pitch: 0 };
    // First visit to Routes: starts where the map is.
    expect(cameras.switchView("closures", "routes", closuresCam)).toBeNull();
    // Back to Closures after moving the Routes map: Closures' own position.
    expect(cameras.switchView("routes", "closures", routesCam)).toEqual(closuresCam);
    expect(cameras.switchView("closures", "routes", closuresCam)).toEqual(routesCam);
    expect(cameras.switchView("routes", "routes", routesCam)).toBeNull();
    expect(mapView).toMatch(/cameras\.current\.switchView\(shownView\.current, view, /);
  });

  it("switching changes only the view: Closures' day, filters, search, selection and drawer state are untouched", () => {
    expect(app).toMatch(/onViewChange=\{setAppView\}/);
    expect(app.match(/setAppView\(/g) ?? []).toHaveLength(0);
    // Closures' own UI is hidden, not unmounted, or shown only in its view; its state lives in App either way.
    expect(app).toMatch(/hidden=\{!closuresView\}\s*className=\{`flex min-h-0 flex-col/);
    expect(app).toMatch(/\{data && closuresView && <DateSelector/);
    expect(app).toMatch(/\{selected && data && closuresView && \(/);
    for (const state of ["filter", "query", "selectedId", "chosenDay", "drawerOpen", "mapKeyOpen"]) expect(app).toMatch(new RegExp(`const \\[${state}, `));
  });

  it("uses one map for both views: no second map container or instance", () => {
    expect(app.match(/<MapView\b/g)).toHaveLength(1);
    expect(mapView.match(/new MapLibreMap\(/g)).toHaveLength(1);
    // The map is created once and removed only when the app goes away (the effect has no dependencies).
    expect(mapView).toMatch(/map\.remove\(\);\s*mapRef\.current = null;\s*\};\s*\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps -- created once/);
    // A selected closure is framed in the Closures view only, so the Routes view's position is never moved by it.
    expect(mapView).toMatch(/if \(!map \|\| !selected \|\| latest\.current\.view !== "closures"\) return;/);
  });
});

describe("each view's own map layers", () => {
  const layers = overlayLayers();

  it("Closures shows its closure, diversion and junction layers and none of Routes'", () => {
    const routes = new Set<string>([...ROUTES_LAYER_IDS, ...ROUTES_OVERLAY_LAYER_IDS]);
    // Whatever the Routes switches say, including every OpenStreetMap layer on.
    const allOn = { junctions: true, ...Object.fromEntries(ROUTES_DATA_LAYERS.map((l) => [l, true])) };
    for (const switches of [{ junctions: true }, allOn]) {
      for (const { id, visible } of viewLayerVisibility("closures", switches)) expect(visible, id).toBe(!routes.has(id));
    }
  });

  it("Routes hides every closure, diversion and confirmed-junction layer, and shows its junction numbers while switched on", () => {
    const shown = (view: AppView, junctions: boolean) => viewLayerVisibility(view, { junctions }).filter((l) => l.visible).map((l) => l.id);
    expect(shown("routes", true)).toEqual(["routes-junction"]);
    expect(shown("routes", false)).toEqual([]);
    // Every layer drawn from a Closures source is switched with the view, so none can show through in Routes.
    const closureSources = new Set(["closures", "markers", "selected-route", "route-ends", "junctions"]);
    const fromClosureSources = layers.filter((l) => "source" in l && closureSources.has(l.source)).map((l) => l.id);
    expect([...fromClosureSources].sort()).toEqual([...CLOSURES_LAYER_IDS].sort());
  });

  it("Routes' layers have their own source and start hidden, so they never change the Closures map", () => {
    const routes = layers.filter((l) => (ROUTES_LAYER_IDS as readonly string[]).includes(l.id));
    expect(new Set(routes.map((l) => (l as { source: string }).source))).toEqual(new Set([ROUTES_JUNCTION_SOURCE]));
    expect(routes.every((l) => (l.layout as { visibility?: string }).visibility === "none")).toBe(true);
  });

  it("first release: the map has junction numbers and no traffic source or layer, so it never asks for traffic", () => {
    expect([...ROUTES_LAYER_IDS]).toEqual(["routes-junction"]);
    expect(layers.map((l) => l.id).filter((id) => /traffic/.test(id))).toEqual([]);
    expect(layers.some((l) => "source" in l && /traffic/.test(String(l.source)))).toBe(false);
    expect(mapView).not.toMatch(/tomtom|TRAFFIC_|trafficSource|trafficRefresh|onTrafficError|\/api\/traffic/i);
    // Each Routes source the map adds: the junction labels only.
    expect(mapView).toMatch(/map\.addSource\(ROUTES_JUNCTION_SOURCE, \{ type: "geojson", data: junctionPoints\(latest\.current\.routeJunctions\) \}\);/);
  });

  it("restriction layers are shown in the Closures view only (their switches and data are kept)", () => {
    expect(mapView).toMatch(/const visible = view === "closures" && o\.visible && o\.data !== null;/);
    expect(app).toMatch(/\{closuresView \? \(\s*<>[\s\S]*?<RestrictionMapControls[\s\S]*?\) : \(/);
  });
});

describe("compact map keys", () => {
  const key = (view: AppView, open: boolean) => renderToStaticMarkup(h(MapKey, { view, open, onOpenChange: () => undefined }));

  it("one key per view, folding to a single 48 px 'Map key' line; open, it shows that view's own rows", () => {
    for (const view of ["closures", "routes"] as const) {
      const folded = key(view, false);
      expect(folded).toMatch(/<summary class="[^"]*\bmin-h-12\b[^"]*">Map key<svg/);
      expect(folded).not.toMatch(/<details[^>]*\sopen=""/);
    }
    expect(key("routes", true)).toContain("Junction number (National Highways roads only)");
    expect(key("routes", true)).not.toContain("Closed carriageway");
    expect(key("closures", true)).toContain("Closed carriageway");
    // Without restriction layers there is no restriction section or disclaimer in it.
    expect(key("closures", true)).not.toMatch(/Restrictions key|restrictions-disclaimer/);
  });

  it("Closures: the key sits bottom left, above the map credits; it scrolls within the map, clear of the restriction controls on phones", () => {
    expect(app).toMatch(/<MapKey\s+view=\{appView\}\s+open=\{mapKeyOpen\}\s+onOpenChange=\{setMapKeyOpen\}\s+restrictions=\{\{ statuses: Object\.values\(statuses\), area: view, now, onSelect: openRestriction \}\}\s+className="absolute bottom-\[calc\(2rem\+env\(safe-area-inset-bottom\)\)\] left-\[max\(0\.75rem,env\(safe-area-inset-left\)\)\] z-\[1\] max-h-\[max\(6rem,calc\(100%-15rem\)\)\] w-max max-w-\[min\(22rem,calc\(100%-4\.5rem\)\)\]/);
  });

  it("Routes: the Layers button at the top left, clear of the map's buttons; the map key at the bottom left, as in Closures", () => {
    // Layers at the top left; its bottom edge follows the map key's measured height, so the open panel always ends above the key
    // (folded or open, at every size) and the two never overlap.
    expect(app).toMatch(
      /<div\s+className="pointer-events-none absolute left-\[max\(0\.75rem,env\(safe-area-inset-left\)\)\] right-14 top-3 z-10 flex items-start \[container-type:size\]"\s+style=\{\{ bottom: `calc\(\$\{routesKeyHeight\}px \+ 2\.5rem \+ env\(safe-area-inset-bottom\)\)` \}\}\s*>\s*<RoutesMapControls\s/,
    );
    expect(app).toMatch(/new ResizeObserver\(\(\) => setRoutesKeyHeight\(key\.offsetHeight\)\)/);
    // The key stays bottom left, as in Closures; opened in Routes it takes at most 45% of the map, so the panel keeps the rest.
    expect(app).toMatch(
      /<MapKey\s+view=\{appView\}\s+open=\{routesKeyOpen\}\s+onOpenChange=\{openRoutesKey\}\s+rootRef=\{setRoutesKeyElement\}\s+routes=\{[^\n]*\}\s+className="absolute bottom-\[calc\(2rem\+env\(safe-area-inset-bottom\)\)\] left-\[max\(0\.75rem,env\(safe-area-inset-left\)\)\] z-\[1\] max-h-\[max\(6rem,calc\(45%-2rem\)\)\] w-max max-w-\[min\(22rem,calc\(100%-7\.5rem\)\)\]/,
    );
    // Each has its own open state: one never opens or closes the other.
    expect(app).toMatch(/<RoutesMapControls\s[^>]*open=\{routesPanelOpen\}\s+onOpenChange=\{openRoutesPanel\}/);
    // The map's own notices start below the Layers button in Routes, at every width.
    expect(app).toMatch(/\$\{closuresView \? "\[--ta-map-top-inset:3\.75rem\] lg:\[--ta-map-top-inset:0px\]" : "\[--ta-map-top-inset:4\.5rem\]"\}/);
  });

  it("Layers: folded, a square 56 px map button named 'Layers' with a layers icon; open, its panel keeps the switch and both notes", () => {
    const panel = (open: boolean, junctions: JunctionLoad = { state: "ready", count: 596, leftOut: 0 }) =>
      renderToStaticMarkup(h(RoutesMapControls, { layers: { junctions: true }, onToggle: () => undefined, junctions, onRetry: () => undefined, open, onOpenChange: () => undefined }));
    const summary = /<summary class="([^"]*)"><svg[^>]*aria-hidden="true"[\s\S]*?<\/svg>Layers<\/summary>/.exec(panel(false));
    expect(summary).not.toBeNull();
    expect(summary![1]).toMatch(/\bsize-14\b/);
    expect(summary![1]).toMatch(/\bfocus-visible:-outline-offset-3!/);
    expect(panel(false)).not.toContain("Route map layers");
    // Folded: no fixed width. Open: the panel widens, with the switch, the scope note and the not-connected note.
    expect(panel(false)).toMatch(/^<div class="pointer-events-auto flex max-h-full min-h-0 flex-col items-start gap-1\.5 p-px ">/);
    // The button is a fixed control: the column around it never scrolls, and the button never shrinks. Only the panel's own box
    // scrolls, inside its border, capped as a flex item and by the container's height less the button.
    expect(panel(false)).not.toMatch(/^<div class="[^"]*overflow-y-auto/);
    expect(summary![1]).toMatch(/\bshrink-0\b/);
    expect(panel(true)).toMatch(/<\/summary><div class="mt-1\.5 max-h-\[calc\(100cqh-4\.25rem\)\] min-h-0 space-y-2 overflow-y-auto overscroll-contain rounded-\[4px\] border border-line bg-surface/);
    expect(panel(true)).toMatch(/^<div class="[^"]*\bw-\[min\(20rem,calc\(100vw-5\.5rem\)\)\]">/);
    expect(panel(true)).toMatch(/role="switch" aria-checked="true"[^>]*>[\s\S]*Junction numbers/);
    expect(panel(true)).toContain(ROUTES_SCOPE_TEXT.replaceAll("'", "&#x27;"));
    expect(panel(true)).toContain(NO_TRAFFIC_TEXT.replaceAll("'", "&#x27;"));
    // Junction loading and errors stay outside the fold, under the button; with nothing to say, the box isn't drawn.
    const fold = (html: string) => /<details[\s\S]*<\/details>/.exec(html)?.[0] ?? "";
    const failed = panel(false, { state: "error" });
    expect(failed.replace(fold(failed), "")).toMatch(/Junction numbers couldn&#x27;t be loaded\.[\s\S]*Try again/);
    expect(panel(false)).toMatch(/<div role="status" class="[^"]*\bempty:hidden"><\/div>/);
  });
});

describe("Routes junction numbers", () => {
  it("draws every real NH junction label, unchanged: 596, none left out", () => {
    const { labels, leftOut } = junctionLabels(realJunctions);
    expect(realJunctions).toHaveLength(596);
    expect(leftOut).toEqual([]);
    expect(labels).toEqual(realJunctions);
    // Motorways and NH-run A roads only (named as NH names them).
    expect(labels.every((j) => /^(M\d+|M6 TOLL|A\d+(\(M\))?)$/.test(j.road))).toBe(true);
    expect(labels.find((j) => j.name === "M56 J10")?.position).toBeDefined();
  });

  it("leaves out, and names, records that are ambiguous or don't agree with themselves (synthetic records: real data has none)", () => {
    const j = (name: string, road: string, number: string, position: [number, number]): Junction => ({ name, road, number, position });
    const { labels, leftOut } = junctionLabels([
      j("M1 J1", "M1", "1", [-0.25, 51.58]),
      j("M1 J2", "M1", "2", [-0.24, 51.6]),
      j("M1 J2", "M1", "2", [-1.2, 52.9]),
      j("M1 J3", "M1", "4", [-0.3, 51.7]),
      j("Almondsbury Interchange", "M5", "15", [-2.55, 51.55]),
    ]);
    expect(labels.map((x) => x.name)).toEqual(["M1 J1"]);
    expect(leftOut).toEqual([
      { name: "M1 J2", reason: "recorded 2 times at different places" },
      { name: "M1 J3", reason: "name doesn't match its road and junction number" },
      { name: "Almondsbury Interchange", reason: "name doesn't match its road and junction number" },
    ]);
  });

  it("loading, error, empty, ready and off states; data already shown is kept if a later fetch fails", () => {
    const real = junctionLabels(realJunctions);
    const none = junctionLabels([]);
    expect(junctionLoad(false, { isPending: true, isError: false, hasData: false }, none)).toEqual({ state: "off" });
    expect(junctionLoad(true, { isPending: true, isError: false, hasData: false }, none)).toEqual({ state: "loading" });
    expect(junctionLoad(true, { isPending: false, isError: true, hasData: false }, none)).toEqual({ state: "error" });
    expect(junctionLoad(true, { isPending: false, isError: false, hasData: true }, none)).toEqual({ state: "empty" });
    expect(junctionLoad(true, { isPending: false, isError: true, hasData: true }, real)).toEqual({ state: "ready", count: 596, leftOut: 0 });
  });
});

describe("the Closures / Routes switch", () => {
  const render = (view: AppView) => renderToStaticMarkup(h(ViewSwitch, { view, onChange: () => undefined }));

  it("is a named group of two 48 px buttons with icons and text, the chosen one pressed and filled", () => {
    const out = render("closures");
    expect(out).toMatch(/^<div role="group" aria-label="Map view" class="[^"]*\bh-12\b/);
    expect(out).toMatch(/<button type="button" aria-pressed="true" class="[^"]*\bbg-ink\b[^"]*\bfont-bold\b[^"]*"><svg[^>]*aria-hidden="true"[\s\S]*?Closures<\/span><\/button>/);
    expect(out).toMatch(/<button type="button" aria-pressed="false" class="[^"]*\btext-muted\b[^"]*"><svg[^>]*aria-hidden="true"[\s\S]*?Routes<\/span><\/button>/);
    expect(render("routes")).toMatch(/aria-pressed="true"[^>]*>[\s\S]*?Routes</);
    // Compact at phone width: the labels truncate rather than push the page sideways.
    expect(out).toMatch(/\bmin-w-0\b[^"]*\bflex-1\b/);
  });

  it("each button chooses its view", () => {
    const onChange = vi.fn();
    const buttons = findAll(ViewSwitch({ view: "closures", onChange }), "button");
    for (const b of buttons) (b.props as { onClick: () => void }).onClick();
    expect(onChange.mock.calls).toEqual([["closures"], ["routes"]]);
  });

  it("sits in the header beside Settings; the closures road search is shown in the Closures view only", () => {
    const header = (view: AppView) =>
      renderToStaticMarkup(
        h(AppHeader, {
          data: { snapshot: undefined, via: undefined, isLoading: true, isRefreshing: false, lastSuccessAt: null, refreshError: null, loadError: null, version: null, publishedAt: null, refresh: () => undefined },
          now: new Date(),
          query: "",
          onQueryChange: () => undefined,
          settingsOpen: false,
          onOpenSettings: () => undefined,
          settingsButtonRef: null,
          view,
          onViewChange: () => undefined,
        }),
      );
    expect(header("closures")).toMatch(/aria-label="Map view" class="[^"]*\bmax-sm:basis-full\b/);
    expect(header("closures")).toMatch(/<label class="[^"]*\blg:flex\b[^"]*"><span class="sr-only">Find a road/);
    expect(header("routes")).not.toMatch(/<label class="[^"]*\blg:flex\b[^"]*"><span class="sr-only">Find a road/);
    expect(header("routes")).toMatch(/Settings/);
  });
});

describe("the Routes layer panel", () => {
  const render = (junctions: JunctionLoad, open = true, on = true) =>
    renderToStaticMarkup(
      h(RoutesMapControls, { layers: { junctions: on }, onToggle: () => undefined, junctions, onRetry: () => undefined, open, onOpenChange: () => undefined }),
    );
  const fold = (html: string) => /<details[\s\S]*<\/details>/.exec(html)?.[0] ?? "";

  it("has its own switch and says what the junction layer covers and where it comes from", () => {
    const out = render({ state: "ready", count: 596, leftOut: 0 });
    expect(out).toMatch(/role="switch" aria-checked="true"[^>]*>[\s\S]*Junction numbers/);
    expect(out).toContain("596 junctions labelled.");
    expect(out).toContain("Other roads&#x27; junctions aren&#x27;t numbered here.");
    expect(out).toContain("Source: National Highways Network Model, Open Government Licence v3.0.");
    const asHtml = (t: string) => t.replaceAll("'", "&#x27;");
    expect(out).toContain(asHtml(ROUTES_SCOPE_TEXT));
    // First release: the approved note that live traffic isn't connected (docs/ROUTES-MAP.md).
    expect(out).toContain(asHtml(NO_TRAFFIC_TEXT));
  });

  it("carries no closure-filter or restriction controls", () => {
    const out = render({ state: "ready", count: 596, leftOut: 0 });
    expect(out).not.toContain(RESTRICTIONS_DISCLAIMER);
    expect(out).not.toMatch(/Restrictions|Height|Weight|LEZ|Find a road|Diversion/);
  });

  it("first release: no live traffic. No traffic switch, key, maintenance message or TomTom name; only the approved not-connected note", () => {
    expect(NO_TRAFFIC_TEXT).toBe("Live traffic isn't connected yet. Road closures are in the Closures view.");
    for (const out of [render({ state: "ready", count: 596, leftOut: 0 }), render({ state: "error" }, false), render({ state: "loading" }, true)]) {
      expect(out).not.toMatch(/tomtom|congestion|maintenance|live traffic is (shown|on|available)|traffic key/i);
      // The only switch is the junction numbers'; the only mention of traffic is the approved note.
      expect(out.match(/role="switch"/g)).toHaveLength(1);
      expect(out.replace(NO_TRAFFIC_TEXT.replaceAll("'", "&#x27;"), "")).not.toMatch(/traffic/i);
    }
  });

  it("loading and errors stay outside the fold, with Try again; an empty data set says so", () => {
    const loading = render({ state: "loading" }, false);
    expect(loading.replace(fold(loading), "")).toContain("Loading junction numbers…");
    const failed = render({ state: "error" }, false);
    expect(failed.replace(fold(failed), "")).toMatch(/Junction numbers couldn&#x27;t be loaded\.[\s\S]*Try again/);
    expect(render({ state: "empty" })).toContain("No junction numbers are in the current data.");
    expect(render({ state: "off" }, true, false)).toMatch(/role="switch" aria-checked="false"/);
  });

  it("folds like the map key, and its toggle and switch report to App", () => {
    expect(render({ state: "off" }, false)).not.toMatch(/<details[^>]*\sopen=""/);
    expect(render({ state: "off" }, true)).toMatch(/<details[^>]*\sopen=""/);
    const onOpenChange = vi.fn();
    const onToggle = vi.fn();
    const tree = RoutesMapControls({ layers: { junctions: true }, onToggle, junctions: { state: "off" }, onRetry: () => undefined, open: true, onOpenChange });
    (findAll(tree, "details")[0]!.props as { onToggle: (e: { currentTarget: { open: boolean } }) => void }).onToggle({ currentTarget: { open: false } });
    // The switch is the shared JunctionNumbersSwitch (also in Settings while Routes is shown).
    const shared = findAll(tree, JunctionNumbersSwitch)[0]!;
    (shared.props as { onToggle: (on: boolean) => void }).onToggle(false);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onToggle).toHaveBeenCalledWith("junctions", false);
  });
});

describe("Settings are the shown view's own", () => {
  const off = (layer: "height" | "weight" | "lez" | "ulez") => ({ layer, state: "off" as const, data: null, error: null, retry: () => undefined });
  const settings = (view: AppView, junctions: JunctionLoad = { state: "ready", count: 596, leftOut: 0 }) =>
    renderToStaticMarkup(
      h(SettingsDialog, {
        open: true,
        onClose: () => undefined,
        returnFocus: () => null,
        view,
        appearance: { theme: "system", onTheme: () => undefined },
        restrictions: { entries: availableLayers(), enabled: { height: true, weight: false, lez: false, ulez: false }, statuses: { height: off("height"), weight: off("weight"), lez: off("lez"), ulez: off("ulez") }, onToggle: () => undefined },
        routes: { layers: { junctions: true }, onToggle: () => undefined, junctions, onRetry: () => undefined },
        appStatus: { version: APP_VERSION, update: { kind: "current", checking: false, checkedAt: null, checkFailed: false }, onCheck: () => undefined, onReload: () => undefined, warnings: [] },
        dataHelp: { data: { snapshot: undefined, via: undefined, isLoading: true, isRefreshing: false, lastSuccessAt: null, refreshError: null, loadError: null, version: null, publishedAt: null, refresh: () => undefined }, now: new Date(), restrictionSources: [] },
      }),
    );

  it("Closures: the road restriction switches and the restrictions disclaimer; no Routes settings", () => {
    const out = settings("closures");
    expect(out).toContain("Showing settings for Closures. Routes has its own settings.");
    expect(out).toMatch(/>Road restrictions</);
    expect(out).toContain(RESTRICTIONS_DISCLAIMER);
    expect(out).not.toMatch(/>Route map</);
    expect(out).not.toMatch(/Junction numbers/);
  });

  it("Routes: only the route map's settings (junction numbers) and its scope note; no closure, restriction or traffic controls", () => {
    const out = settings("routes");
    expect(out).toContain("Showing settings for Routes. Closure and restriction settings are in the Closures view.");
    expect(out).toMatch(/>Route map</);
    expect(out).toMatch(/role="switch" aria-checked="true" aria-describedby="routes-settings-junctions-description"/);
    expect(out).toContain(ROUTES_SCOPE_TEXT.replaceAll("'", "&#x27;"));
    expect(out).not.toMatch(/>Road restrictions</);
    expect(out).not.toContain(RESTRICTIONS_DISCLAIMER);
    // The only switch in Routes' settings is its own; nothing in Settings mentions TomTom or live traffic (first release).
    expect(out.match(/role="switch"/g)).toHaveLength(1);
    for (const view of ["routes", "closures"] as const) expect(settings(view), view).not.toMatch(/tomtom|live traffic|congestion/i);
  });

  it("Routes: the junction data's loading and failure states, with Try again", () => {
    expect(settings("routes", { state: "loading" })).toContain("Loading junction numbers…");
    expect(settings("routes", { state: "error" })).toMatch(/Junction numbers couldn&#x27;t be loaded\.[\s\S]*Try again/);
  });

  it("App gives Settings the shown view, the Routes switches' one state, and each view's own warnings and credits", () => {
    expect(app).toMatch(/view=\{appView\}\s+appearance=/);
    expect(app).toMatch(/routes=\{\{ layers: routeLayers, onToggle: toggleRouteLayer, junctions: routeJunctionLoad, onRetry: retryJunctions \}\}/);
    // Junction numbers on and every OpenStreetMap layer off for a new visitor; after that, restored from this device only.
    expect(app).toMatch(/useState<RoutesLayerSwitches>\(\(\) => readRoutesLayers\(browserStore\(\)\)\)/);
    expect(app).toMatch(/writeRoutesLayers\(browserStore\(\), routeLayers\)/);
    expect(DEFAULT_ROUTES_LAYERS).toEqual({ junctions: true });
    expect(app).not.toMatch(/tomtom|useTraffic|TrafficAttribution|trafficCredit/i);
    // The map panel and Settings change the same Routes state; neither touches the restriction switches.
    expect(app).toMatch(/onToggle=\{toggleRouteLayer\}/);
    expect(app).toMatch(/const toggleRouteLayer = \(layer: keyof RoutesLayerSwitches, on: boolean\) => \{\s*setRouteLayers\(\(l\) => \(\{ \.\.\.l, \[layer\]: on \}\)\);/);
    expect(app).toMatch(/\.\.\.\(closuresView \? RESTRICTION_LAYERS\.filter/);
    expect(app).toMatch(/restrictionSources: closuresView \? allSources\(entries\) : \[\]/);
  });
});

function findAll(node: ReactNode, type: unknown): ReactElement[] {
  const found: ReactElement[] = [];
  const walk = (n: ReactNode) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isValidElement(n)) return;
    if (n.type === type) found.push(n);
    walk((n.props as { children?: ReactNode }).children);
  };
  walk(node);
  return found;
}
