import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { restrictionPointsFileSchema, restrictionsManifestSchema, zonesFileSchema, type RestrictionPointsFile, type ZonesFile } from "../../shared/api/restrictions.ts";
import { readFirstSheet } from "../lib/xlsx.ts";
import { buildRestrictions } from "./build-restrictions.ts";

/** A minimal .xlsx (ZIP with shared strings and one sheet) from rows of cells, to feed the build real TfL records. */
function xlsx(rows: Record<string, string>[]): Buffer {
  const strings: string[] = [];
  const idx = (s: string) => (strings.includes(s) ? strings.indexOf(s) : strings.push(s) - 1);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const sheetRows = rows.map((r, i) => `<row r="${i + 1}">${Object.entries(r).map(([c, v]) => `<c r="${c}${i + 1}" t="s"><v>${idx(v)}</v></c>`).join("")}</row>`).join("");
  // The sheet is built first (above) so the shared-string table below holds every string it uses.
  const files: [string, string][] = [
    ["xl/sharedStrings.xml", `<sst>${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join("")}</sst>`],
    ["xl/worksheets/sheet1.xml", `<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`],
  ];
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const data = deflateRawSync(Buffer.from(text, "utf8"));
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const fixture = (name: string) => readFileSync(`fixtures/restrictions/${name}`, "utf8");
const tflRows = (JSON.parse(fixture("tfl-height-rows.json")) as { rows: Record<string, string>[] }).rows;

/** Input folders laid out as fetch-sources.ts and capture-open.ts write them, from the trimmed real fixtures. */
function inputs() {
  const root = mkdtempSync(join(tmpdir(), "ta-restrictions-"));
  const tfl = join(root, "tfl");
  const osm = join(root, "osm");
  const nh = join(root, "nh");
  for (const d of [tfl, osm, join(nh, "s4"), join(nh, "s5")]) mkdirSync(d, { recursive: true });
  writeFileSync(join(tfl, "height-restrictions-in-london.xlsx"), xlsx(tflRows));
  writeFileSync(join(tfl, "lez.json"), fixture("tfl-lez.json"));
  writeFileSync(join(tfl, "ULEZ_Boundary_20230829.json"), fixture("tfl-lez.json"));
  writeFileSync(join(tfl, "gla.geojson"), fixture("gla-ulez-2023-small-parts.json"));
  const t = "2026-10-09T08:13:33.000Z";
  writeFileSync(
    join(tfl, "manifest.json"),
    JSON.stringify({
      entries: [
        { id: "tfl-height-restrictions", file: "height-restrictions-in-london.xlsx", url: "https://s3-eu-west-1.amazonaws.com/roads.data.tfl.gov.uk/BridgesRestrictions/height-restrictions-in-london.xlsx", fetchedAt: t, lastModified: "Wed, 09 Oct 2019 10:46:14 GMT" },
        { id: "tfl-lez-boundary", file: "lez.json", url: "https://s3-eu-west-1.amazonaws.com/roads.data.tfl.gov.uk/Boundaries/lez.json", fetchedAt: t, lastModified: "Thu, 20 Jul 2023 15:02:26 GMT" },
        { id: "tfl-ulez-boundary", file: "ULEZ_Boundary_20230829.json", url: "https://s3-eu-west-1.amazonaws.com/roads.data.tfl.gov.uk/Boundaries/ULEZ_Boundary_20230829.json", fetchedAt: t, lastModified: "Wed, 13 Sep 2023 16:55:42 GMT" },
        { id: "gla-ulez-2023", file: "gla.geojson", url: "https://data.london.gov.uk/download/vd455/x/LondonWideUltraLowEmissionZone.geojson", fetchedAt: t, lastModified: null },
      ],
    }),
  );
  writeFileSync(join(osm, "osm-tile-01.json"), fixture("osm-elements.json"));
  // Synthetic boundary (labelled as such): a box in British National Grid around central London, standing in for the ONS England
  // boundary; one fixture element is moved outside it to prove the clip.
  const box = [[500000, 150000], [500000, 210000], [560000, 210000], [560000, 150000], [500000, 150000]];
  writeFileSync(join(osm, "england.json"), JSON.stringify({ spatialReference: { wkid: 27700 }, features: [{ attributes: { CTRY23CD: "E92000001" }, geometry: { rings: [box] } }] }));
  writeFileSync(
    join(osm, "manifest.json"),
    JSON.stringify({
      entries: [
        { id: "ons-england-boundary", file: "england.json", url: "https://services1.arcgis.com/x/query", fetchedAt: "2026-10-09T09:00:00.000Z" },
        { id: "osm-tile-01", file: "osm-tile-01.json", url: "https://overpass-api.de/api/interpreter", fetchedAt: "2026-10-09T09:00:00.000Z" },
        { id: "osm-tile-02", file: "osm-tile-02.json", url: "https://overpass-api.de/api/interpreter", fetchedAt: "2026-10-09T09:00:00.000Z" },
      ],
    }),
  );
  // A real element, placed in Cardiff (outside England) for the clip test.
  const outside = { ...(JSON.parse(fixture("osm-elements.json")) as { elements: { id: number }[] }).elements[0]!, id: 999999999001, geometry: [{ lat: 51.4816, lon: -3.1791 }, { lat: 51.4817, lon: -3.1791 }] };
  writeFileSync(join(osm, "osm-tile-02.json"), JSON.stringify({ osm3s: { timestamp_osm_base: "2026-10-09T08:00:00Z" }, elements: [outside] }));
  writeFileSync(join(nh, "s4", "diversion-points.json"), fixture("nh-s4-diversion-points.json"));
  writeFileSync(join(nh, "s5", "vehicle-restrictions.json"), fixture("nh-s5-vehicle-restrictions.json"));
  writeFileSync(
    join(nh, "manifest.json"),
    JSON.stringify({
      entries: [
        { file: "s4/diversion-points.json", url: "https://services-eu1.arcgis.com/x/FeatureServer/3", fetchedAt: "2026-10-06T06:52:53.821Z", sourceLastEditDate: "2026-09-30T11:31:35.478Z" },
        { file: "s5/vehicle-restrictions.json", url: "https://services-eu1.arcgis.com/y/FeatureServer/3", fetchedAt: "2026-10-06T06:53:20.000Z", sourceLastEditDate: "2026-10-06T02:20:37.861Z" },
      ],
    }),
  );
  return { tflDir: tfl, osmDir: osm, nhDir: nh };
}

describe("restriction data build (real trimmed fixtures)", () => {
  const dirs = inputs();
  const run = () => buildRestrictions({ ...dirs, generatedAt: "2026-10-09T10:00:00.000Z" });
  const { files, report } = run();
  const height = files["height.json"] as RestrictionPointsFile;
  const weight = files["weight.json"] as RestrictionPointsFile;

  it("is deterministic: the same inputs give byte-identical files", () => {
    expect(JSON.stringify(run().files)).toBe(JSON.stringify(files));
  });

  it("writes files that pass their own schemas, with every record's source described", () => {
    expect(restrictionPointsFileSchema.safeParse(height).success).toBe(true);
    expect(restrictionPointsFileSchema.safeParse(weight).success).toBe(true);
    expect(zonesFileSchema.safeParse(files["lez.json"]).success).toBe(true);
    expect(zonesFileSchema.safeParse(files["ulez.json"]).success).toBe(true);
    expect(restrictionsManifestSchema.safeParse(files["manifest.json"]).success).toBe(true);
  });

  it("keeps heights and weights apart, and keeps official and community sources apart", () => {
    expect(height.features.every((f) => f.kind === "height")).toBe(true);
    expect(weight.features.every((f) => f.kind !== "height")).toBe(true);
    expect(height.sources.map((s) => `${s.id}:${s.kind}`)).toEqual(["nh-s4-diversion-points:official", "nh-s5-vehicle-restrictions:official", "tfl-height-restrictions:official", "osm:community"]);
    expect(new Set(weight.features.map((f) => f.kind))).toEqual(new Set(["weight-unrecorded-type", "weight-goods", "weight-structural"]));
  });

  it("records provenance: licence, verbatim attribution, dataset dates and fetch times", () => {
    const tfl = height.sources.find((s) => s.id === "tfl-height-restrictions")!;
    expect(tfl.attribution).toBe("Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016. Geomni UK Map data © and database rights [2019].");
    expect(tfl.datasetDate).toBe("2019-10-09T10:46:14.000Z");
    expect(tfl.notes.join(" ")).toMatch(/October 2019/);
    const o = height.sources.find((s) => s.id === "osm")!;
    expect(o.licence.name).toBe("Open Database License (ODbL) 1.0");
    expect(o.attribution).toBe("© OpenStreetMap contributors");
  });

  it("keeps OSM element ids and versions, and never any user names or ids", () => {
    const text = JSON.stringify(files);
    expect(text).not.toMatch(/"user"|"uid"|changeset/);
    expect(height.features.filter((f) => f.source === "osm").every((f) => f.osm && f.osm.version > 0)).toBe(true);
  });

  it("checks the ULEZ boundary against the GLA's independent copy and labels the zones separately with TfL's own rules", () => {
    const ulez = files["ulez.json"] as ZonesFile;
    const lez = files["lez.json"] as ZonesFile;
    expect(report.boundaryCheck).toMatchObject({ sameAsLez: true });
    expect(lez.zones[0]).toMatchObject({ id: "lez", name: "London Low Emission Zone (LEZ)" });
    expect(ulez.zones[0]).toMatchObject({ id: "ulez", name: "London Ultra Low Emission Zone (ULEZ)" });
    expect(ulez.zones[0]!.rules.join(" ")).toMatch(/over 3\.5 tonnes\) .*do not need to pay the ULEZ charge/);
    expect(lez.zones[0]!.rules.join(" ")).toMatch(/heavy diesel vehicles/);
    expect(ulez.sources[0]!.notes.join(" ")).toMatch(/same boundary for the ULEZ and the LEZ/);
  });

  it("keeps only OSM records inside England", () => {
    expect(JSON.stringify(files)).not.toContain("999999999001");
    expect(report.sources["osm"]?.skipped["outside England"]).toBe(1);
  });

  it("reports what was skipped and why", () => {
    expect(report.sources["nh-s4-diversion-points"]?.skipped["height in decimal feet is ambiguous"]).toBe(2);
    expect(report.sources["osm"]?.skipped).toBeDefined();
  });

  it("can build from official sources only, saying OSM was left out", () => {
    const official = buildRestrictions({ ...dirs, osmDir: null, generatedAt: "2026-10-09T10:00:00.000Z" });
    expect((official.files["height.json"] as RestrictionPointsFile).sources.some((s) => s.id === "osm")).toBe(false);
    expect(official.report.sources["osm"]?.skipped).toEqual({ "left out: no OSM download given": 1 });
  });
});

describe("xlsx reader", () => {
  it("reads shared-string cells by column, as TfL's file is laid out", () => {
    const rows = readFirstSheet(xlsx(tflRows.slice(0, 3)));
    expect(rows).toEqual(tflRows.slice(0, 3));
  });

  it("rejects a file that isn't a ZIP", () => {
    expect(() => readFirstSheet(Buffer.from("not a zip"))).toThrow(/Not a ZIP/);
  });
});
