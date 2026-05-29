import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import {
  alertTypeEnum,
  anomalyTypeEnum,
  marketSourceEnum,
  marketStatusEnum,
  timelineEventTypeEnum,
  tradeSideEnum
} from "./enums";

export const markets = pgTable(
  "markets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: marketSourceEnum("source").notNull(),
    externalId: text("external_id").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    status: marketStatusEnum("status").notNull().default("open"),
    conditionId: text("condition_id"),
    clobTokenIds: text("clob_token_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    currentProbability: numeric("current_probability", { precision: 18, scale: 8 }),
    currentProbabilityYes: numeric("current_probability_yes", { precision: 18, scale: 8 }),
    currentProbabilityNo: numeric("current_probability_no", { precision: 18, scale: 8 }),
    volume24h: numeric("volume_24h", { precision: 30, scale: 8 }),
    liquidity: numeric("liquidity", { precision: 30, scale: 8 }),
    isActiveUniverse: boolean("is_active_universe").notNull().default(false),
    marketQualityScore: numeric("market_quality_score", { precision: 12, scale: 6 }),
    universeTier: text("universe_tier"),
    intelligenceWeightedScore: numeric("intelligence_weighted_score", { precision: 12, scale: 6 }),
    repricingVelocityScore: numeric("repricing_velocity_score", { precision: 12, scale: 6 }),
    narrativeRelevanceScore: numeric("narrative_relevance_score", { precision: 12, scale: 6 }),
    walletActivityScore: numeric("wallet_activity_score", { precision: 12, scale: 6 }),
    exclusionReason: text("exclusion_reason"),
    universeRank: integer("universe_rank"),
    lastSelectedAt: timestamp("last_selected_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    resolutionDate: timestamp("resolution_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    externalIdIdx: index("markets_external_id_idx").on(table.externalId),
    sourceExternalIdUnique: uniqueIndex("markets_source_external_id_uidx").on(
      table.source,
      table.externalId
    ),
    categoryIdx: index("markets_category_idx").on(table.category),
    statusIdx: index("markets_status_idx").on(table.status),
    conditionIdIdx: index("markets_condition_id_idx").on(table.conditionId),
    clobTokenIdsGinIdx: index("markets_clob_token_ids_gin_idx").using("gin", table.clobTokenIds),
    activeUniverseIdx: index("markets_is_active_universe_idx").on(table.isActiveUniverse),
    qualityScoreDescIdx: index("markets_market_quality_score_desc_idx").on(
      sql`${table.marketQualityScore} DESC`
    ),
    intelligenceScoreDescIdx: index("markets_intelligence_weighted_score_desc_idx").on(
      sql`${table.intelligenceWeightedScore} DESC`
    ),
    universeTierIdx: index("markets_universe_tier_idx").on(table.universeTier),
    volume24hDescIdx: index("markets_volume_24h_desc_idx").on(sql`${table.volume24h} DESC`),
    liquidityDescIdx: index("markets_liquidity_desc_idx").on(sql`${table.liquidity} DESC`),
    slugIdx: uniqueIndex("markets_slug_uidx").on(table.slug)
  })
);

export const trades = pgTable(
  "trades",
  {
    id: uuid("id").defaultRandom().notNull(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "restrict" }),
    walletAddress: text("wallet_address").notNull(),
    side: tradeSideEnum("side").notNull(),
    price: numeric("price", { precision: 18, scale: 8 }).notNull(),
    quantity: numeric("quantity", { precision: 30, scale: 12 }).notNull(),
    usdValue: numeric("usd_value", { precision: 30, scale: 8 }).notNull(),
    transactionHash: text("transaction_hash").notNull(),
    clobTokenId: text("clob_token_id"),
    outcome: text("outcome"),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    tradeTimestamp: timestamp("trade_timestamp", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pk: primaryKey({ name: "trades_pk", columns: [table.id, table.tradeTimestamp] }),
    marketTimestampIdx: index("trades_market_id_trade_timestamp_idx").on(
      table.marketId,
      table.tradeTimestamp
    ),
    walletIdx: index("trades_wallet_address_idx").on(table.walletAddress),
    timestampDescIdx: index("trades_trade_timestamp_desc_idx").on(
      sql`${table.tradeTimestamp} DESC`
    ),
    transactionIdx: index("trades_transaction_hash_idx").on(table.transactionHash),
    clobTokenIdIdx: index("trades_clob_token_id_idx").on(table.clobTokenId)
  })
);

export const marketAggregates1m = pgTable(
  "market_aggregates_1m",
  {
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    bucket: timestamp("bucket", { withTimezone: true }).notNull(),
    open: numeric("open", { precision: 18, scale: 8 }).notNull(),
    high: numeric("high", { precision: 18, scale: 8 }).notNull(),
    low: numeric("low", { precision: 18, scale: 8 }).notNull(),
    close: numeric("close", { precision: 18, scale: 8 }).notNull(),
    volume: numeric("volume", { precision: 30, scale: 8 }).notNull(),
    tradeCount: integer("trade_count").notNull()
  },
  (table) => ({
    pk: primaryKey({ name: "market_aggregates_1m_pk", columns: [table.marketId, table.bucket] }),
    marketBucketIdx: index("market_aggregates_1m_market_id_bucket_idx").on(
      table.marketId,
      table.bucket
    )
  })
);

export const walletStats = pgTable(
  "wallet_stats",
  {
    walletAddress: text("wallet_address").primaryKey(),
    realizedPnl: numeric("realized_pnl", { precision: 30, scale: 8 }).notNull().default("0"),
    unrealizedPnl: numeric("unrealized_pnl", { precision: 30, scale: 8 }).notNull().default("0"),
    winRate: numeric("win_rate", { precision: 6, scale: 5 }).notNull().default("0"),
    avgHoldTime: integer("avg_hold_time").notNull().default(0),
    convictionScore: numeric("conviction_score", { precision: 8, scale: 4 }).notNull().default("0"),
    reputationScore: numeric("reputation_score", { precision: 8, scale: 4 }).notNull().default("0"),
    informationAdvantageScore: numeric("information_advantage_score", { precision: 8, scale: 4 })
      .notNull()
      .default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    reputationScoreDescIdx: index("wallet_stats_reputation_score_desc_idx").on(
      sql`${table.reputationScore} DESC`
    ),
    informationAdvantageDescIdx: index("wallet_stats_information_advantage_score_desc_idx").on(
      sql`${table.informationAdvantageScore} DESC`
    )
  })
);

export const walletProfiles = pgTable(
  "wallet_profiles",
  {
    walletAddress: text("wallet_address").primaryKey(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    totalVolumeUsd: numeric("total_volume_usd", { precision: 30, scale: 8 }).notNull().default("0"),
    totalTradeCount: integer("total_trade_count").notNull().default(0),
    smartMoneyScore: numeric("smart_money_score", { precision: 8, scale: 4 })
      .notNull()
      .default("0"),
    convictionScore: numeric("conviction_score", { precision: 8, scale: 4 }).notNull().default("0"),
    influenceScore: numeric("influence_score", { precision: 8, scale: 4 }).notNull().default("0"),
    activeMarketCount: integer("active_market_count").notNull().default(0),
    anomalyTriggerCount: integer("anomaly_trigger_count").notNull().default(0),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`)
  },
  (table) => ({
    smartMoneyDescIdx: index("wallet_profiles_smart_money_score_desc_idx").on(
      sql`${table.smartMoneyScore} DESC`
    ),
    influenceDescIdx: index("wallet_profiles_influence_score_desc_idx").on(
      sql`${table.influenceScore} DESC`
    ),
    lastActiveDescIdx: index("wallet_profiles_last_active_at_desc_idx").on(
      sql`${table.lastActiveAt} DESC`
    ),
    volumeDescIdx: index("wallet_profiles_total_volume_usd_desc_idx").on(
      sql`${table.totalVolumeUsd} DESC`
    )
  })
);

export const walletMarketActivity = pgTable(
  "wallet_market_activity",
  {
    walletAddress: text("wallet_address").notNull(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    totalVolumeUsd: numeric("total_volume_usd", { precision: 30, scale: 8 }).notNull().default("0"),
    tradeCount: integer("trade_count").notNull().default(0),
    netPositionEstimate: numeric("net_position_estimate", { precision: 30, scale: 12 })
      .notNull()
      .default("0"),
    lastTradeAt: timestamp("last_trade_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    pk: primaryKey({
      name: "wallet_market_activity_pk",
      columns: [table.walletAddress, table.marketId]
    }),
    walletIdx: index("wallet_market_activity_wallet_idx").on(table.walletAddress),
    marketIdx: index("wallet_market_activity_market_idx").on(table.marketId),
    lastTradeDescIdx: index("wallet_market_activity_last_trade_at_desc_idx").on(
      sql`${table.lastTradeAt} DESC`
    ),
    volumeDescIdx: index("wallet_market_activity_total_volume_usd_desc_idx").on(
      sql`${table.totalVolumeUsd} DESC`
    )
  })
);

export const walletDailyStats = pgTable(
  "wallet_daily_stats",
  {
    walletAddress: text("wallet_address").notNull(),
    bucketDate: timestamp("bucket_date", { withTimezone: true }).notNull(),
    totalVolumeUsd: numeric("total_volume_usd", { precision: 30, scale: 8 }).notNull().default("0"),
    tradeCount: integer("trade_count").notNull().default(0),
    activeMarkets: integer("active_markets").notNull().default(0),
    anomalyCount: integer("anomaly_count").notNull().default(0)
  },
  (table) => ({
    pk: primaryKey({
      name: "wallet_daily_stats_pk",
      columns: [table.walletAddress, table.bucketDate]
    }),
    walletDateIdx: index("wallet_daily_stats_wallet_bucket_date_idx").on(
      table.walletAddress,
      table.bucketDate
    ),
    dateDescIdx: index("wallet_daily_stats_bucket_date_desc_idx").on(sql`${table.bucketDate} DESC`),
    volumeDescIdx: index("wallet_daily_stats_total_volume_usd_desc_idx").on(
      sql`${table.totalVolumeUsd} DESC`
    )
  })
);

export const systemStatus = pgTable("system_status", {
  serviceName: text("service_name").primaryKey(),
  status: text("status").notNull().default("standby"),
  statusMessage: text("status_message"),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  metadata: jsonb("metadata")
    .notNull()
    .default(sql`'{}'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const anomalyEvents = pgTable(
  "anomaly_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    anomalyType: anomalyTypeEnum("anomaly_type").notNull(),
    severityScore: numeric("severity_score", { precision: 8, scale: 4 }).notNull(),
    summary: text("summary").notNull(),
    confidenceScore: numeric("confidence_score", { precision: 8, scale: 4 }).notNull(),
    walletAddresses: text("wallet_addresses")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    severityDetectedIdx: index("anomaly_events_severity_detected_idx").on(
      sql`${table.severityScore} DESC`,
      sql`${table.detectedAt} DESC`
    ),
    detectedDescIdx: index("anomaly_events_detected_at_desc_idx").on(sql`${table.detectedAt} DESC`),
    typeIdx: index("anomaly_events_anomaly_type_idx").on(table.anomalyType),
    marketDetectedIdx: index("anomaly_events_market_id_detected_at_idx").on(
      table.marketId,
      table.detectedAt
    )
  })
);

export const narrativeEvents = pgTable(
  "narrative_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    timestampDescIdx: index("narrative_events_event_timestamp_desc_idx").on(
      sql`${table.eventTimestamp} DESC`
    ),
    tagsGinIdx: index("narrative_events_tags_gin_idx").using("gin", table.tags)
  })
);

export const marketTimeline = pgTable(
  "market_timeline",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    eventType: timelineEventTypeEnum("event_type").notNull(),
    eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull(),
    payload: jsonb("payload")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    marketTimestampIdx: index("market_timeline_market_id_event_timestamp_idx").on(
      table.marketId,
      table.eventTimestamp
    ),
    eventTypeIdx: index("market_timeline_event_type_idx").on(table.eventType)
  })
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    alertType: alertTypeEnum("alert_type").notNull(),
    conditions: jsonb("conditions")
      .notNull()
      .default(sql`'{}'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userActiveIdx: index("alerts_user_id_is_active_idx").on(table.userId, table.isActive),
    alertTypeIdx: index("alerts_alert_type_idx").on(table.alertType)
  })
);

export const marketsRelations = relations(markets, ({ many }) => ({
  trades: many(trades),
  aggregates1m: many(marketAggregates1m),
  anomalies: many(anomalyEvents),
  timeline: many(marketTimeline)
}));

export const tradesRelations = relations(trades, ({ one }) => ({
  market: one(markets, {
    fields: [trades.marketId],
    references: [markets.id]
  })
}));

export const anomalyEventsRelations = relations(anomalyEvents, ({ one }) => ({
  market: one(markets, {
    fields: [anomalyEvents.marketId],
    references: [markets.id]
  })
}));

export const walletMarketActivityRelations = relations(walletMarketActivity, ({ one }) => ({
  market: one(markets, {
    fields: [walletMarketActivity.marketId],
    references: [markets.id]
  })
}));
