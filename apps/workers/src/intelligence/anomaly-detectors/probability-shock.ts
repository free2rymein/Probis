import type { IntelligenceConfig } from "../config";
import { scoreProbabilityShock } from "../scoring";
import type { AggregatePoint, AnalysisMarket, AnomalyCandidate } from "../types";

type WindowDefinition = {
  label: "5m" | "15m" | "60m";
  minutes: number;
  threshold: number;
};

const findAtOrBefore = (points: AggregatePoint[], target: number) =>
  points.find((point) => point.bucket.getTime() <= target);

export const detectProbabilityShock = (
  market: AnalysisMarket,
  aggregates: AggregatePoint[],
  config: IntelligenceConfig
): AnomalyCandidate | null => {
  const latest = aggregates[0];
  if (!latest || aggregates.length < 6) return null;

  const windows: WindowDefinition[] = [
    {
      label: "5m",
      minutes: 5,
      threshold: config.probabilityShockThresholds.fiveMinutes
    },
    {
      label: "15m",
      minutes: 15,
      threshold: config.probabilityShockThresholds.fifteenMinutes
    },
    {
      label: "60m",
      minutes: 60,
      threshold: config.probabilityShockThresholds.sixtyMinutes
    }
  ];

  const moves = windows.map((window) => {
    const target = latest.bucket.getTime() - window.minutes * 60_000;
    const previous = findAtOrBefore(aggregates, target);
    return {
      ...window,
      previousProbability: previous?.close ?? null,
      move: previous ? latest.close - previous.close : null
    };
  });

  const triggered = moves.filter(
    (move) => move.move !== null && Math.abs(move.move) >= move.threshold
  );
  if (triggered.length === 0) return null;

  const primary = triggered.reduce((best, next) =>
    Math.abs(next.move ?? 0) > Math.abs(best.move ?? 0) ? next : best
  );
  const { severityScore, confidenceScore } = scoreProbabilityShock({
    largestMove: Math.abs(primary.move ?? 0),
    fastestWindowMinutes: Math.min(...triggered.map((move) => move.minutes)),
    bucketCount: aggregates.length,
    confirmedWindows: triggered.length
  });

  const direction = (primary.move ?? 0) > 0 ? "up" : "down";

  return {
    anomalyType: "probability_shock",
    marketId: market.id,
    severityScore,
    confidenceScore,
    detectedAt: latest.bucket,
    walletAddresses: [],
    summary: `${market.title} probability moved ${direction} ${(
      Math.abs(primary.move ?? 0) * 100
    ).toFixed(1)}pp over ${primary.label}.`,
    metadata: {
      previous_probability: primary.previousProbability,
      current_probability: latest.close,
      move_5m: moves.find((move) => move.label === "5m")?.move,
      move_15m: moves.find((move) => move.label === "15m")?.move,
      move_60m: moves.find((move) => move.label === "60m")?.move,
      window_used: primary.label,
      latest_bucket: latest.bucket.toISOString()
    }
  };
};
