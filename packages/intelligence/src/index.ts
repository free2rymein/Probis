import type { Severity, SignalKind } from "@probis/types";

export const anomalyTypes = [
  "probability_gap",
  "volume_spike",
  "liquidity_drain",
  "wallet_cluster",
  "timeline_discontinuity"
] as const;

export type AnomalyType = (typeof anomalyTypes)[number];

export type IntelligenceScoreInput = {
  confidence: number;
  impact: number;
  recency: number;
};

export type IntelligenceSignal = {
  kind: SignalKind;
  anomalyType: AnomalyType;
  severity: Severity;
  score: number;
  rationale: string;
};

export const clampScore = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

export const calculateIntelligenceScore = (input: IntelligenceScoreInput) => {
  const weighted = input.confidence * 0.45 + input.impact * 0.4 + input.recency * 0.15;
  return clampScore(weighted);
};

export const severityFromScore = (score: number): Severity => {
  if (score >= 90) return "critical";
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  if (score >= 25) return "low";
  return "neutral";
};
