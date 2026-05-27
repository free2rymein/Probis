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
    transactionIdx: index("trades_transaction_hash_idx").on(table.transactionHash)
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
