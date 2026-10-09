/**
 * This app build's identity: the Git commit and build time stamped in by vite.config.ts (scripts/lib/build-info.ts). It is kept
 * separate from the traffic data's snapshot version, and it is never compared with anything to claim an update exists: only the
 * service worker finding and downloading a new build does that (updates.ts).
 */
declare const __TA_BUILD__: { commit: string; dirty: boolean; builtAt: string };

export interface AppVersion {
  commit: string;
  dirty: boolean;
  builtAt: string;
}

export const APP_VERSION: AppVersion = __TA_BUILD__;

const builtFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/** "9e243b46c5e9", with a note when the build had uncommitted changes, or "Unknown" when Git wasn't available. */
export function versionLabel(v: AppVersion): string {
  if (v.commit === "unknown") return "Unknown";
  return v.dirty ? `${v.commit} (with uncommitted changes)` : v.commit;
}

export function builtLabel(v: AppVersion): string {
  const at = Date.parse(v.builtAt);
  return Number.isNaN(at) ? "Unknown" : builtFormat.format(at);
}
