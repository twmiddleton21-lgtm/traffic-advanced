import { freshnessOf, type Freshness } from "../../../shared/api/freshness.ts";
import type { ClosuresState } from "../hooks/useClosures.ts";
import { formatDateTime } from "./filters.ts";

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
export const formatTime = (msOrIso: number | string): string => timeFormat.format(new Date(msOrIso));

/** The freshness line, in SPECIFICATION §4 wording, from when the data was fetched from National Highways. */
export function freshnessLine(capturedAt: string, now: Date): { freshness: Freshness; text: string } {
  const freshness = freshnessOf(capturedAt, now);
  if (freshness === "fresh") return { freshness, text: `Last updated ${formatTime(capturedAt)}` };
  if (freshness === "delayed") return { freshness, text: `Data may be delayed. Last updated ${formatTime(capturedAt)}` };
  return { freshness, text: `Offline/stale: showing data from ${formatDateTime(capturedAt)}. Check official sources.` };
}

/** Shown wherever the data isn't live: ingestion publishes a new National Highways capture every hour. */
export const NOT_LIVE_TEXT = "Data is not live. Updated hourly.";

/** National Highways' own road closure report, for checking anything the app shows. */
export const OFFICIAL_SOURCE_URL = "https://nationalhighways.co.uk/roads-and-travel/live-travel-updates/road-closure-report/";

/**
 * The not-live banner's "Data last updated" time, from the same capture time and freshness rule as freshnessLine. The time alone
 * while fresh or delayed (as in the §4 wording), with the date once stale, plus the §4 warning when the data is no longer fresh.
 */
export function lastUpdatedLine(capturedAt: string, now: Date): { freshness: Freshness; updated: string; warning: string | null } {
  const freshness = freshnessOf(capturedAt, now);
  if (freshness === "fresh") return { freshness, updated: formatTime(capturedAt), warning: null };
  if (freshness === "delayed") return { freshness, updated: formatTime(capturedAt), warning: "Data may be delayed." };
  return { freshness, updated: formatDateTime(capturedAt), warning: "Offline/stale. Check official sources." };
}

/** Explains a failed refresh while data is still shown, so a failure is never silent. Null when there's nothing to say. */
export function refreshNotice(state: Pick<ClosuresState, "via" | "refreshError" | "lastSuccessAt">): string | null {
  if (state.via === "development-fallback") {
    return `The traffic API is unavailable${state.refreshError ? ` (${state.refreshError.message.replace(/\.$/, "")})` : ""}. Showing the bundled development snapshot instead.`;
  }
  if (state.refreshError && state.lastSuccessAt !== null) {
    return `Couldn't refresh: ${state.refreshError.message} Still showing the data received at ${formatTime(state.lastSuccessAt)}.`;
  }
  if (state.refreshError && state.via === "device-cache") {
    return `Couldn't check for newer data: ${state.refreshError.message} Showing the copy saved on this device.`;
  }
  return null;
}
