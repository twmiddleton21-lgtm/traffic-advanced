import { freshnessLine, formatTime, lastUpdatedLine, NOT_LIVE_TEXT, OFFICIAL_SOURCE_URL } from "../domain/dataStatus.ts";
import type { ClosuresState } from "../hooks/useClosures.ts";

export type ThemeChoice = "light" | "dark";

interface Props {
  data: ClosuresState;
  now: Date;
  query: string;
  onQueryChange: (q: string) => void;
  theme: ThemeChoice;
  onToggleTheme: () => void;
  /** Set while the closures drawer is open as a modal on phones and tablets. */
  inert?: boolean;
}

export function AppHeader({ data, now, query, onQueryChange, theme, onToggleTheme, inert }: Props) {
  // Phones and tablets: brand and theme on one row, data status (always visible) below; the search box moves into the closures
  // drawer. Desktop keeps one row. Safe-area padding keeps it clear of notches and rounded corners.
  return (
    <header
      inert={inert}
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line bg-surface pb-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] lg:gap-x-5 lg:gap-y-2 lg:py-2.5"
    >
      <div className="flex items-center gap-2.5">
        <BrandMark />
        <h1 className="text-[17px] font-bold tracking-tight lg:text-[19px]">Traffic Advanced</h1>
      </div>

      <div className="order-last basis-full lg:order-none lg:basis-auto">
        <DataStatus data={data} now={now} />
      </div>

      <label className="ml-auto hidden min-w-0 flex-1 items-center gap-2 lg:flex lg:max-w-xs">
        <span className="sr-only">Find a road</span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Find a road, e.g. M6 or A14"
          className="h-10 w-full rounded-[4px] border border-line bg-bg px-3 text-[16px] text-ink placeholder:text-muted"
        />
      </label>

      <button
        type="button"
        onClick={onToggleTheme}
        className="h-10 rounded-[4px] border border-line px-3 text-[14px] font-bold hover:bg-raised max-lg:ml-auto"
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      >
        {theme === "dark" ? "Light map" : "Dark map"}
      </button>
    </header>
  );
}

const FRESHNESS_TONE = { fresh: "text-muted", delayed: "font-bold text-delayed", stale: "font-bold text-stale" } as const;

/**
 * Not-live data is impossible to miss: roadworks hazard edge + plain wording. Freshness follows SPECIFICATION §4 (fresh, delayed,
 * stale), shown in words as well as colour. The refresh button re-asks the API; the shown data stays until a valid reply arrives.
 */
function DataStatus({ data, now }: { data: ClosuresState; now: Date }) {
  const provenance = data.snapshot?.provenance;
  if (!provenance) return <span className="text-[14px] text-muted">{data.loadError ? "No data loaded" : "Loading data status"}</span>;
  const live = provenance.kind === "live";
  // Phones and tablets: status and an icon-only Refresh share one row; the "Checked" time shows on desktop only.
  return (
    <div className="flex items-center gap-2 lg:flex-wrap">
      {live ? <LiveStatus capturedAt={provenance.capturedAt} now={now} /> : <NotLiveStatus capturedAt={provenance.capturedAt} now={now} />}
      <button
        type="button"
        onClick={data.refresh}
        disabled={data.isRefreshing}
        aria-busy={data.isRefreshing}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-[4px] border border-line px-3 text-[14px] font-bold hover:bg-raised disabled:cursor-progress disabled:opacity-70 lg:h-10"
      >
        <RefreshIcon spinning={data.isRefreshing} />
        <span className="max-lg:sr-only">{data.isRefreshing ? "Refreshing…" : "Refresh"}</span>
      </button>
      {data.lastSuccessAt !== null && <span className="text-[13px] text-muted max-lg:hidden">Checked {formatTime(data.lastSuccessAt)}</span>}
    </div>
  );
}

function LiveStatus({ capturedAt, now }: { capturedAt: string; now: Date }) {
  const { freshness, text } = freshnessLine(capturedAt, now);
  return (
    <div className="flex min-w-0 items-stretch overflow-hidden rounded-[4px] border border-line max-lg:flex-1" role="status" aria-label={`Live data. ${text}`}>
      <span className="flex flex-wrap items-center gap-x-2 px-2.5 py-1 text-[14px]">
        <strong>Live data</strong>
        <span className={FRESHNESS_TONE[freshness]} data-freshness={freshness}>
          {text}
        </span>
      </span>
    </div>
  );
}

/**
 * Two short lines, so the banner stays compact beside the search box on desktop: when the data is from, then what it is. The link
 * takes taps across 48px (CLAUDE.md) but negative margins keep its line as short as the text; the banner doesn't clip overflow,
 * so the taller tap area isn't cut off at its edge.
 */
function NotLiveStatus({ capturedAt, now }: { capturedAt: string; now: Date }) {
  const { freshness, updated, warning } = lastUpdatedLine(capturedAt, now);
  return (
    <div className="flex min-w-0 items-stretch rounded-[4px] border border-sign max-lg:flex-1">
      <span className="hazard-stripe w-3 shrink-0 rounded-l-[3px]" aria-hidden="true" />
      <div
        className="min-w-0 px-2.5 py-1 text-[14px] leading-snug"
        role="status"
        aria-label={`Data last updated: ${updated}.${warning ? ` ${warning}` : ""} ${NOT_LIVE_TEXT}`}
      >
        <p className={FRESHNESS_TONE[freshness]} data-freshness={freshness}>
          <span className="font-normal text-muted">Data last updated:</span> <time dateTime={capturedAt} className="font-bold text-ink">{updated}</time>
          {warning && <> {warning}</>}
        </p>
        <p className="flex flex-wrap items-center gap-x-3">
          <strong className="text-ink dark:text-sign">{NOT_LIVE_TEXT}</strong>
          <a
            href={OFFICIAL_SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="-mb-3 -mt-4 inline-flex min-h-12 items-center font-bold text-motorway underline decoration-2 underline-offset-2 hover:no-underline dark:text-sign"
          >
            Check official source<span aria-hidden="true">&nbsp;→</span>
            <span className="sr-only"> (National Highways, opens in a new tab)</span>
          </a>
        </p>
      </div>
    </div>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={`size-4 ${spinning ? "motion-safe:animate-spin" : ""}`} aria-hidden="true">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12.5 1.5v3.5H9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BrandMark() {
  // A closed carriageway with a diversion arc: the product in one glyph.
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
      <rect width="32" height="32" rx="5" fill="#0b4f9c" />
      <path d="M6 22 H26" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M13 22 V16" stroke="#c8102e" strokeWidth="3" strokeLinecap="round" />
      <path d="M7 19 C9 8, 23 8, 25 19" fill="none" stroke="#ffd200" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
