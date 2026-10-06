import { freshnessLine, formatTime } from "../domain/dataStatus.ts";
import type { ClosuresState } from "../hooks/useClosures.ts";

export type ThemeChoice = "light" | "dark";

interface Props {
  data: ClosuresState;
  now: Date;
  query: string;
  onQueryChange: (q: string) => void;
  theme: ThemeChoice;
  onToggleTheme: () => void;
}

export function AppHeader({ data, now, query, onQueryChange, theme, onToggleTheme }: Props) {
  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-surface px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <BrandMark />
        <h1 className="text-[19px] font-bold tracking-tight">Traffic Advanced</h1>
      </div>

      <DataStatus data={data} now={now} />

      <label className="ml-auto flex min-w-0 flex-1 items-center gap-2 sm:max-w-xs">
        <span className="sr-only">Find a road</span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Find a road, e.g. M6 or A14"
          className="h-10 w-full rounded-[4px] border border-line bg-bg px-3 text-[15px] text-ink placeholder:text-muted"
        />
      </label>

      <button
        type="button"
        onClick={onToggleTheme}
        className="h-10 rounded-[4px] border border-line px-3 text-[14px] font-bold hover:bg-raised"
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
  const { freshness, text } = freshnessLine(provenance.capturedAt, now);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className={`flex items-stretch overflow-hidden rounded-[4px] border ${live ? "border-line" : "border-sign"}`}
        role="status"
        aria-label={`${live ? "Live data" : `${provenance.label}, not live data`}. ${text}`}
      >
        {!live && <span className="hazard-stripe w-3 shrink-0" aria-hidden="true" />}
        <span className="flex flex-wrap items-center gap-x-2 px-2.5 py-1 text-[14px]">
          <strong className={live ? "" : "text-ink dark:text-sign"}>{live ? "Live data" : `${provenance.label}, not live`}</strong>
          <span className={FRESHNESS_TONE[freshness]} data-freshness={freshness}>
            {text}
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={data.refresh}
        disabled={data.isRefreshing}
        aria-busy={data.isRefreshing}
        className="flex h-10 items-center gap-1.5 rounded-[4px] border border-line px-3 text-[14px] font-bold hover:bg-raised disabled:cursor-progress disabled:opacity-70"
      >
        <RefreshIcon spinning={data.isRefreshing} />
        {data.isRefreshing ? "Refreshing…" : "Refresh"}
      </button>
      {data.lastSuccessAt !== null && <span className="text-[13px] text-muted">Checked {formatTime(data.lastSuccessAt)}</span>}
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
