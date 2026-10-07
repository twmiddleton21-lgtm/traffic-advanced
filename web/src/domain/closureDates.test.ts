import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { closuresSnapshotSchema, type TrafficClosure } from "../../../shared/api/closures.ts";
import { developmentSnapshotSource } from "../data/trafficService.ts";
import {
  addDays,
  appliesOnDay,
  clampDay,
  closuresOnDay,
  dayCount,
  dayFromNumber,
  dayIndex,
  dayLabels,
  dayNumber,
  daysFrom,
  firstDayFor,
  selectableRange,
  selectionOnDay,
  ukDayKey,
  visibleStart,
} from "./closureDates.ts";

// Real closures from the development snapshot, re-timed for each case (synthetic windows on real records).
const { closures: real } = await developmentSnapshotSource.getSnapshot();
const base = real[0]!;
const at = (id: string, start: string, end: string): TrafficClosure => ({ ...base, id, window: { start, end } });

// October 2026 is BST (UTC+1) until 01:00 UTC on Sunday 25 October, then GMT.
const overnight = at("overnight", "2026-10-07T19:00:00.00Z", "2026-10-08T05:00:00.00Z"); // Wed 20:00 to Thu 06:00 UK
const threeDays = at("three-days", "2026-10-07T08:00:00.00Z", "2026-10-09T16:00:00.00Z"); // Wed 09:00 to Fri 17:00 UK
const later = at("later", "2026-10-12T19:00:00.00Z", "2026-10-13T05:00:00.00Z"); // Mon night 12 Oct
const longRunning = at("long-running", "2026-01-12T09:00:00.00Z", "2027-09-03T22:00:00.00Z"); // the M65 Jct 5 works window

describe("which closures apply on a UK calendar day ([start, end) overlaps the day)", () => {
  it("applies on its start date", () => {
    expect(appliesOnDay(threeDays.window, "2026-10-07")).toBe(true);
  });

  it("applies on every date in between", () => {
    expect(appliesOnDay(threeDays.window, "2026-10-08")).toBe(true);
  });

  it("applies on its end date while it is still in force that day", () => {
    expect(appliesOnDay(threeDays.window, "2026-10-09")).toBe(true);
  });

  it("does not apply before it starts or after it ends", () => {
    expect(appliesOnDay(threeDays.window, "2026-10-06")).toBe(false);
    expect(appliesOnDay(threeDays.window, "2026-10-10")).toBe(false);
  });

  it("an overnight closure applies on BOTH days it covers, not only the night it starts", () => {
    expect(closuresOnDay([overnight], "2026-10-07")).toEqual([overnight]);
    expect(closuresOnDay([overnight], "2026-10-08")).toEqual([overnight]);
    expect(closuresOnDay([overnight], "2026-10-09")).toEqual([]);
  });

  it("the end is exclusive: ending exactly at UK midnight doesn't put it on the next day", () => {
    const toMidnight = at("to-midnight", "2026-10-07T19:00:00.00Z", "2026-10-07T23:00:00.00Z"); // Wed 20:00 to Thu 00:00 UK
    expect(appliesOnDay(toMidnight.window, "2026-10-07")).toBe(true);
    expect(appliesOnDay(toMidnight.window, "2026-10-08")).toBe(false);
    const fromMidnight = at("from-midnight", "2026-10-07T23:00:00.00Z", "2026-10-08T05:00:00.00Z"); // Thu 00:00 to 06:00 UK
    expect(appliesOnDay(fromMidnight.window, "2026-10-07")).toBe(false);
    expect(appliesOnDay(fromMidnight.window, "2026-10-08")).toBe(true);
  });

  it("uses UK dates, not UTC dates (23:30 UTC in October is already the next UK day)", () => {
    expect(ukDayKey("2026-10-07T23:30:00Z")).toBe("2026-10-08");
    const pastUtcMidnight = at("bst", "2026-10-07T23:30:00.00Z", "2026-10-08T00:30:00.00Z");
    expect(appliesOnDay(pastUtcMidnight.window, "2026-10-07")).toBe(false);
    expect(appliesOnDay(pastUtcMidnight.window, "2026-10-08")).toBe(true);
  });

  it("handles the clocks going back (25 Oct 2026): GMT midnight is 00:00 UTC again", () => {
    expect(ukDayKey("2026-10-24T23:30:00Z")).toBe("2026-10-25"); // 00:30 BST
    expect(ukDayKey("2026-10-25T23:30:00Z")).toBe("2026-10-25"); // 23:30 GMT
    expect(ukDayKey("2026-10-26T00:00:00Z")).toBe("2026-10-26");
    const acrossChange = at("dst", "2026-10-24T19:00:00.00Z", "2026-10-26T06:00:00.00Z");
    expect(["2026-10-24", "2026-10-25", "2026-10-26"].every((d) => appliesOnDay(acrossChange.window, d))).toBe(true);
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });

  it("an empty or unreadable window applies on no day", () => {
    expect(appliesOnDay({ start: "2026-10-07T19:00:00Z", end: "2026-10-07T19:00:00Z" }, "2026-10-07")).toBe(false);
    expect(appliesOnDay({ start: "not a date", end: "2026-10-08T05:00:00Z" }, "2026-10-07")).toBe(false);
  });

  it("selects without changing anything: same objects, same order, snapshot untouched", () => {
    const all = [later, overnight, threeDays];
    const before = JSON.stringify(all);
    const on8 = closuresOnDay(all, "2026-10-08");
    expect(on8).toEqual([overnight, threeDays]);
    expect(on8[0]).toBe(overnight);
    expect(JSON.stringify(all)).toBe(before);
  });

  it("a day with no closures gives an empty list, not an error", () => {
    expect(closuresOnDay([overnight, later], "2026-10-10")).toEqual([]);
  });

  it("a long-running closure applies on every day it overlaps", () => {
    for (const day of ["2026-10-07", "2026-10-15", "2027-09-03"]) expect(appliesOnDay(longRunning.window, day)).toBe(true);
    expect(appliesOnDay(longRunning.window, "2027-09-04")).toBe(false);
  });
});

describe("the days the selector offers", () => {
  it("run from today (UK) through the latest date any closure STARTS", () => {
    const range = selectableRange([overnight, threeDays, later], "2026-10-07");
    expect(range).toEqual({ first: "2026-10-07", last: "2026-10-12" });
    expect(dayCount(range)).toBe(6);
    expect(daysFrom(range, 0, 7)).toEqual(["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"]);
  });

  it("a long-running closure's 2027 end does not extend the range; only its start counts", () => {
    expect(selectableRange([overnight, later, longRunning], "2026-10-07").last).toBe("2026-10-12");
    // Its start (January 2026) is before today, so it adds no days either.
    expect(selectableRange([longRunning], "2026-10-07")).toEqual({ first: "2026-10-07", last: "2026-10-07" });
  });

  it("start before today: earlier days are not offered", () => {
    expect(selectableRange([threeDays], "2026-10-08")).toEqual({ first: "2026-10-08", last: "2026-10-08" });
  });

  it("with no closure starting today or later, only today is offered (no invented dates)", () => {
    expect(selectableRange([], "2026-10-07")).toEqual({ first: "2026-10-07", last: "2026-10-07" });
  });

  it("count each calendar day once across the clock change", () => {
    const afterChange = at("after", "2026-10-27T20:00:00.00Z", "2026-10-28T06:00:00.00Z");
    const range = selectableRange([afterChange], "2026-10-24");
    expect(dayCount(range)).toBe(4);
    expect(daysFrom(range, 0, 7)).toEqual(["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
  });

  it("on the real development snapshot: every offered day is consecutive, and starts at today", () => {
    const today = ukDayKey(Math.min(...real.map((c) => Date.parse(c.window.start))));
    const range = selectableRange(real, today);
    expect(range.first).toBe(today);
    expect(range.last).toBe(ukDayKey(Math.max(...real.map((c) => Date.parse(c.window.start)))));
    const days = daysFrom(range, 0, dayCount(range));
    expect(days).toHaveLength(dayCount(range));
    days.slice(1).forEach((d, i) => expect(d).toBe(addDays(days[i]!, 1)));
  });
});

describe("the selected day", () => {
  const days = { first: "2026-10-07", last: "2026-10-09" };

  it("defaults to today, the first offered day", () => {
    expect(clampDay(null, days)).toBe("2026-10-07");
  });

  it("never goes before the first or after the last offered day", () => {
    expect(clampDay("2026-10-06", days)).toBe("2026-10-07");
    expect(clampDay("2026-10-12", days)).toBe("2026-10-09");
    expect(clampDay("2026-10-08", days)).toBe("2026-10-08");
  });

  it("today is the UK date, which can differ from the UTC date", () => {
    expect(ukDayKey(new Date("2026-10-07T23:15:00Z"))).toBe("2026-10-08");
    expect(ukDayKey(new Date("2026-12-31T23:15:00Z"))).toBe("2026-12-31");
  });
});

describe("the shown run of dates", () => {
  it("phones (3): the selected day is in the middle where the range allows", () => {
    expect(visibleStart(15, 3, 5, "center")).toBe(4);
    expect(visibleStart(15, 3, 0, "center")).toBe(0); // first day: no earlier date to show
    expect(visibleStart(15, 3, 14, "center")).toBe(12); // last day
  });

  it("desktop (7): moves only to keep the selected day in view", () => {
    expect(visibleStart(15, 7, 3, "keep", 0)).toBe(0);
    expect(visibleStart(15, 7, 7, "keep", 0)).toBe(1);
    expect(visibleStart(15, 7, 5, "keep", 3)).toBe(3);
    expect(visibleStart(15, 7, 2, "keep", 3)).toBe(2);
    expect(visibleStart(15, 7, 14, "keep", 0)).toBe(8);
  });

  it("fewer days than the run: all of them, no placeholders", () => {
    expect(visibleStart(2, 7, 1, "keep", 0)).toBe(0);
    expect(visibleStart(1, 3, 0, "center")).toBe(0);
  });
});

describe("the selected closure when the day changes", () => {
  const all = [overnight, threeDays, later];

  it("stays selected when it still applies on the new day", () => {
    expect(selectionOnDay(all, "overnight", "2026-10-08")).toBe("overnight");
  });

  it("is cleared when it doesn't apply on the new day", () => {
    expect(selectionOnDay(all, "overnight", "2026-10-09")).toBeNull();
    expect(selectionOnDay(all, "missing", "2026-10-08")).toBeNull();
    expect(selectionOnDay(all, null, "2026-10-08")).toBeNull();
  });

  it("a link to a later closure opens on the first offered day it applies on", () => {
    const range = selectableRange(all, "2026-10-07");
    expect(firstDayFor(later, range)).toBe("2026-10-12");
    expect(firstDayFor(overnight, range)).toBe("2026-10-07");
    expect(firstDayFor(at("started", "2026-10-05T19:00:00Z", "2026-10-09T05:00:00Z"), range)).toBe("2026-10-07"); // began before today
    expect(firstDayFor(at("gone", "2026-10-01T19:00:00Z", "2026-10-02T05:00:00Z"), range)).toBeNull();
    expect(firstDayFor(at("after", "2026-10-20T19:00:00Z", "2026-10-21T05:00:00Z"), range)).toBeNull(); // after the last day
  });
});

describe("labels", () => {
  it("weekday and date in UK English, the same in any device time zone", () => {
    expect(dayLabels("2026-10-07")).toEqual({
      weekday: "Wednesday",
      weekdayShort: "Wed",
      date: "7 October",
      dateShort: "7 Oct",
      full: "Wednesday 7 October 2026",
    });
  });
});

describe("far-future dates in the data can't exhaust the page", () => {
  // Schema-valid (Date.parse accepts them) but absurd: the latest date JavaScript can represent, and a five-digit year.
  const farFuture = at("far-future", "+275760-09-12T00:00:00.000Z", "+275760-09-13T00:00:00.000Z");
  const year10000 = at("year-10000", "+010000-01-01T09:00:00.000Z", "+010000-01-02T09:00:00.000Z");

  it("such closures pass the API schema, so the date code itself must cope", () => {
    const parsed = closuresSnapshotSchema.safeParse({
      provenance: { kind: "live", label: "Live", capturedAt: "2026-10-07T17:27:17Z", sources: [], notes: [] },
      generatedAt: "2026-10-07T17:27:17Z",
      closures: [farFuture, year10000],
    });
    expect(parsed.success).toBe(true);
  });

  it("the range is held as its two ends however far it reaches; only the shown run is ever listed", () => {
    const range = selectableRange([overnight, year10000, farFuture], "2026-10-07");
    expect(range).toEqual({ first: "2026-10-07", last: "275760-09-12" });
    expect(dayCount(range)).toBeGreaterThan(99_000_000); // about 100 million days on offer...
    const started = performance.now();
    const shown = daysFrom(range, dayIndex(range, "275760-09-12") - 6, 7); // ...but the last week is 7 dates
    expect(shown).toHaveLength(7);
    expect(shown.at(-1)).toBe("275760-09-12");
    expect(daysFrom(range, 0, 3)).toEqual(["2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(daysFrom(range, dayCount(range) + 5, 7)).toEqual([]); // past the end: nothing, never a negative length
    expect(performance.now() - started).toBeLessThan(50);
  });

  it("selecting and stepping at the far end is arithmetic, not listing", () => {
    const range = selectableRange([farFuture], "2026-10-07");
    const last = clampDay("275760-09-13", range); // beyond the last day
    expect(last).toBe("275760-09-12");
    expect(clampDay("999999-01-01", range)).toBe("2026-10-07"); // no date can represent it: back to today
    expect(dayIndex(range, last)).toBe(dayCount(range) - 1);
    expect(addDays(last, -1)).toBe("275760-09-11");
    expect(visibleStart(dayCount(range), 3, dayIndex(range, last), "center")).toBe(dayCount(range) - 3);
  });

  it("five-digit years order after four-digit ones (compared as day numbers, not text)", () => {
    expect(dayNumber("10000-01-01")).toBeGreaterThan(dayNumber("9999-12-31"));
    expect(dayFromNumber(dayNumber("10000-01-01"))).toBe("10000-01-01");
    expect(addDays("9999-12-31", 1)).toBe("10000-01-01");
    expect(selectableRange([year10000], "2026-10-07").last).toBe("10000-01-01");
    expect(appliesOnDay(year10000.window, "10000-01-01")).toBe(true);
    expect(appliesOnDay(year10000.window, "2026-10-07")).toBe(false);
  });

  it("the selector only ever builds the shown dates from the range", () => {
    const selector = readFileSync("web/src/components/DateSelector.tsx", "utf8");
    expect(selector).toMatch(/daysFrom\(range, shownStart, size\)/);
    expect(selector).not.toMatch(/selectableDays|days\.slice|days\.indexOf/);
    expect(readFileSync("web/src/domain/closureDates.ts", "utf8")).not.toMatch(/selectableDays/);
  });
});
