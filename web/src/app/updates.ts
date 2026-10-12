/**
 * App updates, driven by the service worker (scripts/lib/service-worker-config.ts, docs/APP-UPDATES.md). An update is "ready" only
 * when the browser has found a new build of the app and finished downloading it (the new worker is installed and waiting). The app
 * then says so and offers Reload; it never reloads or swaps itself while someone is using the map.
 *
 * The browser checks for a new build on every visit; while the app stays open it is asked again every hour and when the tab comes
 * back into view, and Settings can ask now. Each check is one small request for /sw.js.
 */
export type UpdateState =
  /** No service worker: a development build, a browser without service workers, or registration failed. */
  | { kind: "unsupported"; reason: string }
  /** Running the newest build the browser knows about. `checkedAt` is the last check that finished this visit (ms), if any. */
  | { kind: "current"; checking: boolean; checkedAt: number | null; checkFailed: boolean }
  /** A new build is being downloaded. */
  | { kind: "downloading" }
  /** A new build is downloaded and waiting. `reloading` once the user pressed Reload. */
  | { kind: "ready"; reloading: boolean }
  /** Another tab applied the update: this page still runs the old build until it is reloaded. */
  | { kind: "applied-elsewhere" };

/** What the controller needs from the service worker registration (vite-plugin-pwa's registerSW in production, stand-ins in tests). */
export interface UpdateBackend {
  /** Asks the browser to look for a new build now. Resolves when that check is done. */
  check: () => Promise<"none" | "installing" | "waiting">;
  /**
   * Tells the waiting build to take over; the backend then calls onTakenOver when it controls the page. "nothing-waiting" when there
   * is no waiting build any more (for example it was already activated or replaced, such as by a kill-switch worker during a
   * rollback: docs/APP-UPDATES.md), so there is nothing to wait for.
   */
  apply: () => "applying" | "nothing-waiting";
}

export interface UpdateEvents {
  /** A new build is installed and waiting. */
  onReady: () => void;
  /** The new build now controls this page (after Reload here, or after another tab applied it). */
  onTakenOver: () => void;
}

/** Plain functions (no `this`), so they can be passed around directly, e.g. to useSyncExternalStore and onClick. */
export interface UpdateController {
  getState: () => UpdateState;
  subscribe: (listener: () => void) => () => void;
  checkNow: () => Promise<void>;
  reload: () => void;
}

export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function createUpdateController(options: {
  /** Starts registration. Returns null when service workers aren't available, with the reason. */
  connect: (events: UpdateEvents) => UpdateBackend | { unsupported: string };
  reloadPage: () => void;
  now?: () => number;
}): UpdateController {
  const now = options.now ?? Date.now;
  const listeners = new Set<() => void>();
  let state: UpdateState = { kind: "current", checking: false, checkedAt: null, checkFailed: false };
  let userAskedToReload = false;
  const set = (next: UpdateState) => {
    state = next;
    for (const l of listeners) l();
  };

  const backend = options.connect({
    onReady: () => {
      if (state.kind !== "ready") set({ kind: "ready", reloading: false });
    },
    onTakenOver: () => {
      // Reload only when the user asked for it in this tab; otherwise say what happened and let them choose when.
      if (userAskedToReload) options.reloadPage();
      else set({ kind: "applied-elsewhere" });
    },
  });
  if ("unsupported" in backend) state = { kind: "unsupported", reason: backend.unsupported };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    checkNow: async () => {
      // Also re-checked while downloading: a download that failed leaves nothing installing, and the check then says so.
      if ("unsupported" in backend || (state.kind !== "current" && state.kind !== "downloading") || (state.kind === "current" && state.checking)) return;
      const before: UpdateState = state.kind === "current" ? state : { kind: "current", checking: false, checkedAt: null, checkFailed: false };
      set({ ...before, checking: true });
      try {
        const found = await backend.check();
        // A found build moves on to "downloading", and to "ready" once installed (onReady), unless that already happened.
        if (state.kind !== "current") return;
        if (found === "none") set({ kind: "current", checking: false, checkedAt: now(), checkFailed: false });
        else if (found === "installing") set({ kind: "downloading" });
        else set({ kind: "ready", reloading: false });
      } catch {
        if (state.kind === "current") set({ kind: "current", checking: false, checkedAt: before.checkedAt, checkFailed: true });
      }
    },
    reload: () => {
      if (state.kind === "applied-elsewhere") return options.reloadPage();
      if ("unsupported" in backend || state.kind !== "ready" || state.reloading) return;
      userAskedToReload = true;
      set({ kind: "ready", reloading: true });
      // The user asked to reload: if nothing is waiting to take over, reload now rather than wait for a takeover that won't come.
      if (backend.apply() === "nothing-waiting") options.reloadPage();
    },
  };
}
