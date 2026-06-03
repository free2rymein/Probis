import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { MarketListItem } from "@probis/types";
import { formatCompactCurrency, formatDate, formatProbability } from "@/lib/format";

export function MarketListRow({ market }: { market: MarketListItem }) {
  const primary = market.outcomes[0];
  return (
    <Link href={`/markets/${market.id}`} className="group grid gap-3 border-b border-border bg-card px-4 py-4 transition hover:bg-secondary/70 md:grid-cols-[minmax(280px,1fr)_100px_100px_100px_100px_110px_20px] md:items-center">
      <div><h2 className="text-sm font-semibold leading-5">{market.title}</h2><p className="mt-1 text-xs text-muted-foreground">{market.primaryCategory?.name ?? "Other"} | {market.venue.name}</p></div>
      <Cell label="Probability" value={formatProbability(primary?.probability ?? market.latestMetrics.probability)} />
      <Cell label="Volume" value={formatCompactCurrency(market.latestMetrics.volume)} />
      <Cell label="Liquidity" value={formatCompactCurrency(market.latestMetrics.liquidity)} />
      <Cell label="Open interest" value={formatCompactCurrency(market.latestMetrics.openInterest)} />
      <Cell label="Resolves" value={formatDate(market.endDate)} />
      <ArrowUpRight size={15} className="hidden text-muted-foreground transition group-hover:text-foreground md:block" />
    </Link>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return <div><span className="text-[10px] font-semibold uppercase text-muted-foreground md:hidden">{label}</span><p className="text-xs font-semibold tabular-nums">{value}</p></div>;
}
