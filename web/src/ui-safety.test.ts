import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The UI displays matcher results; it never determines them. These checks keep it that way.
 */
const files: string[] = [];
const walk = (dir: string): void => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) files.push(path);
  }
};
walk("web/src");

describe("UI safety boundary", () => {
  it("UI code imports shared code only through the API contracts, never matcher internals or source adapters", () => {
    for (const file of files) {
      const imports = [...readFileSync(file, "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]!);
      for (const spec of imports.filter((s) => s.includes("shared/"))) {
        expect(spec, `${file} imports ${spec}`).toMatch(/shared\/api\/(?:closures|junctions|freshness|version|restrictions)\.ts$/);
      }
    }
  });

  it("only trafficService talks to the network, and the UI never imports Worker or server code", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (!/trafficService\.ts$/.test(file)) expect(text, file).not.toMatch(/\bfetch\(/);
      expect(text, file).not.toMatch(/from "[^"]*(?:worker|scripts)\//);
    }
  });

  it("the map reads data only through trafficService, never by importing snapshot files directly", () => {
    for (const file of files.filter((f) => !/trafficService\.ts$/.test(f))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/dev-(?:snapshot|junctions)\.json/);
    }
  });

  it("never claims an HGV is suitable (decision D5), and never presents class C", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/(?<!Not )suitable for HGVs|HGV suitable|safe for HGVs/i);
      expect(text, file).not.toMatch(/Calculated HGV route/);
    }
  });

  it("browser code never imports Node modules (tests may)", () => {
    for (const file of files) expect(readFileSync(file, "utf8"), file).not.toMatch(/from "node:/);
  });

  it("shows the safety notice wording from the spec", () => {
    const notice = readFileSync("web/src/components/SafetyNotice.tsx", "utf8");
    expect(notice).toContain("For planning only. Do not use while driving.");
    expect(notice).toContain("the signs take priority");
    // Shown on every closure's details and in Settings.
    expect(readFileSync("web/src/components/ClosureDetail.tsx", "utf8")).toMatch(/<SafetyNotice \/>/);
    expect(readFileSync("web/src/components/settings/DataHelpSection.tsx", "utf8")).toMatch(/<SafetyNotice \/>/);
  });
});
