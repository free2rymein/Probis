"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Filter, Grid2X2, List, Search, SlidersHorizontal, X } from "lucide-react";
import type { Category, EventListItem, PaginatedResponse } from "@probis/types";
import { AppHeader } from "@/components/layout/app-header";
import { IconButton } from "@/components/ui/icon-button";
import { explorerApi } from "@/lib/api";
import { EventCard } from "@/components/events/event-card";
import { EventListRow } from "@/components/events/event-list-row";
import { MarketCardSkeleton } from "./market-card-skeleton";

type SortKey = "trending" | "volume" | "open-interest" | "newest" | "ending-soon";
type ViewMode = "grid" | "list";

export function MarketsExplorerClient({
  initialVenue = "polymarket",
  initialCategories,
  initialEvents
}: {
  initialVenue?: string;
  initialCategories: Category[] | null;
  initialEvents: PaginatedResponse<EventListItem> | null;
}) {
  const [categories, setCategories] = useState<Category[]>(initialCategories ?? []);
  const [events, setEvents] = useState<EventListItem[]>(initialEvents?.items ?? []);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortKey>("trending");
  const [view, setView] = useState<ViewMode>("grid");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(initialEvents === null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(initialEvents?.pagination.total ?? 0);
  const [nextOffset, setNextOffset] = useState<number | null>(initialEvents?.pagination.nextOffset ?? null);
  const [error, setError] = useState<string | null>(null);
  const skipInitialEventsFetch = useRef(initialEvents !== null);

  useEffect(() => {
    if (initialCategories !== null) return;
    const controller = new AbortController();
    void explorerApi.categories(initialVenue, controller.signal).then(setCategories).catch(() => {
      if (!controller.signal.aborted) setCategories([]);
    });
    return () => controller.abort();
  }, [initialCategories, initialVenue]);

  useEffect(() => {
    if (skipInitialEventsFetch.current) {
      skipInitialEventsFetch.current = false;
      return;
    }
    const params = new URLSearchParams({ venue: initialVenue, limit: "50", offset: "0", sort });
    if (category !== "all") params.set("category", category);
    if (search.trim()) params.set("search", search.trim());
    let controller: AbortController | null = null;
    const timer = setTimeout(() => {
      const requestController = new AbortController();
      controller = requestController;
      setLoading(true);
      setError(null);
      void explorerApi.events(params, requestController.signal).then((data) => {
        setEvents(data.items);
        setTotal(data.pagination.total);
        setNextOffset(data.pagination.nextOffset);
      }).catch(() => {
        if (requestController.signal.aborted) return;
        setEvents([]);
        setTotal(0);
        setNextOffset(null);
        setError("Events are unavailable while the data service is offline.");
      }).finally(() => {
        if (!requestController.signal.aborted) setLoading(false);
      });
    }, 220);
    return () => {
      clearTimeout(timer);
      controller?.abort();
    };
  }, [category, initialVenue, search, sort]);

  const loadMore = () => {
    if (nextOffset === null || loadingMore) return;
    const params = new URLSearchParams({ venue: initialVenue, limit: "50", offset: String(nextOffset), sort });
    if (category !== "all") params.set("category", category);
    if (search.trim()) params.set("search", search.trim());
    setLoadingMore(true);
    void explorerApi.events(params).then((data) => {
      setEvents((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...current, ...data.items.filter((item) => !ids.has(item.id))];
      });
      setTotal(data.pagination.total);
      setNextOffset(data.pagination.nextOffset);
    }).catch(() => setError("More events could not be loaded. Please try again.")).finally(() => setLoadingMore(false));
  };

  const categoryOptions = useMemo(() => {
    const discovered = categories
      .filter((item) => item.marketCount > 0)
      .map((item) => ({ slug: item.slug, name: item.name, count: item.marketCount }));
    const total = discovered.reduce((sum, item) => sum + item.count, 0);
    return [{ slug: "all", name: "All markets", count: total }, ...discovered];
  }, [categories]);

  return (
    <main className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto flex max-w-[1480px]">
        <aside className="hidden w-56 shrink-0 border-r border-border px-4 py-7 lg:block"><Filters options={categoryOptions} selected={category} onSelect={setCategory} /></aside>
        {drawerOpen && <div className="fixed inset-0 z-50 bg-slate-950/35 lg:hidden" onClick={() => setDrawerOpen(false)}><aside className="h-full w-72 bg-card p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="mb-7 flex items-center justify-between"><h2 className="font-bold">Filters</h2><IconButton aria-label="Close filters" onClick={() => setDrawerOpen(false)}><X size={17} /></IconButton></div><Filters options={categoryOptions} selected={category} onSelect={(value) => { setCategory(value); setDrawerOpen(false); }} /></aside></div>}
        <section className="min-w-0 flex-1 px-4 py-7 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div><p className="text-xs font-bold uppercase text-yes">Polymarket</p><h1 className="mt-2 text-2xl font-bold">Market Explorer</h1><p className="mt-1 text-sm text-muted-foreground">{loading ? "Loading events..." : `${events.length} of ${total} event groups`}</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1 sm:w-72"><Search className="pointer-events-none absolute left-3 top-3 text-muted-foreground" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search markets" className="h-10 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20" /></div>
              <button onClick={() => setDrawerOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold lg:hidden"><Filter size={16} /> Filters</button>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Sort markets" className="h-10 rounded-md border border-border bg-card px-3 text-sm font-semibold outline-none focus:border-ring">
                <option value="trending">Trending</option><option value="volume">Volume</option><option value="open-interest">Open Interest</option><option value="newest">Newest</option><option value="ending-soon">Ending Soon</option>
              </select>
              <div className="flex rounded-md border border-border bg-card p-1"><button className={`inline-flex h-8 w-8 items-center justify-center rounded ${view === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground"}`} aria-label="Grid view" onClick={() => setView("grid")}><Grid2X2 size={15} /></button><button className={`inline-flex h-8 w-8 items-center justify-center rounded ${view === "list" ? "bg-secondary text-foreground" : "text-muted-foreground"}`} aria-label="List view" onClick={() => setView("list")}><List size={15} /></button></div>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1 lg:hidden">{categoryOptions.slice(0, 8).map((item) => <button key={item.slug} onClick={() => setCategory(item.slug)} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${category === item.slug ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}>{item.name}</button>)}</div>
          <div className="mt-6">
            {loading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <MarketCardSkeleton key={index} />)}</div> : error ? <EmptyState title="Events are temporarily unavailable" detail={error} /> : events.length === 0 ? <EmptyState title={search ? "No search results" : category !== "all" ? "Category is empty" : "No events found"} detail="Try another search or clear the active category filter." /> : view === "grid" ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{events.map((event) => <EventCard key={event.id} event={event} />)}</div> : <div className="overflow-hidden rounded-md border border-border">{events.map((event) => <EventListRow key={event.id} event={event} />)}</div>}
          </div>
          {!loading && !error && nextOffset !== null && <div className="mt-7 flex justify-center"><button type="button" onClick={loadMore} disabled={loadingMore} className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold transition hover:bg-secondary disabled:cursor-wait disabled:opacity-60">{loadingMore ? "Loading more..." : "Load more"}</button></div>}
        </section>
      </div>
    </main>
  );
}

function Filters({ options, selected, onSelect }: { options: Array<{ slug: string; name: string; count: number }>; selected: string; onSelect: (value: string) => void }) {
  return <div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground"><SlidersHorizontal size={14} /> Categories</div><div className="space-y-1">{options.map((item) => <button key={item.slug} onClick={() => onSelect(item.slug)} className={`flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm transition ${selected === item.slug ? "bg-secondary font-bold text-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"}`}><span>{item.name}</span><span className="text-xs tabular-nums text-muted-foreground">{item.count}</span></button>)}</div></div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-md border border-dashed border-border bg-card px-6 py-16 text-center"><h2 className="font-bold">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{detail}</p></div>;
}
