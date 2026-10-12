import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serviceWorkerOptions } from "../../../scripts/lib/service-worker-config.ts";
import { createUpdateController, type UpdateBackend, type UpdateEvents } from "./updates.ts";

/** A stand-in for the service worker registration, scripted per test. */
function fakeBackend() {
  let events!: UpdateEvents;
  const calls = { checks: 0, applies: 0, reloads: 0 };
  let nextCheck: () => Promise<"none" | "installing" | "waiting"> = () => Promise.resolve("none");
  let waiting = true;
  const backend: UpdateBackend = {
    check: () => {
      calls.checks++;
      return nextCheck();
    },
    apply: () => {
      calls.applies++;
      return waiting ? "applying" : "nothing-waiting";
    },
  };
  const controller = createUpdateController({
    connect: (e) => {
      events = e;
      return backend;
    },
    reloadPage: () => void calls.reloads++,
    now: () => 1_000,
  });
  return { controller, calls, events: () => events, setCheck: (f: typeof nextCheck) => (nextCheck = f), setWaiting: (w: boolean) => (waiting = w) };
}

describe("app updates", () => {
  it("start as current with no claim of having checked", () => {
    const { controller } = fakeBackend();
    expect(controller.getState()).toEqual({ kind: "current", checking: false, checkedAt: null, checkFailed: false });
  });

  it("are ready only when the new build is installed and waiting, and never reload without the user", () => {
    const { controller, calls, events } = fakeBackend();
    events().onReady();
    expect(controller.getState()).toEqual({ kind: "ready", reloading: false });
    expect(calls.reloads).toBe(0);
    expect(calls.applies).toBe(0);
  });

  it("Reload hands over to the new build, then reloads once it controls the page", () => {
    const { controller, calls, events } = fakeBackend();
    events().onReady();
    controller.reload();
    expect(controller.getState()).toEqual({ kind: "ready", reloading: true });
    expect(calls.applies).toBe(1);
    expect(calls.reloads).toBe(0);
    events().onTakenOver();
    expect(calls.reloads).toBe(1);
    controller.reload();
    expect(calls.applies).toBe(1);
  });

  it("Reload still reloads when nothing is waiting any more (e.g. a kill-switch worker replaced it), instead of hanging", () => {
    const { controller, calls, events, setWaiting } = fakeBackend();
    events().onReady();
    setWaiting(false);
    controller.reload();
    expect(calls.applies).toBe(1);
    expect(calls.reloads).toBe(1);
  });

  it("the production backend reports nothing waiting rather than sending skip-waiting to no worker", () => {
    const src = readFileSync("web/src/app/serviceWorker.ts", "utf8");
    expect(src).toMatch(/if \(!registration\?\.waiting\) return "nothing-waiting";\s*void applyUpdate\(true\);\s*return "applying";/);
  });

  it("an update applied in another tab never reloads this one: it says so and waits for the user", () => {
    const { controller, calls, events } = fakeBackend();
    events().onReady();
    events().onTakenOver();
    expect(controller.getState()).toEqual({ kind: "applied-elsewhere" });
    expect(calls.reloads).toBe(0);
    controller.reload();
    expect(calls.reloads).toBe(1);
  });

  it("Reload does nothing when no update is ready", () => {
    const { controller, calls } = fakeBackend();
    controller.reload();
    expect(calls.applies + calls.reloads).toBe(0);
  });

  it("a check reports no update with its time, a download in progress, or an update ready", async () => {
    const a = fakeBackend();
    await a.controller.checkNow();
    expect(a.controller.getState()).toEqual({ kind: "current", checking: false, checkedAt: 1_000, checkFailed: false });

    const b = fakeBackend();
    b.setCheck(() => Promise.resolve("installing"));
    await b.controller.checkNow();
    expect(b.controller.getState()).toEqual({ kind: "downloading" });
    b.events().onReady();
    expect(b.controller.getState().kind).toBe("ready");

    const c = fakeBackend();
    c.setCheck(() => Promise.resolve("waiting"));
    await c.controller.checkNow();
    expect(c.controller.getState().kind).toBe("ready");
  });

  it("a failed check (offline) says so without claiming the app is up to date", async () => {
    const { controller, setCheck } = fakeBackend();
    setCheck(() => Promise.reject(new Error("offline")));
    await controller.checkNow();
    expect(controller.getState()).toEqual({ kind: "current", checking: false, checkedAt: null, checkFailed: true });
  });

  it("a download that failed is found by the next check, so the state never sticks at downloading", async () => {
    const { controller, setCheck } = fakeBackend();
    setCheck(() => Promise.resolve("installing"));
    await controller.checkNow();
    setCheck(() => Promise.resolve("none"));
    await controller.checkNow();
    expect(controller.getState()).toMatchObject({ kind: "current", checkedAt: 1_000 });
  });

  it("an overlapping check is ignored rather than queued", async () => {
    const { controller, calls, setCheck } = fakeBackend();
    let finish!: (v: "none") => void;
    setCheck(() => new Promise((r) => (finish = r)));
    const first = controller.checkNow();
    void controller.checkNow();
    expect(calls.checks).toBe(1);
    finish("none");
    await first;
  });

  it("are unsupported without a service worker, and then never check or reload", async () => {
    let reloads = 0;
    const controller = createUpdateController({ connect: () => ({ unsupported: "No service worker" }), reloadPage: () => void reloads++ });
    expect(controller.getState()).toEqual({ kind: "unsupported", reason: "No service worker" });
    await controller.checkNow();
    controller.reload();
    expect(reloads).toBe(0);
  });

  it("notify subscribers on every change, and stop after unsubscribing", () => {
    const { controller, events } = fakeBackend();
    let n = 0;
    const stop = controller.subscribe(() => n++);
    events().onReady();
    stop();
    controller.reload();
    expect(n).toBe(1);
  });
});

describe("service worker configuration (scripts/lib/service-worker-config.ts)", () => {
  const wb = serviceWorkerOptions.workbox!;

  it("waits for the user: prompt mode, no skipWaiting or clientsClaim, no inline registration", () => {
    expect(serviceWorkerOptions.registerType).toBe("prompt");
    expect(wb.skipWaiting).toBe(false);
    expect(wb.clientsClaim).toBe(false);
    expect(serviceWorkerOptions.injectRegister).toBe(false);
  });

  it("never caches the API, tiles or restriction data: no runtime caching, /api navigations excluded, data files not precached", () => {
    expect(wb.runtimeCaching).toBeUndefined();
    expect(wb.navigateFallbackDenylist?.some((r) => r.test("/api/closures"))).toBe(true);
    expect(wb.globPatterns?.join(",")).not.toMatch(/json/);
    expect(wb.globIgnores).toContain("**/restrictions/**");
  });

  it("keeps one app version: outdated precaches are removed when a new version takes over", () => {
    expect(wb.cleanupOutdatedCaches).toBe(true);
  });

  it("adds no web app manifest (installation isn't offered yet) and no development service worker", () => {
    expect(serviceWorkerOptions.manifest).toBe(false);
    expect(serviceWorkerOptions.devOptions?.enabled).toBe(false);
  });

  it("has no hand-written web/public/sw.js beside the generated worker (the rollback kill switch belongs only in pre-feature builds)", () => {
    expect(existsSync("web/public/sw.js"), "delete web/public/sw.js when reintroducing the service worker (docs/APP-UPDATES.md)").toBe(false);
  });

  it("documents a kill switch that removes only the app-shell precache and reloads nothing", () => {
    const killSwitch = readFileSync("docs/APP-UPDATES.md", "utf8").match(/```js\n([\s\S]*?)```/)?.[1] ?? "";
    expect(killSwitch).toMatch(/names\.filter\(\(n\) => n\.startsWith\("workbox-precache"\)\)\.map\(\(n\) => caches\.delete\(n\)\)/);
    expect(killSwitch).toMatch(/self\.registration\.unregister\(\)/);
    expect(killSwitch).not.toMatch(/navigate|clients\.claim|addEventListener\("fetch"/);
    // The filtered delete is the only one, so the snapshot device copy (ta-snapshots-v1) is never deleted.
    expect(killSwitch.match(/caches\.delete/g)).toHaveLength(1);
  });

  it("is registered only from the bundle, and the library may never reload the page by itself", () => {
    const source = readFileSync("web/src/app/serviceWorker.ts", "utf8");
    expect(source).toMatch(/onNeedReload: events\.onTakenOver/);
    expect(source).not.toMatch(/location\.reload\(\)[\s\S]*onNeedReload/);
    expect(readFileSync("web/src/main.tsx", "utf8")).toMatch(/import "\.\/app\/serviceWorker\.ts"|from "\.\/app\/serviceWorker\.ts"/);
  });
});
