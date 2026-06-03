"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, ChevronRight, Droplets, Landmark, TrendingUp } from "lucide-react";
import type { MarketHistoryPoint, MarketListItem } from "@probis/types";
import { AppHeader } from "@/components/layout/app-header";
import { Skeleton } from "@/components/ui/skeleton";
import { explorerApi } from "@/lib/api";
import { formatCompactCurrency, formatDate, formatProbability, formatTimestamp } from "@/lib/format";
import { MarketHistoryChart } from "./market-history-chart";
import { MarketOutcomeRow } from "./market-outcome-row";

type Tab = "overview" | "probability" | "volume" | "open-interest" | "outcomes";
const tabs: Array<{ id: Tab; label: string }> = [{ id: "overview", label: "Overview" }, { id: "probability", label: "Probability" }, { id: "volume", label: "Volume" }, { id: "open-interest", label: "Open Interest" }, { id: "outcomes", label: "Outcomes" }];

export function MarketDetailClient({ id }: { id: string }) {
  const [market, setMarket] = useState<MarketListItem | null>(null);
  const [history, setHistory] = useState<MarketHistoryPoint[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    void Promise.all([explorerApi.market(id), explorerApi.history(id).catch(() => [])]).then(([detail, points]) => { setMarket(detail); setHistory(points); }).catch(() => setError(true)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <DetailSkeleton />;
  if (error || !market) return <main className="min-h-screen"><AppHeader /><div className="mx-auto max-w-5xl px-4 py-16 text-center"><h1 className="text-xl font-bold">Market unavailable</h1><p className="mt-2 text-sm text-muted-foreground">This market could not be loaded from the explorer API.</p><Link href="/markets" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-yes"><ArrowLeft size={15} /> Back to markets</Link></div></main>;

  const primary = market.outcomes[0];
  return (
    <main className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto max-w-[1180px] px-4 py-7 sm:px-6">
        <Link href="/markets" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"><ArrowLeft size={15} /> Back to markets</Link>
        <header className="mt-6 border-b border-border pb-6">
          {market.event && <div className="mb-4 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Link href={`/events/${market.event.id}`} className="truncate transition hover:text-foreground">{market.event.title}</Link><ChevronRight size={13} className="shrink-0" /><span className="truncate text-foreground">{market.title}</span></div>}
          <div className="flex flex-wrap gap-2"><span className="rounded-sm bg-secondary px-2 py-1 text-[11px] font-semibold">{market.venue.name}</span><span className="rounded-sm bg-secondary px-2 py-1 text-[11px] font-semibold">{market.primaryCategory?.name ?? "Other"}</span><span className="rounded-sm bg-secondary px-2 py-1 text-[11px] font-semibold capitalize">{market.status}</span>{market.tags.slice(0, 2).map((tag) => <span key={`${tag.source}-${tag.id}`} className="rounded-sm border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground">{tag.label}</span>)}</div>
          <h1 className="mt-4 max-w-4xl text-2xl font-bold leading-8 sm:text-3xl sm:leading-10">{market.title}</h1>
          <p className="mt-3 text-xs text-muted-foreground">Updated {formatTimestamp(market.updatedAt)}</p>
        </header>
        <section className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
          <Metric icon={<TrendingUp size={16} />} label="Volume" value={formatCompactCurrency(market.latestMetrics.volume)} />
          <Metric icon={<Droplets size={16} />} label="Liquidity" value={formatCompactCurrency(market.latestMetrics.liquidity)} />
          <Metric icon={<Landmark size={16} />} label="Open interest" value={market.latestMetrics.openInterest === null ? "Not Available" : formatCompactCurrency(market.latestMetrics.openInterest)} />
          <Metric icon={<CalendarDays size={16} />} label="Resolution" value={formatDate(market.endDate)} />
        </section>
        <section className="mt-6 rounded-md border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase text-muted-foreground">Current probability</p>
          <div className="mt-2 flex items-end gap-3"><span className="text-4xl font-bold tabular-nums text-yes">{formatProbability(primary?.probability ?? market.latestMetrics.probability)}</span><span className="pb-1 text-sm font-semibold text-muted-foreground">{primary?.outcomeName ?? "Primary outcome"}</span></div>
        </section>
        <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-border" aria-label="Market research tabs">{tabs.map((tab) => <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition ${activeTab === tab.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>)}</nav>
        <section className="py-6">
          {activeTab === "overview" && <Overview market={market} history={history} />}
          {activeTab === "probability" && <ChartSection title="Probability history" detail="Historical primary-outcome probability from market snapshots."><MarketHistoryChart history={history} metric="probability" /></ChartSection>}
          {activeTab === "volume" && <ChartSection title="Volume history" detail="Market activity captured during periodic snapshot collection."><MarketHistoryChart history={history} metric="volume" /></ChartSection>}
          {activeTab === "open-interest" && <ChartSection title="Open interest history" detail="Provider-reported open interest when available."><MarketHistoryChart history={history} metric="openInterest" /></ChartSection>}
          {activeTab === "outcomes" && <Outcomes outcomes={market.outcomes} />}
        </section>
      </div>
    </main>
  );
}

function Overview({ market, history }: { market: MarketListItem; history: MarketHistoryPoint[] }) {
  return <div className="grid gap-8 lg:grid-cols-[1fr_340px]"><ChartSection title="Probability history" detail="How the primary market outcome has changed over time."><MarketHistoryChart history={history} metric="probability" /></ChartSection><div className="space-y-4"><div className="rounded-md border border-border bg-card p-5 shadow-sm"><p className="text-[11px] font-bold uppercase text-muted-foreground">Overview</p><h2 className="mt-2 text-base font-bold">Market overview</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{market.description || "A market description has not been provided by the venue."}</p></div><div className="rounded-md border border-border bg-card p-5 shadow-sm"><h2 className="text-base font-bold">Outcomes</h2><div className="mt-4 space-y-4">{market.outcomes.slice(0, 5).map((outcome) => <MarketOutcomeRow key={outcome.id} outcome={outcome} />)}</div></div></div></div>;
}

function Outcomes({ outcomes }: { outcomes: MarketListItem["outcomes"] }) {
  if (outcomes.length === 0) return <p className="text-sm text-muted-foreground">Outcome data is unavailable.</p>;
  return <div><h2 className="text-base font-bold">Market outcomes</h2><div className="mt-4 overflow-hidden rounded-md border border-border">{outcomes.map((outcome) => <div key={outcome.id} className="grid gap-3 border-b border-border bg-card p-4 last:border-0 sm:grid-cols-[1fr_110px_110px_80px] sm:items-center"><MarketOutcomeRow outcome={outcome} compact /><p className="text-xs font-semibold tabular-nums">{formatProbability(outcome.probability)}</p><p className="text-xs font-semibold tabular-nums">{formatCompactCurrency(outcome.volume)}</p><p className="text-xs font-semibold text-muted-foreground">#{outcome.rank + 1}</p></div>)}</div></div>;
}

function ChartSection({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return <div><div className="mb-4"><h2 className="text-base font-bold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div>{children}</div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="bg-card p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">{icon}{label}</div><p className="mt-3 text-base font-bold tabular-nums">{value}</p></div>;
}

function DetailSkeleton() {
  return <main className="min-h-screen"><AppHeader /><div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6"><Skeleton className="h-4 w-28" /><Skeleton className="mt-8 h-8 w-4/5" /><Skeleton className="mt-3 h-8 w-2/3" /><div className="mt-8 grid gap-1 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="mt-10 h-[360px]" /></div></main>;
}
