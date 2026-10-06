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
