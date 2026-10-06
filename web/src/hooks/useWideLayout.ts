import { useSyncExternalStore } from "react";

/**
 * Desktop layout from Tailwind's `lg` breakpoint (64rem): closures list beside the map, details on the right. Below it (phones,
 * tablets) the map fills the screen, the list is a drawer and details are a sheet. Keep in step with the `lg:` classes in App.tsx.
 */
export const WIDE_QUERY = "(min-width: 64rem)";

const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/** True while the desktop layout applies; updates on resize and rotation. */
export function useWideLayout(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(WIDE_QUERY).matches);
}
