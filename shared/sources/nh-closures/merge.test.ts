import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeS1Pages } from "./merge.ts";

interface SplitFixture {
  situationId: string;
  expectedRecordCount: number;
  pages: { D2Payload: { situation: { idG: string; situationRecord: unknown[] }[] } }[];
}

const fixture = JSON.parse(readFileSync("fixtures/s1/split-situation-pages.json", "utf8")) as SplitFixture;

describe("mergeS1Pages (real fixture: situation split across pages)", () => {
  it("unions records across pages instead of deduplicating situations", () => {
    const { situations, conflicts } = mergeS1Pages(fixture.pages);
    expect(conflicts).toEqual([]);
    expect(situations.size).toBe(1);
    expect(situations.get(fixture.situationId)?.records.size).toBe(fixture.expectedRecordCount);
  });

  it("would lose records if pages were naively deduplicated by situation id", () => {
    const firstPageOnly = fixture.pages[0]!.D2Payload.situation[0]!.situationRecord.length;
    expect(firstPageOnly).toBeLessThan(fixture.expectedRecordCount);
  });

  it("flags a record id that appears with different content", () => {
    const page = structuredClone(fixture.pages[0]!);
    const wrapper = page.D2Payload.situation[0]!.situationRecord[0] as Record<string, { idG: string; versionG: string }>;
    const altered = structuredClone(page);
    const alteredWrapper = altered.D2Payload.situation[0]!.situationRecord[0] as Record<string, { versionG: string }>;
    const type = Object.keys(wrapper)[0]!;
    alteredWrapper[type]!.versionG = "synthetic-different-version";
    expect(mergeS1Pages([page, altered]).conflicts).toEqual([wrapper[type]!.idG]);
  });
});
