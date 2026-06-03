import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { EventListItem } from "@probis/types";
import { formatCompactCurrency, formatDate, formatProbability } from "@/lib/format";

export function EventListRow({ event }: { event: EventListItem }) {
  const primary = event.leaderOutcome;
  return (
    <Link href={`/events/${event.id}`} className="group grid gap-3 border-b border-border bg-card px-4 py-4 transition hover:bg-secondary/70 md:grid-cols-[minmax(300px,1fr)_100px_100px_100px_100px_110px_20px] md:items-center">
      <div><h2 className="text-sm font-semibold leading-5">{event.title}</h2><p className="mt-1 text-xs text-muted-foreground">{event.primaryCategory?.name ?? "Other"} | {event.marketCount} markets</p></div>
      <Cell label="Leader" value={primary ? `${primary.title} ${formatProbability(primary.probability)}` : "n/a"} />
      <Cell label="Volume" value={formatCompactCurrency(event.volume)} />
      <Cell label="24h volume" value={formatCompactCurrency(event.volume24h)} />
      <Cell label="Liquidity" value={formatCompactCurrency(event.liquidity)} />
      <Cell label="Resolves" value={formatDate(event.endDate)} />
      <ArrowUpRight size={15} className="hidden text-muted-foreground transition group-hover:text-foreground md:block" />
    </Link>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return <div><span className="text-[10px] font-semibold uppercase text-muted-foreground md:hidden">{label}</span><p className="text-xs font-semibold tabular-nums">{value}</p></div>;
}
