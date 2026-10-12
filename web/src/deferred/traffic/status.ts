import { TRAFFIC_STATUS_PATH, trafficStatusSchema } from "../../../../shared/api/traffic.ts";

/**
 * DEFERRED (not in the first release; README.md here). Whether the Routes map's live traffic can be shown now (our Worker's
 * /api/traffic/status; costs no TomTom request). Anything but a clear yes, including a network error or a 503, is no.
 * On re-integration this belongs in web/src/data/trafficService.ts, the app's one data-access boundary.
 */
export async function getTrafficStatus(signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(TRAFFIC_STATUS_PATH, { signal, cache: "no-store" });
    if (!response.ok) return false;
    return trafficStatusSchema.parse(await response.json()).available;
  } catch {
    return false;
  }
}
