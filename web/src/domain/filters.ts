import type { TrafficClosure } from "../../../shared/api/closures.ts";

/**
 * UI filters. They only SELECT closures using fields the matcher already provides; they never decide or change a
 * classification. Each definition is shown to the user as the filter's description.
 */
export type FilterId = "all" | "hgv" | "diversion" | "closures" | "A" | "B" | "D";

export const FILTERS: { id: FilterId; label: string; description: string; matches: (c: TrafficClosure) => boolean }[] = [
  { id: "all", label: "All", description: "Every closure in this data", matches: () => true },
  {
    id: "hgv",
    label: "HGV relevant",
    description: "Closures where National Highways gives HGV information for an official diversion route",
    matches: (c) => c.matchedRoute !== null,
  },
  {
    id: "diversion",
    label: "Diversion available",
    description: "Official diversion information (A) or a matched official route (B)",
    matches: (c) => c.classes.includes("A") || c.classes.includes("B"),
  },
  {
    id: "closures",
    label: "Full closures",
    description: "Full carriageway closures. Excludes works NH describes as laybys, slips or similar",
    matches: (c) => c.fullCarriagewayClosure,
  },
  { id: "A", label: "A", description: "Official diversion information for this roadworks event", matches: (c) => c.classes.includes("A") },
  { id: "B", label: "B", description: "Official NH diversion — match based on available data", matches: (c) => c.classes.includes("B") },
  { id: "D", label: "D", description: "No reliable diversion available", matches: (c) => c.classes.includes("D") },
];

/**
 * Normalises how people and NH write roads and junctions, for matching only:
 * "Jct 4", "J4", "Junction 4" → "j4"; "M53J4" → "m53 j4"; "A1(M)" → "a1m"; "J4–J5" / "J4-J5" → "j4 j5".
 */
export const normaliseSearchText = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\(m\)/g, "m")
    .replace(/[–—-]/g, " ")
    .replace(/\b([am]\d+m?)(?=j\d)/g, "$1 ")
    .replace(/\b(?:junction|jct|j)\.?\s*(\d+[a-z]?)\b/g, "j$1")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Search over the validated closure data only: road numbers, junctions ("m53 j4", "Jct 4"), closure ID, NH situation number,
 * the matched official stretch and route IDs, and NH's own closure text. Every term must match.
 */
export function matchesSearch(c: TrafficClosure, query: string): boolean {
  const q = normaliseSearchText(query);
  if (q === "") return true;
  const haystack = normaliseSearchText(
    [
      c.id,
      c.situationId,
      c.road,
      ...c.roads,
      ...c.nhText,
      ...(c.matchedRoute ? [c.matchedRoute.stretch.label, c.matchedRoute.stretch.junctionFrom, c.matchedRoute.stretch.junctionTo, ...c.matchedRoute.routes.map((r) => r.routeId)] : []),
    ].join(" "),
  );
  const tokens = new Set(haystack.split(/[^a-z0-9]+/));
  // Road numbers and junctions must match whole ("m5" is not "m53", "j4" is not "j45"); other words may match part of the text.
  return q.split(" ").every((term) => (/^(?:[abm]\d+m?|j\d+[a-z]?)$/.test(term) ? tokens.has(term) : haystack.includes(term)));
}

export function applyFilters(closures: TrafficClosure[], filter: FilterId, query: string): TrafficClosure[] {
  const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0]!;
  return closures.filter((c) => f.matches(c) && matchesSearch(c, query));
}

/** Junction range the matcher CONFIRMED (from a matched official stretch). Null means not determined, never guessed. */
export function confirmedJunctions(c: TrafficClosure): { from: string; to: string } | null {
  return c.matchedRoute ? { from: c.matchedRoute.stretch.junctionFrom, to: c.matchedRoute.stretch.junctionTo } : null;
}

const DIRECTION_LABEL: Record<TrafficClosure["direction"], string> = {
  northbound: "Northbound",
  southbound: "Southbound",
  eastbound: "Eastbound",
  westbound: "Westbound",
  clockwise: "Clockwise",
  anticlockwise: "Anticlockwise",
};
export const directionLabel = (d: TrafficClosure["direction"]): string => DIRECTION_LABEL[d];

const dateFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/** "Tue 6 Oct, 20:00 to 06:00" in UK time. */
export function formatWindow(window: { start: string; end: string }): string {
  const start = new Date(window.start);
  const end = new Date(window.end);
  const sameDayOrNext = end.getTime() - start.getTime() < 24 * 3_600_000;
  return `${dateFormat.format(start)} to ${sameDayOrNext ? timeFormat.format(end) : dateFormat.format(end)}`;
}

export const formatDateTime = (iso: string): string => dateFormat.format(new Date(iso));
