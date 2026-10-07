import type { TrafficClosure } from "../../../shared/api/closures.ts";

/**
 * Closure dates: which closures apply on a UK calendar day, and which days the date selector offers. Pure and framework-free.
 *
 * A day is a UK calendar date (Europe/London), written "YYYY-MM-DD". A closure applies on a day when its window [start, end)
 * overlaps any part of that day, so an overnight closure (Wed 20:00 to Thu 06:00) applies on both Wednesday and Thursday.
 */
export type DayKey = string;

const ukDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

/** The UK calendar date of an instant. */
export const ukDayKey = (instant: number | string | Date): DayKey => ukDate.format(new Date(instant));

/**
 * True when the window [start, end) overlaps the UK calendar day. Because UK midnight is the boundary between dates, the window
 * overlaps the day exactly when it starts on or before it and its last instant (end − 1 ms) falls on or after it. An empty or
 * unreadable window applies on no day (the API schema already rejects unreadable times).
 */
export function appliesOnDay(window: { start: string; end: string }, day: DayKey): boolean {
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return false;
  return ukDayKey(start) <= day && ukDayKey(end - 1) >= day;
}

/** The closures that apply on a day: one derived view, used for both the map and the list. The snapshot is never changed. */
export function closuresOnDay(closures: TrafficClosure[], day: DayKey): TrafficClosure[] {
  return closures.filter((c) => appliesOnDay(c.window, day));
}

const parts = (day: DayKey): [number, number, number] => {
  const [y, m, d] = day.split("-").map(Number);
  return [y!, m!, d!];
};

/** The calendar day `n` days after `day` (calendar arithmetic, so clock changes can't skip or repeat a date). */
export function addDays(day: DayKey, n: number): DayKey {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * The days the selector offers: from today through the latest date any closure STARTS in this snapshot. Not the latest end:
 * some planned works carry overall windows of a year or more, and the snapshot only lists closures starting within its capture
 * horizon, so later days would look falsely quiet. Long-running closures still apply on every offered day they overlap.
 * With no closure starting today or later, only today is offered.
 */
export function selectableDays(closures: TrafficClosure[], today: DayKey): DayKey[] {
  let last = today;
  for (const c of closures) {
    const start = Date.parse(c.window.start);
    if (Number.isNaN(start)) continue;
    const day = ukDayKey(start);
    if (day > last) last = day;
  }
  const days: DayKey[] = [];
  for (let day = today; day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

/** The selected day kept inside the offered days (it moves to today after midnight, or into a newer snapshot's range). */
export function clampDay(day: DayKey | null, days: DayKey[]): DayKey {
  const first = days[0]!;
  const last = days[days.length - 1]!;
  if (day === null || day < first) return first;
  return day > last ? last : day;
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

/** After the day changes, the selected closure stays selected only if it applies on the new day. */
export function selectionOnDay(closures: TrafficClosure[], selectedId: string | null, day: DayKey): string | null {
  if (selectedId === null) return null;
  const selected = closures.find((c) => c.id === selectedId);
  return selected && appliesOnDay(selected.window, day) ? selectedId : null;
}

/** For a link to one closure: the first offered day it applies on, or null if it applies on none of them. */
export function firstDayFor(closure: TrafficClosure, days: DayKey[]): DayKey | null {
  return days.find((day) => appliesOnDay(closure.window, day)) ?? null;
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
