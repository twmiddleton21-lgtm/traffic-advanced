import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { junctionsSnapshotSchema, parseJunctionName } from "./junctions.ts";

const snapshot = junctionsSnapshotSchema.parse(JSON.parse(readFileSync("web/src/data/dev-junctions.json", "utf8")));

describe("junctions contract (development export of the NH Network Model)", () => {
  it("is labelled as a development snapshot from National Highways, not live", () => {
    expect(snapshot.provenance.kind).toBe("development-snapshot");
    expect(snapshot.provenance.sources).toEqual(["National Highways Network Model"]);
  });

  it("parses NH junction names and rejects names without a junction number", () => {
    expect(parseJunctionName("M53 J4")).toEqual({ road: "M53", number: "4" });
    expect(parseJunctionName("A1(M) J6")).toEqual({ road: "A1(M)", number: "6" });
    expect(parseJunctionName("M6 J10A")).toEqual({ road: "M6", number: "10A" });
    expect(parseJunctionName("M4 J8/9")).toEqual({ road: "M4", number: "8/9" });
    expect(parseJunctionName("M6 TOLL T7")).toEqual({ road: "M6 TOLL", number: "T7" });
    expect(parseJunctionName("Almondsbury Interchange")).toBeNull();
  });

  it("every exported label is an NH junction name whose parts match its road and number", () => {
    for (const j of snapshot.junctions) expect(parseJunctionName(j.name), j.name).toEqual({ road: j.road, number: j.number });
    expect(new Set(snapshot.junctions.map((j) => j.name)).size).toBe(snapshot.junctions.length);
  });

  it("contains the junctions around the review examples, inside England and Wales", () => {
    for (const name of ["M53 J4", "M53 J5", "M65 J7", "M65 J8", "M54 J2", "M6 J10A"]) {
      const j = snapshot.junctions.find((x) => x.name === name);
      expect(j, name).toBeDefined();
      const [lng, lat] = j!.position;
      expect(lng).toBeGreaterThan(-6.5);
      expect(lng).toBeLessThan(2);
      expect(lat).toBeGreaterThan(49.8);
      expect(lat).toBeLessThan(56);
    }
  });
});
