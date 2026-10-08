import type { TrafficClosure } from "../../../shared/api/closures.ts";

/**
 * Closure dates: which closures apply on a UK calendar day, and which days the date selector offers. Pure and framework-free.
 *
 * A day is a UK calendar date (Europe/London), written "YYYY-MM-DD". A closure applies on a day when its window [start, end)
 * overlaps any part of that day, so an overnight closure (Wed 20:00 to Thu 06:00) applies on both Wednesday and Thursday.
 *
 * Days are compared and stepped as day numbers (days since 1970-01-01), never as text or by listing every date: the range on
 * offer is just its first and last day, so even an absurd far-future date in the data costs nothing to handle.
 */
export type DayKey = string;

const MS_PER_DAY = 86_400_000;
const ukDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

const parts = (day: DayKey): [number, number, number] => {
  const [y, m, d] = day.split("-").map(Number);
  return [y!, m!, d!];
};

/** Days since 1970-01-01 for a calendar date (any year the platform's dates allow). */
export const dayNumber = (day: DayKey): number => {
  const [y, m, d] = parts(day);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
};

/** The calendar date for a day number. Years past 9999 keep plain digits, so keys stay "YYYY…-MM-DD". */
export const dayFromNumber = (n: number): DayKey => {
  const date = new Date(n * MS_PER_DAY);
  const pad = (v: number, width: number) => String(v).padStart(width, "0");
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
};

/** The UK calendar date of an instant. */
export const ukDayKey = (instant: number | string | Date): DayKey => {
  const p = Object.fromEntries(ukDate.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return `${p["year"]}-${p["month"]}-${p["day"]}`;
};

/** The UK day number of an instant. */
const ukDayNumber = (ms: number): number => dayNumber(ukDayKey(ms));

/** The calendar day `n` days after `day` (calendar arithmetic, so clock changes can't skip or repeat a date). */
export const addDays = (day: DayKey, n: number): DayKey => dayFromNumber(dayNumber(day) + n);

/**
 * True when the window [start, end) overlaps the UK calendar day. Because UK midnight is the boundary between dates, the window
 * overlaps the day exactly when it starts on or before it and its last instant (end − 1 ms) falls on or after it. An empty or
 * unreadable window applies on no day (the API schema already rejects unreadable times).
 */
export function appliesOnDay(window: { start: string; end: string }, day: DayKey): boolean {
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return false;
  const n = dayNumber(day);
  return ukDayNumber(start) <= n && ukDayNumber(end - 1) >= n;
}

/** The closures that apply on a day: one derived view, used for both the map and the list. The snapshot is never changed. */
export function closuresOnDay(closures: TrafficClosure[], day: DayKey): TrafficClosure[] {
  return closures.filter((c) => appliesOnDay(c.window, day));
}

/** The days on offer: every calendar day from `first` to `last`, held as its two ends only. */
export interface DayRange {
  first: DayKey;
  last: DayKey;
}

/**
 * The days the selector offers: from yesterday through the latest date any closure STARTS in this snapshot (and at least today).
 * Yesterday, because closures that start yesterday evening often run into this morning. Not the latest end: some planned works
 * carry overall windows of a year or more, and the snapshot only lists closures starting within its capture horizon, so later days
 * would look falsely quiet. Long-running closures still apply on every offered day they overlap. One pass over the closures;
 * nothing is listed per day.
 */
export function selectableRange(closures: TrafficClosure[], today: DayKey): DayRange {
  let last = dayNumber(today);
  for (const c of closures) {
    const start = Date.parse(c.window.start);
    if (Number.isNaN(start)) continue;
    const day = ukDayNumber(start);
    if (day > last) last = day;
  }
  return { first: addDays(today, -1), last: dayFromNumber(last) };
}

/** How many days the range offers (arithmetic only). */
export const dayCount = (range: DayRange): number => dayNumber(range.last) - dayNumber(range.first) + 1;

/** Position of a day within the range (0 = first). */
export const dayIndex = (range: DayRange, day: DayKey): number => dayNumber(day) - dayNumber(range.first);

/**
 * The day to show: the chosen day kept inside the range (so after midnight, or with a newer snapshot, it stays valid). No choice
 * yet means today, the default, even though the range starts a day earlier.
 */
export function clampDay(day: DayKey | null, range: DayRange, today: DayKey): DayKey {
  // No choice, or a day no date can represent: today.
  const n = day === null ? Number.NaN : dayNumber(day);
  if (day === null || Number.isNaN(n)) return clampDay(today, range, today);
  if (n < dayNumber(range.first)) return range.first;
  return n > dayNumber(range.last) ? range.last : day;
}

/**
 * The first of the shown run of `size` days. "center" keeps the selected day in the middle where the range allows (phones);
 * "keep" moves the run only as far as needed to keep the selected day in view (desktop, so the dates don't jump under the
 * pointer when one is clicked).
 */
export function visibleStart(total: number, size: number, selectedIndex: number, mode: "center" | "keep", previousStart = 0): number {
  const maxStart = Math.max(0, total - size);
  const wanted = mode === "center" ? selectedIndex - Math.floor(size / 2) : Math.min(Math.max(previousStart, selectedIndex - size + 1), selectedIndex);
  return Math.min(Math.max(wanted, 0), maxStart);
}

/** The days shown from position `start`: at most `size` of them, however long the range is. */
export function daysFrom(range: DayRange, start: number, size: number): DayKey[] {
  const count = Math.max(0, Math.min(size, dayCount(range) - start));
  const first = dayNumber(range.first) + start;
  return Array.from({ length: count }, (_, i) => dayFromNumber(first + i));
}

/** After the day changes, the selected closure stays selected only if it applies on the new day. */
export function selectionOnDay(closures: TrafficClosure[], selectedId: string | null, day: DayKey): string | null {
  if (selectedId === null) return null;
  const selected = closures.find((c) => c.id === selectedId);
  return selected && appliesOnDay(selected.window, day) ? selectedId : null;
}

/** For a link to one closure: the first offered day it applies on, or null if it applies on none of them. */
export function firstDayFor(closure: TrafficClosure, range: DayRange): DayKey | null {
  const start = Date.parse(closure.window.start);
  if (Number.isNaN(start)) return null;
  const candidate = dayFromNumber(Math.max(ukDayNumber(start), dayNumber(range.first)));
  return dayNumber(candidate) <= dayNumber(range.last) && appliesOnDay(closure.window, candidate) ? candidate : null;
}

const weekdayLong = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });
const weekdayShort = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const dateLong = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const dateShort = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Labels for a day ("Wednesday", "Wed", "7 October", "7 Oct", "Wednesday 7 October 2026"), independent of the device's zone. */
export function dayLabels(day: DayKey) {
  const [y, m, d] = parts(day);
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  const weekday = weekdayLong.format(noon);
  const date = dateLong.format(noon);
  return { weekday, weekdayShort: weekdayShort.format(noon), date, dateShort: dateShort.format(noon), full: `${weekday} ${date} ${y}` };
}
