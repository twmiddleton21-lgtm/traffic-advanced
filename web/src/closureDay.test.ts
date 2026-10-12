import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TrafficClosure } from "../../shared/api/closures.ts";
import { developmentSnapshotSource } from "./data/trafficService.ts";
import { closuresOnDay } from "./domain/closureDates.ts";
import { applyFilters } from "./domain/filters.ts";
import { closuresQuery, closuresSync } from "./hooks/useClosures.ts";

/** The closures date selector wired into the app: one day-filtered collection, and no fetching when the day changes. */
const { closures: real } = await developmentSnapshotSource.getSnapshot();
const base = real[0]!;
const at = (id: string, start: string, end: string): TrafficClosure => ({ ...base, id, window: { start, end } });
const overnight = at("overnight", "2026-10-07T19:00:00.00Z", "2026-10-08T05:00:00.00Z"); // Wed 20:00 to Thu 06:00 UK
const later = at("later", "2026-10-12T19:00:00.00Z", "2026-10-13T05:00:00.00Z"); // Mon night 12 Oct

describe("one filtered collection for the map and the list", () => {
  it("search still works within the selected day", () => {
    const m6 = { ...overnight, id: "m6", road: "M6", roads: ["M6"], nhText: ["M6 northbound Jct 10 to 11 carriageway closure"] };
    const a14 = { ...later, id: "a14", road: "A14", roads: ["A14"], nhText: ["A14 eastbound closure"] };
    const onDay = closuresOnDay([m6, a14], "2026-10-08");
    expect(applyFilters(onDay, "all", "M6").map((c) => c.id)).toEqual(["m6"]);
    expect(applyFilters(onDay, "all", "A14")).toEqual([]); // A14 is on 12 Oct, not 8 Oct
  });

  it("App derives the day's closures once and gives the same list to the map, the list, the counts and the filter chips", () => {
    const app = readFileSync("web/src/App.tsx", "utf8");
    expect(app).toMatch(/closuresOnDay\(closures, day\)/);
    expect(app).toMatch(/applyFilters\(dayClosures, filter, query\)/);
    expect(app).toMatch(/<MapView\s+closures=\{visible\}/);
    expect(app).toMatch(/<ClosureList\s+closures=\{visible\}/);
    expect(app).toMatch(/<FilterBar closures=\{dayClosures\}/);
    // No second date filter anywhere else.
    for (const file of ["web/src/map/MapView.tsx", "web/src/components/ClosureList.tsx", "web/src/components/FilterBar.tsx"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/closuresOnDay|appliesOnDay/);
    }
  });
});

describe("an empty day", () => {
  it("is a calm empty state in the list, not an error, and the map gets no closures", () => {
    const app = readFileSync("web/src/App.tsx", "utf8");
    expect(app).toMatch(/emptyDay=\{dayClosures\.length === 0\}/);
    const list = readFileSync("web/src/components/ClosureList.tsx", "utf8");
    expect(list).toMatch(/if \(emptyDay\) \{[\s\S]*role="status"[\s\S]*No closures scheduled for this day/);
    expect(list.slice(list.indexOf("if (emptyDay)"), list.indexOf("if (closures.length === 0)"))).not.toMatch(/role="alert"/);
  });
});

describe("changing the day never fetches", () => {
  it("the closures query doesn't depend on the selected day: one key, so a day change can't refetch or re-download", () => {
    expect(closuresQuery(closuresSync).queryKey).toEqual(["closures", "live-api"]);
    const app = readFileSync("web/src/App.tsx", "utf8");
    expect(app).toMatch(/useClosures\(\)/);
    // The date module is pure: no data layer, no network.
    const dates = readFileSync("web/src/domain/closureDates.ts", "utf8");
    expect(dates).not.toMatch(/fetch|trafficService|snapshotSync|useQuery/);
  });
});
