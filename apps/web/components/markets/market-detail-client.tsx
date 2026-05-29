"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type {
  MarketProbabilityPoint,
  MarketRecentTrade,
  MarketVolumePoint,
  MarketWalletFlow
} from "@probis/types";
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
import { useMarketDetail } from "@/lib/api/hooks";

type ChartPoint = MarketProbabilityPoint | MarketVolumePoint;
type TimeRange = "1H" | "6H" | "24H";

const RANGE_HOURS: Record<TimeRange, number> = {
  "1H": 1,
  "6H": 6,
  "24H": 24
};

const formatPercent = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "n/a";
  if (value <= 0.001) return "<1%";
  if (value >= 0.999) return ">99%";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1
  }).format(value);
};

const shortWallet = (wallet: string) => `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;

const formatAxisTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));

const formatFullTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));

const formatSignedPercentPoints = (value: number) => {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)} pts`;
};

const getFilteredPoints = <T extends { bucket: string }>(points: T[], range: TimeRange) => {
  if (!points.length) return [];
  const latestTime = new Date(points.at(-1)?.bucket ?? Date.now()).getTime();
  const cutoff = latestTime - RANGE_HOURS[range] * 60 * 60 * 1000;
  const filtered = points.filter((point) => new Date(point.bucket).getTime() >= cutoff);
  return filtered.length >= 2 ? filtered : points.slice(-Math.min(points.length, 2));
};

function MetricCard({
  label,
  value,
  description,
  tone = "neutral"
}: {
  label: string;
  value: string;
  description: string;
  tone?: "positive" | "negative" | "neutral" | "warning";
}) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-red-300"
        : tone === "warning"
          ? "text-amber-300"
          : "text-foreground";

  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          {label}
        </div>
        <div className={`font-mono text-lg font-semibold ${valueClass}`}>{value}</div>
        <p className="text-muted-foreground text-xs leading-5">{description}</p>
      </CardContent>
    </Card>
  );
}

function TimeRangeSelector({
  value,
  onChange
}: {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
}) {
  return (
    <div className="border-border bg-muted/20 inline-flex rounded-md border p-1">
      {(["1H", "6H", "24H"] as TimeRange[]).map((range) => (
        <button
          key={range}
          type="button"
          onClick={() => onChange(range)}
          className={`rounded px-2.5 py-1 text-xs font-medium transition ${
            value === range
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {range}
        </button>
      ))}
    </div>
  );
}

function AnalyticsLineChart({
  points,
  getValue,
  valueLabel,
  formatValue,
  accentClass = "text-primary",
  highlightSpikes = false
}: {
  points: ChartPoint[];
  getValue: (point: ChartPoint) => number;
  valueLabel: string;
  formatValue: (value: number) => string;
  accentClass?: string;
  highlightSpikes?: boolean;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <EmptyState
        title="Not enough history"
        description={`${valueLabel} history will appear after more market activity is ingested.`}
        className="min-h-56"
      />
    );
  }

  const values = points.map(getValue);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = (rawMax - rawMin || Math.max(rawMax, 1)) * 0.12;
  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;
  const span = max - min || 1;
  const width = 720;
  const height = 260;
  const paddingLeft = 54;
  const paddingRight = 18;
  const paddingTop = 18;
  const paddingBottom = 34;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const coordinates = points.map((point, index) => {
    const x = paddingLeft + (index / Math.max(1, points.length - 1)) * chartWidth;
    const y = paddingTop + (1 - (getValue(point) - min) / span) * chartHeight;
    return { point, value: getValue(point), x, y };
  });
  const path = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const hovered = hoverIndex === null ? null : coordinates[hoverIndex];
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const spikeThreshold = Math.max(average * 2, average + Math.max(...values) * 0.2);
  const yTicks = [0, 0.5, 1].map((step) => {
    const value = min + (max - min) * step;
    const y = paddingTop + (1 - step) * chartHeight;
    return { value, y };
  });
  const xTicks = [0, Math.floor((points.length - 1) / 2), points.length - 1].map((index) => ({
    index,
    x: coordinates[index]?.x ?? paddingLeft,
    label: formatAxisTime(points[index]?.bucket ?? new Date().toISOString())
  }));

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1))));
    setHoverIndex(index);
  };

  return (
    <div className="space-y-2">
      <div className="relative h-72 w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full overflow-visible"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
          role="img"
          aria-label={`${valueLabel} history chart`}
        >
          {yTicks.map((tick) => (
            <g key={tick.y}>
              <line
                x1={paddingLeft}
                x2={width - paddingRight}
                y1={tick.y}
                y2={tick.y}
                className="stroke-border/60"
                strokeDasharray="4 6"
              />
              <text
                x={paddingLeft - 10}
                y={tick.y + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[11px]"
              >
                {formatValue(tick.value)}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <g key={`${tick.index}-${tick.label}`}>
              <line
                x1={tick.x}
                x2={tick.x}
                y1={paddingTop}
                y2={height - paddingBottom}
                className="stroke-border/30"
              />
              <text
                x={tick.x}
                y={height - 10}
                textAnchor={
                  tick.index === 0 ? "start" : tick.index === points.length - 1 ? "end" : "middle"
                }
                className="fill-muted-foreground text-[11px]"
              >
                {tick.label}
              </text>
            </g>
          ))}
          <polyline
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="2.5"
            points={path}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {highlightSpikes
            ? coordinates
                .filter(({ value }) => value >= spikeThreshold && value > 0)
                .map(({ x, y, value }, index) => (
                  <circle
                    key={`${x}-${index}`}
                    cx={x}
                    cy={y}
                    r={5}
                    className="fill-amber-300/80 stroke-amber-100"
                    aria-label={`Volume spike ${formatValue(value)}`}
                  />
                ))
            : null}
          {hovered ? (
            <g>
              <line
                x1={hovered.x}
                x2={hovered.x}
                y1={paddingTop}
                y2={height - paddingBottom}
                className="stroke-primary/60"
              />
              <circle
                cx={hovered.x}
                cy={hovered.y}
                r={5}
                className="fill-primary stroke-background"
              />
            </g>
          ) : null}
        </svg>
        {hovered ? (
          <div
            className="border-border bg-popover text-popover-foreground pointer-events-none absolute rounded-md border px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${(hovered.x / width) * 100}%`,
              top: `${Math.max(0, hovered.y - 56)}px`,
              transform: hovered.x > width * 0.72 ? "translateX(-100%)" : "translateX(0)"
            }}
          >
            <div className={`font-mono font-semibold ${accentClass}`}>
              {formatValue(hovered.value)}
            </div>
            <div className="text-muted-foreground mt-1 font-mono">
              {formatFullTime(hovered.point.bucket)}
            </div>
          </div>
        ) : null}
      </div>
      <div className="text-muted-foreground flex justify-between font-mono text-xs">
        <span>{formatFullTime(points[0]?.bucket ?? new Date().toISOString())}</span>
        <span>
          Latest {valueLabel}: {formatValue(values.at(-1) ?? 0)}
        </span>
        <span>{formatFullTime(points.at(-1)?.bucket ?? new Date().toISOString())}</span>
      </div>
    </div>
  );
}

const getProbabilitySummary = (points: MarketProbabilityPoint[], range: TimeRange) => {
  if (points.length < 2) {
    return {
      value: "n/a",
      description: "Probability movement needs more YES trade history.",
      tone: "neutral" as const
    };
  }

  const first = points[0]?.yesProbability ?? 0;
  const latest = points.at(-1)?.yesProbability ?? first;
  const delta = latest - first;

  return {
    value: formatSignedPercentPoints(delta),
    description: `YES probability ${delta >= 0 ? "up" : "down"} over the selected ${range} window.`,
    tone:
      delta > 0.01
        ? ("positive" as const)
        : delta < -0.01
          ? ("negative" as const)
          : ("neutral" as const)
  };
};

const getVolumeSummary = (points: MarketVolumePoint[]) => {
  if (points.length < 2) {
    return {
      value: "n/a",
      description: "Volume baseline needs more aggregate history.",
      tone: "neutral" as const
    };
  }

  const latest = points.at(-1)?.volume ?? 0;
  const previous = points.slice(0, -1).map((point) => point.volume);
  const baseline = previous.reduce((sum, value) => sum + value, 0) / Math.max(1, previous.length);
  const ratio = baseline > 0 ? latest / baseline : 0;

  return {
    value: formatUsd(latest),
    description:
      ratio >= 1.75
        ? "Volume elevated vs recent baseline."
        : ratio <= 0.5
          ? "Volume muted vs recent baseline."
          : "Volume near recent baseline.",
    tone: ratio >= 1.75 ? ("warning" as const) : ("neutral" as const)
  };
};

const getWalletSummary = (walletFlows: MarketWalletFlow[]) => {
  const totalFlow = walletFlows.reduce(
    (sum, wallet) => sum + Math.abs(wallet.buyVolumeUsd) + Math.abs(wallet.sellVolumeUsd),
    0
  );
  const topFlow = walletFlows
    .slice(0, 3)
    .reduce(
      (sum, wallet) => sum + Math.abs(wallet.buyVolumeUsd) + Math.abs(wallet.sellVolumeUsd),
      0
    );
  const concentration = totalFlow > 0 ? topFlow / totalFlow : 0;

  return {
    value: totalFlow > 0 ? formatPercent(concentration) : "n/a",
    description:
      totalFlow > 0
        ? `Top wallets account for ${formatPercent(concentration)} of recent flow.`
        : "Wallet concentration will appear after recent trades.",
    tone: concentration >= 0.65 ? ("warning" as const) : ("neutral" as const)
  };
};

const getTradeBiasSummary = (trades: MarketRecentTrade[]) => {
  const yesBuyUsd = trades
    .filter((trade) => trade.side === "buy" && trade.outcome?.toLowerCase() === "yes")
    .reduce((sum, trade) => sum + trade.usdValue, 0);
  const noBuyUsd = trades
    .filter((trade) => trade.side === "buy" && trade.outcome?.toLowerCase() === "no")
    .reduce((sum, trade) => sum + trade.usdValue, 0);
  const sellUsd = trades
    .filter((trade) => trade.side === "sell")
    .reduce((sum, trade) => sum + trade.usdValue, 0);
  const totalDirectional = yesBuyUsd + noBuyUsd + sellUsd;

  if (!totalDirectional) {
    return {
      value: "n/a",
      description: "Recent trade bias needs directional trade flow.",
      tone: "neutral" as const
    };
  }

  const yesBuyShare = yesBuyUsd / totalDirectional;
  const sellShare = sellUsd / totalDirectional;
  const value =
    yesBuyShare >= 0.5
      ? "YES buying"
      : sellShare >= 0.5
        ? "Selling"
        : noBuyUsd > yesBuyUsd
          ? "NO buying"
          : "Mixed";

  return {
    value,
    description:
      value === "YES buying"
        ? "Recent flow is biased toward YES buying."
        : value === "NO buying"
          ? "Recent flow is biased toward NO buying."
          : value === "Selling"
            ? "Recent flow is dominated by sells."
            : "Recent flow is mixed.",
    tone:
      value === "YES buying"
        ? ("positive" as const)
        : value === "NO buying" || value === "Selling"
          ? ("warning" as const)
          : ("neutral" as const)
  };
};

export function MarketDetailClient({ marketId }: { marketId: string }) {
  const detail = useMarketDetail(marketId);
  const [timeRange, setTimeRange] = useState<TimeRange>("6H");
  const data = detail.data;
  const market = data?.market;
  const probabilityHistory = data?.probabilityHistory ?? [];
  const volumeHistory = data?.volumeHistory ?? [];
  const recentTrades = data?.recentTrades ?? [];
  const walletFlows = data?.walletFlows ?? [];
  const rangedProbabilityHistory = useMemo(
    () => getFilteredPoints(probabilityHistory, timeRange),
    [probabilityHistory, timeRange]
  );
  const rangedVolumeHistory = useMemo(
    () => getFilteredPoints(volumeHistory, timeRange),
    [volumeHistory, timeRange]
  );
  const probabilitySummary = getProbabilitySummary(rangedProbabilityHistory, timeRange);
  const volumeSummary = getVolumeSummary(rangedVolumeHistory);
  const walletSummary = getWalletSummary(walletFlows);
  const tradeBiasSummary = getTradeBiasSummary(recentTrades);
  const totalBuyFlow = walletFlows.reduce((sum, wallet) => sum + wallet.buyVolumeUsd, 0);
  const totalSellFlow = walletFlows.reduce((sum, wallet) => sum + wallet.sellVolumeUsd, 0);
  const totalNetFlow = walletFlows.reduce((sum, wallet) => sum + wallet.netFlowUsd, 0);
  const totalWalletFlow = totalBuyFlow + totalSellFlow;
  const buyShare = totalWalletFlow > 0 ? totalBuyFlow / totalWalletFlow : 0;
  const sellShare = totalWalletFlow > 0 ? totalSellFlow / totalWalletFlow : 0;
  const topWalletFlow = walletFlows[0]
    ? Math.abs(walletFlows[0].buyVolumeUsd) + Math.abs(walletFlows[0].sellVolumeUsd)
    : 0;
  const concentration = totalWalletFlow > 0 ? topWalletFlow / totalWalletFlow : 0;

  if (detail.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (detail.isError || !market) {
    return (
      <EmptyState
        title="Market detail unavailable"
        description="The API could not load this market. Confirm the market still exists in the tracked universe."
        action={
          <Button variant="outline" onClick={() => void detail.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/markets">
            <ArrowLeft className="h-4 w-4" />
            Markets
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void detail.refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">#{market.universeRank ?? "-"} tracked</Badge>
                <Badge variant="outline">{market.category}</Badge>
                <Badge variant="outline">{market.source}</Badge>
              </div>
              <h2 className="text-foreground mt-3 max-w-5xl text-lg font-semibold">
                {market.title}
              </h2>
              {market.description ? (
                <p className="text-muted-foreground mt-2 max-w-4xl text-sm">{market.description}</p>
              ) : null}
            </div>
            <div className="grid min-w-72 grid-cols-2 gap-2 text-sm">
              <div className="border-border rounded-md border p-2">
                <div className="text-muted-foreground text-xs">YES %</div>
                <div className="font-mono text-lg">{formatPercent(market.yesProbability)}</div>
              </div>
              <div className="border-border rounded-md border p-2">
                <div className="text-muted-foreground text-xs">Liquidity</div>
                <div className="font-mono text-lg">
                  {market.liquidity === null ? "n/a" : formatUsd(market.liquidity)}
                </div>
              </div>
              <div className="border-border rounded-md border p-2">
                <div className="text-muted-foreground text-xs">Volume</div>
                <div className="font-mono text-lg">{formatUsd(market.volume24h)}</div>
              </div>
              <div className="border-border rounded-md border p-2">
                <div className="text-muted-foreground text-xs">Resolution</div>
                <div className="font-mono text-sm">
                  {market.resolutionDate
                    ? new Date(market.resolutionDate).toLocaleDateString()
                    : "n/a"}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Probability Move"
          value={probabilitySummary.value}
          description={probabilitySummary.description}
          tone={probabilitySummary.tone}
        />
        <MetricCard
          label="Volume Activity"
          value={volumeSummary.value}
          description={volumeSummary.description}
          tone={volumeSummary.tone}
        />
        <MetricCard
          label="Wallet Concentration"
          value={walletSummary.value}
          description={walletSummary.description}
          tone={walletSummary.tone}
        />
        <MetricCard
          label="Trade Bias"
          value={tradeBiasSummary.value}
          description={tradeBiasSummary.description}
          tone={tradeBiasSummary.tone}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>YES Probability</CardTitle>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-muted-foreground text-xs">Current YES</div>
                <div className="font-mono text-sm">{formatPercent(market.yesProbability)}</div>
              </div>
              <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
            </div>
          </CardHeader>
          <CardContent>
            <AnalyticsLineChart
              points={rangedProbabilityHistory}
              getValue={(point) => (point as MarketProbabilityPoint).yesProbability}
              valueLabel="YES"
              formatValue={formatPercent}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Volume</CardTitle>
            <div className="text-right">
              <div className="text-muted-foreground text-xs">Latest</div>
              <div className="font-mono text-sm">
                {formatUsd(rangedVolumeHistory.at(-1)?.volume ?? 0)}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <AnalyticsLineChart
              points={rangedVolumeHistory}
              getValue={(point) => (point as MarketVolumePoint).volume}
              valueLabel="Volume"
              formatValue={formatUsd}
              accentClass="text-amber-300"
              highlightSpikes
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent Trades</CardTitle>
          </CardHeader>
          <CardContent>
            {recentTrades.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>USD</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTrades.map((trade) => (
                    <TableRow key={trade.id}>
                      <TableCell className="font-mono">
                        {shortWallet(trade.walletAddress)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={trade.side === "buy" ? "success" : "warning"}>
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
                description="Trades will appear here once Data API ingestion records activity for this market."
                className="min-h-56"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Wallet Flow</CardTitle>
          </CardHeader>
          <CardContent>
            {walletFlows.length ? (
              <div className="space-y-4">
                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <div className="border-border rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">Net flow</div>
                    <div
                      className={`font-mono text-base ${
                        totalNetFlow >= 0 ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {formatUsd(totalNetFlow)}
                    </div>
                  </div>
                  <div className="border-border rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">Buy / sell</div>
                    <div className="font-mono text-base">
                      {formatPercent(buyShare)} / {formatPercent(sellShare)}
                    </div>
                  </div>
                  <div className="border-border rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">Top wallet</div>
                    <div className="font-mono text-base">{formatPercent(concentration)}</div>
                  </div>
                </div>
                <div className="bg-muted/40 h-2 overflow-hidden rounded-full">
                  <div
                    className="h-full bg-emerald-400/80"
                    style={{ width: `${Math.min(100, buyShare * 100)}%` }}
                  />
                </div>
                {walletFlows.map((wallet) => (
                  <div
                    key={wallet.walletAddress}
                    className="border-border rounded-md border p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-mono">{shortWallet(wallet.walletAddress)}</div>
                        <div className="text-muted-foreground text-xs">
                          {formatCompactNumber(wallet.tradeCount)} trades
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div
                          className={wallet.netFlowUsd >= 0 ? "text-emerald-400" : "text-amber-400"}
                        >
                          {formatUsd(wallet.netFlowUsd)}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          buy {formatUsd(wallet.buyVolumeUsd)} / sell{" "}
                          {formatUsd(wallet.sellVolumeUsd)}
                        </div>
                      </div>
                    </div>
                    <div className="bg-muted/40 mt-3 grid grid-cols-2 overflow-hidden rounded-full">
                      <div
                        className="h-1.5 bg-emerald-400/80"
                        style={{
                          width: `${Math.min(
                            100,
                            (wallet.buyVolumeUsd /
                              Math.max(1, wallet.buyVolumeUsd + wallet.sellVolumeUsd)) *
                              100
                          )}%`
                        }}
                      />
                      <div
                        className="h-1.5 justify-self-end bg-amber-400/80"
                        style={{
                          width: `${Math.min(
                            100,
                            (wallet.sellVolumeUsd /
                              Math.max(1, wallet.buyVolumeUsd + wallet.sellVolumeUsd)) *
                              100
                          )}%`
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No wallet flow yet"
                description="Wallet flow is derived from recent stored trades and will populate after ingestion."
                className="min-h-56"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
