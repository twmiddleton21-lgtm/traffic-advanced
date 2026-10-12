import { TOMTOM_TRAFFIC_CREDIT } from "./credits.ts";

/**
 * DEFERRED (not in the first release; README.md here).
 * TomTom's credit on the Routes map: a small bubble at the bottom centre, clear of the map key (bottom left) and the map's own
 * credits and scale (bottom right). It links to TomTom's product attributions in a new tab, with no referrer. The visible pill is
 * small; its tap area is 48 px tall (CLAUDE.md). It sits under MapLibre's controls (z-index 2), so when the base-map credits are
 * open (narrow screens, first view) they cover it rather than it covering them. To be shown only while TomTom traffic is drawn.
 */
export function TrafficAttribution() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-[1] flex justify-center">
      <a
        href={TOMTOM_TRAFFIC_CREDIT.url}
        target="_blank"
        rel="noopener noreferrer"
        className="pointer-events-auto relative rounded-full border border-line bg-surface/95 px-2.5 py-1 text-[12px] font-bold text-ink shadow-sm before:absolute before:-inset-y-3 before:inset-x-0 before:content-[''] hover:underline"
      >
        {TOMTOM_TRAFFIC_CREDIT.text}
        <span className="sr-only"> (TomTom product attributions, opens in a new tab)</span>
      </a>
    </div>
  );
}
