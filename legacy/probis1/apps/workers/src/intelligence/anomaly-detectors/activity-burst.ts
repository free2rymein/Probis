import type { IntelligenceConfig } from "../config";
import { scoreActivityBurst } from "../scoring";
import type { AggregatePoint, AnalysisMarket, AnomalyCandidate } from "../types";

export const detectActivityBurst = (
  market: AnalysisMarket,
  aggregates: AggregatePoint[],
  config: IntelligenceConfig
): AnomalyCandidate | null => {
  const latest = aggregates[0];
  if (!latest || aggregates.length < 18) return null;

  const latestStart = latest.bucket.getTime() - 4 * 60_000;
  const latestFiveMinutes = aggregates.filter((point) => point.bucket.getTime() >= latestStart);
  const priorHourStart = latest.bucket.getTime() - 65 * 60_000;
  const priorHourEnd = latest.bucket.getTime() - 5 * 60_000;
  const trailingHour = aggregates.filter((point) => {
    const bucketMs = point.bucket.getTime();
    return bucketMs >= priorHourStart && bucketMs <= priorHourEnd;
  });

  if (latestFiveMinutes.length < 3 || trailingHour.length < 12) return null;

  const latestTradeCount = latestFiveMinutes.reduce((sum, point) => sum + point.tradeCount, 0);
  const trailingTotal = trailingHour.reduce((sum, point) => sum + point.tradeCount, 0);
  const trailingFiveMinuteAverage = trailingTotal / Math.max(trailingHour.length / 5, 1);

  if (latestTradeCount < config.activitySpikeMinTrades || trailingFiveMinuteAverage <= 0) {
    return null;
  }

  const spikeMultiple = latestTradeCount / trailingFiveMinuteAverage;
  if (spikeMultiple < config.activitySpikeMultiple) return null;

  const { severityScore, confidenceScore } = scoreActivityBurst({
    multiple: spikeMultiple,
    bucketCount: aggregates.length
  });

  return {
    anomalyType: "activity_burst",
    marketId: market.id,
    severityScore,
    confidenceScore,
    detectedAt: latest.bucket,
    walletAddresses: [],
    summary: `${market.title} activity jumped ${spikeMultiple.toFixed(1)}x above the trailing hourly baseline.`,
    metadata: {
      latest_5m_trade_count: latestTradeCount,
      trailing_avg_trade_count: trailingFiveMinuteAverage,
      spike_multiple: spikeMultiple
    }
  };
};
