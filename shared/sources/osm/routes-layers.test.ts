import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { routesPointsFileSchema, routesSectionsFileSchema, ROUTES_LAYERS_SCHEMA_VERSION, type RoutesPoint } from "../../api/routes-layers.ts";
import { bearing, chainWays, parseAccess, parseMetres, parseMph, readRoutesLayers, type InputNode, type InputRelation, type InputWay, type RoutesInput } from "./routes-layers.ts";

/**
 * The Routes layers' OSM rules, on REAL elements trimmed from the Geofabrik England extract of 2026-10-11
 * (fixtures/routes-layers/osm-elements.json, scripts/routes-layers/capture-fixtures.ts), including near-misses that must be left
 * out. Edge cases real data doesn't give us are built inline and labelled SYNTHETIC.
 */
const fixture = JSON.parse(readFileSync("fixtures/routes-layers/osm-elements.json", "utf8")) as RoutesInput & { source: { replicationTimestamp: string } };
const all = readRoutesLayers(fixture, () => true);
const byId = (list: RoutesPoint[], id: string) => list.find((p) => p.id === id);
const skippedFor = (element: string) => all.skipped.filter((s) => s.element === element).map((s) => s.reason);

describe("speed cameras (real elements)", () => {
  it("a camera mapped with maxspeed=30 mph shows 30 mph, with no direction because none is mapped", () => {
    const c = byId(all.points["speed-cameras"], "osm/node/222227/speed-camera")!;
    expect(c.value).toEqual({ type: "measure", amount: 30, unit: "mph" });
    expect(c.direction).toBeNull();
    expect(c.partOf).toEqual([]);
  });

  it("a bare-number maxspeed (km/h by OSM's rules, often an mph mistake in England) is never converted or shown", () => {
    const c = byId(all.points["speed-cameras"], "osm/node/1414957293/speed-camera")!;
    expect(c.value).toBeNull();
    expect(c.recorded).toEqual([{ key: "maxspeed", value: "80" }]);
  });

  it("an enforcement relation's device is a camera, with the relation's limit and the bearing from its from point to its to point", () => {
    const rel = fixture.relations.find((r) => r.id === 67109)!;
    const device = rel.members.find((m) => m.role === "device")!.ref;
    const c = byId(all.points["speed-cameras"], `osm/node/${device}/speed-camera`)!;
    expect(c.partOf).toEqual(["maxspeed"]);
    expect(c.value).toEqual({ type: "measure", amount: 40, unit: "mph" });
    const node = (role: string) => fixture.nodes.find((n) => n.id === rel.members.find((m) => m.role === role)!.ref)!;
    expect(c.direction?.travelBearings).toEqual([bearing([node("from").lon, node("from").lat], [node("to").lon, node("to").lat])]);
    expect(c.osm).toContainEqual({ type: "relation", id: 67109, version: rel.version });
  });

  it("an enforcement tag on a node is reported as a mistake; the node is still a camera by its highway=speed_camera tag, direction kept verbatim", () => {
    expect(skippedFor("node/26421233")).toContain("enforcement tag on a node (a documented mistake)");
    const c = byId(all.points["speed-cameras"], "osm/node/26421233/speed-camera")!;
    expect(c.direction).toEqual({ travelBearings: [], mapped: "both" });
    expect(c.value).toEqual({ type: "measure", amount: 50, unit: "mph" });
  });

  it("every England fixture camera validates, one record per node", () => {
    const ids = all.points["speed-cameras"].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("red-light cameras (real elements)", () => {
  it("only the device of an enforcement=traffic_signals relation, never enforcement=red_light_camera", () => {
    const red = fixture.relations.find((r) => r.id === 1326764)!;
    const device = red.members.find((m) => m.role === "device")!.ref;
    expect(all.points["red-light-cameras"].map((p) => p.id)).toEqual([`osm/node/${device}/red-light-camera`]);
    expect(skippedFor("relation/13056650")).toEqual(["non-standard value (enforcement=red_light_camera)"]);
    // Its device is not made into a camera of any kind.
    const mistaken = fixture.relations.find((r) => r.id === 13056650)!.members.find((m) => m.role === "device")!.ref;
    expect([...all.points["speed-cameras"], ...all.points["red-light-cameras"]].some((p) => p.id.includes(`node/${mistaken}/`))).toBe(false);
  });
});

describe("average speed sections (real elements)", () => {
  it("draws a check only when its section ways join into one line through its from and to points, start to end", () => {
    expect(all.sections.map((s) => s.id)).toEqual(["osm/relation/10253900/average-speed"]);
    const s = all.sections[0]!;
    const rel = fixture.relations.find((r) => r.id === 10253900)!;
    const at = (role: string) => {
      const n = fixture.nodes.find((x) => x.id === rel.members.find((m) => m.role === role)!.ref)!;
      // Lines are stored to 6 decimal places (about 0.1 m).
      return [Math.round(n.lon * 1e6) / 1e6, Math.round(n.lat * 1e6) / 1e6];
    };
    expect(s.line[0]).toEqual(at("from"));
    expect(s.line.at(-1)).toEqual(at("to"));
    expect(s.value).toEqual({ type: "measure", amount: 50, unit: "mph" });
    expect(s.travelBearing).toBe(bearing(s.line[0]!, s.line.at(-1)!));
    expect(s.lengthMetres).toBeGreaterThan(500);
  });

  it("leaves out checks it can't map reliably, each with its reason (near-misses from real data)", () => {
    expect(skippedFor("relation/14161786")).toContain("from or to point is not on the section");
    expect(skippedFor("relation/10157575")).toContain("not exactly one from and one to point");
    expect(skippedFor("relation/10266611")).toContain("section ways don't join into one unbroken line");
  });
});

describe("restrictions (real elements)", () => {
  it("a 7.5 t lorry limit keeps its exemption verbatim and is not marked conditional-only", () => {
    const w = byId(all.points.weight, "osm/way/2273/weight-goods")!;
    expect(w.value).toEqual({ type: "measure", amount: 7.5, unit: "t" });
    expect(w.conditions).toEqual(["maxweightrating:hgv: none @ destination"]);
    expect(w.conditionalOnly).toBe(false);
  });

  it("a lorry limit mapped only under conditions is kept with them, marked conditional-only, never as a general rule", () => {
    const w = byId(all.points.weight, "osm/way/4066422/weight-goods")!;
    expect(w.conditionalOnly).toBe(true);
    expect(w.conditions).toEqual(["maxweightrating:hgv: 5 @ Sa 00:00-23:59 ;Su 00:00-23:59"]);
  });

  it("all-vehicle and lorry weight limits stay apart (hgv=destination road with maxweight=5)", () => {
    expect(byId(all.points.weight, "osm/way/2769/weight-structural")?.value).toEqual({ type: "measure", amount: 5, unit: "t" });
    expect(byId(all.points.weight, "osm/way/2769/weight-goods")).toBeUndefined();
  });

  it("heights in feet and inches convert to metres; 'default' never becomes a clearance; signed and physical keep the lower", () => {
    expect(byId(all.points.height, "osm/way/1858766/height")?.value).toEqual({ type: "measure", amount: 4.19, unit: "m" });
    expect(byId(all.points.height, "osm/way/1166/height")).toBeUndefined();
    expect(skippedFor("way/1166")).toContain("maxheight: no specific limit (default)");
    const both = byId(all.points.height, "osm/way/24325993/height")!;
    expect(both.recorded).toEqual([
      { key: "maxheight", value: "2.2" },
      { key: "maxheight:physical", value: "2.2" },
    ]);
  });

  it("widths and lengths: 6'6\" reads as 1.98 m; implausible widths and lone-node physical widths are left out", () => {
    expect(byId(all.points["width-length"], "osm/way/1144/width")?.value).toEqual({ type: "measure", amount: 1.98, unit: "m" });
    expect(byId(all.points["width-length"], "osm/way/1881115/length")?.value).toEqual({ type: "measure", amount: 18.75, unit: "m" });
    expect(byId(all.points["width-length"], "osm/way/955693000/width")).toBeUndefined();
    expect(skippedFor("way/955693000")).toContain("maxwidth: implausible width (1 m)");
    expect(all.points["width-length"].some((p) => p.id.startsWith("osm/node/99878/"))).toBe(false);
  });

  it("lorry access: no, destination and discouraged are kept as mapped; permissions and undocumented values are not", () => {
    expect(byId(all.points.access, "osm/way/960/hgv-access")?.value).toEqual({ type: "access", access: "no" });
    expect(byId(all.points.access, "osm/way/2769/hgv-access")?.value).toEqual({ type: "access", access: "destination" });
    expect(byId(all.points.access, "osm/way/797917/hgv-access")?.value).toEqual({ type: "access", access: "discouraged" });
    expect(byId(all.points.access, "osm/way/3987398/hgv-access")).toBeUndefined();
    expect(skippedFor("way/3987398")).toContain("hgv: value not shown (unsuitable)");
    expect(byId(all.points.access, "osm/way/1218/hgv-access")).toBeUndefined();
    expect(skippedFor("way/1218")).toContain("hgv: a permission, not a restriction (designated)");
  });

  it("a lorry ban mapped only under conditions keeps its conditions verbatim and is marked conditional-only", () => {
    const a = byId(all.points.access, "osm/way/3994632/hgv-access")!;
    expect(a.value).toEqual({ type: "access", access: "no" });
    expect(a.conditionalOnly).toBe(true);
    expect(a.conditions).toEqual(["hgv: no @ 22:00-07:00 AND weight > 7.5"]);
  });

  it("restriction tags on footways, cycleways, pedestrian streets and tracks are not lorry information", () => {
    for (const id of [2407076, 1430327, 28984370]) {
      expect(Object.values(all.points).flat().some((p) => p.id.startsWith(`osm/way/${id}/`)), String(id)).toBe(false);
      expect(skippedFor(`way/${id}`).some((r) => r.startsWith("not a road for motor vehicles")), String(id)).toBe(true);
    }
  });

  it("a stretch of road is shown at its middle, marked approximate when longer than 200 m", () => {
    for (const p of Object.values(all.points).flat().filter((x) => x.osm[0]!.type === "way")) {
      expect(p.extentMetres).not.toBeNull();
      expect(p.approximate).toBe(p.extentMetres! > 200);
    }
  });

  it("every layer's records validate against the shipped file contract", () => {
    const source = {
      name: "OpenStreetMap",
      attribution: "© OpenStreetMap contributors",
      copyrightUrl: "https://www.openstreetmap.org/copyright",
      licence: { name: "Open Database License (ODbL) 1.0", url: "https://opendatacommons.org/licenses/odbl/1-0/" },
      extract: { url: "https://download.geofabrik.de/europe/united-kingdom/england-261011.osm.pbf", file: "england-261011.osm.pbf", sha256: "0".repeat(64), fetchedAt: "2026-10-12T20:15:40Z" },
      dataAsOf: fixture.source.replicationTimestamp,
      notes: [],
    } as const;
    for (const [layer, features] of Object.entries(all.points)) {
      expect(routesPointsFileSchema.safeParse({ schemaVersion: ROUTES_LAYERS_SCHEMA_VERSION, layer, generatedAt: "2026-10-12T21:30:00Z", source, features }).success, layer).toBe(true);
    }
    expect(routesSectionsFileSchema.safeParse({ schemaVersion: ROUTES_LAYERS_SCHEMA_VERSION, layer: "average-speed", generatedAt: "2026-10-12T21:30:00Z", source, sections: all.sections }).success).toBe(true);
  });

  it("nothing outside the area kept (the build passes the ONS England boundary) becomes a record", () => {
    const none = readRoutesLayers(fixture, () => false);
    expect(Object.values(none.points).flat()).toEqual([]);
    expect(none.sections).toEqual([]);
  });
});

describe("value parsers", () => {
  it("speed limits: only '<n> mph', within 5–70", () => {
    expect(parseMph("30 mph")).toEqual({ value: 30 });
    expect(parseMph("30mph")).toEqual({ value: 30 });
    for (const t of ["30", "48 km/h", "national", "none", "200 mph", "GB:nsl_single"]) expect("skip" in parseMph(t), t).toBe(true);
  });

  it("widths and lengths: metres or feet-inches, plausible only, no-limit words never a value", () => {
    expect(parseMetres("2.1", { min: 1.5, max: 10 }, "width")).toEqual({ value: 2.1 });
    expect(parseMetres("7'0\"", { min: 1.5, max: 10 }, "width")).toEqual({ value: 2.13 });
    expect(parseMetres("default", { min: 1.5, max: 10 }, "width")).toEqual({ skip: "no specific limit (default)" });
    expect(parseMetres("6'13\"", { min: 1.5, max: 10 }, "width")).toEqual({ skip: "inches out of range (6'13\")" });
    expect(parseMetres("wide", { min: 1.5, max: 10 }, "width")).toEqual({ skip: "unreadable width (wide)" });
  });

  it("access: restrictions only", () => {
    expect(parseAccess("delivery")).toEqual({ value: "delivery" });
    expect(parseAccess("yes")).toEqual({ skip: "a permission, not a restriction (yes)" });
    expect(parseAccess("local")).toEqual({ skip: "value not shown (local)" });
  });
});

describe("SYNTHETIC edge cases (not in the real fixture)", () => {
  const node = (id: number, tags: Record<string, string> = {}, lon = -1 + id / 1000, lat = 52): InputNode => ({ id, version: 1, timestamp: "2026-01-01T00:00:00Z", lat, lon, tags });
  const way = (id: number, refs: number[], tags: Record<string, string>, nodes: InputNode[]): InputWay => ({
    id,
    version: 1,
    timestamp: "2026-01-01T00:00:00Z",
    tags,
    refs,
    geometry: refs.map((r) => {
      const n = nodes.find((x) => x.id === r);
      return n ? ([n.lon, n.lat] as const) : null;
    }),
  });

  it("chaining section ways: reversed pieces join; a gap, a fork or a loop doesn't", () => {
    const line = (refs: number[]) => ({ refs, line: refs.map((r) => [r, 0] as const) });
    expect(chainWays([line([1, 2, 3]), line([5, 4, 3])])?.refs).toEqual([1, 2, 3, 4, 5]);
    expect(chainWays([line([3, 4]), line([1, 2, 3])])?.refs).toEqual([1, 2, 3, 4]);
    expect(chainWays([line([1, 2]), line([3, 4])])).toBeNull();
    expect(chainWays([line([1, 2, 3]), line([3, 4]), line([3, 5])])).toBeNull();
    expect(chainWays([line([1, 2, 3]), line([3, 4, 1])])).toBeNull();
  });

  it("a section is drawn from its to point back to its from point when the ways run the other way, so travel order holds", () => {
    const nodes = [1, 2, 3, 4].map((i) => node(i));
    const rel: InputRelation = {
      id: 9,
      version: 1,
      timestamp: null,
      tags: { type: "enforcement", enforcement: "average_speed", maxspeed: "50 mph" },
      members: [
        { type: "node", ref: 4, role: "from" },
        { type: "node", ref: 1, role: "to" },
        { type: "way", ref: 10, role: "section" },
      ],
    };
    const r = readRoutesLayers({ nodes, ways: [way(10, [1, 2, 3, 4], {}, nodes)], relations: [rel] }, () => true);
    expect(r.sections[0]!.line[0]).toEqual([nodes[3]!.lon, nodes[3]!.lat]);
    expect(r.sections[0]!.line.at(-1)).toEqual([nodes[0]!.lon, nodes[0]!.lat]);
  });

  it("a camera whose mapped limits disagree shows no limit", () => {
    const cam = node(1, { highway: "speed_camera", maxspeed: "30 mph" });
    const rel: InputRelation = { id: 5, version: 1, timestamp: null, tags: { type: "enforcement", enforcement: "maxspeed", maxspeed: "40 mph" }, members: [{ type: "node", ref: 1, role: "device" }] };
    const r = readRoutesLayers({ nodes: [cam], ways: [], relations: [rel] }, () => true);
    expect(r.points["speed-cameras"][0]!.value).toBeNull();
  });

  it("a road with a node missing from the extract (cut at its edge) is left out, never drawn short", () => {
    const nodes = [node(1), node(2)];
    const r = readRoutesLayers({ nodes, ways: [way(20, [1, 2, 3], { highway: "residential", maxheight: "4" }, nodes)], relations: [] }, () => true);
    expect(r.points.height).toEqual([]);
    expect(r.skipped).toContainEqual({ element: "way/20", layer: "restrictions", reason: "incomplete geometry" });
  });

  it("a malformed conditional is reported and dropped; the plain limit stays", () => {
    const nodes = [node(1), node(2)];
    const r = readRoutesLayers({ nodes, ways: [way(21, [1, 2], { highway: "residential", "maxweightrating:hgv": "7.5", "maxweightrating:hgv:conditional": "destination" }, nodes)], relations: [] }, () => true);
    expect(r.points.weight[0]!.conditions).toEqual([]);
    expect(r.skipped.map((s) => s.reason)).toContain('maxweightrating:hgv:conditional: no "@" in conditional "destination"');
  });
});
