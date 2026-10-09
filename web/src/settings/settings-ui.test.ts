import { readFileSync } from "node:fs";
import { createElement as h, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RESTRICTIONS_DISCLAIMER, restrictionPointsFileSchema, type RestrictionSource } from "../../../shared/api/restrictions.ts";
import { APP_VERSION } from "../app/version.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { ModalDialog } from "../components/ModalDialog.tsx";
import { RestrictionMapControls } from "../components/RestrictionMapControls.tsx";
import { AppearanceSection } from "../components/settings/AppearanceSection.tsx";
import { AppStatusSection } from "../components/settings/AppStatusSection.tsx";
import { DataHelpSection } from "../components/settings/DataHelpSection.tsx";
import { RestrictionsSection } from "../components/settings/RestrictionsSection.tsx";
import { UpdateNotice } from "../components/UpdateNotice.tsx";
import type { ClosuresState } from "../hooks/useClosures.ts";
import type { LayerEntry } from "../restrictions/catalog.ts";
import type { LayerStatus } from "../restrictions/useRestrictionData.ts";
import type { RestrictionLayer } from "./preferences.ts";

/**
 * Settings UI rendered to HTML in Node (react-dom/server), so roles, names, states and wording are checked without a browser.
 * Opening, closing, Escape and focus return run in a real browser (docs/RESTRICTIONS.md, browser checks); here the dialog's
 * wiring for them is checked in its source.
 */
const html = (el: ReturnType<typeof h>) => renderToStaticMarkup(el);

const source = (over: Partial<RestrictionSource> = {}): RestrictionSource => ({
  id: "tfl-height-restrictions",
  name: "Bridges, tunnels, road barriers: height restrictions",
  authority: "Transport for London",
  kind: "official",
  licence: { name: "TfL Transport Data Service licence (based on OGL v2.0)", url: "https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service" },
  attribution: "Powered by TfL Open Data.",
  url: "https://data.london.gov.uk/dataset/bridges-tunnels-road-barriers-height-restrictions-epowr/",
  datasetDate: "2019-10-09T10:46:14.000Z",
  fetchedAt: "2026-10-09T08:13:33.000Z",
  records: 877,
  notes: ["TfL records heights in bands."],
  ...over,
});
const osm = source({ id: "osm", authority: "OpenStreetMap contributors", kind: "community", name: "OpenStreetMap", licence: { name: "Open Database License (ODbL) 1.0", url: "https://opendatacommons.org/licenses/odbl/1-0/" } });
const off = (layer: RestrictionLayer): LayerStatus => ({ layer, state: "off", data: null, error: null, retry: () => undefined });
const statuses = { height: off("height"), weight: off("weight"), lez: off("lez"), ulez: off("ulez") };
const allOff = { height: false, weight: false, lez: false, ulez: false };

describe("Settings button (replaces the theme button)", () => {
  const props: ComponentProps<typeof AppHeader> = {
    data: { snapshot: undefined, via: undefined, isLoading: true, isRefreshing: false, lastSuccessAt: null, refreshError: null, loadError: null, version: null, publishedAt: null, refresh: () => undefined },
    now: new Date(),
    query: "",
    onQueryChange: () => undefined,
    settingsOpen: false,
    onOpenSettings: () => undefined,
    settingsButtonRef: null,
  };
  const out = html(h(AppHeader, props));

  it("is at least 48 × 48 px, named Settings for screen readers, and says it opens a dialog", () => {
    expect(out).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"[^>]*aria-controls="settings-dialog"[^>]*class="[^"]*\bh-12\b[^"]*\bmin-w-12\b/);
    expect(out).toMatch(/<span class="max-lg:sr-only">Settings<\/span>/);
  });

  it("the standalone theme toggle is gone", () => {
    expect(out).not.toMatch(/Light map|Dark map|Switch to (light|dark) theme/);
    expect(readFileSync("web/src/App.tsx", "utf8")).not.toMatch(/toggleTheme/);
  });
});

describe("Appearance", () => {
  it("offers System, Light and Dark as a labelled radio group with the current choice checked", () => {
    const out = html(h(AppearanceSection, { theme: "system", onTheme: () => undefined }));
    expect(out).toMatch(/<fieldset><legend[^>]*>Theme<\/legend>/);
    expect(out.match(/type="radio"/g)).toHaveLength(3);
    expect(out).toMatch(/checked="" value="system"/);
    expect(out.match(/checked=""/g)).toHaveLength(1);
    for (const label of ["System", "Light", "Dark"]) expect(out).toContain(`>${label}<`);
  });

  it("shows the standard map only: no satellite control until a free, licensed provider is approved", () => {
    expect(html(h(AppearanceSection, { theme: "dark", onTheme: () => undefined }))).not.toMatch(/satellite/i);
  });
});

describe("Road restrictions", () => {
  const entries: LayerEntry[] = [
    { layer: "height", url: "/assets/height.json", records: 900, sources: [source(), osm] },
    { layer: "lez", url: "/assets/lez.json", records: 1, sources: [source({ id: "tfl-lez", name: "LEZ boundary" })] },
  ];
  const out = html(h(RestrictionsSection, { entries, enabled: allOff, statuses, onToggle: () => undefined }));

  it("has a switch only for layers with data, all off by default, each described", () => {
    expect(out.match(/role="switch"/g)).toHaveLength(2);
    expect(out.match(/aria-checked="false"/g)).toHaveLength(2);
    expect(out).toContain("Height restrictions");
    expect(out).toContain("London Low Emission Zone (LEZ)");
    expect(out).not.toContain("Weight restrictions");
    expect(out).not.toContain("ULEZ");
    expect(out).toMatch(/aria-describedby="restriction-height-description"[\s\S]*id="restriction-height-description"/);
  });

  it("describes weight values as NH diversion-route records of unrecorded type, and the ULEZ with TfL's vehicle categories", () => {
    const all = html(
      h(RestrictionsSection, {
        entries: [
          { layer: "weight", url: "/assets/weight.json", records: 84, sources: [source({ id: "nh-s4-diversion-points", authority: "National Highways" })] },
          { layer: "ulez", url: "/assets/ulez.json", records: 1, sources: [source({ id: "tfl-ulez" })] },
        ],
        enabled: allOff,
        statuses,
        onToggle: () => undefined,
      }),
    );
    expect(all).toContain("Weight values National Highways records on its emergency diversion routes.");
    expect(all).toContain("so none is a confirmed lorry limit or limit for all vehicles");
    expect(all).not.toMatch(/including 7\.5 tonne limits/);
    expect(all).toContain("cars, motorcycles, vans and specialist vehicles up to and including 3.5 tonnes, and minibuses up to and including 5 tonnes");
    expect(all).not.toContain("For vehicles up to 3.5 tonnes");
  });

  it("shows the mandatory disclaimer verbatim, and labels community sources unverified", () => {
    expect(out).toContain(RESTRICTIONS_DISCLAIMER.replace(/'/g, "&#x27;"));
    expect(out).toContain("OpenStreetMap contributors (community, unverified)");
  });

  it("is omitted entirely when no restriction data is available", () => {
    expect(html(h(RestrictionsSection, { entries: [], enabled: allOff, statuses, onToggle: () => undefined }))).toBe("");
  });

  it("shows loading and failure for a layer that is on, with a retry", () => {
    const loading = html(h(RestrictionsSection, { entries, enabled: { ...allOff, height: true }, statuses: { ...statuses, height: { ...off("height"), state: "loading" } }, onToggle: () => undefined }));
    expect(loading).toMatch(/aria-checked="true"/);
    expect(loading).toContain("Loading…");
    const failed = html(
      h(RestrictionsSection, { entries, enabled: { ...allOff, height: true }, statuses: { ...statuses, height: { ...off("height"), state: "error", error: "Restriction data can't be loaded." } }, onToggle: () => undefined }),
    );
    expect(failed).toContain("Restriction data can&#x27;t be loaded.");
    expect(failed).toContain("Try again");
  });
});

describe("App status and updates", () => {
  const base = { version: APP_VERSION, onCheck: () => undefined, onReload: () => undefined, warnings: [] };

  it("shows the app build's commit and build time, separate from the data version", () => {
    const out = html(h(AppStatusSection, { ...base, update: { kind: "current", checking: false, checkedAt: null, checkFailed: false } }));
    expect(out).toContain("0123456789ab");
    expect(out).toContain("The traffic data has its own version");
    expect(out).toContain("No problems right now.");
  });

  it("never claims the app is up to date without a finished check, and says when a check failed", () => {
    const never = html(h(AppStatusSection, { ...base, update: { kind: "current", checking: false, checkedAt: null, checkFailed: false } }));
    expect(never).not.toMatch(/latest|up to date/i);
    const failed = html(h(AppStatusSection, { ...base, update: { kind: "current", checking: false, checkedAt: null, checkFailed: true } }));
    expect(failed).toContain("Couldn&#x27;t check for a new version");
  });

  it("offers an explicit Reload when an update is ready, and explains an update applied in another tab", () => {
    expect(html(h(AppStatusSection, { ...base, update: { kind: "ready", reloading: false } }))).toMatch(/A new version of Traffic Advanced is ready[\s\S]*Reload to update/);
    expect(html(h(AppStatusSection, { ...base, update: { kind: "applied-elsewhere" } }))).toContain("updated in another tab");
    expect(html(h(AppStatusSection, { ...base, update: { kind: "unsupported", reason: "Update checks run in production builds only." } }))).not.toMatch(/<button/);
  });

  it("lists current problems", () => {
    expect(html(h(AppStatusSection, { ...base, update: { kind: "unsupported", reason: "x" }, warnings: ["The base map couldn't load."] }))).toContain("<li>The base map couldn&#x27;t load.</li>");
  });

  it("the update notice appears only for a ready update, politely, with Reload and Later", () => {
    const props = { dismissed: false, onReload: () => undefined, onDismiss: () => undefined };
    expect(html(h(UpdateNotice, { ...props, update: { kind: "current", checking: false, checkedAt: null, checkFailed: false } }))).toBe("");
    expect(html(h(UpdateNotice, { ...props, update: { kind: "downloading" } }))).toBe("");
    const ready = html(h(UpdateNotice, { ...props, update: { kind: "ready", reloading: false } }));
    expect(ready).toMatch(/^<div role="status"/);
    expect(ready).toMatch(/Reload to update[\s\S]*Later/);
    expect(html(h(UpdateNotice, { ...props, dismissed: true, update: { kind: "ready", reloading: false } }))).toBe("");
  });
});

describe("Data status and help", () => {
  const snapshot = JSON.parse(readFileSync("web/src/data/dev-snapshot.json", "utf8")) as ClosuresState["snapshot"];
  const state: ClosuresState = {
    snapshot,
    via: "device-cache",
    isLoading: false,
    isRefreshing: false,
    lastSuccessAt: null,
    refreshError: null,
    loadError: null,
    version: "20261008T232216Z-ccbf18f3fc40",
    publishedAt: null,
    refresh: () => undefined,
  };
  const out = html(h(DataHelpSection, { data: state, now: new Date(), restrictionSources: [source(), osm] }));

  it("shows the traffic data version, capture time, origin and that publication isn't confirmed (never invented)", () => {
    expect(out).toContain("20261008T232216Z-ccbf18f3fc40");
    expect(out).toContain("Not confirmed this visit");
    expect(out).toContain("The copy saved on this device (not confirmed with the server this visit)");
    expect(out).toContain("Not this visit");
  });

  it("lists every source with its attribution and licence link, and community data as unverified", () => {
    expect(out).toContain("Closures, diversions and junctions: National Highways, Open Government Licence v3.0");
    expect(out).toContain("OpenFreeMap © OpenMapTiles Data from OpenStreetMap.");
    expect(out).toContain("Powered by TfL Open Data.");
    expect(out).toContain("Community record: OpenStreetMap contributors. Unverified.");
    expect(out).toContain('href="https://opendatacommons.org/licenses/odbl/1-0/"');
    expect(out).toMatch(/rel="noopener noreferrer"/);
  });

  it("includes the safety notice and privacy information, and a reserved Contact section with no form or address", () => {
    expect(out).toContain("For planning only. Do not use while driving.");
    expect(out).toContain("Your settings are saved on this device only");
    const contact = out.slice(out.indexOf(">Contact<"));
    expect(contact).toContain("A way to contact us will be added here.");
    expect(contact).not.toMatch(/<form|<input|mailto:|@[a-z0-9-]+\./i);
  });
});

describe("Restrictions on the map", () => {
  it("show nothing while every layer is off", () => {
    expect(html(h(RestrictionMapControls, { statuses: Object.values(statuses), zoom: 14, onOpenList: () => undefined, buttonRef: null }))).toBe("");
  });

  it("offer the Restrictions list button (48px), loading and failure states, and a zoom hint", () => {
    const out = html(
      h(RestrictionMapControls, {
        statuses: [
          { ...off("height"), state: "ready", data: null },
          { ...off("weight"), state: "loading" },
          { ...off("lez"), state: "error", error: "Restriction data can't be loaded." },
        ],
        zoom: 9,
        onOpenList: () => undefined,
        buttonRef: null,
      }),
    );
    expect(out).toMatch(/<button[^>]*class="[^"]*\bh-12\b[^"]*"[^>]*>[\s\S]*Restrictions<\/button>/);
    expect(out).toContain("Loading weight restrictions…");
    expect(out).toContain("Try again");
    expect(out).toContain("Zoom in to see height and weight restrictions.");
    // Only community data gets the dashed-border explanation (none of these layers has loaded community data).
    expect(out).not.toContain("Dashed: community record");
  });

  it("key the shipped weight data as NH diversion-route values of unrecorded type, never as lorry or all-vehicle limits", () => {
    const points = restrictionPointsFileSchema.parse(JSON.parse(readFileSync("web/src/restrictions/data/weight.json", "utf8")));
    const key = (file: typeof points) => html(h(RestrictionMapControls, { statuses: [{ ...off("weight"), state: "ready", data: { layer: "weight", points: file } }], zoom: 14, onOpenList: () => undefined, buttonRef: null }));
    const out = key(points);
    expect(out).toContain("Weight value on a National Highways diversion route. Type, scope and");
    expect(out).toContain("exemptions not recorded.");
    expect(out).not.toContain("Lorry weight limit");
    expect(out).not.toContain("Weight limit, all vehicles");
    // A lorry-limit row appears only once lorry-limit records are actually loaded (synthetic record).
    const goods = { ...points, features: [{ ...points.features[0]!, kind: "weight-goods" as const }] };
    expect(key(goods)).toContain("Lorry weight limit");
    expect(key(goods)).not.toContain("Weight value on a National Highways diversion route");
  });
});

describe("Settings dialog wiring", () => {
  it("is a labelled native modal dialog with a 48px close button", () => {
    const out = html(h(ModalDialog, { id: "settings-dialog", open: false, onClose: () => undefined, titleId: "t", title: "Settings", returnFocus: () => null, children: "x" }));
    expect(out).toMatch(/^<dialog id="settings-dialog" aria-labelledby="t"/);
    expect(out).toMatch(/<h2 id="t"[^>]*>Settings<\/h2>/);
    expect(out).toMatch(/<button[^>]*class="[^"]*\bsize-12\b[^"]*"[^>]*aria-label="Close"/);
  });

  it("opens with showModal (inert background, Escape closes), closes on the backdrop, and returns focus to its opener", () => {
    const src = readFileSync("web/src/components/ModalDialog.tsx", "utf8");
    expect(src).toMatch(/dialog\.showModal\(\);\s*closeButton\.current\?\.focus\(\);/);
    expect(src).toMatch(/onClose=\{onClose\}/);
    expect(src).toMatch(/e\.target === e\.currentTarget && onClose\(\)/);
    expect(src).toMatch(/if \(!open && wasOpen\.current\) returnTo\.current\(\)\?\.focus\(\);/);
    const app = readFileSync("web/src/App.tsx", "utf8");
    expect(app).toMatch(/returnFocus=\{\(\) => settingsButton\.current\}/);
    expect(app).toMatch(/returnFocus=\{\(\) => restrictionsButton\.current\}/);
  });

  it("keeps the map mounted: Settings renders beside the map and never moves it", () => {
    const app = readFileSync("web/src/App.tsx", "utf8");
    expect(app).toMatch(/<MapView[\s\S]*<SettingsDialog/);
    const settingsFiles = ["AppearanceSection", "AppStatusSection", "DataHelpSection", "RestrictionsSection", "SettingsDialog"].map((n) => readFileSync(`web/src/components/settings/${n}.tsx`, "utf8"));
    for (const src of settingsFiles) expect(src).not.toMatch(/fitBounds|flyTo|setCenter|setZoom|jumpTo/);
  });
});
