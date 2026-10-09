import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync("web/src/map/MapView.tsx", "utf8");

describe("map attribution notice", () => {
  it("uses MapLibre's (i) toggle at every screen size, desktop as well as phones, with the same credits", () => {
    expect(view).toMatch(/attributionControl: \{ compact: true, customAttribution: "Closures, diversions and junctions: National Highways, Open Government Licence v3\.0" \}/);
    // The base map's own credits (OpenFreeMap, OpenMapTiles, OpenStreetMap) come from the style and are never removed or replaced.
    expect(view).not.toMatch(/attributionControl: false|customAttribution: \[|maplibregl-ctrl-attrib-inner/);
  });

  it("shows the credits first and folds them after five seconds in view (an OSMF-allowed trigger), never at once", () => {
    expect(view).toMatch(/const ATTRIBUTION_SHOWN_MS = 5000;/);
    expect(view).toMatch(/const stopFolding = foldAttributionLater\(map, container\.current\);/);
    // The countdown starts only once the map has rendered and the splash has gone (#root no longer inert).
    expect(view).toMatch(/map\.once\("idle", \(\) => \{[\s\S]{0,200}hasAttribute\("inert"\)/);
    expect(view).toMatch(/setTimeout\(fold, ATTRIBUTION_SHOWN_MS\)/);
    // Folding removes only the class MapLibre's own drag handler removes, so the (i) button still opens and closes the credits.
    expect(view).toMatch(/const fold = \(\) => container\.querySelector\("\.maplibregl-compact-show"\)\?\.classList\.remove\("maplibregl-compact-show"\);/);
    expect(view).not.toMatch(/map\.once\("load", \(\) => container\.current\?\.querySelector\("\.maplibregl-compact-show"\)/);
    expect(view).toMatch(/stopFolding\(\);/); // no timer outlives the map
  });
});
