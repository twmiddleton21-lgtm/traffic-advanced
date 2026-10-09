import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseConditional, parseHeight, parseWeight, readElement, readOverpass } from "./restrictions.ts";

// Synthetic OSM elements for edge cases (labelled as such, CLAUDE.md); real records are tested in
// scripts/restrictions/build-restrictions.test.ts against the trimmed fixture.
const way = (id: number, tags: Record<string, string>, geometry = [{ lat: 51.5, lon: -0.1 }, { lat: 51.5001, lon: -0.1 }]) => ({
  type: "way",
  id,
  version: 3,
  timestamp: "2024-05-03T10:00:00Z",
  geometry,
  tags,
});

describe("OSM height values", () => {
  it("reads metres and feet-inches, including typographic quotes", () => {
    expect(parseHeight("4.2")).toEqual({ value: 4.2 });
    expect(parseHeight("4.2 m")).toEqual({ value: 4.2 });
    expect(parseHeight("4.2m")).toEqual({ value: 4.2 });
    expect(parseHeight(`14'6"`)).toEqual({ value: 4.42 });
    expect(parseHeight("14'")).toEqual({ value: 4.27 });
    expect(parseHeight("14′6″")).toEqual({ value: 4.42 });
    expect(parseHeight("14’ 6”")).toEqual({ value: 4.42 });
  });

  it("skips no-limit values, unreadable text, impossible inches and implausible heights, with a reason", () => {
    for (const t of ["default", "none", "below_default", "unsigned"]) expect(parseHeight(t)).toHaveProperty("skip");
    for (const t of ["4,2", "about 4m", "4.2 metres", "14'13\"", "0.5", "15", "14ft 6in"]) expect(parseHeight(t), t).toHaveProperty("skip");
  });
});

describe("OSM weight values", () => {
  it("reads tonnes, and skips other units and implausible values rather than converting them", () => {
    expect(parseWeight("7.5")).toEqual({ value: 7.5 });
    expect(parseWeight("7.5 t")).toEqual({ value: 7.5 });
    expect(parseWeight("18t")).toEqual({ value: 18 });
    for (const t of ["7.5 st", "16000 lbs", "7500 kg", "0.2", "none", "7,5", "yes"]) expect(parseWeight(t), t).toHaveProperty("skip");
  });
});

describe("OSM conditional values", () => {
  it("splits on semicolons outside parentheses and keeps each condition verbatim", () => {
    expect(parseConditional("7.5 @ (Mo-Fr 07:00-19:00; Sa 08:00-13:00); none @ destination")).toEqual([
      { value: "7.5", condition: "Mo-Fr 07:00-19:00; Sa 08:00-13:00" },
      { value: "none", condition: "destination" },
    ]);
  });

  it("rejects malformed conditionals", () => {
    expect(() => parseConditional("7.5 Mo-Fr")).toThrow();
    expect(() => parseConditional("@ destination")).toThrow();
  });
});

describe("OSM elements to restriction points", () => {
  it("a lorry-symbol 7.5 t limit is weight-goods, and keeps its exemption verbatim", () => {
    const { points } = readElement(way(1, { highway: "unclassified", "maxweightrating:hgv": "7.5", "maxweightrating:hgv:conditional": "none @ destination" }));
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ id: "osm/way/1/weight-goods", kind: "weight-goods", limit: { min: 7.5, max: 7.5 }, conditions: ["maxweightrating:hgv: none @ destination"] });
  });

  it("the older maxweight:hgv tag is also a goods-vehicle limit; maxweight and maxweightrating are structural", () => {
    expect(readElement(way(2, { highway: "residential", "maxweight:hgv": "7.5" })).points[0]?.kind).toBe("weight-goods");
    expect(readElement(way(3, { highway: "residential", maxweight: "18" })).points[0]?.kind).toBe("weight-structural");
    expect(readElement(way(4, { highway: "residential", maxweightrating: "3" })).points[0]?.kind).toBe("weight-structural");
  });

  it("never infers a weight limit from hgv=destination or other access tags (near-miss)", () => {
    expect(readElement(way(5, { highway: "residential", hgv: "destination" })).points).toEqual([]);
    expect(readElement(way(6, { highway: "residential", hgv: "no", goods: "destination" })).points).toEqual([]);
    expect(readElement(way(7, { highway: "residential", "maxweight:hgv:conditional": "none @ destination" })).points).toEqual([]);
  });

  it("one element with height and two weight kinds gives one record each, kinds never merged", () => {
    const { points } = readElement(way(8, { highway: "primary", maxheight: "4.1", maxweight: "18", "maxweightrating:hgv": "7.5" }));
    expect(points.map((p) => p.kind).sort()).toEqual(["height", "weight-goods", "weight-structural"]);
  });

  it("prefers the signed height; uses the physical clearance only when no signed value is readable, and says so", () => {
    expect(readElement(way(9, { highway: "service", maxheight: "4.0", "maxheight:physical": "4.3" })).points[0]).toMatchObject({ limit: { max: 4 }, physical: false });
    expect(readElement(way(10, { highway: "service", maxheight: "default", "maxheight:physical": "4.3" })).points[0]).toMatchObject({ limit: { max: 4.3 }, physical: true });
  });

  it("a conditional-only limit applies under its conditions, which are listed", () => {
    const p = readElement(way(11, { highway: "tertiary", "maxweight:conditional": "7.5 @ (Mo-Fr 07:00-19:00)" })).points[0];
    expect(p).toMatchObject({ kind: "weight-structural", limit: { max: 7.5 }, recorded: "7.5 @ (Mo-Fr 07:00-19:00)", conditions: ["maxweight: 7.5 @ Mo-Fr 07:00-19:00"] });
  });

  it("skips unreadable values with the element and key named, and keeps nothing for them", () => {
    const r = readElement(way(12, { highway: "residential", maxheight: "low", maxweight: "7.5 st" }));
    expect(r.points).toEqual([]);
    expect(r.skipped.map((s) => s.key)).toEqual(["maxheight", "maxweight"]);
  });

  it("positions a way at its middle, marks long stretches approximate, and keeps no personal tags", () => {
    const long = way(13, { highway: "primary", maxweight: "18", note: "call Bob on 0700", fixme: "x", name: "High Street" }, [
      { lat: 51.5, lon: -0.1 },
      { lat: 51.51, lon: -0.1 },
    ]);
    const p = readElement(long).points[0]!;
    expect(p.position[1]).toBeCloseTo(51.505, 5);
    expect(p.approximate).toBe(true);
    expect(p.extentMetres).toBeGreaterThan(1000);
    expect(p.osm?.tags).toEqual({ highway: "primary", maxweight: "18", name: "High Street" });
    expect(readElement(way(14, { highway: "primary", maxweight: "18" })).points[0]?.approximate).toBe(false);
  });

  it("de-duplicates elements returned by overlapping tiles, and reports the newest data time", () => {
    const tile = (base: string) => ({ osm3s: { timestamp_osm_base: base }, elements: [way(20, { highway: "primary", maxheight: "4.4" })] });
    const r = readOverpass([tile("2026-10-09T08:00:00Z"), tile("2026-10-09T08:05:00Z")]);
    expect(r.points).toHaveLength(1);
    expect(r.dataAsOf).toBe("2026-10-09T08:05:00Z");
  });

  it("rejects an invalid element rather than passing it through", () => {
    expect(readElement({ type: "way", id: 1, tags: {} }).skipped[0]?.reason).toBe("invalid element");
  });
});

describe("real OpenStreetMap elements (fixtures/restrictions/osm-elements.json)", () => {
  const fixture = JSON.parse(readFileSync("fixtures/restrictions/osm-elements.json", "utf8")) as { osm3s: unknown; elements: unknown[] };
  const { points, skipped } = readOverpass([fixture]);
  const byElement = (ref: string) => points.filter((p) => p.id.startsWith(`osm/${ref}/`));

  it("reads metres and feet-inches on ways and nodes", () => {
    expect(byElement("way/1011594151")[0]).toMatchObject({ kind: "height", limit: { max: 3.9 }, physical: false, osm: { type: "way" } });
    expect(byElement("node/33717258")[0]).toMatchObject({ kind: "height", limit: { max: 2.06 }, approximate: false, extentMetres: null });
    expect(byElement("node/2661542912")[0]).toMatchObject({ kind: "height", limit: { max: 1.88 }, recorded: `6'2"` });
  });

  it("treats an unsigned height (maxheight:signed=no) and maxheight:physical as clearances, not signed limits", () => {
    expect(byElement("way/596180041")[0]).toMatchObject({ limit: { max: 5 }, physical: true });
    expect(byElement("way/371202325")[0]).toMatchObject({ limit: { max: 7.6 }, physical: true, recorded: "7.6" });
  });

  it("skips default, below_default and other units with a reason", () => {
    expect(byElement("way/167402160")).toEqual([]);
    expect(byElement("node/4239701213")).toEqual([]);
    expect(byElement("node/5359381481")).toEqual([]);
    expect(skipped.map((s) => `${s.element} ${s.reason}`)).toEqual(
      expect.arrayContaining(["way/167402160 no specific limit (default)", "node/4239701213 no specific limit (below_default)", "node/5359381481 unreadable weight (1275 KG)"]),
    );
  });

  it("reads 7.5 t lorry limits with their exemptions verbatim, and hgv=destination adds nothing", () => {
    expect(byElement("node/13049956975")[0]).toMatchObject({ kind: "weight-goods", limit: { max: 7.5 }, conditions: ["maxweightrating:hgv: none @ delivery"] });
    const withAccess = byElement("way/3754158");
    expect(withAccess).toHaveLength(1);
    expect(withAccess[0]).toMatchObject({ kind: "weight-goods", limit: { max: 7.5 }, conditions: ["maxweightrating:hgv: none @ destination"] });
    expect(withAccess[0]?.osm?.tags["hgv"]).toBe("destination");
  });

  it("reads a lorry limit that applies only at certain times, listing the times as recorded", () => {
    expect(byElement("way/506849750")[0]).toMatchObject({ kind: "weight-goods", limit: { max: 16.5 }, conditions: ["maxweightrating:hgv: 16.5 @ Mo-Fr 00:00-07:00,21:00-24:00; Sa 00:00-07:00,13:00-24:00; Su 00:00-24:00"] });
  });

  it("reads all-vehicle weight limits as structural, with their recorded conditions", () => {
    expect(byElement("way/4386882")[0]).toMatchObject({ kind: "weight-structural", limit: { max: 7.5 }, recorded: "7.5 t" });
    expect(byElement("way/14351598")[0]?.conditions[0]).toMatch(/permit_holder/);
    expect(byElement("way/22767739")[0]).toMatchObject({ kind: "weight-structural", limit: { max: 18 } });
  });
});
