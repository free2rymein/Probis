import type { WorkerConfig } from "../config/env";
import type { DedupePolicy } from "./types";

export type IntelligenceConfig = {
  enabled: boolean;
  intervalMs: number;
  maxMarketsPerRun: number;
  probabilityShockThresholds: {
    fiveMinutes: number;
    fifteenMinutes: number;
    sixtyMinutes: number;
  };
  volumeSpikeMultiple: number;
  volumeSpikeMinVolume: number;
  activitySpikeMultiple: number;
  activitySpikeMinTrades: number;
  whaleTradeUsdThreshold: number;
  dedupeWindowsMs: DedupePolicy;
};

export const createIntelligenceConfig = (config: WorkerConfig): IntelligenceConfig => ({
  enabled: config.INTELLIGENCE_ENABLED,
  intervalMs: config.INTELLIGENCE_INTERVAL_MS,
  maxMarketsPerRun: config.INTELLIGENCE_MAX_MARKETS_PER_RUN,
  probabilityShockThresholds: {
    fiveMinutes: config.PROB_SHOCK_5M_THRESHOLD,
    fifteenMinutes: config.PROB_SHOCK_15M_THRESHOLD,
    sixtyMinutes: config.PROB_SHOCK_60M_THRESHOLD
  },
  volumeSpikeMultiple: config.VOLUME_SPIKE_MULTIPLE,
  volumeSpikeMinVolume: config.VOLUME_SPIKE_MIN_VOLUME,
  activitySpikeMultiple: config.ACTIVITY_SPIKE_MULTIPLE,
  activitySpikeMinTrades: config.ACTIVITY_SPIKE_MIN_TRADES,
  whaleTradeUsdThreshold: config.WHALE_TRADE_USD_THRESHOLD,
  dedupeWindowsMs: {
    probability_shock: 10 * 60_000,
    volume_spike: 10 * 60_000,
    activity_burst: 10 * 60_000,
    whale_activity: 5 * 60_000
  }
});
