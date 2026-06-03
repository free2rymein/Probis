import Link from "next/link";
import { ArrowUpRight, CalendarDays, Droplets, TrendingUp } from "lucide-react";
import type { MarketListItem } from "@probis/types";
import { formatCompactCurrency, formatDate, formatTimestamp } from "@/lib/format";
import { MarketOutcomeRow } from "./market-outcome-row";

export function MarketCard({ market }: { market: MarketListItem }) {
  return (
    <Link href={`/markets/${market.id}`} className="group flex min-h-[310px] flex-col rounded-md border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-sm bg-secondary px-2 py-1 text-[11px] font-semibold text-muted-foreground">{market.primaryCategory?.name ?? "Other"}</span>
        <ArrowUpRight size={16} className="text-muted-foreground transition group-hover:text-foreground" />
      </div>
      <h2 className="mt-4 line-clamp-3 min-h-[66px] text-[15px] font-semibold leading-[22px]">{market.title}</h2>
      {market.tags.length > 0 && <div className="mt-3 flex gap-1.5 overflow-hidden">{market.tags.slice(0, 2).map((tag) => <span key={`${tag.source}-${tag.id}`} className="truncate rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{tag.label}</span>)}</div>}
      <div className="mt-4 space-y-3">
        {market.outcomes.slice(0, 2).map((outcome) => <MarketOutcomeRow key={outcome.id} outcome={outcome} compact />)}
        {market.outcomes.length === 0 && <p className="text-sm text-muted-foreground">Outcome data unavailable</p>}
      </div>
      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border pt-4">
        <Metric icon={<TrendingUp size={13} />} label="Volume" value={formatCompactCurrency(market.latestMetrics.volume)} />
        <Metric icon={<Droplets size={13} />} label="Liquidity" value={formatCompactCurrency(market.latestMetrics.liquidity)} />
        <Metric icon={<CalendarDays size={13} />} label="Resolves" value={formatDate(market.endDate)} />
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Updated {formatTimestamp(market.updatedAt)}</p>
    </Link>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="min-w-0"><span className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">{icon}{label}</span><p className="mt-1 truncate text-xs font-semibold">{value}</p></div>;
}
