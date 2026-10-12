import { useEffect, useReducer, useState } from "react";
import { getTrafficStatus } from "./status.ts";

/**
 * DEFERRED (not in the first release; README.md here).
 * Live traffic on the Routes map: whether it may be shown, decided once each time the user turns it on (in Routes).
 *   off → checking → available ⇄ (tile error) → unavailable
 * "unavailable" stays until the user turns traffic off and on again, or leaves Routes and comes back: there is no automatic retry,
 * so a disabled or failing service is never polled. Asking costs no TomTom request (the Worker's /api/traffic/status).
 */
export type TrafficState = "off" | "checking" | "available" | "unavailable";
export type TrafficEvent = "activate" | "deactivate" | "status-available" | "status-unavailable" | "tile-error";

export function trafficReducer(state: TrafficState, event: TrafficEvent): TrafficState {
  switch (event) {
    case "activate":
      return "checking";
    case "deactivate":
      return "off";
    case "status-available":
      return state === "checking" ? "available" : state;
    case "status-unavailable":
      return state === "checking" ? "unavailable" : state;
    case "tile-error":
      return state === "available" ? "unavailable" : state;
  }
}

/** `active`: the Routes view is shown and the user has traffic switched on. */
export function useTraffic(active: boolean) {
  const [state, dispatch] = useReducer(trafficReducer, "off");
  // When the Worker last said yes: the time shown with the traffic until the next refresh.
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!active) {
      dispatch("deactivate");
      return;
    }
    dispatch("activate");
    const controller = new AbortController();
    void getTrafficStatus(controller.signal).then((ok) => {
      if (controller.signal.aborted) return;
      if (ok) setCheckedAt(Date.now());
      dispatch(ok ? "status-available" : "status-unavailable");
    });
    return () => controller.abort();
  }, [active]);
  return { state, checkedAt, onTileError: () => dispatch("tile-error") };
}

/**
 * How often shown traffic is fetched again: every 10 minutes, and only while it is shown and the page is visible (no requests in
 * the background or in the Closures view). Tiles in between come from the browser for TomTom's max-age (at most 5 minutes, set by
 * the Worker), so a pan back over the same area costs nothing.
 */
export const TRAFFIC_REFRESH_MS = 10 * 60_000;

/** A refresh number for the tile URLs, and when shown traffic was last refetched (null until the first refresh). */
export function useTrafficRefresh(shown: boolean): { token: number; refreshedAt: number | null } {
  const [refresh, setRefresh] = useState<{ token: number; refreshedAt: number | null }>({ token: 0, refreshedAt: null });
  useEffect(() => {
    if (!shown) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") setRefresh((r) => ({ token: r.token + 1, refreshedAt: Date.now() }));
    }, TRAFFIC_REFRESH_MS);
    return () => clearInterval(timer);
  }, [shown]);
  return refresh;
}

/** When the traffic on screen was fetched: the later of the check that switched it on and the last refresh. */
export const trafficUpdatedAt = (checkedAt: number | null, refreshedAt: number | null): number | null =>
  checkedAt === null ? refreshedAt : refreshedAt === null ? checkedAt : Math.max(checkedAt, refreshedAt);
