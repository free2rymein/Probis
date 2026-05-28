"use client";

import { AlertCircle, BellRing, Clock, Database, Radio, TrendingUp } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from "@probis/ui";
import { formatCompactNumber, formatUsd } from "@probis/shared";
import { useDashboardMetrics, useTimeline } from "@/lib/api/hooks";

const healthVariant = {
  healthy: "success",
  stale: "warning",
  idle: "outline"
} as const;

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
      label: "Volume / 24h",
      value: formatUsd(metrics.volume24h),
      icon: TrendingUp
    },
    {
      label: "Signals / 24h",
      value: formatCompactNumber(metrics.openSignalsCount),
      icon: BellRing
    }
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-xs uppercase">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold">{card.value}</p>
                </div>
                <Icon className="text-muted-foreground h-5 w-5" />
              </CardContent>
            </Card>
          );
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
              <span className="text-muted-foreground">High severity / 24h</span>
              <span className="font-mono">
                {formatCompactNumber(metrics.highSeveritySignalsCount)}
              </span>
            </div>
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
            <div className="border-border flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Latest anomaly</span>
              <span className="font-mono">{latestAnomaly}</span>
            </div>
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
