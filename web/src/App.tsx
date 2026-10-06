import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader, type ThemeChoice } from "./components/AppHeader.tsx";
import { ClosureDetail } from "./components/ClosureDetail.tsx";
import { ClosureList } from "./components/ClosureList.tsx";
import { FilterBar } from "./components/FilterBar.tsx";
import { refreshNotice } from "./domain/dataStatus.ts";
import { applyFilters, type FilterId } from "./domain/filters.ts";
import { useClosures } from "./hooks/useClosures.ts";
import { useJunctions } from "./hooks/useJunctions.ts";
import { useNow } from "./hooks/useNow.ts";
import { MapView } from "./map/MapView.tsx";

const NO_JUNCTIONS: never[] = [];
const readSelectedFromUrl = (): string | null => new URLSearchParams(window.location.search).get("closure");

export function App() {
  const closuresState = useClosures();
  const { snapshot: data, isLoading, loadError } = closuresState;
  const now = useNow();
  const notice = refreshNotice(closuresState);
  // Junction labels are optional context: without them the map still shows closures and diversions.
  const junctions = useJunctions().data?.junctions ?? NO_JUNCTIONS;
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(readSelectedFromUrl);
  const [theme, setTheme] = useState<ThemeChoice>(() => (document.documentElement.dataset["theme"] === "light" ? "light" : "dark"));

  const closures = useMemo(() => data?.closures ?? [], [data]);
  const visible = useMemo(() => applyFilters(closures, filter, query), [closures, filter, query]);
  const selected = closures.find((c) => c.id === selectedId) ?? null;

  // Keep the selected closure in the URL so a link opens it.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId) url.searchParams.set("closure", selectedId);
    else url.searchParams.delete("closure");
    window.history.replaceState(null, "", url);
  }, [selectedId]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      document.documentElement.dataset["theme"] = next;
      try {
        localStorage.setItem("ta-theme", next);
      } catch {
        // Storage can be unavailable (private mode). The theme still applies for this visit.
      }
      return next;
    });
  }, []);

  return (
    <div className="flex h-full flex-col">
      <AppHeader data={closuresState} now={now} query={query} onQueryChange={setQuery} theme={theme} onToggleTheme={toggleTheme} />

      {notice && (
        // A failed refresh is never silent, and never clears the closures already shown.
        <p className="flex items-center gap-2 border-b border-line bg-raised px-4 py-2 text-[14px]" role="alert">
          <span className="hazard-stripe h-4 w-3 shrink-0 rounded-[2px]" aria-hidden="true" />
          {notice}
        </p>
      )}

      <main className="relative flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <aside className="flex min-h-0 flex-1 flex-col border-line bg-surface md:w-[380px] md:flex-none md:border-r" aria-label="Closures">
          <div className="space-y-3 border-b border-line px-4 py-3">
            <h2 className="text-[17px] font-bold">
              Closures
              {data && <span className="ml-2 font-normal text-muted">{visible.length === closures.length ? closures.length : `${visible.length} of ${closures.length}`}</span>}
            </h2>
            {data && <FilterBar closures={closures} query={query} active={filter} onChange={setFilter} />}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading && <p className="px-4 py-6 text-muted">Loading closures…</p>}
            {loadError && (
              <div className="px-4 py-6" role="alert">
                <p className="font-bold">Closures couldn't be loaded.</p>
                <p className="mt-1 text-[14px] text-muted">{loadError.message}</p>
                <button type="button" onClick={closuresState.refresh} className="mt-3 rounded-[4px] border border-line px-3 py-1.5 font-bold hover:bg-raised">
                  Try again
                </button>
              </div>
            )}
            {data && (
              <ClosureList
                closures={visible}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onClearFilters={() => {
                  setFilter("all");
                  setQuery("");
                }}
              />
            )}
          </div>
        </aside>

        <section className="h-[45vh] flex-none md:h-auto md:flex-1" aria-label="Map">
          <MapView closures={visible} selected={selected} junctions={junctions} onSelect={setSelectedId} theme={theme} />
        </section>

        {selected && data && (
          // Phones: the panel replaces the list below the map, so the closure and its diversion arrows stay in view.
          <div className="absolute inset-x-0 bottom-0 top-[45vh] z-20 border-t border-line bg-surface md:inset-y-0 md:left-auto md:right-0 md:top-0 md:w-[440px] md:border-l md:border-t-0 md:shadow-xl">
            <ClosureDetail closure={selected} provenance={data.provenance} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </main>
    </div>
  );
}
