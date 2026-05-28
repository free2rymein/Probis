import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type {
  alerts,
  anomalyEvents,
  marketAggregates1m,
  marketTimeline,
  markets,
  narrativeEvents,
  trades,
  walletDailyStats,
  walletMarketActivity,
  walletProfiles,
  walletStats
} from "./tables";

export type Market = InferSelectModel<typeof markets>;
export type NewMarket = InferInsertModel<typeof markets>;

export type Trade = InferSelectModel<typeof trades>;
export type NewTrade = InferInsertModel<typeof trades>;

export type MarketAggregate1m = InferSelectModel<typeof marketAggregates1m>;
export type NewMarketAggregate1m = InferInsertModel<typeof marketAggregates1m>;

export type WalletStats = InferSelectModel<typeof walletStats>;
export type NewWalletStats = InferInsertModel<typeof walletStats>;

export type WalletProfile = InferSelectModel<typeof walletProfiles>;
export type NewWalletProfile = InferInsertModel<typeof walletProfiles>;

export type WalletMarketActivity = InferSelectModel<typeof walletMarketActivity>;
export type NewWalletMarketActivity = InferInsertModel<typeof walletMarketActivity>;

export type WalletDailyStats = InferSelectModel<typeof walletDailyStats>;
export type NewWalletDailyStats = InferInsertModel<typeof walletDailyStats>;

export type AnomalyEvent = InferSelectModel<typeof anomalyEvents>;
export type NewAnomalyEvent = InferInsertModel<typeof anomalyEvents>;

export type NarrativeEvent = InferSelectModel<typeof narrativeEvents>;
export type NewNarrativeEvent = InferInsertModel<typeof narrativeEvents>;

export type MarketTimelineEvent = InferSelectModel<typeof marketTimeline>;
export type NewMarketTimelineEvent = InferInsertModel<typeof marketTimeline>;

export type Alert = InferSelectModel<typeof alerts>;
export type NewAlert = InferInsertModel<typeof alerts>;
