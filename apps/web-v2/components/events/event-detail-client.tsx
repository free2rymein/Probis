"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, CalendarDays, Droplets, Landmark, TrendingUp, Trophy } from "lucide-react";
import type { EventAssociatedMarket, EventDetail } from "@probis/types";
import { AppHeader } from "@/components/layout/app-header";
import { Skeleton } from "@/components/ui/skeleton";
import { explorerApi } from "@/lib/api";
import { formatCompactCurrency, formatDate, formatPrice, formatProbability, formatProbabilityDelta, formatTimestamp } from "@/lib/format";

export function EventDetailClient({ id }: { id: string }) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    void explorerApi.event(id).then(setEvent).catch(() => setError(true)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <DetailSkeleton />;
  if (error || !event) return <main className="min-h-screen"><AppHeader /><div className="mx-auto max-w-5xl px-4 py-16 text-center"><h1 className="text-xl font-bold">Event unavailable</h1><p className="mt-2 text-sm text-muted-foreground">This event could not be loaded from the explorer API.</p><Link href="/markets" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-yes"><ArrowLeft size={15} /> Back to markets</Link></div></main>;

  return (
    <main className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto max-w-[1180px] px-4 py-7 sm:px-6">
        <Link href="/markets" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"><ArrowLeft size={15} /> Back to markets</Link>
        <header className="mt-6 border-b border-border pb-6">
          <div className="flex flex-wrap gap-2"><span className="rounded-sm bg-secondary px-2 py-1 text-[11px] font-semibold">{event.venue.name}</span><span className="rounded-sm bg-secondary px-2 py-1 text-[11px] font-semibold">{event.primaryCategory?.name ?? "Other"}</span>{event.tags.slice(0, 3).map((tag) => <span key={tag.id} className="rounded-sm border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground">{tag.label}</span>)}</div>
          <h1 className="mt-4 max-w-4xl text-2xl font-bold leading-8 sm:text-3xl sm:leading-10">{event.title}</h1>
          <p className="mt-3 text-xs text-muted-foreground">Updated {formatTimestamp(event.updatedAt)}</p>
        </header>
        <section className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-5">
          <Metric icon={<TrendingUp size={16} />} label="Volume" value={formatCompactCurrency(event.volume)} />
          <Metric icon={<TrendingUp size={16} />} label="24h volume" value={formatCompactCurrency(event.volume24h)} />
          <Metric icon={<Droplets size={16} />} label="Liquidity" value={formatCompactCurrency(event.liquidity)} />
          <Metric icon={<Landmark size={16} />} label="Open interest" value={formatCompactCurrency(event.openInterest)} />
          <Metric icon={<CalendarDays size={16} />} label="Resolution" value={formatDate(event.endDate)} />
        </section>
        <section className="grid gap-8 py-8 lg:grid-cols-[1fr_320px]">
          <div>
            {event.outcomeOrdering === "probability" && <TopContenders markets={event.markets.slice(0, 3)} />}
            <div className={event.outcomeOrdering === "probability" ? "mt-7" : ""}>
              <h2 className="text-lg font-bold">Associated markets</h2>
              <p className="mt-1 text-sm text-muted-foreground">{event.marketCount} active markets in this event group.</p>
              <div className="mt-4 overflow-hidden rounded-md border border-border bg-card shadow-sm">{event.markets.map((market, index) => <MarketRow key={market.id} market={market} rank={event.outcomeOrdering === "probability" ? index + 1 : null} />)}</div>
            </div>
          </div>
          <aside className="space-y-4">
            <div className="rounded-md border border-border bg-card p-5 shadow-sm">
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Overview</p>
              <h2 className="mt-2 text-base font-bold">Event overview</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{event.description || "A description has not been provided by the venue."}</p>
            </div>
            <div className="rounded-md border border-border bg-card p-5 shadow-sm"><h3 className="text-sm font-bold">Market charts</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Open any associated market to inspect its probability, volume, and open-interest history.</p></div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function TopContenders({ markets }: { markets: EventAssociatedMarket[] }) {
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2"><Trophy size={15} className="text-warning" /><h2 className="text-sm font-bold">Top contenders</h2></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">{markets.map((market, index) => <div key={market.id} className="min-w-0 rounded-sm bg-secondary/70 px-3 py-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">#{index + 1}</p><p className="mt-1 truncate text-sm font-semibold">{market.title}</p><p className="mt-2 text-xl font-bold tabular-nums text-yes">{formatProbability(market.yesProbability)}</p></div>)}</div>
    </div>
  );
}

function MarketRow({ market, rank }: { market: EventAssociatedMarket; rank: number | null }) {
  const noProbability = market.noProbability ?? (market.yesProbability === null ? null : 1 - market.yesProbability);
  const probabilityWidth = Math.max(0, Math.min(1, market.yesProbability ?? 0)) * 100;
  const changeTone = market.probabilityChange24h === null ? "text-muted-foreground" : market.probabilityChange24h > 0 ? "text-yes" : market.probabilityChange24h < 0 ? "text-danger" : "text-muted-foreground";
  return (
    <Link href={`/markets/${market.id}`} className="group grid gap-4 border-b border-border bg-card p-4 transition last:border-0 hover:bg-secondary/70 md:grid-cols-[minmax(140px,1fr)_166px_112px_70px_94px_50px_18px] md:items-center">
      <div className="min-w-0"><div className="flex items-center gap-2">{rank !== null && <span className="shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">#{rank}</span>}<h3 className="truncate text-sm font-semibold leading-5">{market.title}</h3></div></div>
      <div><div className="flex items-end justify-between gap-3"><span className="text-[10px] font-bold uppercase text-muted-foreground">YES probability</span><span className="text-xl font-bold leading-none tabular-nums text-yes">{formatProbability(market.yesProbability)}</span></div><div className="mt-2.5 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-yes" style={{ width: `${probabilityWidth}%` }} /></div></div>
      <RowMetric label="Price" value={`YES ${formatPrice(market.yesProbability)} / NO ${formatPrice(noProbability)}`} />
      <RowMetric label="Volume" value={formatCompactCurrency(market.volume)} />
      <RowMetric label="Resolves" value={formatDate(market.endDate)} />
      <RowMetric label="24h change" value={formatProbabilityDelta(market.probabilityChange24h)} valueClassName={changeTone} />
      <ArrowUpRight size={15} className="hidden text-muted-foreground transition group-hover:text-foreground md:block" />
    </Link>
  );
}

function RowMetric({ label, value, valueClassName = "" }: { label: string; value: string; valueClassName?: string }) {
  return <div><p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p><p className={`mt-1 text-xs font-semibold tabular-nums ${valueClassName}`}>{value}</p></div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="bg-card p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">{icon}{label}</div><p className="mt-3 text-base font-bold tabular-nums">{value}</p></div>;
}

function DetailSkeleton() {
  return <main className="min-h-screen"><AppHeader /><div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6"><Skeleton className="h-4 w-28" /><Skeleton className="mt-8 h-8 w-4/5" /><Skeleton className="mt-3 h-8 w-2/3" /><div className="mt-8 grid gap-1 sm:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="mt-10 h-[360px]" /></div></main>;
}
