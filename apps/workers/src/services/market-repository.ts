import type postgres from "postgres";
import {
  canonicalCategories,
  dateOrNull,
  hasFinalEventState,
  hasFinalMarketState,
  stringArray,
  type NormalizedEvent,
  type NormalizedMarket,
  type NormalizedTag,
  slugify
} from "./normalization";
import type { GammaEvent } from "./polymarket";

const snapshotBucket = (date = new Date()) =>
  new Date(Math.floor(date.getTime() / 60_000) * 60_000);

const chunked = <T>(items: T[], size = 250) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

const uniqueBy = <T>(items: T[], keyFor: (item: T) => string) =>
  [...new Map(items.map((item) => [keyFor(item), item])).values()];

const DEFAULT_RELATIONSHIP_SYNC_BATCH_SIZE = 1_000;

type MarketRepositoryOptions = {
  relationshipSyncBatchSize?: number;
};

type RelationshipSyncCounters = {
  candidateRows: number;
  uniqueRows: number;
  batchSize: number;
  batches: number;
};

type SyncStats = {
  events: number;
  markets: number;
  categoriesAssigned: number;
  categoryCounts: Record<string, number>;
  otherMarkets: number;
  unknownTags: number;
  timings: Record<string, number>;
};

export type ClosedFeedSyncStats = {
  fetchedEvents: number;
  localEventsBatchClosed: number;
  localChildMarketsBatchClosed: number;
  durationMs: number;
};

export type StaleCleanupStats = {
  candidates: number;
  eventsClosed: number;
  childMarketsClosed: number;
  applied: boolean;
  durationMs: number;
};

export type OpenFeedGuardrailStats = {
  eventsStamped: number;
  finalEventsClosed: number;
  marketsStamped: number;
  finalMarketsClosed: number;
  durationMs: number;
};

export type LifecycleReconcileCandidate = {
  id: string;
  externalEventId: string;
  title: string;
  endDate: Date | null;
  lastSeenInOpenFeedAt: Date | null;
  lastLifecycleCheckedAt: Date | null;
  volume: string | null;
  hasStartedSportsMarket: boolean;
};

export type LifecycleReconcileUpdate = {
  eventClosed: boolean;
  childMarketsUpdated: number;
  childMarketsMissingLocally: number;
};

const eventConfirmedClosed = (event: GammaEvent) =>
  event.closed === true
  || event.active === false
  || event.archived === true
  || event.ended === true
  || event.automaticallyResolved === true
  || Boolean(event.closedTime);

export class MarketRepository {
  private readonly relationshipSyncBatchSize: number;

  constructor(private readonly sql: postgres.Sql, options: MarketRepositoryOptions = {}) {
    this.relationshipSyncBatchSize = Math.max(
      100,
      Math.min(5_000, Math.trunc(options.relationshipSyncBatchSize ?? DEFAULT_RELATIONSHIP_SYNC_BATCH_SIZE))
    );
  }

  async ensurePolymarketVenue() {
    const [venue] = await this.sql<{ id: string }[]>`
      insert into venues (slug, name)
      values ('polymarket', 'Polymarket')
      on conflict (slug) do update set name = excluded.name
      returning id
    `;
    if (!venue) throw new Error("Unable to sync Polymarket venue");
    return venue.id;
  }

  async syncEvents(events: NormalizedEvent[], standaloneMarkets: NormalizedMarket[], runStartedAt = new Date()) {
    const totalStartedAt = Date.now();
    const timings: Record<string, number> = {};
    const timed = async <T>(name: string, task: () => Promise<T>) => {
      const startedAt = Date.now();
      try {
        return await task();
      } finally {
        timings[name] = Date.now() - startedAt;
      }
    };

    const venueStartedAt = Date.now();
    const venueId = await this.ensurePolymarketVenue();
    timings.ensureVenueMs = Date.now() - venueStartedAt;
    const categoryIds = await timed("ensureCategoriesMs", () => this.ensureCanonicalCategories(venueId));
    const tagIds = new Map<string, string>();
    const stats: SyncStats = {
      events: 0,
      markets: 0,
      categoriesAssigned: 0,
      categoryCounts: {},
      otherMarkets: 0,
      unknownTags: 0,
      timings
    };

    const prepareStartedAt = Date.now();
    const eventMarketIds = new Set(events.flatMap((event) => event.markets.map((market) => market.externalMarketId)));
    const unmatchedMarkets = standaloneMarkets.filter((market) => !eventMarketIds.has(market.externalMarketId));
    const markets = uniqueBy([...events.flatMap((event) => event.markets), ...unmatchedMarkets], (market) => market.externalMarketId);
    const tags = uniqueBy(
      [...events.flatMap((event) => event.tags), ...markets.flatMap((market) => market.tags)],
      (tag) => tag.slug
    );
    timings.prepareRowsMs = Date.now() - prepareStartedAt;
    timings.preparedEvents = events.length;
    timings.preparedMarkets = markets.length;
    timings.preparedTags = tags.length;

    const persistedTagIds = await timed("upsertTagsMs", () => this.upsertTags(venueId, tags));
    for (const [slug, id] of persistedTagIds) tagIds.set(slug, id);
    const persistedEventIds = await timed("upsertEventsMs", () => this.upsertEvents(venueId, events, categoryIds, runStartedAt));
    const persistedMarketIds = await timed("upsertMarketsMs", () => this.upsertMarkets(venueId, markets, categoryIds, runStartedAt));

    this.addRelationshipCounters(timings, "syncEventMarkets", await timed("syncEventMarketsMs", () => this.syncEventMarkets(events, persistedEventIds, persistedMarketIds)));
    this.addRelationshipCounters(timings, "syncEventTags", await timed("syncEventTagsMs", () => this.syncEventTags(events, persistedEventIds, tagIds)));
    this.addRelationshipCounters(timings, "syncMarketCategories", await timed("syncMarketCategoriesMs", () => this.syncMarketCategories(markets, persistedMarketIds, categoryIds)));
    this.addRelationshipCounters(timings, "syncMarketTags", await timed("syncMarketTagsMs", () => this.syncMarketTags(markets, persistedMarketIds, tagIds)));
    this.addRelationshipCounters(timings, "syncOutcomes", await timed("syncOutcomesMs", () => this.syncOutcomes(markets, persistedMarketIds)));

    stats.events = events.length;
    for (const market of markets) {
      this.addMarketStats(stats, market);
    }
    timings.totalMs = Date.now() - totalStartedAt;

    return stats;
  }

  async snapshotKnownMarkets(markets: NormalizedMarket[]) {
    const venueId = await this.ensurePolymarketVenue();
    const bucket = snapshotBucket();
    let inserted = 0;

    for (const market of markets) {
      const [known] = await this.sql<{ id: string }[]>`
        select id from markets
        where venue_id = ${venueId} and external_market_id = ${market.externalMarketId}
        limit 1
      `;
      if (!known) continue;

      await this.sql`
        insert into market_snapshots (
          market_id, snapshot_time, probability, volume, liquidity, open_interest
        )
        values (
          ${known.id}, ${bucket}, ${market.snapshot.probability}, ${market.snapshot.volume},
          ${market.snapshot.liquidity}, ${market.snapshot.openInterest}
        )
        on conflict (market_id, snapshot_time) do update set
          probability = excluded.probability,
          volume = excluded.volume,
          liquidity = excluded.liquidity,
          open_interest = excluded.open_interest
      `;
      inserted += 1;
    }

    return inserted;
  }

  private async ensureCanonicalCategories(venueId: string) {
    const ids = new Map<string, string>();
    for (const name of canonicalCategories) {
      const [category] = await this.sql<{ id: string }[]>`
        insert into categories (venue_id, slug, name)
        values (${venueId}, ${slugify(name)}, ${name})
        on conflict (venue_id, slug) do update set name = excluded.name
        returning id
      `;
      if (!category) throw new Error(`Unable to sync canonical category: ${name}`);
      ids.set(slugify(name), category.id);
    }
    return ids;
  }

  private async upsertEvents(venueId: string, events: NormalizedEvent[], categoryIds: Map<string, string>, runStartedAt: Date) {
    const ids = new Map<string, string>();
    for (const batch of chunked(events)) {
      if (batch.length === 0) continue;
      const rows = batch.map((event) => ({
        venue_id: venueId,
        external_event_id: event.externalEventId,
        slug: event.slug,
        title: event.title,
        description: event.description,
        primary_category_id: categoryIds.get(event.categorySlug),
        start_date: event.startDate,
        end_date: event.endDate,
        active: event.active,
        closed: event.closed,
        archived: event.archived,
        closed_time: event.closedTime,
        live: event.live,
        ended: event.ended,
        period: event.period,
        finished_timestamp: event.finishedTimestamp,
        score: event.score,
        automatically_resolved: event.automaticallyResolved,
        gamma_updated_at: event.gammaUpdatedAt,
        last_seen_in_open_feed_at: runStartedAt,
        volume: event.volume,
        volume_24h: event.volume24h,
        liquidity: event.liquidity,
        open_interest: event.openInterest
      }));
      const persisted = await this.sql<{ id: string; external_event_id: string }[]>`
        insert into events ${this.sql(rows)}
        on conflict (venue_id, external_event_id) do update set
          slug = excluded.slug, title = excluded.title, description = excluded.description,
          primary_category_id = excluded.primary_category_id, start_date = excluded.start_date,
          end_date = excluded.end_date, active = excluded.active, closed = excluded.closed,
          archived = excluded.archived, closed_time = excluded.closed_time, live = excluded.live,
          ended = excluded.ended, period = excluded.period, finished_timestamp = excluded.finished_timestamp,
          score = excluded.score, automatically_resolved = excluded.automatically_resolved,
          gamma_updated_at = excluded.gamma_updated_at, last_seen_in_open_feed_at = excluded.last_seen_in_open_feed_at,
          volume = excluded.volume, volume_24h = excluded.volume_24h,
          liquidity = excluded.liquidity, open_interest = excluded.open_interest, updated_at = now()
        returning id, external_event_id
      `;
      for (const event of persisted) ids.set(event.external_event_id, event.id);
    }
    return ids;
  }

  private async upsertTags(venueId: string, tags: NormalizedTag[]) {
    const ids = new Map<string, string>();
    for (const batch of chunked(tags)) {
      if (batch.length === 0) continue;
      const rows = batch.map((tag) => ({
        venue_id: venueId,
        external_tag_id: tag.externalTagId,
        slug: tag.slug,
        label: tag.label,
        raw_type: tag.rawType
      }));
      const persisted = await this.sql<{ id: string; slug: string }[]>`
        insert into venue_tags ${this.sql(rows)}
        on conflict (venue_id, slug) do update set
          external_tag_id = coalesce(excluded.external_tag_id, venue_tags.external_tag_id),
          label = excluded.label,
          raw_type = coalesce(excluded.raw_type, venue_tags.raw_type)
        returning id, slug
      `;
      for (const tag of persisted) ids.set(tag.slug, tag.id);
    }
    return ids;
  }

  private async upsertMarkets(venueId: string, markets: NormalizedMarket[], categoryIds: Map<string, string>, runStartedAt: Date) {
    const ids = new Map<string, string>();
    for (const batch of chunked(markets)) {
      if (batch.length === 0) continue;
      const rows = batch.map((market) => {
        const categoryId = categoryIds.get(market.categorySlug);
        if (!categoryId) throw new Error(`Missing canonical category: ${market.categoryName}`);
        return {
          venue_id: venueId,
          external_market_id: market.externalMarketId,
          slug: market.slug,
          title: market.title,
          description: market.description,
          group_item_title: market.groupItemTitle,
          sports_market_type: market.sportsMarketType,
          game_start_time: market.gameStartTime,
          uma_resolution_status: market.umaResolutionStatus,
          uma_resolution_statuses: market.umaResolutionStatuses,
          resolved_by: market.resolvedBy,
          ready: market.ready,
          approved: market.approved,
          resolved: market.resolved,
          period: market.period,
          finished_timestamp: market.finishedTimestamp,
          automatically_resolved: market.automaticallyResolved,
          last_seen_in_open_feed_at: runStartedAt,
          category_id: categoryId,
          primary_category_id: categoryId,
          status: market.status,
          end_date: market.endDate,
          active: market.active,
          closed: market.closed,
          archived: market.archived,
          accepting_orders: market.acceptingOrders,
          enable_order_book: market.enableOrderBook,
          closed_time: market.closedTime,
          volume: market.volume,
          volume_24h: market.volume24h,
          liquidity: market.liquidity,
          featured: market.featured,
          is_new: market.isNew,
          competitive: market.competitive,
          one_day_price_change: market.oneDayPriceChange,
          one_hour_price_change: market.oneHourPriceChange,
          one_week_price_change: market.oneWeekPriceChange,
          gamma_updated_at: market.gammaUpdatedAt
        };
      });
      const persisted = await this.sql<{ id: string; external_market_id: string }[]>`
        insert into markets ${this.sql(rows)}
        on conflict (venue_id, external_market_id) do update set
          slug = excluded.slug, title = excluded.title, description = excluded.description,
          group_item_title = excluded.group_item_title, sports_market_type = excluded.sports_market_type,
          game_start_time = excluded.game_start_time, uma_resolution_status = excluded.uma_resolution_status,
          uma_resolution_statuses = excluded.uma_resolution_statuses, resolved_by = excluded.resolved_by,
          ready = excluded.ready, approved = excluded.approved, category_id = excluded.category_id,
          resolved = excluded.resolved, period = excluded.period,
          finished_timestamp = excluded.finished_timestamp,
          automatically_resolved = excluded.automatically_resolved,
          last_seen_in_open_feed_at = excluded.last_seen_in_open_feed_at,
          primary_category_id = excluded.primary_category_id, status = excluded.status,
          end_date = excluded.end_date, active = excluded.active, closed = excluded.closed,
          archived = excluded.archived, accepting_orders = excluded.accepting_orders,
          enable_order_book = excluded.enable_order_book,
          closed_time = excluded.closed_time, volume = excluded.volume,
          volume_24h = excluded.volume_24h, liquidity = excluded.liquidity,
          featured = excluded.featured, is_new = excluded.is_new,
          competitive = excluded.competitive, one_day_price_change = excluded.one_day_price_change,
          one_hour_price_change = excluded.one_hour_price_change,
          one_week_price_change = excluded.one_week_price_change,
          gamma_updated_at = excluded.gamma_updated_at, updated_at = now()
        returning id, external_market_id
      `;
      for (const market of persisted) ids.set(market.external_market_id, market.id);
    }
    return ids;
  }

  private relationshipCounters(candidateRows: number, uniqueRows: number): RelationshipSyncCounters {
    return {
      candidateRows,
      uniqueRows,
      batchSize: this.relationshipSyncBatchSize,
      batches: Math.ceil(uniqueRows / this.relationshipSyncBatchSize)
    };
  }

  private addRelationshipCounters(timings: Record<string, number>, prefix: string, counters: RelationshipSyncCounters) {
    timings[`${prefix}CandidateRows`] = counters.candidateRows;
    timings[`${prefix}UniqueRows`] = counters.uniqueRows;
    timings[`${prefix}BatchSize`] = counters.batchSize;
    timings[`${prefix}Batches`] = counters.batches;
  }

  private async syncEventTags(events: NormalizedEvent[], eventIds: Map<string, string>, tagIds: Map<string, string>): Promise<RelationshipSyncCounters> {
    const candidates = events.flatMap((event) => event.tags.map((tag) => ({
      event_id: eventIds.get(event.externalEventId),
      tag_id: tagIds.get(tag.slug)
    })));
    const rows = uniqueBy(candidates.filter((row): row is { event_id: string; tag_id: string } => Boolean(row.event_id && row.tag_id)), (row) => `${row.event_id}:${row.tag_id}`);
    for (const batch of chunked(rows, this.relationshipSyncBatchSize)) await this.sql`insert into event_tags ${this.sql(batch)} on conflict (event_id, tag_id) do nothing`;
    return this.relationshipCounters(candidates.length, rows.length);
  }

  private async syncMarketCategories(markets: NormalizedMarket[], marketIds: Map<string, string>, categoryIds: Map<string, string>): Promise<RelationshipSyncCounters> {
    const candidates = markets.map((market) => ({
      market_id: marketIds.get(market.externalMarketId),
      category_id: categoryIds.get(market.categorySlug),
      is_primary: true,
      source: market.categorySource,
      confidence: market.categoryConfidence
    }));
    const rows = uniqueBy(candidates.filter((row): row is {
      market_id: string;
      category_id: string;
      is_primary: boolean;
      source: NormalizedMarket["categorySource"];
      confidence: number;
    } => Boolean(row.market_id && row.category_id)), (row) => `${row.market_id}:${row.category_id}:${row.source}`);
    for (const batch of chunked(rows, this.relationshipSyncBatchSize)) {
      const marketIdsForBatch = batch.map((row) => row.market_id);
      await this.sql`update market_categories set is_primary = false where market_id in ${this.sql(marketIdsForBatch)} and is_primary = true`;
      await this.sql`
        insert into market_categories ${this.sql(batch)}
        on conflict (market_id, category_id, source) do update set
          is_primary = excluded.is_primary, confidence = excluded.confidence
      `;
    }
    return this.relationshipCounters(candidates.length, rows.length);
  }

  private async syncMarketTags(markets: NormalizedMarket[], marketIds: Map<string, string>, tagIds: Map<string, string>): Promise<RelationshipSyncCounters> {
    const candidates = markets.flatMap((market) => market.tags.map((tag) => ({
      market_id: marketIds.get(market.externalMarketId),
      tag_id: tagIds.get(tag.slug),
      source: market.categorySource
    })));
    const rows = uniqueBy(candidates.filter((row): row is { market_id: string; tag_id: string; source: NormalizedMarket["categorySource"] } => Boolean(row.market_id && row.tag_id)), (row) => `${row.market_id}:${row.tag_id}:${row.source}`);
    for (const batch of chunked(rows, this.relationshipSyncBatchSize)) await this.sql`insert into market_tags ${this.sql(batch)} on conflict (market_id, tag_id, source) do nothing`;
    return this.relationshipCounters(candidates.length, rows.length);
  }

  private async syncOutcomes(markets: NormalizedMarket[], marketIds: Map<string, string>): Promise<RelationshipSyncCounters> {
    const candidates = markets.flatMap((market) => market.outcomes.map((outcome) => ({
      market_id: marketIds.get(market.externalMarketId),
      outcome_name: outcome.name,
      external_token_id: outcome.externalTokenId,
      probability: outcome.probability,
      volume: outcome.volume,
      rank: outcome.rank
    })));
    const rows = uniqueBy(candidates.filter((row): row is {
      market_id: string;
      outcome_name: string;
      external_token_id: string | null;
      probability: number | null;
      volume: number;
      rank: number;
    } => Boolean(row.market_id)), (row) => `${row.market_id}:${row.outcome_name}`);
    for (const batch of chunked(rows, this.relationshipSyncBatchSize)) await this.sql`
      insert into market_outcomes ${this.sql(batch)}
      on conflict (market_id, outcome_name) do update set
        external_token_id = excluded.external_token_id,
        probability = excluded.probability, volume = excluded.volume,
        rank = excluded.rank, updated_at = now()
    `;
    return this.relationshipCounters(candidates.length, rows.length);
  }

  private async syncEventMarkets(events: NormalizedEvent[], eventIds: Map<string, string>, marketIds: Map<string, string>): Promise<RelationshipSyncCounters> {
    const candidates = events.flatMap((event) => event.markets.map((market) => ({
      event_id: eventIds.get(event.externalEventId),
      market_id: marketIds.get(market.externalMarketId)
    })));
    const rows = uniqueBy(candidates.filter((row): row is { event_id: string; market_id: string } => Boolean(row.event_id && row.market_id)), (row) => `${row.event_id}:${row.market_id}`);
    for (const batch of chunked(rows, this.relationshipSyncBatchSize)) await this.sql`insert into event_markets ${this.sql(batch)} on conflict (event_id, market_id) do nothing`;
    return this.relationshipCounters(candidates.length, rows.length);
  }

  private addMarketStats(stats: SyncStats, market: NormalizedMarket) {
    stats.markets += 1;
    stats.categoryCounts[market.categoryName] = (stats.categoryCounts[market.categoryName] ?? 0) + 1;
    if (market.categoryName === "Other") {
      stats.otherMarkets += 1;
      stats.unknownTags += market.tags.length;
    } else {
      stats.categoriesAssigned += 1;
    }
  }

  async applyOpenFeedGuardrails(events: GammaEvent[], runStartedAt: Date): Promise<OpenFeedGuardrailStats> {
    const startedAt = Date.now();
    const eventRows = events.filter((event) => event.id).map((event) => ({
      external_event_id: event.id,
      final_state: hasFinalEventState(event),
      closed_time: event.closedTime ?? null,
      ended: event.ended ?? null,
      live: event.live ?? null,
      period: event.period ?? null,
      finished_timestamp: event.finishedTimestamp ?? null,
      score: event.score ?? null,
      automatically_resolved: event.automaticallyResolved ?? null,
      gamma_updated_at: event.updatedAt ?? null
    }));
    const marketRows = events.flatMap((event) => (event.markets ?? []).map((market) => ({
      external_market_id: market.conditionId ?? market.id ?? null,
      final_state: hasFinalMarketState(market),
      closed_time: market.closedTime ?? null,
      uma_resolution_status: market.umaResolutionStatus ?? null,
      resolved: market.resolved ?? null,
      period: market.period ?? null,
      finished_timestamp: market.finishedTimestamp ?? null,
      automatically_resolved: market.automaticallyResolved ?? null,
      gamma_updated_at: market.updatedAt ?? null
    }))).filter((market) => market.external_market_id);
    const totals = { eventsStamped: 0, finalEventsClosed: 0, marketsStamped: 0, finalMarketsClosed: 0 };

    for (const batch of chunked(eventRows)) {
      const rows = await this.sql<{ final_state: boolean }[]>`
        with incoming as (
          select *
          from jsonb_to_recordset(${this.sql.json(batch)}::jsonb) as x(
            external_event_id text,
            final_state boolean,
            closed_time timestamptz,
            ended boolean,
            live boolean,
            period text,
            finished_timestamp timestamptz,
            score text,
            automatically_resolved boolean,
            gamma_updated_at timestamptz
          )
        )
        update events e set
          active = case when incoming.final_state then false else e.active end,
          closed = case when incoming.final_state then true else e.closed end,
          closed_time = coalesce(incoming.closed_time, e.closed_time),
          ended = coalesce(incoming.ended, e.ended),
          live = coalesce(incoming.live, e.live),
          period = coalesce(incoming.period, e.period),
          finished_timestamp = coalesce(incoming.finished_timestamp, e.finished_timestamp),
          score = coalesce(incoming.score, e.score),
          automatically_resolved = coalesce(incoming.automatically_resolved, e.automatically_resolved),
          gamma_updated_at = coalesce(incoming.gamma_updated_at, e.gamma_updated_at),
          last_seen_in_open_feed_at = ${runStartedAt},
          updated_at = now()
        from incoming
        where e.external_event_id = incoming.external_event_id
        returning incoming.final_state
      `;
      totals.eventsStamped += rows.length;
      totals.finalEventsClosed += rows.filter((row) => row.final_state).length;
    }

    for (const batch of chunked(marketRows)) {
      const rows = await this.sql<{ final_state: boolean }[]>`
        with incoming as (
          select *
          from jsonb_to_recordset(${this.sql.json(batch)}::jsonb) as x(
            external_market_id text,
            final_state boolean,
            closed_time timestamptz,
            uma_resolution_status text,
            resolved boolean,
            period text,
            finished_timestamp timestamptz,
            automatically_resolved boolean,
            gamma_updated_at timestamptz
          )
        )
        update markets m set
          status = case
            when incoming.final_state and lower(coalesce(incoming.uma_resolution_status, '')) = 'resolved' then 'resolved'
            when incoming.final_state then 'closed'
            else m.status
          end,
          active = case when incoming.final_state then false else m.active end,
          closed = case when incoming.final_state then true else m.closed end,
          accepting_orders = case when incoming.final_state then false else m.accepting_orders end,
          closed_time = coalesce(incoming.closed_time, m.closed_time),
          uma_resolution_status = coalesce(incoming.uma_resolution_status, m.uma_resolution_status),
          resolved = coalesce(incoming.resolved, m.resolved),
          period = coalesce(incoming.period, m.period),
          finished_timestamp = coalesce(incoming.finished_timestamp, m.finished_timestamp),
          automatically_resolved = coalesce(incoming.automatically_resolved, m.automatically_resolved),
          gamma_updated_at = coalesce(incoming.gamma_updated_at, m.gamma_updated_at),
          last_seen_in_open_feed_at = ${runStartedAt},
          updated_at = now()
        from incoming
        where m.external_market_id = incoming.external_market_id
        returning incoming.final_state
      `;
      totals.marketsStamped += rows.length;
      totals.finalMarketsClosed += rows.filter((row) => row.final_state).length;
    }

    return { ...totals, durationMs: Date.now() - startedAt };
  }

  async syncClosedEvents(events: GammaEvent[]): Promise<ClosedFeedSyncStats> {
    const startedAt = Date.now();
    const eventRows = events
      .filter((event): event is GammaEvent & { id: string } => Boolean(event.id))
      .map((event) => ({
        external_event_id: event.id,
        closed_time: event.closedTime ?? null,
        ended: event.ended ?? null,
        live: event.live ?? null,
        period: event.period ?? null,
        finished_timestamp: event.finishedTimestamp ?? null,
        score: event.score ?? null,
        automatically_resolved: event.automaticallyResolved ?? null,
        gamma_updated_at: event.updatedAt ?? null
      }));
    if (eventRows.length === 0) {
      return { fetchedEvents: events.length, localEventsBatchClosed: 0, localChildMarketsBatchClosed: 0, durationMs: Date.now() - startedAt };
    }

    const [eventCounts] = await this.sql<{ events_closed: number; child_markets_closed: number }[]>`
      with incoming as (
        select *
        from jsonb_to_recordset(${this.sql.json(eventRows)}::jsonb) as x(
          external_event_id text,
          closed_time timestamptz,
          ended boolean,
          live boolean,
          period text,
          finished_timestamp timestamptz,
          score text,
          automatically_resolved boolean,
          gamma_updated_at timestamptz
        )
      ),
      closed_events as (
        update events e set
          active = false,
          closed = true,
          closed_time = coalesce(incoming.closed_time, e.closed_time),
          ended = coalesce(incoming.ended, e.ended),
          live = coalesce(incoming.live, false),
          period = coalesce(incoming.period, e.period),
          finished_timestamp = coalesce(incoming.finished_timestamp, e.finished_timestamp),
          score = coalesce(incoming.score, e.score),
          automatically_resolved = coalesce(incoming.automatically_resolved, e.automatically_resolved),
          gamma_updated_at = coalesce(incoming.gamma_updated_at, e.gamma_updated_at),
          last_lifecycle_checked_at = now(),
          updated_at = now()
        from incoming
        where e.external_event_id = incoming.external_event_id
        returning e.id
      ),
      closed_markets as (
        update markets m set
          status = case when lower(coalesce(m.uma_resolution_status, '')) = 'resolved' then 'resolved' else 'closed' end,
          active = false,
          closed = true,
          accepting_orders = false,
          last_lifecycle_checked_at = now(),
          updated_at = now()
        from event_markets em
        join closed_events e on e.id = em.event_id
        where m.id = em.market_id
        returning m.id
      )
      select
        (select count(*)::int from closed_events) as events_closed,
        (select count(distinct id)::int from closed_markets) as child_markets_closed
    `;

    const marketRows = events.flatMap((event) => (event.markets ?? []).map((market) => ({
      external_event_id: event.id ?? null,
      external_market_id: market.conditionId ?? market.id ?? null,
      closed_time: market.closedTime ?? null,
      uma_resolution_status: market.umaResolutionStatus ?? null,
      uma_resolution_statuses: market.umaResolutionStatuses === undefined ? null : stringArray(market.umaResolutionStatuses),
      resolved: market.resolved ?? null,
      period: market.period ?? null,
      finished_timestamp: market.finishedTimestamp ?? null,
      automatically_resolved: market.automaticallyResolved ?? null,
      gamma_updated_at: market.updatedAt ?? null
    }))).filter((market) => market.external_event_id && market.external_market_id);
    for (const batch of chunked(marketRows)) {
      await this.sql`
        with incoming as (
          select *
          from jsonb_to_recordset(${this.sql.json(batch)}::jsonb) as x(
            external_event_id text,
            external_market_id text,
            closed_time timestamptz,
            uma_resolution_status text,
            uma_resolution_statuses text[],
            resolved boolean,
            period text,
            finished_timestamp timestamptz,
            automatically_resolved boolean,
            gamma_updated_at timestamptz
          )
        )
        update markets m set
          status = case when lower(coalesce(incoming.uma_resolution_status, '')) = 'resolved' then 'resolved' else m.status end,
          closed_time = coalesce(incoming.closed_time, m.closed_time),
          uma_resolution_status = coalesce(incoming.uma_resolution_status, m.uma_resolution_status),
          uma_resolution_statuses = coalesce(incoming.uma_resolution_statuses, m.uma_resolution_statuses),
          resolved = coalesce(incoming.resolved, m.resolved),
          period = coalesce(incoming.period, m.period),
          finished_timestamp = coalesce(incoming.finished_timestamp, m.finished_timestamp),
          automatically_resolved = coalesce(incoming.automatically_resolved, m.automatically_resolved),
          gamma_updated_at = coalesce(incoming.gamma_updated_at, m.gamma_updated_at),
          updated_at = now()
        from incoming
        join events e on e.external_event_id = incoming.external_event_id
        join event_markets em on em.event_id = e.id
        where m.id = em.market_id
          and m.external_market_id = incoming.external_market_id
      `;
    }

    return {
      fetchedEvents: events.length,
      localEventsBatchClosed: eventCounts?.events_closed ?? 0,
      localChildMarketsBatchClosed: eventCounts?.child_markets_closed ?? 0,
      durationMs: Date.now() - startedAt
    };
  }

  async cleanupStaleOpenEvents(graceMinutes: number, endDateBufferHours: number, apply: boolean): Promise<StaleCleanupStats> {
    const startedAt = Date.now();
    const staleWhere = this.sql`
      e.active = true
      and e.closed = false
      and e.archived = false
      and e.last_seen_in_open_feed_at <= now() - (${graceMinutes} * interval '1 minute')
      and e.end_date <= now() - (${endDateBufferHours} * interval '1 hour')
    `;
    const [candidateRow] = await this.sql<{ count: number }[]>`
      select count(*)::int
      from events e
      where ${staleWhere}
    `;
    const candidates = candidateRow?.count ?? 0;
    if (!apply || candidates === 0) {
      return { candidates, eventsClosed: 0, childMarketsClosed: 0, applied: false, durationMs: Date.now() - startedAt };
    }

    const [closed] = await this.sql<{ events_closed: number; child_markets_closed: number }[]>`
      with stale_events as (
        update events e set
          active = false,
          closed = true,
          last_lifecycle_checked_at = now(),
          updated_at = now()
        where ${staleWhere}
        returning e.id
      ),
      stale_markets as (
        update markets m set
          status = 'closed',
          active = false,
          closed = true,
          accepting_orders = false,
          last_lifecycle_checked_at = now(),
          updated_at = now()
        from event_markets em
        join stale_events e on e.id = em.event_id
        where m.id = em.market_id
        returning m.id
      )
      select
        (select count(*)::int from stale_events) as events_closed,
        (select count(distinct id)::int from stale_markets) as child_markets_closed
    `;
    return {
      candidates,
      eventsClosed: closed?.events_closed ?? 0,
      childMarketsClosed: closed?.child_markets_closed ?? 0,
      applied: true,
      durationMs: Date.now() - startedAt
    };
  }

  async selectLifecycleReconcileCandidates(limit: number, staleMinutes: number) {
    return this.sql<LifecycleReconcileCandidate[]>`
      select
        e.id,
        e.external_event_id as "externalEventId",
        e.title,
        e.end_date as "endDate",
        e.last_seen_in_open_feed_at as "lastSeenInOpenFeedAt",
        e.last_lifecycle_checked_at as "lastLifecycleCheckedAt",
        e.volume::text,
        exists (
          select 1
          from event_markets sports_em
          join markets sports_m on sports_m.id = sports_em.market_id
          where sports_em.event_id = e.id
            and sports_m.sports_market_type is not null
            and sports_m.game_start_time <= now()
        ) as "hasStartedSportsMarket"
      from events e
      where e.active = true
        and e.closed = false
        and e.archived = false
        and (
          e.last_lifecycle_checked_at is null
          or e.last_lifecycle_checked_at <= now() - (${staleMinutes} * interval '1 minute')
        )
        and exists (
          select 1
          from event_markets open_em
          join markets open_m on open_m.id = open_em.market_id
          where open_em.event_id = e.id
            and open_m.status = 'open'
            and open_m.active = true
            and open_m.closed = false
            and open_m.archived = false
            and open_m.accepting_orders = true
            and open_m.enable_order_book = true
        )
      order by
        (e.end_date <= now()) desc,
        (e.last_seen_in_open_feed_at is null or e.last_seen_in_open_feed_at <= now() - (${staleMinutes} * interval '1 minute')) desc,
        exists (
          select 1
          from event_markets sports_em
          join markets sports_m on sports_m.id = sports_em.market_id
          where sports_em.event_id = e.id
            and sports_m.sports_market_type is not null
            and sports_m.game_start_time <= now()
        ) desc,
        (
          select coalesce(max(stale_m.gamma_updated_at), '-infinity'::timestamptz)
          from event_markets stale_em
          join markets stale_m on stale_m.id = stale_em.market_id
          where stale_em.event_id = e.id
        ) asc,
        coalesce(e.volume, 0) desc
      limit ${limit}
    `;
  }

  async markLifecycleChecked(eventId: string) {
    await this.sql`update events set last_lifecycle_checked_at = now() where id = ${eventId}`;
  }

  async reconcileEventDetail(eventId: string, detail: GammaEvent): Promise<LifecycleReconcileUpdate> {
    const checkedAt = new Date();
    const confirmedClosed = eventConfirmedClosed(detail);
    if (confirmedClosed) {
      const stats = await this.syncClosedEvents([detail]);
      return {
        eventClosed: true,
        childMarketsUpdated: stats.localChildMarketsBatchClosed,
        childMarketsMissingLocally: 0
      };
    }
    await this.sql`
      update events set
        active = coalesce(${detail.active ?? null}, active),
        closed = case when ${confirmedClosed} then true else coalesce(${detail.closed ?? null}, closed) end,
        archived = coalesce(${detail.archived ?? null}, archived),
        closed_time = coalesce(${dateOrNull(detail.closedTime)}, closed_time),
        live = coalesce(${detail.live ?? null}, live),
        ended = coalesce(${detail.ended ?? null}, ended),
        period = coalesce(${detail.period ?? null}, period),
        finished_timestamp = coalesce(${dateOrNull(detail.finishedTimestamp)}, finished_timestamp),
        score = coalesce(${detail.score ?? null}, score),
        automatically_resolved = coalesce(${detail.automaticallyResolved ?? null}, automatically_resolved),
        gamma_updated_at = coalesce(${dateOrNull(detail.updatedAt)}, gamma_updated_at),
        last_lifecycle_checked_at = ${checkedAt},
        updated_at = now()
      where id = ${eventId}
    `;
    return { eventClosed: false, childMarketsUpdated: 0, childMarketsMissingLocally: 0 };
  }
}
