"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { AnomalySignal } from "@probis/types";
import { AlertCircle, ArrowDownRight, ArrowLeft, ArrowUpRight, Network, Radar } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@probis/ui";
import { formatCompactNumber, formatUsd } from "@probis/shared";
import { useWalletDetail } from "@/lib/api/hooks";
import { archetypeLabel, shortWalletAddress, walletAlias } from "@/lib/wallet-display";

const formatPercent = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1
  }).format(value);
};

const scoreTone = (value: number | null) => {
  if (value === null) return "outline";
  if (value >= 70) return "success";
  if (value >= 40) return "warning";
  return "outline";
};

const metadataNumber = (metadata: Record<string, unknown>, key: string) => {
  const value = metadata[key];
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const metadataString = (metadata: Record<string, unknown>, key: string) => {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
};

const metadataWallets = (metadata: Record<string, unknown>, fallback: string[]) => {
  const value = metadata.related_wallet_addresses;
  return Array.isArray(value) ? value.map(String).filter(Boolean) : fallback;
};

const anomalyTypeLabel = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const signalLabel = (signalKind: string | null, anomalyType: string) => {
  if (signalKind === "large_concentrated_yes_buying") return "Large concentrated YES buying";
  if (signalKind === "high_conviction_accumulation") return "High-conviction accumulation";
  if (signalKind === "unusual_wallet_activity") return "Unusual wallet activity";
  if (signalKind === "synchronized_directional_flow") return "Synchronized directional flow";
  if (anomalyType === "repeat_whale_activity") return "Repeated whale activity";
  if (anomalyType === "coordinated_wallet_activity") return "Coordinated wallet activity";
  if (anomalyType === "whale_activity") return "Whale-sized trade";
  return anomalyTypeLabel(anomalyType);
};

const anomalyDirection = (anomaly: AnomalySignal) => {
  const side = metadataString(anomaly.metadata, "side");
  const outcome = metadataString(anomaly.metadata, "outcome");
  if (outcome) return `${outcome.toUpperCase()} ${side ?? "flow"}`;
  if (side) return `${side.toUpperCase()} flow`;
  return "direction n/a";
};

const anomalyExplanation = (anomaly: AnomalySignal) => {
  const signalKind = metadataString(anomaly.metadata, "signal_kind");
  const volume = metadataNumber(anomaly.metadata, "total_volume_usd");
  const topWalletShare = metadataNumber(anomaly.metadata, "top_wallet_share");
  const walletCount =
    metadataNumber(anomaly.metadata, "wallet_count") ?? anomaly.walletAddresses.length;
  const tradeCount = metadataNumber(anomaly.metadata, "trade_count");
  const baselineMultiple = metadataNumber(anomaly.metadata, "baseline_multiple");
  const minutes =
    metadataString(anomaly.metadata, "started_at") && metadataString(anomaly.metadata, "ended_at")
      ? Math.max(
          1,
          Math.round(
            (new Date(metadataString(anomaly.metadata, "ended_at") ?? "").getTime() -
              new Date(metadataString(anomaly.metadata, "started_at") ?? "").getTime()) /
              60_000
          )
        )
      : null;

  if (signalKind === "large_concentrated_yes_buying") {
    return `Wallet flow accumulated ${formatUsd(volume ?? 0)} YES${minutes ? ` within ${minutes} minutes` : ""}.`;
  }
  if (signalKind === "high_conviction_accumulation") {
    return `Top wallet controlled ${formatPercent(topWalletShare)} of recent flow, suggesting concentrated conviction.`;
  }
  if (signalKind === "synchronized_directional_flow") {
    return `Flow synchronized with ${formatCompactNumber(walletCount)} active wallets in the same market window.`;
  }
  if (signalKind === "unusual_wallet_activity") {
    return baselineMultiple
      ? `Activity exceeded recent baseline by ${baselineMultiple.toFixed(1)}x.`
      : `${formatCompactNumber(tradeCount ?? 0)} trades concentrated into a short recent window.`;
  }
  return anomaly.summary;
};

const interpretAnomaly = (anomaly: AnomalySignal) => {
  const signalKind = metadataString(anomaly.metadata, "signal_kind");
  const volume =
    metadataNumber(anomaly.metadata, "total_volume_usd") ??
    metadataNumber(anomaly.metadata, "usd_value") ??
    metadataNumber(anomaly.metadata, "max_trade_usd");
  const relatedWallets = metadataWallets(anomaly.metadata, anomaly.walletAddresses);

  return {
    title: signalLabel(signalKind, anomaly.anomalyType),
    direction: anomalyDirection(anomaly),
    volume,
    relatedWallets,
    explanation: anomalyExplanation(anomaly),
    meaningful:
      anomaly.severityScore >= 70
        ? "high impact"
        : anomaly.severityScore >= 45
          ? "meaningful"
          : "watchlist"
  };
};

export function WalletDetailClient({ address }: { address: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const wallet = useWalletDetail(address);
  const focusAnomalies = searchParams.get("section") === "anomalies";

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

  const { profile, metrics, recentTrades } = wallet.data;
  const alias = walletAlias(profile.walletAddress, metrics.archetype);
  const buySellTotal = (metrics.buyVolumeUsd ?? 0) + (metrics.sellVolumeUsd ?? 0);
  const buyShare = buySellTotal > 0 ? (metrics.buyVolumeUsd ?? 0) / buySellTotal : null;
  const yesNoTotal = (metrics.yesBuyVolumeUsd ?? 0) + (metrics.noBuyVolumeUsd ?? 0);
  const yesShare = yesNoTotal > 0 ? (metrics.yesBuyVolumeUsd ?? 0) / yesNoTotal : null;
  const directionalLabel =
    metrics.directionalBiasLabel?.replaceAll("_", " ") ?? "not enough directional flow";
  const categoryFallbackTags = wallet.data.recentMarkets
    .map((market) => market.marketCategory?.toLowerCase() ?? "")
    .flatMap((category) => {
      if (category.includes("crypto")) return ["crypto"];
      if (category.includes("geo")) return ["geopolitics"];
      if (category.includes("macro") || category.includes("finance")) return ["macro"];
      if (category.includes("politic") || category.includes("election")) return ["politics"];
      if (category.includes("tech") || category.includes("ai")) return ["tech_ai"];
      return [];
    });
  const specializationTags = [
    ...new Set(
      metrics.specializationTags.length ? metrics.specializationTags : categoryFallbackTags
    )
  ];
  const smartFlowAnomalies = wallet.data.recentAnomalies.filter((anomaly) =>
    Boolean(metadataString(anomaly.metadata, "signal_kind"))
  );
  const impactedMarkets = new Map<string, { title: string; count: number; maxSeverity: number }>();
  for (const anomaly of wallet.data.recentAnomalies) {
    const current = impactedMarkets.get(anomaly.marketId);
    impactedMarkets.set(anomaly.marketId, {
      title: anomaly.marketTitle,
      count: (current?.count ?? 0) + 1,
      maxSeverity: Math.max(current?.maxSeverity ?? 0, anomaly.severityScore)
    });
  }
  const topImpactedMarket = [...impactedMarkets.values()].sort(
    (a, b) => b.maxSeverity - a.maxSeverity || b.count - a.count
  )[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/wallets">Wallets</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">{archetypeLabel(metrics.archetype)}</Badge>
              <Badge variant="outline">{metrics.archetypeConfidence ?? "low confidence"}</Badge>
              <Badge variant={scoreTone(metrics.recentActivityScore)}>
                activity {metrics.recentActivityScore?.toFixed(0) ?? "n/a"}
              </Badge>
              <Badge variant={scoreTone(metrics.concentrationScore)}>
                concentration {metrics.concentrationScore?.toFixed(0) ?? "n/a"}
              </Badge>
              {metrics.coordinatedFlowParticipation ? (
                <Badge variant="warning">coordinated flow participant</Badge>
              ) : null}
            </div>
            <h2 className="mt-3 text-lg font-semibold" title={profile.walletAddress}>
              {alias}
            </h2>
            <div className="text-muted-foreground mt-1 font-mono text-xs">
              {shortWalletAddress(profile.walletAddress)}
            </div>
            <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
              {metrics.archetypeReason} Smart-money ranking combines conviction, activity,
              concentration, influence, and meaningful volume.
              {metrics.coordinatedFlowParticipation
                ? " This wallet also appears in recent synchronized directional flow."
                : ""}
            </p>
            {specializationTags.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {specializationTags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag.replace("_", "/")}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          <div className="grid min-w-72 grid-cols-2 gap-2 text-sm">
            <div className="border-border rounded-md border p-2">
              <div className="text-muted-foreground text-xs">24h Volume</div>
              <div className="font-mono text-lg">{formatUsd(metrics.recent24hVolumeUsd ?? 0)}</div>
            </div>
            <div className="border-border rounded-md border p-2">
              <div className="text-muted-foreground text-xs">Proxy PnL</div>
              <div
                className={`font-mono text-lg ${
                  (metrics.proxyRealizedPnlUsd ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {metrics.proxyRealizedPnlUsd === null
                  ? "n/a"
                  : formatUsd(metrics.proxyRealizedPnlUsd)}
              </div>
            </div>
            <div className="border-border rounded-md border p-2">
              <div className="text-muted-foreground text-xs">Proxy Win Rate</div>
              <div className="font-mono text-lg">{formatPercent(metrics.proxyWinRate)}</div>
            </div>
            <div className="border-border rounded-md border p-2">
              <div className="text-muted-foreground text-xs">Entry Avg</div>
              <div className="font-mono text-lg">{formatPercent(metrics.avgEntryPrice)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

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

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Behavior Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="border-border flex justify-between rounded-md border p-3">
                <span className="text-muted-foreground">Wallet</span>
                <span className="font-medium" title={profile.walletAddress}>
                  {alias}
                </span>
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
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="border-border flex justify-between rounded-md border p-3">
                <span className="text-muted-foreground">Directional behavior</span>
                <span className="font-medium capitalize">{directionalLabel}</span>
              </div>
              <div className="border-border flex justify-between rounded-md border p-3">
                <span className="text-muted-foreground">Confidence</span>
                <Badge variant="outline">{metrics.archetypeConfidence ?? "low confidence"}</Badge>
              </div>
              <div className="border-border flex justify-between rounded-md border p-3">
                <span className="text-muted-foreground">Coordinated flow</span>
                <Badge variant={metrics.coordinatedFlowParticipation ? "warning" : "outline"}>
                  {metrics.coordinatedFlowParticipation ? "participant" : "not observed"}
                </Badge>
              </div>
              <div className="border-border flex justify-between rounded-md border p-3">
                <span className="text-muted-foreground">Specialization</span>
                <span className="font-medium">
                  {specializationTags.length
                    ? specializationTags.map((tag) => tag.replace("_", "/")).join(", ")
                    : "not enough data"}
                </span>
              </div>
              <div className="border-border rounded-md border p-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Buy / sell balance</span>
                  <span className="font-mono">{formatPercent(buyShare)}</span>
                </div>
                <div className="bg-muted/40 mt-3 h-2 overflow-hidden rounded-full">
                  <div
                    className="h-full bg-emerald-400"
                    style={{ width: `${Math.min(100, (buyShare ?? 0) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="border-border rounded-md border p-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">YES buy share</span>
                  <span className="font-mono">{formatPercent(yesShare)}</span>
                </div>
                <div className="bg-muted/40 mt-3 h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full"
                    style={{ width: `${Math.min(100, (yesShare ?? 0) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anomaly Intelligence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {wallet.data.recentAnomalies.length ? (
              <>
                <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                  <div className="border-border rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">Recent alerts</div>
                    <div className="font-mono text-xl">{wallet.data.recentAnomalies.length}</div>
                  </div>
                  <div className="border-border rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">Smart flow</div>
                    <div className="font-mono text-xl">{smartFlowAnomalies.length}</div>
                  </div>
                  <div className="border-border rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">Max severity</div>
                    <div className="font-mono text-xl">
                      {Math.max(
                        ...wallet.data.recentAnomalies.map((item) => item.severityScore)
                      ).toFixed(0)}
                    </div>
                  </div>
                </div>
                {topImpactedMarket ? (
                  <div className="border-border rounded-md border p-3 text-sm">
                    <div className="text-muted-foreground text-xs">Market impact</div>
                    <div className="mt-1 line-clamp-2 font-medium">{topImpactedMarket.title}</div>
                    <div className="text-muted-foreground mt-1 font-mono text-xs">
                      {topImpactedMarket.count} alert
                      {topImpactedMarket.count === 1 ? "" : "s"} · severity{" "}
                      {topImpactedMarket.maxSeverity.toFixed(0)}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <AlertCircle className="h-4 w-4" />
                No recent wallet-linked anomalies.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div
        id="anomalies"
        className={`grid gap-4 xl:grid-cols-[1.2fr_0.8fr] ${
          focusAnomalies ? "ring-ring ring-offset-background rounded-lg ring-2 ring-offset-2" : ""
        }`}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radar className="h-4 w-4" />
              Recent Anomaly Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {wallet.data.recentAnomalies.length ? (
              wallet.data.recentAnomalies.slice(0, 10).map((anomaly) => {
                const interpreted = interpretAnomaly(anomaly);
                return (
                  <div key={anomaly.id} className="border-border rounded-md border p-3 text-sm">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              interpreted.meaningful === "high impact"
                                ? "danger"
                                : interpreted.meaningful === "meaningful"
                                  ? "warning"
                                  : "outline"
                            }
                          >
                            {interpreted.meaningful}
                          </Badge>
                          <Badge variant="outline">{interpreted.direction}</Badge>
                          <span className="text-muted-foreground font-mono text-xs">
                            {new Date(anomaly.detectedAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-2 font-medium">{interpreted.title}</div>
                        <p className="text-muted-foreground mt-1">{interpreted.explanation}</p>
                      </div>
                      <div className="grid min-w-44 grid-cols-2 gap-2 font-mono text-xs">
                        <div className="border-border rounded border p-2">
                          <div className="text-muted-foreground">Size</div>
                          <div>
                            {interpreted.volume === null ? "n/a" : formatUsd(interpreted.volume)}
                          </div>
                        </div>
                        <div className="border-border rounded border p-2">
                          <div className="text-muted-foreground">Confidence</div>
                          <div>{anomaly.confidenceScore.toFixed(0)}</div>
                        </div>
                      </div>
                    </div>
                    <div className="border-border mt-3 border-t pt-3">
                      <Link
                        href={`/markets/${anomaly.marketId}`}
                        className="line-clamp-1 font-medium hover:underline"
                      >
                        {anomaly.marketTitle}
                      </Link>
                      {interpreted.relatedWallets.length > 1 ? (
                        <div className="text-muted-foreground mt-2 flex flex-wrap gap-1 text-xs">
                          <span>Related wallets:</span>
                          {interpreted.relatedWallets.slice(0, 4).map((walletAddress) => (
                            <span key={walletAddress} className="font-mono">
                              {shortWalletAddress(walletAddress)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState
                title="No anomaly timeline yet"
                description="Wallet-linked anomaly events will appear here when smart-flow detection flags meaningful behavior."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-4 w-4" />
              Smart Flow Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {smartFlowAnomalies.length ? (
              smartFlowAnomalies.slice(0, 6).map((anomaly) => {
                const interpreted = interpretAnomaly(anomaly);
                return (
                  <div key={anomaly.id} className="border-border rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="success">{interpreted.direction}</Badge>
                      <span className="font-mono text-xs">{anomaly.severityScore.toFixed(0)}</span>
                    </div>
                    <div className="mt-2 font-medium">{interpreted.title}</div>
                    <p className="text-muted-foreground mt-1 text-xs">{interpreted.explanation}</p>
                  </div>
                );
              })
            ) : (
              <EmptyState
                title="No smart flow alerts"
                description="Concentrated, synchronized, or unusual flow alerts will appear here."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent Trades</CardTitle>
          </CardHeader>
          <CardContent>
            {recentTrades.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Market</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>USD</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTrades.slice(0, 25).map((trade) => (
                    <TableRow key={trade.id}>
                      <TableCell className="max-w-72 truncate">
                        <Link href={`/markets/${trade.marketId}`} className="hover:underline">
                          {trade.marketTitle}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={trade.side === "buy" ? "success" : "warning"}>
                          {trade.side === "buy" ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {trade.side}
                        </Badge>
                      </TableCell>
                      <TableCell>{trade.outcome ?? "n/a"}</TableCell>
                      <TableCell className="font-mono">{formatPercent(trade.price)}</TableCell>
                      <TableCell className="font-mono">{formatUsd(trade.usdValue)}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {new Date(trade.tradeTimestamp).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title="No recent trades"
                description="Trade-level activity will appear after ingestion records this wallet."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historical Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {wallet.data.dailyStats.length ? (
              wallet.data.dailyStats.slice(0, 14).map((day) => (
                <div key={day.bucketDate} className="border-border rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {new Date(day.bucketDate).toLocaleDateString()}
                    </span>
                    <span className="font-mono">{formatUsd(day.totalVolumeUsd)}</span>
                  </div>
                  <div className="text-muted-foreground mt-1 font-mono text-xs">
                    {formatCompactNumber(day.tradeCount)} trades across{" "}
                    {formatCompactNumber(day.activeMarkets)} markets
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="No daily history"
                description="Daily wallet activity appears after the profiler runs."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top Positions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {wallet.data.recentMarkets.length ? (
            wallet.data.recentMarkets.map((market) => (
              <div
                key={market.marketId}
                className="border-border grid gap-2 rounded-md border px-3 py-2 text-sm md:grid-cols-[1fr_auto_auto]"
              >
                <Link href={`/markets/${market.marketId}`} className="font-medium hover:underline">
                  {market.marketTitle}
                </Link>
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
