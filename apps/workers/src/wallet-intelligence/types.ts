export type WalletProfileInput = {
  walletAddress: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  totalVolumeUsd: number;
  totalTradeCount: number;
  activeMarketCount: number;
  largeTradeCount: number;
  averageTradeUsd: number;
  maxTradeUsd: number;
  anomalyTriggerCount: number;
  highSignalMarketCount: number;
  marketConcentration: number;
};

export type WalletScores = {
  smartMoneyScore: number;
  convictionScore: number;
  influenceScore: number;
  metadata: Record<string, unknown>;
};

export type WalletMarketInput = {
  walletAddress: string;
  marketId: string;
  totalVolumeUsd: number;
  tradeCount: number;
  netPositionEstimate: number;
  lastTradeAt: Date;
};

export type WalletDailyInput = {
  walletAddress: string;
  bucketDate: Date;
  totalVolumeUsd: number;
  tradeCount: number;
  activeMarkets: number;
  anomalyCount: number;
};

export type CoordinatedActivityCandidate = {
  marketId: string;
  walletAddresses: string[];
  tradeCount: number;
  totalVolumeUsd: number;
  startedAt: Date;
  endedAt: Date;
};
