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
  yesBuyVolumeUsd: number;
  noBuyVolumeUsd: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  recent24hVolumeUsd: number;
  recent24hTradeCount: number;
  avgEntryPrice: number;
  avgExitPrice: number;
  profitableMarketProxyCount: number;
  resolvedMarketCount: number;
  specializationTags: string[];
  coordinatedFlowParticipation: boolean;
  proxyPnlUsd: number;
  proxyPnlSampleCount: number;
  proxyPnlResolvedCount: number;
  timingSampleCount: number;
  favorableTimingCount: number;
  poorTimingCount: number;
  repeatedDirectionalMarketCount: number;
};

export type WalletScores = {
  smartMoneyScore: number;
  convictionScore: number;
  influenceScore: number;
  archetype: WalletArchetype;
  metadata: Record<string, unknown>;
};

export type WalletArchetype =
  | "whale"
  | "sniper"
  | "momentum_trader"
  | "high_frequency_scalper"
  | "concentrated_conviction_buyer"
  | "broad_diversified_trader"
  | "emerging_wallet"
  | "inactive_wallet"
  | "low_activity_wallet"
  | "directional_buyer"
  | "directional_seller";

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

export type SmartFlowCandidate = {
  marketId: string;
  marketTitle: string;
  walletAddresses: string[];
  side: "buy" | "sell";
  outcome: string | null;
  tradeCount: number;
  totalVolumeUsd: number;
  maxWalletVolumeUsd: number;
  startedAt: Date;
  endedAt: Date;
  signalKind:
    | "large_concentrated_yes_buying"
    | "high_conviction_accumulation"
    | "unusual_wallet_activity"
    | "synchronized_directional_flow";
};
