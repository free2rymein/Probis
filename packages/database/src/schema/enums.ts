import { pgEnum } from "drizzle-orm/pg-core";

export const marketSourceEnum = pgEnum("market_source", [
  "polymarket",
  "kalshi",
  "manifold",
  "internal"
]);

export const marketStatusEnum = pgEnum("market_status", [
  "draft",
  "open",
  "paused",
  "closed",
  "settled",
  "cancelled"
]);

export const tradeSideEnum = pgEnum("trade_side", ["buy", "sell"]);

export const anomalyTypeEnum = pgEnum("anomaly_type", [
  "probability_gap",
  "volume_spike",
  "liquidity_drain",
  "wallet_cluster",
  "timeline_discontinuity",
  "narrative_correlation",
  "price_dislocation",
  "probability_shock",
  "activity_burst",
  "whale_activity"
]);

export const timelineEventTypeEnum = pgEnum("timeline_event_type", [
  "trade",
  "aggregate",
  "anomaly",
  "narrative",
  "alert",
  "resolution",
  "system"
]);

export const alertTypeEnum = pgEnum("alert_type", [
  "market",
  "wallet",
  "anomaly",
  "narrative",
  "system"
]);
