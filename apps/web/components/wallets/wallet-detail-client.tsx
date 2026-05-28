"use client";

import { AlertCircle } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from "@probis/ui";
import { formatCompactNumber, formatUsd } from "@probis/shared";
import { useWalletDetail } from "@/lib/api/hooks";

const shortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

export function WalletDetailClient({ address }: { address: string }) {
  const wallet = useWalletDetail(address);

  if (wallet.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (wallet.isError || !wallet.data) {
    return (
      <EmptyState
        title="Wallet profile unavailable"
        description="This wallet has not been profiled yet, or the wallet intelligence API is unavailable."
      />
    );
  }

  const { profile } = wallet.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Smart money", profile.smartMoneyScore.toFixed(0)],
          ["Conviction", profile.convictionScore.toFixed(0)],
          ["Influence", profile.influenceScore.toFixed(0)],
          ["Volume", formatUsd(profile.totalVolumeUsd)]
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent>
              <p className="text-muted-foreground text-xs uppercase">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Score Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="border-border flex justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Wallet</span>
              <span className="font-mono">{shortAddress(profile.walletAddress)}</span>
            </div>
            <div className="border-border flex justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Trades</span>
              <span className="font-mono">{formatCompactNumber(profile.totalTradeCount)}</span>
            </div>
            <div className="border-border flex justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Active markets</span>
              <span className="font-mono">{formatCompactNumber(profile.activeMarketCount)}</span>
            </div>
            <div className="border-border flex justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Anomaly triggers</span>
              <Badge variant={profile.anomalyTriggerCount > 0 ? "warning" : "outline"}>
                {profile.anomalyTriggerCount}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Anomalies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {wallet.data.recentAnomalies.length ? (
              wallet.data.recentAnomalies.map((anomaly) => (
                <div key={anomaly.id} className="border-border rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="outline">{anomaly.anomalyType.replaceAll("_", " ")}</Badge>
                    <span className="font-mono text-xs">{anomaly.severityScore.toFixed(0)}</span>
                  </div>
                  <p className="text-muted-foreground mt-2 line-clamp-2 text-xs">
                    {anomaly.summary}
                  </p>
                </div>
              ))
            ) : (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <AlertCircle className="h-4 w-4" />
                No recent wallet-linked anomalies.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Markets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {wallet.data.recentMarkets.length ? (
            wallet.data.recentMarkets.map((market) => (
              <div
                key={market.marketId}
                className="border-border grid gap-2 rounded-md border px-3 py-2 text-sm md:grid-cols-[1fr_auto_auto]"
              >
                <span className="font-medium">{market.marketTitle}</span>
                <span className="font-mono">{formatUsd(market.totalVolumeUsd)}</span>
                <span className="text-muted-foreground font-mono text-xs">
                  {new Date(market.lastTradeAt).toLocaleString()}
                </span>
              </div>
            ))
          ) : (
            <EmptyState
              title="No market activity"
              description="Recent market-level wallet activity will appear after profiler updates."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
