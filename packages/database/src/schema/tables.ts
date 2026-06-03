import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const venues = pgTable("venues", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    venueIdx: index("categories_venue_id_idx").on(table.venueId),
    venueSlugUnique: uniqueIndex("categories_venue_slug_unique").on(table.venueId, table.slug)
  })
);

export const markets = pgTable(
  "markets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    externalMarketId: text("external_market_id").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    groupItemTitle: text("group_item_title"),
    sportsMarketType: text("sports_market_type"),
    gameStartTime: timestamp("game_start_time", { withTimezone: true }),
    umaResolutionStatus: text("uma_resolution_status"),
    umaResolutionStatuses: text("uma_resolution_statuses").array().notNull().default([]),
    resolvedBy: text("resolved_by"),
    ready: boolean("ready"),
    approved: boolean("approved"),
    resolved: boolean("resolved"),
    period: text("period"),
    finishedTimestamp: timestamp("finished_timestamp", { withTimezone: true }),
    automaticallyResolved: boolean("automatically_resolved"),
    lastLifecycleCheckedAt: timestamp("last_lifecycle_checked_at", { withTimezone: true }),
    lastSeenInOpenFeedAt: timestamp("last_seen_in_open_feed_at", { withTimezone: true }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    primaryCategoryId: uuid("primary_category_id").references(() => categories.id, {
      onDelete: "set null"
    }),
    status: text("status").notNull().default("open"),
    endDate: timestamp("end_date", { withTimezone: true }),
    active: boolean("active"),
    closed: boolean("closed"),
    archived: boolean("archived"),
    acceptingOrders: boolean("accepting_orders"),
    enableOrderBook: boolean("enable_order_book"),
    closedTime: timestamp("closed_time", { withTimezone: true }),
    volume: numeric("volume", { precision: 30, scale: 8 }),
    volume24h: numeric("volume_24h", { precision: 30, scale: 8 }),
    liquidity: numeric("liquidity", { precision: 30, scale: 8 }),
    featured: boolean("featured"),
    isNew: boolean("is_new"),
    competitive: numeric("competitive", { precision: 18, scale: 8 }),
    oneDayPriceChange: numeric("one_day_price_change", { precision: 18, scale: 8 }),
    oneHourPriceChange: numeric("one_hour_price_change", { precision: 18, scale: 8 }),
    oneWeekPriceChange: numeric("one_week_price_change", { precision: 18, scale: 8 }),
    gammaUpdatedAt: timestamp("gamma_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    venueIdx: index("markets_venue_id_idx").on(table.venueId),
    categoryIdx: index("markets_category_id_idx").on(table.categoryId),
    primaryCategoryIdx: index("markets_primary_category_id_idx").on(table.primaryCategoryId),
    statusEndDateIdx: index("markets_status_end_date_idx").on(table.status, table.endDate),
    venueExternalUnique: uniqueIndex("markets_venue_external_market_unique").on(
      table.venueId,
      table.externalMarketId
    ),
    venueSlugUnique: uniqueIndex("markets_venue_slug_unique").on(table.venueId, table.slug)
  })
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    externalEventId: text("external_event_id").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    primaryCategoryId: uuid("primary_category_id").references(() => categories.id, {
      onDelete: "set null"
    }),
    active: boolean("active").notNull().default(true),
    closed: boolean("closed").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    closedTime: timestamp("closed_time", { withTimezone: true }),
    live: boolean("live"),
    ended: boolean("ended"),
    period: text("period"),
    finishedTimestamp: timestamp("finished_timestamp", { withTimezone: true }),
    score: text("score"),
    automaticallyResolved: boolean("automatically_resolved"),
    gammaUpdatedAt: timestamp("gamma_updated_at", { withTimezone: true }),
    lastLifecycleCheckedAt: timestamp("last_lifecycle_checked_at", { withTimezone: true }),
    lastSeenInOpenFeedAt: timestamp("last_seen_in_open_feed_at", { withTimezone: true }),
    volume: numeric("volume", { precision: 30, scale: 8 }),
    volume24h: numeric("volume_24h", { precision: 30, scale: 8 }),
    liquidity: numeric("liquidity", { precision: 30, scale: 8 }),
    openInterest: numeric("open_interest", { precision: 30, scale: 8 }),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    venueIdx: index("events_venue_id_idx").on(table.venueId),
    primaryCategoryIdx: index("events_primary_category_id_idx").on(table.primaryCategoryId),
    activeEndDateIdx: index("events_active_end_date_idx").on(
      table.active,
      table.closed,
      table.archived,
      table.endDate
    ),
    volumeIdx: index("events_volume_idx").on(table.volume),
    venueExternalUnique: uniqueIndex("events_venue_external_event_unique").on(
      table.venueId,
      table.externalEventId
    ),
    venueSlugUnique: uniqueIndex("events_venue_slug_unique").on(table.venueId, table.slug)
  })
);

export const venueTags = pgTable(
  "venue_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    externalTagId: text("external_tag_id"),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    rawType: text("raw_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    venueIdx: index("venue_tags_venue_id_idx").on(table.venueId),
    venueSlugUnique: uniqueIndex("venue_tags_venue_slug_unique").on(table.venueId, table.slug)
  })
);

export const eventMarkets = pgTable(
  "event_markets",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    eventIdx: index("event_markets_event_id_idx").on(table.eventId),
    marketIdx: index("event_markets_market_id_idx").on(table.marketId),
    eventMarketUnique: uniqueIndex("event_markets_event_market_unique").on(
      table.eventId,
      table.marketId
    )
  })
);

export const eventTags = pgTable(
  "event_tags",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => venueTags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    eventIdx: index("event_tags_event_id_idx").on(table.eventId),
    tagIdx: index("event_tags_tag_id_idx").on(table.tagId),
    eventTagUnique: uniqueIndex("event_tags_event_tag_unique").on(table.eventId, table.tagId)
  })
);

export const marketTags = pgTable(
  "market_tags",
  {
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => venueTags.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    marketIdx: index("market_tags_market_id_idx").on(table.marketId),
    tagIdx: index("market_tags_tag_id_idx").on(table.tagId),
    marketTagSourceUnique: uniqueIndex("market_tags_market_tag_source_unique").on(
      table.marketId,
      table.tagId,
      table.source
    )
  })
);

export const marketCategories = pgTable(
  "market_categories",
  {
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    source: text("source").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    marketIdx: index("market_categories_market_id_idx").on(table.marketId),
    categoryIdx: index("market_categories_category_id_idx").on(table.categoryId),
    marketCategorySourceUnique: uniqueIndex("market_categories_market_category_source_unique").on(
      table.marketId,
      table.categoryId,
      table.source
    )
  })
);

export const marketOutcomes = pgTable(
  "market_outcomes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    outcomeName: text("outcome_name").notNull(),
    externalTokenId: text("external_token_id"),
    probability: numeric("probability", { precision: 12, scale: 8 }),
    volume: numeric("volume", { precision: 30, scale: 8 }).notNull().default("0"),
    rank: integer("rank").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    marketIdx: index("market_outcomes_market_id_idx").on(table.marketId),
    marketRankIdx: index("market_outcomes_market_rank_idx").on(table.marketId, table.rank),
    marketNameUnique: uniqueIndex("market_outcomes_market_name_unique").on(
      table.marketId,
      table.outcomeName
    )
  })
);

export const marketSnapshots = pgTable(
  "market_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    snapshotTime: timestamp("snapshot_time", { withTimezone: true }).notNull(),
    probability: numeric("probability", { precision: 12, scale: 8 }),
    volume: numeric("volume", { precision: 30, scale: 8 }),
    liquidity: numeric("liquidity", { precision: 30, scale: 8 }),
    openInterest: numeric("open_interest", { precision: 30, scale: 8 })
  },
  (table) => ({
    marketIdx: index("market_snapshots_market_id_idx").on(table.marketId),
    snapshotTimeIdx: index("market_snapshots_snapshot_time_idx").on(table.snapshotTime),
    marketTimeUnique: uniqueIndex("market_snapshots_market_time_unique").on(
      table.marketId,
      table.snapshotTime
    ),
    marketTimeIdx: index("market_snapshots_market_time_idx").on(
      table.marketId,
      table.snapshotTime
    )
  })
);

export const gammaIngestionBatches = pgTable(
  "gamma_ingestion_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: text("source").notNull().default("gamma"),
    feedKind: text("feed_kind").notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    normalizedAt: timestamp("normalized_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    rawCleanupAt: timestamp("raw_cleanup_at", { withTimezone: true }),
    eventCount: integer("event_count").notNull().default(0),
    marketCount: integer("market_count").notNull().default(0),
    normalizedEventCount: integer("normalized_event_count").notNull().default(0),
    normalizedMarketCount: integer("normalized_market_count").notNull().default(0),
    excludedEventCount: integer("excluded_event_count").notNull().default(0),
    excludedMarketCount: integer("excluded_market_count").notNull().default(0),
    errorMessage: text("error_message"),
    timings: jsonb("timings").notNull().default({}),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    statusStartedAtIdx: index("gamma_ingestion_batches_status_started_at_idx").on(table.status, table.startedAt),
    createdAtIdx: index("gamma_ingestion_batches_created_at_idx").on(table.createdAt),
    feedKindStartedAtIdx: index("gamma_ingestion_batches_feed_kind_started_at_idx").on(table.feedKind, table.startedAt)
  })
);

export const gammaRawEvents = pgTable(
  "gamma_raw_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => gammaIngestionBatches.id, { onDelete: "cascade" }),
    feedKind: text("feed_kind").notNull(),
    externalEventId: text("external_event_id").notNull(),
    payload: jsonb("payload").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    normalizationStatus: text("normalization_status").notNull().default("pending"),
    exclusionReasons: text("exclusion_reasons").array().notNull().default([]),
    normalizedAt: timestamp("normalized_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    batchIdx: index("gamma_raw_events_batch_id_idx").on(table.batchId),
    externalEventIdx: index("gamma_raw_events_external_event_id_idx").on(table.externalEventId),
    normalizationStatusIdx: index("gamma_raw_events_normalization_status_idx").on(table.normalizationStatus),
    createdAtIdx: index("gamma_raw_events_created_at_idx").on(table.createdAt),
    pendingBatchCreatedIdIdx: index("gamma_raw_events_pending_batch_created_id_idx")
      .on(table.batchId, table.createdAt, table.id)
      .where(sql`${table.normalizationStatus} = 'pending'`),
    pendingBatchIdIdx: index("gamma_raw_events_pending_batch_id_idx")
      .on(table.batchId, table.id)
      .where(sql`${table.normalizationStatus} = 'pending'`),
    batchFeedEventUnique: uniqueIndex("gamma_raw_events_batch_feed_event_unique").on(
      table.batchId,
      table.feedKind,
      table.externalEventId
    )
  })
);

export const gammaRawMarkets = pgTable(
  "gamma_raw_markets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => gammaIngestionBatches.id, { onDelete: "cascade" }),
    feedKind: text("feed_kind").notNull(),
    externalEventId: text("external_event_id"),
    externalMarketId: text("external_market_id").notNull(),
    payload: jsonb("payload").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    normalizationStatus: text("normalization_status").notNull().default("pending"),
    exclusionReasons: text("exclusion_reasons").array().notNull().default([]),
    normalizedAt: timestamp("normalized_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    batchIdx: index("gamma_raw_markets_batch_id_idx").on(table.batchId),
    externalEventIdx: index("gamma_raw_markets_external_event_id_idx").on(table.externalEventId),
    externalMarketIdx: index("gamma_raw_markets_external_market_id_idx").on(table.externalMarketId),
    normalizationStatusIdx: index("gamma_raw_markets_normalization_status_idx").on(table.normalizationStatus),
    createdAtIdx: index("gamma_raw_markets_created_at_idx").on(table.createdAt),
    pendingBatchCreatedIdIdx: index("gamma_raw_markets_pending_batch_created_id_idx")
      .on(table.batchId, table.createdAt, table.id)
      .where(sql`${table.normalizationStatus} = 'pending'`),
    pendingBatchIdIdx: index("gamma_raw_markets_pending_batch_id_idx")
      .on(table.batchId, table.id)
      .where(sql`${table.normalizationStatus} = 'pending'`),
    batchFeedMarketUnique: uniqueIndex("gamma_raw_markets_batch_feed_market_unique").on(
      table.batchId,
      table.feedKind,
      table.externalMarketId
    )
  })
);

export const explorerEventCards = pgTable(
  "explorer_event_cards",
  {
    eventId: uuid("event_id")
      .primaryKey()
      .references(() => events.id, { onDelete: "cascade" }),
    externalEventId: text("external_event_id"),
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "set null" }),
    venueSlug: text("venue_slug").notNull(),
    venueName: text("venue_name"),
    eventSlug: text("event_slug"),
    title: text("title").notNull(),
    searchText: text("search_text"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    categorySlug: text("category_slug"),
    categoryName: text("category_name"),
    tags: jsonb("tags").notNull().default([]),
    volume: numeric("volume"),
    volume24h: numeric("volume_24h"),
    liquidity: numeric("liquidity"),
    openInterest: numeric("open_interest"),
    endDate: timestamp("end_date", { withTimezone: true }),
    eventUpdatedAt: timestamp("event_updated_at", { withTimezone: true }),
    marketCount: integer("market_count").notNull().default(0),
    topMarkets: jsonb("top_markets").notNull().default([]),
    leaderOutcome: jsonb("leader_outcome"),
    sameResolutionDate: boolean("same_resolution_date"),
    outcomeOrdering: text("outcome_ordering"),
    isExplorerVisible: boolean("is_explorer_visible").notNull().default(true),
    hiddenFromNew: boolean("hidden_from_new").notNull().default(false),
    exclusionReasons: text("exclusion_reasons").array().notNull().default([]),
    refreshGeneration: uuid("refresh_generation").notNull(),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    venueVisibleIdx: index("explorer_event_cards_venue_visible_idx").on(table.venueSlug, table.isExplorerVisible),
    categoryVisibleIdx: index("explorer_event_cards_category_visible_idx").on(table.categorySlug, table.isExplorerVisible),
    visibleDefaultRankingIdx: index("explorer_event_cards_visible_default_ranking_idx").on(
      table.isExplorerVisible,
      table.volume24h,
      table.volume,
      table.liquidity,
      table.openInterest
    ),
    visibleEndDateIdx: index("explorer_event_cards_visible_end_date_idx").on(table.isExplorerVisible, table.endDate),
    visibleEventUpdatedAtIdx: index("explorer_event_cards_visible_event_updated_at_idx").on(
      table.isExplorerVisible,
      table.eventUpdatedAt
    ),
    refreshGenerationIdx: index("explorer_event_cards_refresh_generation_idx").on(table.refreshGeneration)
  })
);

export const venuesRelations = relations(venues, ({ many }) => ({
  categories: many(categories),
  markets: many(markets),
  events: many(events),
  tags: many(venueTags),
  explorerEventCards: many(explorerEventCards)
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  venue: one(venues, { fields: [categories.venueId], references: [venues.id] }),
  markets: many(markets)
}));

export const marketsRelations = relations(markets, ({ one, many }) => ({
  venue: one(venues, { fields: [markets.venueId], references: [venues.id] }),
  category: one(categories, { fields: [markets.categoryId], references: [categories.id] }),
  primaryCategory: one(categories, {
    fields: [markets.primaryCategoryId],
    references: [categories.id]
  }),
  outcomes: many(marketOutcomes),
  snapshots: many(marketSnapshots),
  events: many(eventMarkets),
  tags: many(marketTags),
  categories: many(marketCategories)
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  venue: one(venues, { fields: [events.venueId], references: [venues.id] }),
  primaryCategory: one(categories, {
    fields: [events.primaryCategoryId],
    references: [categories.id]
  }),
  markets: many(eventMarkets),
  tags: many(eventTags),
  explorerCard: one(explorerEventCards, {
    fields: [events.id],
    references: [explorerEventCards.eventId]
  })
}));

export const explorerEventCardsRelations = relations(explorerEventCards, ({ one }) => ({
  event: one(events, { fields: [explorerEventCards.eventId], references: [events.id] }),
  venue: one(venues, { fields: [explorerEventCards.venueId], references: [venues.id] }),
  category: one(categories, { fields: [explorerEventCards.categoryId], references: [categories.id] })
}));

export const venueTagsRelations = relations(venueTags, ({ one, many }) => ({
  venue: one(venues, { fields: [venueTags.venueId], references: [venues.id] }),
  events: many(eventTags),
  markets: many(marketTags)
}));

export const marketOutcomesRelations = relations(marketOutcomes, ({ one }) => ({
  market: one(markets, { fields: [marketOutcomes.marketId], references: [markets.id] })
}));

export const marketSnapshotsRelations = relations(marketSnapshots, ({ one }) => ({
  market: one(markets, { fields: [marketSnapshots.marketId], references: [markets.id] })
}));
