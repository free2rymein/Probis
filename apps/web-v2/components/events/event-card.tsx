import Link from "next/link";
import { ArrowUpRight, CalendarDays, Droplets, TrendingUp } from "lucide-react";
import type { EventListItem } from "@probis/types";
import { formatCompactCurrency, formatDate, formatProbability, formatTimestamp } from "@/lib/format";

export function EventCard({ event }: { event: EventListItem }) {
  return (
    <Link href={`/events/${event.id}`} className="group flex min-h-[350px] flex-col rounded-md border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-sm bg-secondary px-2 py-1 text-[11px] font-semibold text-muted-foreground">{event.primaryCategory?.name ?? "Other"}</span>
        <ArrowUpRight size={16} className="text-muted-foreground transition group-hover:text-foreground" />
      </div>
      <h2 className="mt-4 line-clamp-3 min-h-[66px] text-[15px] font-semibold leading-[22px]">{event.title}</h2>
      {event.tags.length > 0 && <div className="mt-3 flex gap-1.5 overflow-hidden">{event.tags.slice(0, 2).map((tag) => <span key={tag.id} className="truncate rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{tag.label}</span>)}</div>}
      <div className="mt-4 space-y-3">
        {event.topMarkets.map((market) => <PreviewRow key={market.id} title={market.title} probability={market.probability} />)}
        {event.topMarkets.length === 0 && <p className="text-sm text-muted-foreground">Outcome data unavailable</p>}
        {event.marketCount > event.topMarkets.length && <p className="text-xs font-semibold text-muted-foreground">+{event.marketCount - event.topMarkets.length} more markets</p>}
      </div>
      {event.leaderOutcome && <p className="mt-4 truncate text-xs text-muted-foreground">Leader: <span className="font-semibold text-foreground">{event.leaderOutcome.title} ({formatProbability(event.leaderOutcome.probability)})</span></p>}
      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border pt-4">
        <Metric icon={<TrendingUp size={13} />} label="Volume" value={formatCompactCurrency(event.volume)} />
        <Metric icon={<Droplets size={13} />} label="24h volume" value={formatCompactCurrency(event.volume24h)} />
        <Metric icon={<CalendarDays size={13} />} label="Resolves" value={formatDate(event.endDate)} />
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Updated {formatTimestamp(event.updatedAt)}</p>
    </Link>
  );
}

function PreviewRow({ title, probability }: { title: string; probability: number | null }) {
  const width = Math.max(0, Math.min(1, probability ?? 0)) * 100;
  return <div><div className="flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium">{title}</span><span className="font-semibold tabular-nums">{formatProbability(probability)}</span></div><div className="mt-1 h-1 rounded-full bg-muted"><div className="h-full rounded-full bg-yes" style={{ width: `${width}%` }} /></div></div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="min-w-0"><span className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">{icon}{label}</span><p className="mt-1 truncate text-xs font-semibold">{value}</p></div>;
}
