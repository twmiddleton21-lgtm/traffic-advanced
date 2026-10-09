import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RESTRICTIONS_DISCLAIMER, type RestrictionPoint, type RestrictionPointsFile, type RestrictionSource } from "../../../shared/api/restrictions.ts";
import { PointDetails, RestrictionsDialog } from "../components/RestrictionsDialog.tsx";
import { getRestrictionFile, TrafficApiError } from "../data/trafficService.ts";
import { availableLayers } from "./catalog.ts";
import { allowedLink, heightWordingNote, isStale, kindLabel, limitText, locationText, markerText, osmElementUrl, sourceLabel, wordingImperialHeight } from "./describe.ts";
import { formatHeight } from "../domain/units.ts";
import { groupPoints } from "./group.ts";
import { findPoint, LIST_LIMIT, pointsInView } from "./inView.ts";
import { restrictionPointsFileSchema } from "../../../shared/api/restrictions.ts";

const src = (over: Partial<RestrictionSource>): RestrictionSource => ({
  id: "osm",
  name: "OpenStreetMap",
  authority: "OpenStreetMap contributors",
  kind: "community",
  licence: { name: "Open Database License (ODbL) 1.0", url: "https://opendatacommons.org/licenses/odbl/1-0/" },
  attribution: "© OpenStreetMap contributors",
  url: "https://www.openstreetmap.org/copyright",
  datasetDate: "2026-10-09T08:12:19.000Z",
  fetchedAt: "2026-10-09T09:00:00.000Z",
  records: 1,
  notes: ["Community-sourced and unverified."],
  ...over,
});
const point = (over: Partial<RestrictionPoint>): RestrictionPoint => ({
  id: "osm/way/1/weight-goods",
  source: "osm",
  kind: "weight-goods",
  limit: { min: 7.5, max: 7.5 },
  recorded: "7.5",
  physical: false,
  conditions: [],
  position: [-0.1, 51.5],
  approximate: false,
  extentMetres: 120,
  road: { name: "High Street", ref: "B123", area: null },
  sourceText: null,
  context: null,
  lastEdited: "2024-05-03T10:00:00.000Z",
  osm: { type: "way", id: 1, version: 3, tags: { highway: "residential", "maxweightrating:hgv": "7.5" } },
  ...over,
});
const file = (features: RestrictionPoint[], sources = [src({ records: features.length })]): RestrictionPointsFile => ({
  schemaVersion: 1,
  layer: features[0]?.kind === "height" ? "height" : "weight",
  generatedAt: "2026-10-09T09:00:00.000Z",
  sources,
  features,
});

describe("restriction wording", () => {
  it("names each kind distinctly: structural and lorry weight limits are never confused", () => {
    expect(kindLabel(point({ kind: "weight-goods" }))).toBe("Lorry weight limit (goods vehicles, environmental)");
    expect(kindLabel(point({ kind: "weight-structural" }))).toBe("Weight limit, all vehicles (structural)");
    expect(kindLabel(point({ kind: "weight-unrecorded-type" }))).toBe("Weight value on a National Highways diversion route: type, scope and exemptions not recorded");
    expect(kindLabel(point({ kind: "height" }))).toBe("Height restriction");
    expect(kindLabel(point({ kind: "height", physical: true }))).toBe("Height clearance (measured, not signed)");
  });

  it("shows heights in metres and feet-inches (never overstated) and keeps bands as bands", () => {
    expect(limitText(point({ kind: "height", limit: { min: 4.4, max: 4.4 } }))).toBe("4.4 m (14′5″)");
    expect(limitText(point({ kind: "height", limit: { min: 3.6, max: 4 } }))).toBe("Between 3.6 m (11′9″) and 4 m (13′1″)");
    expect(limitText(point({ kind: "height", limit: { min: null, max: 3 } }))).toBe("3 m (9′10″) or lower");
    expect(limitText(point({}))).toBe("7.5 t");
    expect(markerText(point({ kind: "height", limit: { min: 3.6, max: 4 } }))).toBe("3.6–4.0m");
    expect(markerText(point({ kind: "height", limit: { min: null, max: 3 } }))).toBe("≤3.0m");
    expect(markerText(point({}))).toBe("7.5t");
  });

  it("labels community records unverified and official records with their authority", () => {
    expect(sourceLabel(src({}))).toBe("Community record: OpenStreetMap contributors. Unverified.");
    expect(sourceLabel(src({ kind: "official", authority: "Transport for London" }))).toBe("Official record: Transport for London");
  });

  it("says when a position is only approximate", () => {
    expect(locationText(point({ approximate: true }))).toMatch(/B123, High Street \(approximate position/);
    expect(locationText(point({ road: { name: null, ref: null, area: null } }))).toBe("51.50000, -0.10000");
  });

  it("flags data downloaded more than four months ago as possibly out of date", () => {
    expect(isStale("2026-01-01T00:00:00Z", new Date("2026-10-09T00:00:00Z"))).toBe(true);
    expect(isStale("2026-09-01T00:00:00Z", new Date("2026-10-09T00:00:00Z"))).toBe(false);
  });

  it("links only to allow-listed https hosts, and builds OSM record links from validated ids", () => {
    expect(allowedLink("https://tfl.gov.uk/modes/driving/low-emission-zone")).toBe("https://tfl.gov.uk/modes/driving/low-emission-zone");
    expect(allowedLink("http://tfl.gov.uk/")).toBeNull();
    expect(allowedLink("https://evil.example/")).toBeNull();
    expect(allowedLink("javascript:alert(1)")).toBeNull();
    expect(osmElementUrl("way", 123)).toBe("https://www.openstreetmap.org/way/123");
  });
});

describe("restrictions in view (the keyboard and screen-reader route)", () => {
  const near = point({ id: "osm/way/1/weight-goods", position: [-0.1, 51.5] });
  const far = point({ id: "osm/way/2/weight-goods", position: [-0.12, 51.51] });
  const outside = point({ id: "osm/way/3/weight-goods", position: [1, 52] });
  const f = file([far, near, outside]);

  it("lists records inside the view, nearest the centre first, never outside it", () => {
    const r = pointsInView([f], [-0.2, 51.4, 0, 51.6], [-0.1, 51.5]);
    expect(r.items.map((i) => i.point.id)).toEqual(["osm/way/1/weight-goods", "osm/way/2/weight-goods"]);
    expect(r.total).toBe(2);
  });

  it("caps the list and reports the full count", () => {
    const many = Array.from({ length: LIST_LIMIT + 5 }, (_, i) => point({ id: `osm/way/${i + 10}/weight-goods`, position: [-0.1 + i * 1e-4, 51.5] }));
    const r = pointsInView([file(many)], [-0.2, 51.4, 0, 51.6], [-0.1, 51.5]);
    expect(r.items).toHaveLength(LIST_LIMIT);
    expect(r.total).toBe(LIST_LIMIT + 5);
  });

  it("finds a tapped marker's record with its source", () => {
    expect(findPoint([f], "osm/way/2/weight-goods")?.source.kind).toBe("community");
    expect(findPoint([f], "nope")).toBeNull();
  });

  it("an empty view says nothing is recorded, not that there is nothing there", () => {
    const out = renderToStaticMarkup(
      h(RestrictionsDialog, { open: false, onClose: () => undefined, returnFocus: () => null, view: { bounds: [1.5, 52.5, 1.6, 52.6], centre: [1.55, 52.55], zoom: 14 }, points: [f], zones: [], selectedId: null, onSelect: () => undefined, now: new Date("2026-10-09T10:00:00Z") }),
    );
    expect(out).toContain("No restrictions are recorded in this view. That does not mean there are none.");
    expect(out).toContain(RESTRICTIONS_DISCLAIMER.replace(/'/g, "&#x27;"));
  });

  it("asks to zoom in rather than listing restrictions at a wide view", () => {
    const out = renderToStaticMarkup(
      h(RestrictionsDialog, { open: false, onClose: () => undefined, returnFocus: () => null, view: { bounds: [-1, 51, 1, 52], centre: [0, 51.5], zoom: 8 }, points: [f], zones: [], selectedId: null, onSelect: () => undefined, now: new Date() }),
    );
    expect(out).toContain("Zoom in on the map to list height and weight restrictions here.");
  });
});

describe("restriction details", () => {
  it("show type, value, location, source, dates, conditions verbatim, caveats and a link to the OSM record", () => {
    const p = point({ conditions: ["maxweightrating:hgv: none @ destination"] });
    const out = renderToStaticMarkup(h(PointDetails, { item: { point: p, records: [p], source: src({}), distance: 0 } }));
    expect(out).toContain("7.5 t");
    expect(out).toContain("Lorry weight limit (goods vehicles, environmental)");
    expect(out).toContain("B123, High Street");
    expect(out).toContain("Community record: OpenStreetMap contributors. Unverified.");
    expect(out).toContain("maxweightrating:hgv: none @ destination");
    expect(out).toContain("as written, not interpreted");
    expect(out).toContain("Record last edited 3 May 2024");
    expect(out).toContain('href="https://www.openstreetmap.org/way/1"');
    expect(out).toContain("Community-sourced and unverified.");
  });

  it("say what NH's weight values don't record, and when a height is only a band", () => {
    const nhPoint = point({ kind: "weight-unrecorded-type", osm: null });
    const nh = renderToStaticMarkup(h(PointDetails, { item: { point: nhPoint, records: [nhPoint], source: src({ kind: "official", authority: "National Highways" }), distance: 0 } }));
    expect(nh).toContain("Weight value on a National Highways diversion route: type, scope and exemptions not recorded");
    expect(nh).toContain("It doesn&#x27;t record whether it is a structural limit or a lorry limit, which vehicles it applies to, where it starts and ends, or any exemptions.");
    expect(nh).toContain("Don&#x27;t treat it as a confirmed limit for all vehicles or for lorries.");
    expect(nh).not.toContain("Lorry weight limit");
    expect(nh).not.toContain("all vehicles (structural)");
    expect(nh).not.toContain("openstreetmap.org/way");
    const bandPoint = point({ kind: "height", limit: { min: 3.6, max: 4 }, osm: null });
    const band = renderToStaticMarkup(h(PointDetails, { item: { point: bandPoint, records: [bandPoint], source: src({ kind: "official" }), distance: 0 } }));
    expect(band).toContain("records only a height band");
  });
});

describe("restriction catalogue (which switches appear)", () => {
  const s = src({});
  const m = { schemaVersion: 1 as const, generatedAt: "2026-10-09T09:00:00.000Z", layers: { height: { file: "height.json", records: 3, sources: [s] }, weight: { file: "weight.json", records: 0, sources: [s] }, lez: { file: "lez.json", records: 1, sources: [s] } } };

  it("lists only layers with a catalogue entry, a data file and records", () => {
    const files = { "./data/height.json": "/assets/height-abc.json", "./data/weight.json": "/assets/weight-abc.json" };
    expect(availableLayers(m, files).map((e) => e.layer)).toEqual(["height"]);
    expect(availableLayers(null, files)).toEqual([]);
  });

  it("this build's catalogue is valid and every listed layer has its file", () => {
    const layers = availableLayers();
    expect(layers.length).toBeGreaterThan(0);
    for (const l of layers) expect(l.url).toMatch(/\.json$/);
  });
});

describe("loading a restriction file", () => {
  const valid = file([point({})]);
  const respond = (body: unknown, status = 200) => () => Promise.resolve(new Response(JSON.stringify(body), { status }));

  it("fetches exactly the file, with no viewport or location in the request, and validates it", async () => {
    let requested = "";
    const data = await getRestrictionFile("/assets/weight-abc.json", restrictionPointsFileSchema, undefined, (input) => {
      requested = input instanceof Request ? input.url : input.toString();
      return respond(valid)();
    });
    expect(data.features).toHaveLength(1);
    expect(new URL(requested).search).toBe("");
    expect(new URL(requested).pathname).toBe("/assets/weight-abc.json");
  });

  it("refuses an invalid, unreadable or missing file with a clear error, never partial data", async () => {
    await expect(getRestrictionFile("/x.json", restrictionPointsFileSchema, undefined, respond({ ...valid, schemaVersion: 2 }))).rejects.toThrow(/failed validation/);
    await expect(getRestrictionFile("/x.json", restrictionPointsFileSchema, undefined, () => Promise.resolve(new Response("{", { status: 200 })))).rejects.toThrow(/couldn't be read/);
    await expect(getRestrictionFile("/x.json", restrictionPointsFileSchema, undefined, respond({}, 404))).rejects.toThrow(/error 404/);
    await expect(getRestrictionFile("/x.json", restrictionPointsFileSchema, undefined, () => Promise.reject(new TypeError("Failed to fetch")))).rejects.toBeInstanceOf(TrafficApiError);
  });

  it("an empty file is valid and shows no markers (and the list then says nothing is recorded)", () => {
    expect(restrictionPointsFileSchema.safeParse({ ...valid, sources: [src({ records: 0 })], features: [] }).success).toBe(true);
  });

  it("is only requested by the restriction data hook, and only while its layer is on", () => {
    const hook = readFileSync("web/src/restrictions/useRestrictionData.ts", "utf8");
    expect(hook).toMatch(/enabled: enabled && entry !== undefined/);
    expect(readFileSync("web/src/App.tsx", "utf8")).toMatch(/useRestrictionData\(entryOf\("height"\), "height", enabled\.height\)/);
  });
});

/** The shipped data (web/src/restrictions/data), as the app loads it. */
const shipped = (layer: "height" | "weight") => restrictionPointsFileSchema.parse(JSON.parse(readFileSync(`web/src/restrictions/data/${layer}.json`, "utf8")));
const nhSource = (over: Partial<RestrictionSource> = {}) => src({ id: "nh-s4-diversion-points", kind: "official", authority: "National Highways", ...over });
const nhPoint = (over: Partial<RestrictionPoint>) =>
  point({ id: "nh-s4-diversion-points/a", source: "nh-s4-diversion-points", kind: "weight-unrecorded-type", extentMetres: null, road: { name: null, ref: null, area: null }, lastEdited: null, osm: null, context: "Recorded on National Highways emergency diversion route M56/J10/J9/1", ...over });

describe("the same restriction recorded on several NH diversion routes", () => {
  it("is shown once per place in the shipped data, with every record kept (weight 84 records at 75 places, NH heights 77 at 48)", () => {
    const weight = groupPoints(shipped("weight").features);
    expect(weight).toHaveLength(75);
    const height = shipped("height");
    const heightGroups = groupPoints(height.features);
    expect(heightGroups.filter((g) => g.point.source === "nh-s4-diversion-points")).toHaveLength(48);
    expect(heightGroups).toHaveLength(943);
    for (const [file, groups] of [[shipped("weight"), weight], [height, heightGroups]] as const) {
      // Nothing dropped, nothing counted twice.
      expect(groups.flatMap((g) => g.records.map((r) => r.id)).sort()).toEqual(file.features.map((f) => f.id).sort());
      for (const g of groups) {
        expect(g.point).toBe(g.records[0]);
        // Grouped records differ only in id and the route they were recorded on.
        for (const r of g.records) expect({ ...r, id: "", context: "" }).toEqual({ ...g.point, id: "", context: "" });
      }
    }
  });

  it("merges only identical restrictions: a different value, source, position or wording at the same place stays separate", () => {
    const a = nhPoint({ id: "nh-s4-diversion-points/b" });
    const sameOtherRoute = nhPoint({ id: "nh-s4-diversion-points/a", context: "Recorded on National Highways emergency diversion route M56/J9/J10/1" });
    const otherValue = nhPoint({ id: "nh-s4-diversion-points/c", limit: { min: 18, max: 18 }, recorded: "18 tonnes" });
    const otherSource = nhPoint({ id: "nh-s5-vehicle-restrictions/d", source: "nh-s5-vehicle-restrictions" });
    const otherPlace = nhPoint({ id: "nh-s4-diversion-points/e", position: [-0.1, 51.50001] });
    const otherWording = nhPoint({ id: "nh-s4-diversion-points/f", sourceText: "Weak bridge" });
    const groups = groupPoints([a, sameOtherRoute, otherValue, otherSource, otherPlace, otherWording]);
    expect(groups.map((g) => g.records.map((r) => r.id))).toEqual([
      ["nh-s4-diversion-points/a", "nh-s4-diversion-points/b"],
      ["nh-s4-diversion-points/c"],
      ["nh-s5-vehicle-restrictions/d"],
      ["nh-s4-diversion-points/e"],
      ["nh-s4-diversion-points/f"],
    ]);
    // The lowest id represents the group.
    expect(groups[0]!.point.id).toBe("nh-s4-diversion-points/a");
  });

  it("lists one entry for the M56 J9/J10 place (two routes), and either record's id opens it", () => {
    const weight = shipped("weight");
    const m56 = weight.features.filter((f) => f.position[0] === -2.545119 && f.position[1] === 53.350447);
    expect(m56).toHaveLength(2);
    const { items, total } = pointsInView([weight], [-2.55, 53.345, -2.54, 53.355], [-2.545119, 53.350447]);
    expect(total).toBe(1);
    expect(items[0]!.records.map((r) => r.id).sort()).toEqual(m56.map((r) => r.id).sort());
    for (const r of m56) expect(findPoint([weight], r.id)?.point.id).toBe(items[0]!.point.id);
    const listHtml = renderToStaticMarkup(
      h(RestrictionsDialog, { open: false, onClose: () => undefined, returnFocus: () => null, view: { bounds: [-2.55, 53.345, -2.54, 53.355], centre: [-2.545119, 53.350447], zoom: 14 }, points: [weight], zones: [], selectedId: null, onSelect: () => undefined, now: new Date("2026-10-09T15:00:00Z") }),
    );
    expect(listHtml.match(/<li>/g)).toHaveLength(1);
    expect(listHtml).toContain("1 recorded in this view");
    expect(listHtml).toContain("Recorded 2 times at this place (once per diversion route), shown once");
  });

  it("details keep every record's diversion route", () => {
    const a = nhPoint({ id: "nh-s4-diversion-points/a" });
    const b = nhPoint({ id: "nh-s4-diversion-points/b", context: "Recorded on National Highways emergency diversion route M56/J9/J10/1" });
    const out = renderToStaticMarkup(h(PointDetails, { item: { point: a, records: [a, b], source: nhSource(), distance: 0 } }));
    expect(out).toContain("Where recorded (2 records of this restriction, shown once)");
    expect(out).toContain("<li>Recorded on National Highways emergency diversion route M56/J10/J9/1</li>");
    expect(out).toContain("<li>Recorded on National Highways emergency diversion route M56/J9/J10/1</li>");
    const single = renderToStaticMarkup(h(PointDetails, { item: { point: a, records: [a], source: nhSource(), distance: 0 } }));
    expect(single).not.toContain("records of this restriction");
    expect(single).toContain("Recorded on National Highways emergency diversion route M56/J10/J9/1");
  });
});

describe("heights whose source wording gives feet and inches", () => {
  it("reads an unambiguous feet-and-inches statement, and nothing else", () => {
    expect(wordingImperialHeight("Vehicles Exceeding Height 14ft 0ins Prohibited")).toMatchObject({ feet: 14, inches: 0 });
    expect(wordingImperialHeight("Vehicles Exceeding Height 13ft 6ins Prohibited")).toMatchObject({ feet: 13, inches: 6 });
    expect(wordingImperialHeight("Vehicles Exceeding Height 15ft 9ins Prohibited")).toMatchObject({ feet: 15, inches: 9 });
    expect(wordingImperialHeight("14 ft 3 in")).toMatchObject({ feet: 14, inches: 3 });
    expect(wordingImperialHeight(`Max 14'6"`)).toMatchObject({ feet: 14, inches: 6 });
    expect(wordingImperialHeight("14ft 0ins")?.metres).toBeCloseTo(4.2672, 4);
    for (const none of [null, "", "Vehicles Exceeding Height 4.9m Prohibited", "Hanger Lane Tunnel", "Updated on 14/09/2018", "14ft 13ins", "14ft 0ins or 13ft 6ins"])
      expect(wordingImperialHeight(none), String(none)).toBeNull();
  });

  it("shows NH's 14ft 0ins record as worded, not as the contradictory conversion 4.2 m (13′9″)", () => {
    const p = point({ kind: "height", limit: { min: 4.2, max: 4.2 }, recorded: "4.2 m", sourceText: "Vehicles Exceeding Height 14ft 0ins Prohibited" });
    expect(limitText(p)).toBe("14′0″ in the wording, recorded as 4.2 m");
    expect(limitText(p)).not.toContain("13′9″");
    expect(markerText(p)).toBe("4.2m");
    expect(heightWordingNote(p)).toBe("14′0″ is taken from the source's wording, not converted from the metric value. The recorded metric value, 4.2 m, is lower than 14′0″ (about 4.27 m). Follow the sign.");
    const out = renderToStaticMarkup(h(PointDetails, { item: { point: p, records: [p], source: src({ kind: "official", authority: "National Highways" }), distance: 0 } }));
    expect(out).toContain("Wording recorded by National Highways: “Vehicles Exceeding Height 14ft 0ins Prohibited”");
    expect(out).not.toContain("13′9″");
    expect(out).not.toContain("Source wording");
  });

  it("every shipped NH network height worded in feet and inches shows that figure, never a different converted one", () => {
    const worded = shipped("height").features.filter((f) => wordingImperialHeight(f.sourceText));
    expect(worded).toHaveLength(8);
    for (const f of worded) {
      const w = wordingImperialHeight(f.sourceText)!;
      const text = limitText(f);
      expect(text, f.sourceText!).toBe(`${w.feet}′${w.inches}″ in the wording, recorded as ${f.limit.max} m`);
      const converted = formatHeight(f.limit.max).match(/\((.*)\)/)![1]!;
      if (converted !== `${w.feet}′${w.inches}″`) expect(text).not.toContain(converted);
    }
  });

  it("keeps the conversion when the wording is metric, and flags a metric value higher than the wording", () => {
    const metric = point({ kind: "height", limit: { min: 4.9, max: 4.9 }, sourceText: "Vehicles Exceeding Height 4.9m Prohibited" });
    expect(limitText(metric)).toBe("4.9 m (16′0″)");
    expect(heightWordingNote(metric)).toBeNull();
    // Synthetic: no shipped record has a metric value above its wording.
    const higher = point({ kind: "height", limit: { min: 4.2, max: 4.2 }, sourceText: "Vehicles Exceeding Height 13ft 6ins Prohibited" });
    expect(heightWordingNote(higher)).toContain("is higher than 13′6″ (about 4.11 m). Use the lower figure, 13′6″, and follow the sign.");
    // A band never takes a single worded figure.
    expect(limitText(point({ kind: "height", limit: { min: 3.6, max: 4 }, sourceText: "14ft 0ins" }))).toBe("Between 3.6 m (11′9″) and 4 m (13′1″)");
  });
});
