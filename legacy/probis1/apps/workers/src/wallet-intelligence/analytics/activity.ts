import type { CoordinatedActivityCandidate, WalletMarketInput, WalletProfileInput } from "../types";

export const marketConcentration = (markets: WalletMarketInput[], totalVolumeUsd: number) => {
  if (totalVolumeUsd <= 0) return 0;
  const largestMarketVolume = Math.max(...markets.map((market) => market.totalVolumeUsd), 0);
  return largestMarketVolume / totalVolumeUsd;
};

export const activeWhaleProfiles = (profiles: WalletProfileInput[], whaleThresholdUsd: number) =>
  profiles.filter(
    (profile) =>
      profile.maxTradeUsd >= whaleThresholdUsd || profile.totalVolumeUsd >= whaleThresholdUsd * 2
  );

export const summarizeCoActivity = (
  candidates: CoordinatedActivityCandidate[]
): Record<string, unknown> => ({
  candidate_count: candidates.length,
  markets: candidates.slice(0, 5).map((candidate) => ({
    market_id: candidate.marketId,
    wallets: candidate.walletAddresses.length,
    trade_count: candidate.tradeCount,
    total_volume_usd: candidate.totalVolumeUsd
  }))
});
