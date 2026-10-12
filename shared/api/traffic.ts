import * as z from "zod";

/**
 * Live traffic for the Routes map (TomTom flow tiles, proxied by our Worker: worker/src/traffic/). The browser only ever talks to
 * our own /api/traffic/*; the TomTom key stays server-side. Nothing here is closure data.
 */

/** Our tile path: /api/traffic/flow/{z}/{x}/{y}. */
export const TRAFFIC_TILE_PREFIX = "/api/traffic/flow/";
export const TRAFFIC_STATUS_PATH = "/api/traffic/status";

/**
 * The zooms tiles are fetched at. Below the minimum nothing is drawn (England-wide congestion lines aren't readable and would
 * spend requests); above the maximum the map stretches the zoom-13 tiles (overzoom), so zooming in further costs no requests.
 */
export const TRAFFIC_MIN_ZOOM = 7;
export const TRAFFIC_MAX_ZOOM = 13;

/** Parses /api/traffic/flow/{z}/{x}/{y}, or null when it isn't a tile we serve (bad numbers, outside the zoom range or grid). */
export function parseTrafficTilePath(pathname: string): { z: number; x: number; y: number } | null {
  const m = /^\/api\/traffic\/flow\/(\d{1,2})\/(\d{1,5})\/(\d{1,5})$/.exec(pathname);
  if (!m) return null;
  const [z, x, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (z < TRAFFIC_MIN_ZOOM || z > TRAFFIC_MAX_ZOOM) return null;
  const size = 2 ** z;
  return x < size && y < size ? { z, x, y } : null;
}

/** GET /api/traffic/status: whether tiles can be served now. Deliberately nothing more (no usage figures, no provider details). */
export const trafficStatusSchema = z.object({ available: z.boolean() });
export type TrafficStatus = z.infer<typeof trafficStatusSchema>;

/** The only wording visitors see when traffic can't be shown, whatever the reason (Routes only). */
export const TRAFFIC_UNAVAILABLE_TEXT = "Live traffic is temporarily unavailable due to maintenance. Please try again later.";
