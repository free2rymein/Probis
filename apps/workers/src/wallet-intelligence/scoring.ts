import type { WalletArchetype, WalletProfileInput, WalletScores } from "./types";

const clampScore = (score: number) => Math.max(0, Math.min(100, Math.round(score)));
const safeRatio = (value: number, target: number) => Math.min(value / target, 1);

const directionalBias = (profile: WalletProfileInput) => {
  const directionalVolume = profile.yesBuyVolumeUsd + profile.noBuyVolumeUsd;
  if (directionalVolume <= 0) return 0;
  return (profile.yesBuyVolumeUsd - profile.noBuyVolumeUsd) / directionalVolume;
};

const recentActivityScore = (profile: WalletProfileInput) =>
  clampScore(
    safeRatio(profile.recent24hVolumeUsd, profile.totalVolumeUsd * 0.5 || 1) * 60 +
      safeRatio(profile.recent24hTradeCount, 12) * 40
  );

const proxyWinRate = (profile: WalletProfileInput) =>
  profile.resolvedMarketCount > 0
    ? profile.profitableMarketProxyCount / profile.resolvedMarketCount
    : null;

const proxyPnl = (profile: WalletProfileInput) =>
  profile.sellVolumeUsd > 0 || profile.buyVolumeUsd > 0
    ? profile.sellVolumeUsd - profile.buyVolumeUsd
    : null;

const confidenceLabel = (profile: WalletProfileInput) => {
  if (
    profile.totalTradeCount >= 20 &&
    profile.activeMarketCount >= 3 &&
    profile.totalVolumeUsd >= 5_000
  ) {
    return "high confidence";
  }
  if (
    profile.totalTradeCount >= 5 ||
    profile.totalVolumeUsd >= 1_000 ||
    profile.activeMarketCount >= 2
  ) {
    return "medium confidence";
  }
  return "low confidence";
};

const classifyArchetype = (
  profile: WalletProfileInput,
  minSmartMoneyVolumeUsd: number
): WalletArchetype => {
  const concentration = profile.marketConcentration;
  const activity = recentActivityScore(profile);
  const direction = directionalBias(profile);
  const bias = Math.abs(direction);
  const avgTrade = profile.averageTradeUsd;
  const inactiveCutoff = Date.now() - 48 * 60 * 60_000;

  if (profile.lastSeenAt.getTime() < inactiveCutoff && profile.recent24hTradeCount === 0) {
    return "inactive_wallet";
  }

  if (
    profile.maxTradeUsd >= minSmartMoneyVolumeUsd * 3 ||
    profile.totalVolumeUsd >= minSmartMoneyVolumeUsd * 10
  ) {
    return "whale";
  }
  if (profile.totalTradeCount >= 35 && avgTrade < Math.max(500, minSmartMoneyVolumeUsd * 1.5)) {
    return "high_frequency_scalper";
  }
  if (concentration >= 0.55 && bias >= 0.35 && profile.totalVolumeUsd >= minSmartMoneyVolumeUsd) {
    return "concentrated_conviction_buyer";
  }
  if (activity >= 55 && bias >= 0.25) {
    return "momentum_trader";
  }
  if (profile.avgEntryPrice > 0 && profile.avgEntryPrice <= 0.4 && concentration >= 0.35) {
    return "sniper";
  }
  if (direction >= 0.2) return "directional_buyer";
  if (direction <= -0.2) return "directional_seller";
  if (profile.totalTradeCount < 5 || profile.totalVolumeUsd < minSmartMoneyVolumeUsd) {
    return profile.recent24hTradeCount > 0 ? "emerging_wallet" : "low_activity_wallet";
  }
  return "broad_diversified_trader";
};

const buildArchetypeReason = (
  profile: WalletProfileInput,
  archetype: WalletArchetype,
  direction: number
) => {
  const directional =
    direction > 0.2 ? "YES-leaning" : direction < -0.2 ? "NO-leaning" : "balanced";

  if (archetype === "whale") {
    return `Large notional footprint with max trade size near $${Math.round(profile.maxTradeUsd).toLocaleString()}.`;
  }
  if (archetype === "sniper") {
    return `Early-entry profile with average buy price near ${(profile.avgEntryPrice * 100).toFixed(0)}%.`;
  }
  if (archetype === "momentum_trader") {
    return `Recent active ${directional} flow with repeated trades in the current lookback.`;
  }
  if (archetype === "high_frequency_scalper") {
    return `High trade count with smaller average ticket size across active markets.`;
  }
  if (archetype === "concentrated_conviction_buyer") {
    return `Concentrated ${directional} accumulation with above-average market concentration.`;
  }
  if (archetype === "directional_buyer") {
    return `Directional buying bias visible even with a lighter trade sample.`;
  }
  if (archetype === "directional_seller") {
    return `Directional selling or NO-side bias visible in recent flow.`;
  }
  if (archetype === "inactive_wallet") {
    return `Previously observed wallet with no meaningful activity in the latest 24h window.`;
  }
  if (archetype === "emerging_wallet") {
    return `Low-history wallet with enough recent activity to monitor, but not enough for a stronger label.`;
  }
  if (archetype === "low_activity_wallet") {
    return `Low-activity wallet with limited recent evidence; monitor for repeat activity before assigning a stronger label.`;
  }
  return `Diversified activity across multiple markets without a single dominant directional signature.`;
};

export const scoreWalletProfile = (
  profile: WalletProfileInput,
  minSmartMoneyVolumeUsd: number
): WalletScores => {
  const direction = directionalBias(profile);
  const recentScore = recentActivityScore(profile);
  const winRate = proxyWinRate(profile);
  const pnl = proxyPnl(profile);
  const archetype = classifyArchetype(profile, minSmartMoneyVolumeUsd);
  const confidence = confidenceLabel(profile);
  const volumeScore = safeRatio(profile.totalVolumeUsd, minSmartMoneyVolumeUsd * 5) * 28;
  const largeTradeScore = safeRatio(profile.largeTradeCount, 8) * 18;
  const signalScore =
    safeRatio(profile.anomalyTriggerCount + profile.highSignalMarketCount, 6) * 24;
  const breadthScore = safeRatio(profile.activeMarketCount, 12) * 12;
  const consistencyScore = safeRatio(profile.totalTradeCount, 40) * 14;
  const recentActivityContribution = safeRatio(recentScore, 100) * 4;

  const smartMoneyScore = clampScore(
    profile.totalVolumeUsd < minSmartMoneyVolumeUsd
      ? (volumeScore +
          largeTradeScore +
          signalScore +
          breadthScore +
          consistencyScore +
          recentActivityContribution) *
          0.6
      : volumeScore +
          largeTradeScore +
          signalScore +
          breadthScore +
          consistencyScore +
          recentActivityContribution
  );

  const convictionScore = clampScore(
    safeRatio(profile.averageTradeUsd, 1_500) * 35 +
      safeRatio(profile.marketConcentration, 0.65) * 30 +
      safeRatio(Math.abs(direction), 0.65) * 20 +
      safeRatio(profile.largeTradeCount, 5) * 10 +
      safeRatio(profile.totalTradeCount, 20) * 5
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
    archetype,
    metadata: {
      scoring_version: 2,
      archetype,
      archetype_confidence: confidence,
      archetype_reason: buildArchetypeReason(profile, archetype, direction),
      large_trade_count: profile.largeTradeCount,
      average_trade_usd: profile.averageTradeUsd,
      max_trade_usd: profile.maxTradeUsd,
      high_signal_market_count: profile.highSignalMarketCount,
      market_concentration: profile.marketConcentration,
      concentration_score: clampScore(safeRatio(profile.marketConcentration, 0.75) * 100),
      directional_bias: direction,
      directional_bias_label:
        direction > 0.2 ? "yes_biased" : direction < -0.2 ? "no_biased" : "balanced",
      yes_buy_volume_usd: profile.yesBuyVolumeUsd,
      no_buy_volume_usd: profile.noBuyVolumeUsd,
      buy_volume_usd: profile.buyVolumeUsd,
      sell_volume_usd: profile.sellVolumeUsd,
      recent_24h_volume_usd: profile.recent24hVolumeUsd,
      recent_24h_trade_count: profile.recent24hTradeCount,
      recent_activity_score: recentScore,
      avg_entry_price: profile.avgEntryPrice,
      avg_exit_price: profile.avgExitPrice,
      proxy_realized_pnl_usd: pnl,
      proxy_win_rate: winRate,
      profitable_market_proxy_count: profile.profitableMarketProxyCount,
      resolved_market_count: profile.resolvedMarketCount,
      specialization_tags: profile.specializationTags,
      coordinated_flow_participation: profile.coordinatedFlowParticipation,
      smart_money_min_volume_usd: minSmartMoneyVolumeUsd
    }
  };
};
