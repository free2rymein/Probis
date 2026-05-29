"use client";

import Link from "next/link";
import { AlertCircle, BellRing, Clock, Database, Radio, TrendingUp } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from "@probis/ui";
import { formatCompactNumber, formatUsd } from "@probis/shared";
import { useDashboardMetrics, useTimeline } from "@/lib/api/hooks";

const healthVariant = {
  healthy: "success",
  stale: "warning",
  idle: "outline"
} as const;

const linkedMetricClass =
  "border-border hover:bg-muted/30 flex items-center justify-between rounded-md border p-3 transition-colors";

export function DashboardClient() {
  const dashboard = useDashboardMetrics();
  const timeline = useTimeline(8);

  if (dashboard.isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
    );
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <EmptyState
        title="Dashboard data unavailable"
        description="The API could not load aggregate-backed metrics. Check the API service and database connection."
      />
    );
  }

  const metrics = dashboard.data;
  const latestAggregate = metrics.latestAggregateBucket
    ? new Date(metrics.latestAggregateBucket).toLocaleTimeString()
    : "none";
  const latestMarketUpdate = metrics.latestMarketUpdate
    ? new Date(metrics.latestMarketUpdate).toLocaleTimeString()
    : "none";
  const latestAnomaly = metrics.latestAnomalyTimestamp
    ? new Date(metrics.latestAnomalyTimestamp).toLocaleTimeString()
    : "none";

  const cards = [
    {
      label: "Tracked markets",
      value: formatCompactNumber(metrics.trackedMarketCount),
      icon: Database
    },
    {
      label: "Active sources",
      value: formatCompactNumber(metrics.activeIngestionCount),
      icon: Radio
    },
    {
      label: "Active universe",
      value: formatCompactNumber(metrics.activeUniverseCount),
      icon: Database
    },
    {
      label: "Volume / 24h",
      value: formatUsd(metrics.volume24h),
      icon: TrendingUp
    },
    {
      label: "Signal candidates / 24h",
      value: formatCompactNumber(metrics.openSignalsCount),
      icon: BellRing,
      href: "/signals?sort=priority"
    },
    {
      label: "Active whales",
      value: formatCompactNumber(metrics.activeWhalesCount),
      icon: TrendingUp
    }
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const content = (
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs uppercase">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold">{card.value}</p>
              </div>
              <Icon className="text-muted-foreground h-5 w-5" />
            </CardContent>
          );

          if ("href" in card) {
            return (
              <Link key={card.label} href={card.href} className="block">
                <Card className="hover:bg-muted/30 cursor-pointer transition-colors">
                  {content}
                </Card>
              </Link>
            );
          }

          return <Card key={card.label}>{content}</Card>;
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Ingestion Health</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Worker status</span>
              <Badge variant={healthVariant[metrics.ingestionHealth]}>
                {metrics.ingestionHealth}
              </Badge>
            </div>
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Open markets</span>
              <span className="font-mono">{formatCompactNumber(metrics.openMarketCount)}</span>
            </div>
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Universe avg liquidity</span>
              <span className="font-mono">{formatUsd(metrics.activeUniverseAvgLiquidity)}</span>
            </div>
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Universe avg volume</span>
              <span className="font-mono">{formatUsd(metrics.activeUniverseAvgVolume24h)}</span>
            </div>
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Top quality market</span>
              <span className="max-w-48 truncate font-mono">
                {metrics.topMarketByQualityScore ?? "none"}
              </span>
            </div>
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Top categories</span>
              <span className="max-w-56 truncate font-mono">
                {metrics.topCategories.length
                  ? metrics.topCategories
                      .map((category) => `${category.category} ${category.count}`)
                      .join(", ")
                  : "none"}
              </span>
            </div>
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Tier mix</span>
              <span className="max-w-56 truncate font-mono">
                {metrics.tierDistribution.length
                  ? metrics.tierDistribution.map((tier) => `${tier.tier} ${tier.count}`).join(", ")
                  : "none"}
              </span>
            </div>
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Top repricing</span>
              <span className="max-w-48 truncate font-mono">
                {metrics.topRepricingMarkets[0]?.title ?? "none"}
              </span>
            </div>
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Top narrative</span>
              <span className="max-w-48 truncate font-mono">
                {metrics.topNarrativeMarkets[0]?.title ?? "none"}
              </span>
            </div>
            <Link href="/signals?sort=priority" className={linkedMetricClass}>
              <span className="text-muted-foreground">Total signals / 24h</span>
              <span className="font-mono">{formatCompactNumber(metrics.openSignalsCount)}</span>
            </Link>
            <Link href="/signals?confidence=high&sort=priority" className={linkedMetricClass}>
              <span className="text-muted-foreground">High confidence signals</span>
              <span className="font-mono">
                {formatCompactNumber(metrics.highSeveritySignalsCount)}
              </span>
            </Link>
            <Link href="/signals?confidence=critical&sort=priority" className={linkedMetricClass}>
              <span className="text-muted-foreground">Critical confidence</span>
              <span className="font-mono">open</span>
            </Link>
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Top smart wallet</span>
              <span className="font-mono">
                {metrics.topSmartMoneyWallet
                  ? `${metrics.topSmartMoneyWallet.slice(0, 6)}...${metrics.topSmartMoneyWallet.slice(-4)}`
                  : "none"}
              </span>
            </div>
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Top smart score</span>
              <span className="font-mono">{metrics.topSmartMoneyScore?.toFixed(0) ?? "none"}</span>
            </div>
            <Link
              href="/signals?anomalyType=whale_activity&sort=priority"
              className={linkedMetricClass}
            >
              <span className="text-muted-foreground">Whale alerts / 24h</span>
              <span className="font-mono">
                {formatCompactNumber(metrics.recentWhaleAlertsCount)}
              </span>
            </Link>
            <Link
              href="/signals?anomalyType=coordinated_wallet_activity&lifecycle=active&sort=priority"
              className={linkedMetricClass}
            >
              <span className="text-muted-foreground">Coordinated / 24h</span>
              <span className="font-mono">
                {formatCompactNumber(metrics.coordinatedActivityCount)}
              </span>
            </Link>
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Trades / 5m</span>
              <span className="font-mono">
                {formatCompactNumber(metrics.recentTradeThroughput5m)}
              </span>
            </div>
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Trades / 1m</span>
              <span className="font-mono">
                {formatCompactNumber(metrics.recentTradeThroughput1m)}
              </span>
            </div>
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Latest aggregate
              </span>
              <span className="font-mono">{latestAggregate}</span>
            </div>
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Latest market update</span>
              <span className="font-mono">{latestMarketUpdate}</span>
            </div>
            <Link href="/signals?lifecycle=active&sort=priority" className={linkedMetricClass}>
              <span className="text-muted-foreground">Latest anomaly</span>
              <span className="font-mono">{latestAnomaly}</span>
            </Link>
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Timeline / 1h</span>
              <span className="font-mono">
                {formatCompactNumber(metrics.recentTimelineEvents1h)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {metrics.crossMarketClusters.length ? (
              <div className="border-border mb-3 rounded-md border p-3">
                <div className="text-muted-foreground text-xs uppercase tracking-wide">
                  Thematic Clusters
                </div>
                <div className="mt-2 space-y-2">
                  {metrics.crossMarketClusters.slice(0, 4).map((cluster) => (
                    <Link
                      key={cluster.cluster}
                      href="/signals?sort=priority"
                      className="hover:bg-muted/30 flex items-center justify-between rounded border px-2 py-1.5 transition-colors"
                    >
                      <span className="text-sm">{cluster.cluster}</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {cluster.marketCount} mkts / {cluster.signalCount} sigs
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            {timeline.isError ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <AlertCircle className="h-4 w-4" />
                Timeline temporarily unavailable.
              </div>
            ) : timeline.data?.items.length ? (
              timeline.data.items.map((event) => (
                <div key={event.id} className="border-border rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground uppercase">{event.eventType}</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {new Date(event.eventTimestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="No recent replay events"
                description="Timeline activity will appear as ingestion writes replay-ready events."
                className="min-h-32"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
