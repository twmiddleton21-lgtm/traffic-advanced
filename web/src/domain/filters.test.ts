import { describe, expect, it } from "vitest";
import { developmentSnapshotSource } from "../data/trafficService.ts";
import { applyFilters, confirmedJunctions, FILTERS, matchesSearch, normaliseSearchText } from "./filters.ts";
import { classificationMeaning, formatHeight, formatRestriction } from "./units.ts";

const { closures } = await developmentSnapshotSource.getSnapshot();

describe("filters select on matcher-provided fields only", () => {
  it("A/B/D filters return exactly the closures carrying that class", () => {
    for (const cls of ["A", "B", "D"] as const) {
      expect(applyFilters(closures, cls, "")).toEqual(closures.filter((c) => c.classes.includes(cls)));
    }
  });

  it("diversion available = A or B; HGV relevant = has an official route; full closures = per NH text", () => {
    expect(applyFilters(closures, "diversion", "").every((c) => c.classes.some((x) => x === "A" || x === "B"))).toBe(true);
    expect(applyFilters(closures, "hgv", "").every((c) => c.matchedRoute !== null)).toBe(true);
    expect(applyFilters(closures, "closures", "").every((c) => c.fullCarriagewayClosure)).toBe(true);
    expect(applyFilters(closures, "all", "")).toHaveLength(closures.length);
  });

  it("every filter explains itself", () => {
    for (const f of FILTERS) expect(f.description.length).toBeGreaterThan(0);
  });

  it("road search matches road numbers and NH text, case-insensitively", () => {
    const m53 = closures.filter((c) => matchesSearch(c, "m53 j4"));
    expect(m53.some((c) => c.road === "M53")).toBe(true);
    expect(closures.filter((c) => matchesSearch(c, "zz99"))).toHaveLength(0);
  });

  it("normalises the ways people and NH write roads and junctions", () => {
    expect(normaliseSearchText("M53 Jct 4")).toBe("m53 j4");
    expect(normaliseSearchText("M53 Junction 4")).toBe("m53 j4");
    expect(normaliseSearchText("m53j4")).toBe("m53 j4");
    expect(normaliseSearchText("A1(M) J6")).toBe("a1m j6");
    expect(normaliseSearchText("J4–J5")).toBe("j4 j5");
  });

  it("finds closures by road, junction, road + junction, closure ID, NH situation number and text", () => {
    const ids = (q: string) => closures.filter((c) => matchesSearch(c, q)).map((c) => c.id);
    const m53 = closures.find((c) => c.road === "M53" && c.situationId === "491297")!;
    const m65 = closures.find((c) => c.road === "M65" && c.situationId === "520677")!;
    expect(ids("M53")).toContain(m53.id);
    expect(ids("M53 J4")).toContain(m53.id);
    expect(ids("m53 jct 5")).toContain(m53.id);
    expect(ids("M65 J7")).toContain(m65.id);
    expect(ids("491297")).toEqual(closures.filter((c) => c.situationId === "491297").map((c) => c.id));
    expect(ids(m53.id)).toContain(m53.id);
    expect(ids("M53/J4/J5/1")).toContain(m53.id);
  });

  it("matches road numbers and junctions whole: M5 is not M53, J4 is not J45", () => {
    for (const c of closures.filter((x) => matchesSearch(x, "M5"))) {
      expect(normaliseSearchText([c.road, ...c.roads, ...c.nhText].join(" ")).split(/[^a-z0-9]+/)).toContain("m5");
    }
    expect(closures.filter((c) => matchesSearch(c, "M53 J45"))).toHaveLength(0);
  });

  it("search never changes a closure's classification", () => {
    const before = JSON.stringify(closures);
    for (const q of ["M53 J4", "m65", "491297", "lane"]) applyFilters(closures, "all", q);
    expect(JSON.stringify(closures)).toBe(before);
  });

  it("junctions are only 'confirmed' when the matcher matched an official stretch", () => {
    for (const c of closures) expect(confirmedJunctions(c) !== null).toBe(c.matchedRoute !== null);
  });
});

describe("units", () => {
  it("shows heights in metres and feet-inches, rounding inches down", () => {
    expect(formatHeight(4.4)).toBe("4.4 m (14′5″)");
    expect(formatHeight(3.6)).toBe("3.6 m (11′9″)");
    expect(formatRestriction({ kind: "weight", value: 7.5, unit: "Tonnes" })).toBe("Weight limit 7.5 t");
    expect(formatRestriction({ kind: "height", value: null, unit: "metres" })).toBe("Height restriction (value not recorded)");
  });

  it("explains NH classifications in GG 903 terms", () => {
    expect(classificationMeaning("Class_2A")).toBe("Class 2a: not to be used by HGVs");
    expect(classificationMeaning(null)).toBe("No recognised classification");
  });
});
