/// <reference types="vite-plugin-pwa/client" />
/**
 * The production update backend: vite-plugin-pwa's registration (workbox-window) for the worker in scripts/lib/service-worker-config.ts.
 * Kept apart from updates.ts so the update logic is testable in Node without the build-time virtual module.
 */
import { registerSW } from "virtual:pwa-register";
import { createUpdateController, UPDATE_CHECK_INTERVAL_MS, type UpdateBackend, type UpdateController, type UpdateEvents } from "./updates.ts";

/** At most one check when the tab comes back into view in this period (the hourly timer covers the rest). */
const VISIBLE_CHECK_GAP_MS = 10 * 60 * 1000;

function connect(events: UpdateEvents): UpdateBackend | { unsupported: string } {
  if (import.meta.env.DEV) return { unsupported: "Update checks run in production builds only." };
  if (!("serviceWorker" in navigator)) return { unsupported: "This browser can't check for app updates. Reloading the page always loads the latest version." };
  let registration: ServiceWorkerRegistration | undefined;
  let registerError: unknown;
  const applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh: events.onReady,
    // Given, so the library never reloads by itself: the controller reloads only after the user pressed Reload in this tab.
    onNeedReload: events.onTakenOver,
    onRegisteredSW: (_url, r) => {
      registration = r;
    },
    onRegisterError: (e: unknown) => {
      registerError = e;
    },
  });
  return {
    async check() {
      if (!registration) throw registerError instanceof Error ? registerError : new Error("The update service isn't registered yet.");
      await registration.update();
      if (registration.waiting) return "waiting";
      if (registration.installing) return "installing";
      return "none";
    },
    apply: () => {
      if (!registration?.waiting) return "nothing-waiting";
      void applyUpdate(true);
      return "applying";
    },
  };
}

export const appUpdates: UpdateController = createUpdateController({ connect, reloadPage: () => window.location.reload() });

if (appUpdates.getState().kind !== "unsupported") {
  setInterval(() => void appUpdates.checkNow(), UPDATE_CHECK_INTERVAL_MS);
  let lastVisibleCheck = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || Date.now() - lastVisibleCheck < VISIBLE_CHECK_GAP_MS) return;
    lastVisibleCheck = Date.now();
    void appUpdates.checkNow();
  });
}
