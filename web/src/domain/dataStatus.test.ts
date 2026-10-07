import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TrafficApiError } from "../data/trafficService.ts";
import { freshnessLine, lastUpdatedLine, NOT_LIVE_TEXT, OFFICIAL_SOURCE_URL, refreshNotice } from "./dataStatus.ts";

const captured = "2026-10-05T12:08:26.087Z"; // the Day-1 capture (13:08 UK time)
const at = (minutes: number) => new Date(Date.parse(captured) + minutes * 60_000);

describe("freshness line (SPECIFICATION §4 wording)", () => {
  it("fresh: 'Last updated' with the UK time", () => {
    expect(freshnessLine(captured, at(5))).toEqual({ freshness: "fresh", text: "Last updated 13:08" });
  });

  it("delayed: says the data may be delayed", () => {
    expect(freshnessLine(captured, at(30))).toEqual({ freshness: "delayed", text: "Data may be delayed. Last updated 13:08" });
  });

  it("stale: says so and points to official sources", () => {
    const { freshness, text } = freshnessLine(captured, at(6 * 60));
    expect(freshness).toBe("stale");
    expect(text).toBe("Offline/stale: showing data from Mon 5 Oct, 13:08. Check official sources.");
  });
});

describe("not-live banner", () => {
  it("shows when the data was last updated, from the snapshot's capture time and the same freshness rule", () => {
    expect(lastUpdatedLine(captured, at(5))).toEqual({ freshness: "fresh", updated: "13:08", warning: null });
    expect(lastUpdatedLine(captured, at(30))).toEqual({ freshness: "delayed", updated: "13:08", warning: "Data may be delayed." });
    expect(lastUpdatedLine(captured, at(6 * 60))).toEqual({ freshness: "stale", updated: "Mon 5 Oct, 13:08", warning: "Offline/stale. Check official sources." });
  });

  it("says plainly that the data isn't live, and links to National Highways' road closure report", () => {
    expect(NOT_LIVE_TEXT).toBe("Data is not live. Updated hourly.");
    expect(OFFICIAL_SOURCE_URL).toBe("https://nationalhighways.co.uk/roads-and-travel/live-travel-updates/road-closure-report/");
  });

  it("opens the official source in a new tab without giving it access to the app", () => {
    const header = readFileSync("web/src/components/AppHeader.tsx", "utf8");
    expect(header).toMatch(/href=\{OFFICIAL_SOURCE_URL\}\s+target="_blank"\s+rel="noopener noreferrer"/);
    expect(header).toMatch(/Check official source<span aria-hidden="true">&nbsp;→<\/span>/);
  });

  it("no longer calls the data a development snapshot anywhere in the UI", () => {
    for (const file of ["web/src/components/AppHeader.tsx", "web/src/components/ClosureDetail.tsx"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/provenance\.label|Development snapshot/);
    }
  });
});

describe("refresh notice", () => {
  const error = new TrafficApiError("timeout", "The traffic service didn't respond within 15 seconds.");

  it("says nothing when the latest refresh worked", () => {
    expect(refreshNotice({ via: "api", refreshError: null, lastSuccessAt: Date.parse(captured) })).toBeNull();
  });

  it("explains a failed refresh and that the last valid data is still shown", () => {
    expect(refreshNotice({ via: "api", refreshError: error, lastSuccessAt: Date.parse(captured) })).toBe(
      "Couldn't refresh: The traffic service didn't respond within 15 seconds. Still showing the data received at 13:08.",
    );
  });

  it("says plainly when the bundled development snapshot is shown instead of the API", () => {
    expect(refreshNotice({ via: "development-fallback", refreshError: error, lastSuccessAt: null })).toBe(
      "The traffic API is unavailable (The traffic service didn't respond within 15 seconds). Showing the bundled development snapshot instead.",
    );
  });
});
