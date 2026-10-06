/**
 * Data freshness (SPECIFICATION §4), decided from when the closure data was last successfully fetched from National Highways
 * (the snapshot's provenance.capturedAt), never from when our API or the browser last responded:
 *   fresh   < 15 min   "Last updated 14:05"
 *   delayed 15–60 min  "Data may be delayed. Last updated 13:40"
 *   stale   > 60 min   "Offline/stale: showing data from 12:10. Check official sources."
 * Pure and framework-free so the UI and, later, the Worker apply the same rule.
 */
export const FRESHNESS_RULES = { delayedAfterMinutes: 15, staleAfterMinutes: 60 } as const;

export type Freshness = "fresh" | "delayed" | "stale";

export function freshnessOf(capturedAt: string, now: Date): Freshness {
  const captured = Date.parse(capturedAt);
  // An unreadable time can't prove the data is recent.
  if (Number.isNaN(captured)) return "stale";
  // A capture time slightly in the future is clock skew, not extra freshness: it counts as age 0.
  const ageMinutes = Math.max(0, now.getTime() - captured) / 60_000;
  if (ageMinutes > FRESHNESS_RULES.staleAfterMinutes) return "stale";
  if (ageMinutes >= FRESHNESS_RULES.delayedAfterMinutes) return "delayed";
  return "fresh";
}
