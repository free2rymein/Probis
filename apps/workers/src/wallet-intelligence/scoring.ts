import type { WalletProfileInput, WalletScores } from "./types";

const clampScore = (score: number) => Math.max(0, Math.min(100, Math.round(score)));
const safeRatio = (value: number, target: number) => Math.min(value / target, 1);

export const scoreWalletProfile = (
  profile: WalletProfileInput,
  minSmartMoneyVolumeUsd: number
): WalletScores => {
  const volumeScore = safeRatio(profile.totalVolumeUsd, minSmartMoneyVolumeUsd * 5) * 28;
  const largeTradeScore = safeRatio(profile.largeTradeCount, 8) * 18;
  const signalScore =
    safeRatio(profile.anomalyTriggerCount + profile.highSignalMarketCount, 6) * 24;
  const breadthScore = safeRatio(profile.activeMarketCount, 12) * 16;
  const consistencyScore = safeRatio(profile.totalTradeCount, 40) * 14;

  const smartMoneyScore = clampScore(
    profile.totalVolumeUsd < minSmartMoneyVolumeUsd
      ? (volumeScore + largeTradeScore + signalScore + breadthScore + consistencyScore) * 0.6
      : volumeScore + largeTradeScore + signalScore + breadthScore + consistencyScore
  );

  const convictionScore = clampScore(
    safeRatio(profile.averageTradeUsd, 1_500) * 35 +
      safeRatio(profile.marketConcentration, 0.65) * 30 +
      safeRatio(profile.largeTradeCount, 5) * 20 +
      safeRatio(profile.totalTradeCount, 20) * 15
  );

  const influenceScore = clampScore(
    safeRatio(profile.maxTradeUsd, 10_000) * 35 +
      safeRatio(profile.anomalyTriggerCount, 5) * 30 +
      safeRatio(profile.highSignalMarketCount, 5) * 20 +
      safeRatio(profile.totalVolumeUsd, minSmartMoneyVolumeUsd * 4) * 15
  );

  return {
    smartMoneyScore,
    convictionScore,
    influenceScore,
    metadata: {
      scoring_version: 1,
      large_trade_count: profile.largeTradeCount,
      average_trade_usd: profile.averageTradeUsd,
      max_trade_usd: profile.maxTradeUsd,
      high_signal_market_count: profile.highSignalMarketCount,
      market_concentration: profile.marketConcentration,
      smart_money_min_volume_usd: minSmartMoneyVolumeUsd
    }
  };
};
