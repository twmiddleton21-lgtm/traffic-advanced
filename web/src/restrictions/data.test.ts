import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { restrictionPointsFileSchema, restrictionsManifestSchema, zonesFileSchema } from "../../../shared/api/restrictions.ts";

/** The restriction data files shipped with this build (scripts/restrictions/build-restrictions.ts), checked as the app will read them. */
const dir = "web/src/restrictions/data";
const read = (name: string): unknown => JSON.parse(readFileSync(`${dir}/${name}`, "utf8"));
const manifest = restrictionsManifestSchema.parse(read("manifest.json"));

describe("shipped restriction data", () => {
  it("every catalogue entry's file exists, validates, and has the records and sources the catalogue says", () => {
    for (const [layer, entry] of Object.entries(manifest.layers)) {
      const raw = read(entry.file);
      if (layer === "lez" || layer === "ulez") {
        const zones = zonesFileSchema.parse(raw);
        expect(zones.zones.map((z) => z.id)).toEqual([layer]);
        expect(zones.sources).toEqual(entry.sources);
      } else {
        const points = restrictionPointsFileSchema.parse(raw);
        expect(points.layer).toBe(layer);
        expect(points.features).toHaveLength(entry.records);
        expect(points.sources).toEqual(entry.sources);
        expect(points.generatedAt).toBe(manifest.generatedAt);
      }
    }
  });

  it("labels OpenStreetMap as community data under the ODbL, and every official source with its licence", () => {
    for (const entry of Object.values(manifest.layers)) {
      for (const s of entry.sources) {
        if (s.id === "osm") expect(s).toMatchObject({ kind: "community", licence: { name: "Open Database License (ODbL) 1.0" }, attribution: "© OpenStreetMap contributors" });
        else expect(s.kind).toBe("official");
        expect(s.attribution.length).toBeGreaterThan(10);
      }
    }
  });

  it("stores no OpenStreetMap user names, user ids or changesets", () => {
    for (const name of ["height.json", "weight.json"]) expect(readFileSync(`${dir}/${name}`, "utf8")).not.toMatch(/"(user|uid|changeset)":/);
  });

  it("keeps the files small enough to load on a phone when a layer is switched on", () => {
    for (const entry of Object.values(manifest.layers)) expect(statSync(`${dir}/${entry.file}`).size, entry.file).toBeLessThan(8 * 1024 * 1024);
  });

  it("has only National Highways weight values of unrecorded type, as the Settings and map key wording assume", () => {
    // If this fails, a new weight source was added: update LAYER_TEXT.weight (web/src/components/settings/RestrictionsSection.tsx).
    const weight = restrictionPointsFileSchema.parse(read("weight.json"));
    expect(new Set(weight.features.map((f) => `${f.source} ${f.kind}`))).toEqual(new Set(["nh-s4-diversion-points weight-unrecorded-type"]));
    expect(weight.sources.map((s) => s.id)).toEqual(["nh-s4-diversion-points"]);
    expect(weight.sources[0]?.notes.join(" ")).toMatch(/doesn't record whether it is a structural limit or a lorry \(goods vehicle\) limit, which vehicles it applies to, where it starts and ends, or any exemptions/);
  });

  it("gives the NH diversion points the licence their publisher links to (OGL v3.0), with NH's Ordnance Survey attribution verbatim", () => {
    for (const entry of Object.values(manifest.layers))
      for (const s of entry.sources.filter((x) => x.id === "nh-s4-diversion-points")) {
        expect(s.licence).toEqual({ name: "Open Government Licence v3.0", url: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" });
        expect(s.attribution).toBe(
          "Data derived from Ordnance Survey Highway Network, Subject to Crown copyright and database rights 2024. Ordnance Survey Licence: AC0000827444. The data is published under an Open Government Licence.",
        );
      }
  });

  it("never labels a source an \"official record\" (TfL licence, Non-endorsement)", () => {
    for (const f of ["web/src/restrictions/describe.ts", "web/src/components/RestrictionsDialog.tsx"]) expect(readFileSync(f, "utf8")).not.toMatch(/Official record/);
  });

  it("quotes TfL's ULEZ vehicle categories", () => {
    const ulez = zonesFileSchema.parse(read("ulez.json"));
    expect(ulez.zones[0]?.rules).toContain("This applies to cars, motorcycles, vans and specialist vehicles (up to and including 3.5 tonnes) and minibuses (up to and including 5 tonnes).");
  });

  it("never states a 7.5 t lorry limit for a record whose source doesn't say so", () => {
    const weight = restrictionPointsFileSchema.parse(read("weight.json"));
    for (const p of weight.features.filter((f) => f.kind === "weight-goods")) {
      expect(p.source).toBe("osm");
      expect(Object.keys(p.osm?.tags ?? {}).some((k) => /^(maxweightrating:hgv|maxweight:hgv)(:conditional)?$/.test(k))).toBe(true);
    }
  });
});
