import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader, type ThemeChoice } from "./components/AppHeader.tsx";
import { ClosureDetail } from "./components/ClosureDetail.tsx";
import { ClosureList } from "./components/ClosureList.tsx";
import { DateSelector } from "./components/DateSelector.tsx";
import { FilterBar } from "./components/FilterBar.tsx";
import { appliesOnDay, clampDay, closuresOnDay, firstDayFor, selectableRange, selectionOnDay, ukDayKey, type DayKey } from "./domain/closureDates.ts";
import { refreshNotice } from "./domain/dataStatus.ts";
import { applyFilters, type FilterId } from "./domain/filters.ts";
import { useClosures } from "./hooks/useClosures.ts";
import { useJunctions } from "./hooks/useJunctions.ts";
import { useNow } from "./hooks/useNow.ts";
import { useWideLayout } from "./hooks/useWideLayout.ts";
import { MapView } from "./map/MapView.tsx";
import { hideSplash, SPLASH_MAX_MS } from "./splash.ts";

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
  const wide = useWideLayout();
  // Phones and tablets: the closures list is a drawer over a full-screen map. On desktop it is always shown beside the map.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerModal = !wide && drawerOpen;

  const closures = useMemo(() => data?.closures ?? [], [data]);
  // The chosen day (UK calendar date) decides what the map AND the list show. Null means today, which follows the clock; a chosen
  // day is kept inside the days on offer, so it moves to today after midnight and stays valid when a newer snapshot arrives.
  const today = ukDayKey(now);
  const [chosenDay, setChosenDay] = useState<DayKey | null>(null);
  const range = useMemo(() => selectableRange(closures, today), [closures, today]);
  const day = clampDay(chosenDay, range);
  // One derived view of the snapshot for the day: map, list, counts and filter chips all use it. The snapshot isn't changed or
  // fetched again.
  const dayClosures = useMemo(() => closuresOnDay(closures, day), [closures, day]);
  const visible = useMemo(() => applyFilters(dayClosures, filter, query), [dayClosures, filter, query]);
  const selectedClosure = closures.find((c) => c.id === selectedId) ?? null;
  // Details only for a closure on the chosen day's map and list.
  const selected = selectedClosure && appliesOnDay(selectedClosure.window, day) ? selectedClosure : null;

  const changeDay = (next: DayKey) => {
    setChosenDay(next);
    setSelectedId((id) => selectionOnDay(closures, id, next));
  };

  // A link to one closure (?closure=…) opens on the first day it applies on, once the data has arrived.
  const [linkResolved, setLinkResolved] = useState(false);
  if (!linkResolved && data) {
    setLinkResolved(true);
    if (selectedClosure && !appliesOnDay(selectedClosure.window, day)) {
      const linkedDay = firstDayFor(selectedClosure, range);
      if (linkedDay) setChosenDay(linkedDay);
      else setSelectedId(null);
    }
  }

  // Keep the selected closure in the URL so a link opens it.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId) url.searchParams.set("closure", selectedId);
    else url.searchParams.delete("closure");
    window.history.replaceState(null, "", url);
  }, [selectedId]);

  // Splash: hidden once the closures have loaded and the map has drawn them (or at once if loading failed, so the error shows).
  const dataSettled = Boolean(data || loadError);
  const dataSettledRef = useRef(dataSettled);
  useEffect(() => {
    dataSettledRef.current = dataSettled;
  }, [dataSettled]);
  const [mapSettled, setMapSettled] = useState(false);
  const onMapIdle = useCallback(() => {
    if (dataSettledRef.current) setMapSettled(true);
  }, []);
  useEffect(() => {
    if (loadError || (data && mapSettled)) hideSplash();
  }, [data, loadError, mapSettled]);
  useEffect(() => {
    const backstop = setTimeout(hideSplash, SPLASH_MAX_MS);
    return () => clearTimeout(backstop);
  }, []);

  // Drawer focus: into the drawer when it opens, back to the button that opened it when it closes (not when a closure was picked:
  // focus then goes to its details).
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const detailPanel = useRef<HTMLDivElement>(null);
  const focusAfterClose = useRef<"opener" | "detail">("opener");
  const reopenAfterDetail = useRef(false);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (drawerModal) closeButton.current?.focus();
    else if (wasOpen.current) (focusAfterClose.current === "detail" ? detailPanel.current : openButton.current)?.focus();
    wasOpen.current = drawerModal;
    focusAfterClose.current = "opener";
  }, [drawerModal]);
  useEffect(() => {
    if (!drawerModal) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerModal]);

  const selectFromList = (id: string) => {
    setSelectedId(id);
    if (wide) return;
    // As before on phones: the details replace the list, and closing them brings the list back.
    reopenAfterDetail.current = true;
    focusAfterClose.current = "detail";
    setDrawerOpen(false);
  };
  const selectFromMap = (id: string) => {
    reopenAfterDetail.current = false;
    setSelectedId(id);
  };
  const closeDetail = () => {
    setSelectedId(null);
    if (!wide && reopenAfterDetail.current) setDrawerOpen(true);
    reopenAfterDetail.current = false;
  };

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

  const count = data ? (visible.length === dayClosures.length ? `${dayClosures.length}` : `${visible.length} of ${dayClosures.length}`) : null;

  return (
    <div className="flex h-full flex-col">
      <AppHeader data={closuresState} now={now} query={query} onQueryChange={setQuery} theme={theme} onToggleTheme={toggleTheme} inert={drawerModal} />

      {notice && (
        // A failed refresh is never silent, and never clears the closures already shown.
        <p className="flex items-center gap-2 border-b border-line bg-raised px-4 py-2 text-[14px]" role="alert">
          <span className="hazard-stripe h-4 w-3 shrink-0 rounded-[2px]" aria-hidden="true" />
          {notice}
        </p>
      )}

      {data && <DateSelector range={range} selected={day} today={today} onSelect={changeDay} inert={drawerModal} />}

      <main className="relative flex min-h-0 flex-1">
        <aside
          id="closures-drawer"
          aria-label="Closures"
          role={wide ? undefined : "dialog"}
          aria-modal={drawerModal || undefined}
          inert={!wide && !drawerOpen}
          className={`flex min-h-0 flex-col border-line bg-surface max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-30 max-lg:w-[min(24rem,calc(100%-3.5rem))] max-lg:border-r max-lg:pb-[env(safe-area-inset-bottom)] max-lg:pl-[env(safe-area-inset-left)] max-lg:transition-[translate] max-lg:duration-200 max-lg:ease-out lg:w-[380px] lg:flex-none lg:border-r ${
            // Closed: slid fully off-screen and inert (out of the tab order and the accessibility tree). No visibility toggle, so focus
            // can move straight in when it opens; the shadow is only drawn while open so nothing shows at the screen edge.
            drawerOpen ? "max-lg:shadow-[4px_0_16px_rgb(0_0_0/0.25)]" : "max-lg:-translate-x-full"
          }`}
        >
          <div className="space-y-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="flex-1 text-[17px] font-bold">
                Closures
                {count && <span className="ml-2 font-normal text-muted">{count}</span>}
              </h2>
              <button
                ref={closeButton}
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="-mr-2 grid size-12 place-items-center rounded-[4px] hover:bg-raised lg:hidden"
                aria-label="Close closures list"
              >
                <CloseIcon />
              </button>
            </div>
            {/* Phones and tablets search from here; desktop has the search box in the header. */}
            <label className="block lg:hidden">
              <span className="sr-only">Find a road</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a road, e.g. M6 or A14"
                className="h-11 w-full rounded-[4px] border border-line bg-bg px-3 text-[16px] text-ink placeholder:text-muted"
              />
            </label>
            {data && <FilterBar closures={dayClosures} query={query} active={filter} onChange={setFilter} />}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                emptyDay={dayClosures.length === 0}
                selectedId={selectedId}
                onSelect={selectFromList}
                onClearFilters={() => {
                  setFilter("all");
                  setQuery("");
                }}
              />
            )}
          </div>
        </aside>

        {/* Tap outside the drawer to close it; it also keeps the map from taking gestures meant for the list. */}
        <div
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 z-20 bg-[#0b0e11]/45 transition-opacity duration-200 lg:hidden ${drawerModal ? "opacity-100" : "pointer-events-none opacity-0"}`}
        />

        {/* --ta-map-top-inset keeps the map's own notices clear of the Closures button on phones and tablets. */}
        <section className="relative min-w-0 flex-1 [--ta-map-top-inset:3.75rem] lg:[--ta-map-top-inset:0px]" aria-label="Map" inert={drawerModal}>
          <MapView closures={visible} selected={selected} junctions={junctions} onSelect={selectFromMap} onIdle={onMapIdle} theme={theme} />
          <button
            ref={openButton}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            aria-controls="closures-drawer"
            className="absolute left-[max(0.75rem,env(safe-area-inset-left))] top-3 z-10 flex h-12 items-center gap-2 rounded-[4px] border border-line bg-surface pl-3 pr-4 font-bold shadow-[0_1px_4px_rgb(0_0_0/0.25)] hover:bg-raised lg:hidden"
          >
            <ListIcon />
            Closures
            {count && <span className="font-normal tabular-nums text-muted">{count}</span>}
          </button>
        </section>

        {selected && data && (
          // Desktop: a panel on the right. Phones: a sheet over the lower map (the closure and its diversion stay in view above it),
          // or on the right when the phone is sideways.
          <div
            ref={detailPanel}
            tabIndex={-1}
            className="absolute z-20 border-line bg-surface outline-none max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-[42%] max-lg:rounded-t-[8px] max-lg:border-t max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-[0_-4px_16px_rgb(0_0_0/0.2)] max-lg:landscape:left-auto max-lg:landscape:top-0 max-lg:landscape:w-[min(440px,58%)] max-lg:landscape:rounded-none max-lg:landscape:border-l max-lg:landscape:border-t-0 max-lg:landscape:pr-[env(safe-area-inset-right)] lg:inset-y-0 lg:right-0 lg:w-[440px] lg:border-l lg:shadow-xl"
          >
            <ClosureDetail closure={selected} provenance={data.provenance} onClose={closeDetail} />
          </div>
        )}
      </main>
    </div>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
