/**
 * The app's two views: Closures (the closures map, list and details; the default) and Routes (a map for route awareness). The
 * view is kept in the URL (?view=routes), as the selected closure is (?closure=…), so a reload or a shared link opens the same view.
 * No other storage is used. Closures is never written to the URL: it's what a plain link opens.
 */
export type AppView = "closures" | "routes";

export const DEFAULT_VIEW: AppView = "closures";

export function readView(search: string): AppView {
  return new URLSearchParams(search).get("view") === "routes" ? "routes" : DEFAULT_VIEW;
}

/** The same URL with the view set; everything else in it (e.g. ?closure=…) is kept. */
export function withView(href: string, view: AppView): URL {
  const url = new URL(href);
  if (view === "routes") url.searchParams.set("view", "routes");
  else url.searchParams.delete("view");
  return url;
}

export interface Camera {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

/**
 * Each view keeps its own map position: leaving a view remembers where its map was, and coming back puts it there again. A view
 * not seen yet starts where the map is now. One map serves both views, so nothing is created or destroyed on a switch.
 */
export function createViewCameras() {
  const saved = new Map<AppView, Camera>();
  return {
    /** Remembers `from`'s camera; returns where `to` should be, or null to stay put. */
    switchView(from: AppView, to: AppView, current: Camera): Camera | null {
      if (from === to) return null;
      saved.set(from, current);
      return saved.get(to) ?? null;
    },
  };
}
