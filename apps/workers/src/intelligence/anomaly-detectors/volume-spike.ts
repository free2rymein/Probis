import type { IntelligenceConfig } from "../config";
import { scoreVolumeSpike } from "../scoring";
import type { AggregatePoint, AnalysisMarket, AnomalyCandidate } from "../types";

export const detectVolumeSpike = (
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

  const latestVolume = latestFiveMinutes.reduce((sum, point) => sum + point.volume, 0);
  const trailingTotal = trailingHour.reduce((sum, point) => sum + point.volume, 0);
  const trailingFiveMinuteAverage = trailingTotal / Math.max(trailingHour.length / 5, 1);

  if (latestVolume < config.volumeSpikeMinVolume || trailingFiveMinuteAverage <= 0) return null;

  const spikeMultiple = latestVolume / trailingFiveMinuteAverage;
  if (spikeMultiple < config.volumeSpikeMultiple) return null;

  const { severityScore, confidenceScore } = scoreVolumeSpike({
    multiple: spikeMultiple,
    bucketCount: aggregates.length
  });

  return {
    anomalyType: "volume_spike",
    marketId: market.id,
    severityScore,
    confidenceScore,
    detectedAt: latest.bucket,
    walletAddresses: [],
    summary: `${market.title} volume spiked ${spikeMultiple.toFixed(1)}x above the trailing hourly baseline.`,
    metadata: {
      latest_5m_volume: latestVolume,
      trailing_60m_avg_volume: trailingFiveMinuteAverage,
      spike_multiple: spikeMultiple,
      bucket_range: {
        latest_start: new Date(latestStart).toISOString(),
        latest_end: latest.bucket.toISOString(),
        trailing_start: new Date(priorHourStart).toISOString(),
        trailing_end: new Date(priorHourEnd).toISOString()
      }
    }
  };
};
