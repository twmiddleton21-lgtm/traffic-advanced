/**
 * The splash in index.html covers the app while it starts, so the map and closures never assemble in view. It goes as soon as the
 * app is ready (App.tsx); SPLASH_MAX_MS is only a backstop so a slow network or a failed base map can never trap anyone behind it.
 */
export const SPLASH_MAX_MS = 8000;

/** Fades the splash out, removes it, and makes the app beneath interactive again. Safe to call more than once. */
export function hideSplash(doc: Document = document): void {
  doc.getElementById("root")?.removeAttribute("inert");
  const splash = doc.getElementById("splash");
  if (!splash || splash.dataset["state"] === "done") return;
  splash.dataset["state"] = "done";
  const remove = () => splash.remove();
  splash.addEventListener("transitionend", remove, { once: true });
  // No transition runs with reduced motion or in a background tab, so don't wait for one.
  setTimeout(remove, 400);
}
