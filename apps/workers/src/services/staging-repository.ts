import type postgres from "postgres";
import type { GammaEvent, GammaMarket, GammaTag } from "./polymarket";

const chunked = <T>(items: T[], size = 250) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

const RAW_STAGING_READ_PAGE_SIZE = 250;

const dateOrNull = (value: string | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as never;

const compactTag = (tag: string | GammaTag) => typeof tag === "string" ? tag : ({
  id: tag.id,
  slug: tag.slug,
  label: tag.label ?? tag.name ?? tag.slug,
  type: tag.type
});

const compactEventTag = (tag: GammaTag): GammaTag => ({
  id: tag.id,
  slug: tag.slug,
  label: tag.label ?? tag.name ?? tag.slug,
  type: tag.type
});

const compactEvent = (event: GammaEvent): GammaEvent => ({
  id: event.id,
  slug: event.slug,
  title: event.title,
  description: event.description,
  ticker: event.ticker,
  category: event.category,
  active: event.active,
  closed: event.closed,
  archived: event.archived,
  ended: event.ended,
  closedTime: event.closedTime,
  startDate: event.startDate,
  startTime: event.startTime,
  endDate: event.endDate,
  endDateIso: event.endDateIso,
  resolutionDate: event.resolutionDate,
  updatedAt: event.updatedAt,
  createdAt: event.createdAt,
  volume: event.volume,
  volume24hr: event.volume24hr,
  liquidity: event.liquidity,
  openInterest: event.openInterest,
  tags: event.tags?.map(compactEventTag),
  live: event.live,
  period: event.period,
  finishedTimestamp: event.finishedTimestamp,
  score: event.score,
  automaticallyResolved: event.automaticallyResolved,
  stagedMarketIds: event.markets?.flatMap((market) => {
    const id = market.conditionId ?? market.id;
    return id ? [String(id)] : [];
  })
});

const compactMarket = (market: GammaMarket): GammaMarket => ({
  id: market.id,
  conditionId: market.conditionId,
  questionID: market.questionID,
  slug: market.slug,
  question: market.question,
  title: market.title,
  description: market.description,
  category: market.category,
  tags: market.tags?.map(compactTag),
  active: market.active,
  closed: market.closed,
  resolved: market.resolved,
  archived: market.archived,
  ready: market.ready,
  approved: market.approved,
  funded: market.funded,
  acceptingOrders: market.acceptingOrders,
  enableOrderBook: market.enableOrderBook,
  endDate: market.endDate,
  endDateIso: market.endDateIso,
  resolutionDate: market.resolutionDate,
  closedTime: market.closedTime,
  updatedAt: market.updatedAt,
  createdAt: market.createdAt,
  volume: market.volume,
  volumeNum: market.volumeNum,
  volume24h: market.volume24h,
  volume24hr: market.volume24hr,
  liquidity: market.liquidity,
  liquidityNum: market.liquidityNum,
  openInterest: market.openInterest,
  open_interest: market.open_interest,
  bestBid: market.bestBid,
  bestAsk: market.bestAsk,
  lastTradePrice: market.lastTradePrice,
  outcomes: market.outcomes,
  outcomePrices: market.outcomePrices,
  clobTokenIds: market.clobTokenIds,
  tokens: market.tokens?.map((token) => ({
    outcome: token.outcome,
    name: token.name,
    label: token.label,
    price: token.price
  })),
  groupItemTitle: market.groupItemTitle,
  sportsMarketType: market.sportsMarketType,
  gameStartTime: market.gameStartTime,
  umaResolutionStatus: market.umaResolutionStatus,
  umaResolutionStatuses: market.umaResolutionStatuses,
  resolvedBy: market.resolvedBy,
  automaticallyResolved: market.automaticallyResolved,
  featured: market.featured,
  new: market.new,
  competitive: market.competitive,
  oneDayPriceChange: market.oneDayPriceChange,
  oneHourPriceChange: market.oneHourPriceChange,
  oneWeekPriceChange: market.oneWeekPriceChange,
  period: market.period,
  finishedTimestamp: market.finishedTimestamp,
  eventStartTime: market.eventStartTime
});

export type GammaFeedKind = "open_events" | "closed_events" | "market_snapshots";

export type GammaIngestionBatch = {
  id: string;
  source: string;
  feedKind: string;
  status: string;
  startedAt: Date;
  fetchedAt: Date | null;
  normalizedAt: Date | null;
  completedAt: Date | null;
  rawCleanupAt: Date | null;
  eventCount: number;
  marketCount: number;
};

export type RawStagedEvent = {
  id: string;
  externalEventId: string;
  payload: GammaEvent;
};

export type RawStagedMarket = {
  id: string;
  externalEventId: string | null;
  externalMarketId: string;
  payload: GammaMarket;
};

export type RawInsertStats = {
  inserted: number;
  skipped: number;
};

export type RawCleanupStats = {
  rawEventsDeleted: number;
  rawMarketsDeleted: number;
  affectedBatches: number;
};

export type RawCleanupPolicy = {
  keepSuccessfulBatches: number;
  failedRetentionMinutes: number;
  otherRetentionMinutes: number;
};

export class StagingRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async createGammaIngestionBatch({
    feedKind,
    metadata = {}
  }: {
    feedKind: GammaFeedKind;
    metadata?: Record<string, unknown>;
  }) {
    const [batch] = await this.sql<{ id: string }[]>`
      insert into gamma_ingestion_batches (feed_kind, status, metadata)
      values (${feedKind}, 'started', ${this.sql.json(asJson(metadata))})
      returning id
    `;
    if (!batch) throw new Error(`Unable to create Gamma ingestion batch for ${feedKind}`);
    return batch.id;
  }

  async markBatchFetched(batchId: string, {
    eventCount,
    marketCount,
    timings = {}
  }: {
    eventCount: number;
    marketCount: number;
    timings?: Record<string, unknown>;
  }) {
    await this.sql`
      update gamma_ingestion_batches set
        status = 'fetched',
        fetched_at = now(),
        completed_at = now(),
        event_count = ${eventCount},
        market_count = ${marketCount},
        timings = timings || ${this.sql.json(asJson(timings))},
        error_message = null
      where id = ${batchId}
    `;
  }

  async markBatchNormalized(batchId: string, {
    normalizedEventCount,
    normalizedMarketCount,
    excludedEventCount = 0,
    excludedMarketCount = 0,
    timings = {}
  }: {
    normalizedEventCount: number;
    normalizedMarketCount: number;
    excludedEventCount?: number;
    excludedMarketCount?: number;
    timings?: Record<string, unknown>;
  }) {
    await this.sql`
      update gamma_ingestion_batches set
        status = 'normalized',
        normalized_at = now(),
        completed_at = now(),
        normalized_event_count = ${normalizedEventCount},
        normalized_market_count = ${normalizedMarketCount},
        excluded_event_count = ${excludedEventCount},
        excluded_market_count = ${excludedMarketCount},
        timings = timings || ${this.sql.json(asJson(timings))},
        error_message = null
      where id = ${batchId}
    `;
  }

  async markBatchFailed(batchId: string, error: unknown) {
    await this.sql`
      update gamma_ingestion_batches set
        status = 'failed',
        completed_at = now(),
        error_message = ${error instanceof Error ? error.message : String(error)}
      where id = ${batchId}
    `;
  }

  async insertRawEvents(batchId: string, feedKind: GammaFeedKind, rawEvents: GammaEvent[]): Promise<RawInsertStats> {
    const rows = rawEvents.flatMap((event) => event.id ? [{
      batch_id: batchId,
      feed_kind: feedKind,
      external_event_id: String(event.id),
      payload: compactEvent(event),
      source_updated_at: dateOrNull(event.updatedAt)
    }] : []);
    let inserted = 0;
    for (const batch of chunked(rows)) {
      const persisted = await this.sql<{ id: string }[]>`
        insert into gamma_raw_events (
          batch_id, feed_kind, external_event_id, payload, source_updated_at
        )
        select
          incoming.batch_id::uuid,
          incoming.feed_kind,
          incoming.external_event_id,
          incoming.payload,
          incoming.source_updated_at
        from jsonb_to_recordset(${this.sql.json(batch)}::jsonb) as incoming(
          batch_id text,
          feed_kind text,
          external_event_id text,
          payload jsonb,
          source_updated_at timestamptz
        )
        on conflict (batch_id, feed_kind, external_event_id) do nothing
        returning id
      `;
      inserted += persisted.length;
    }
    return { inserted, skipped: rows.length - inserted };
  }

  async insertRawMarkets(batchId: string, feedKind: GammaFeedKind, rawMarkets: Array<{
    externalEventId?: string | null;
    market: GammaMarket;
  }>): Promise<RawInsertStats> {
    const rows = rawMarkets.flatMap(({ externalEventId, market }) => {
      const externalMarketId = market.conditionId ?? market.id;
      return externalMarketId ? [{
        batch_id: batchId,
        feed_kind: feedKind,
        external_event_id: externalEventId ?? null,
        external_market_id: String(externalMarketId),
        payload: compactMarket(market),
        source_updated_at: dateOrNull(market.updatedAt)
      }] : [];
    });
    let inserted = 0;
    for (const batch of chunked(rows)) {
      const persisted = await this.sql<{ id: string }[]>`
        insert into gamma_raw_markets (
          batch_id, feed_kind, external_event_id, external_market_id, payload, source_updated_at
        )
        select
          incoming.batch_id::uuid,
          incoming.feed_kind,
          incoming.external_event_id,
          incoming.external_market_id,
          incoming.payload,
          incoming.source_updated_at
        from jsonb_to_recordset(${this.sql.json(batch)}::jsonb) as incoming(
          batch_id text,
          feed_kind text,
          external_event_id text,
          external_market_id text,
          payload jsonb,
          source_updated_at timestamptz
        )
        on conflict (batch_id, feed_kind, external_market_id) do nothing
        returning id
      `;
      inserted += persisted.length;
    }
    return { inserted, skipped: rows.length - inserted };
  }

  async getLatestCompletedOrFetchedBatch(feedKind: GammaFeedKind) {
    const [batch] = await this.sql<GammaIngestionBatch[]>`
      select
        id,
        source,
        feed_kind as "feedKind",
        status,
        started_at as "startedAt",
        fetched_at as "fetchedAt",
        normalized_at as "normalizedAt",
        completed_at as "completedAt",
        raw_cleanup_at as "rawCleanupAt",
        event_count as "eventCount",
        market_count as "marketCount"
      from gamma_ingestion_batches
      where feed_kind = ${feedKind}
        and status in ('fetched', 'normalized')
      order by completed_at desc nulls last, started_at desc
      limit 1
    `;
    return batch ?? null;
  }

  async getLatestFetchedBatch(feedKind: GammaFeedKind) {
    const [batch] = await this.sql<GammaIngestionBatch[]>`
      select
        id,
        source,
        feed_kind as "feedKind",
        status,
        started_at as "startedAt",
        fetched_at as "fetchedAt",
        normalized_at as "normalizedAt",
        completed_at as "completedAt",
        raw_cleanup_at as "rawCleanupAt",
        event_count as "eventCount",
        market_count as "marketCount"
      from gamma_ingestion_batches
      where feed_kind = ${feedKind}
        and status = 'fetched'
      order by fetched_at desc nulls last, started_at desc
      limit 1
    `;
    return batch ?? null;
  }

  async getBatch(batchId: string) {
    const [batch] = await this.sql<GammaIngestionBatch[]>`
      select
        id,
        source,
        feed_kind as "feedKind",
        status,
        started_at as "startedAt",
        fetched_at as "fetchedAt",
        normalized_at as "normalizedAt",
        completed_at as "completedAt",
        raw_cleanup_at as "rawCleanupAt",
        event_count as "eventCount",
        market_count as "marketCount"
      from gamma_ingestion_batches
      where id = ${batchId}
      limit 1
    `;
    return batch ?? null;
  }

  async getPendingRawEvents(batchId: string) {
    const rows: RawStagedEvent[] = [];

    for (let offset = 0; ; offset += RAW_STAGING_READ_PAGE_SIZE) {
      const page = await this.sql<RawStagedEvent[]>`
        select
          id,
          external_event_id as "externalEventId",
          payload
        from gamma_raw_events
        where batch_id = ${batchId}
          and normalization_status = 'pending'
        order by created_at, external_event_id
        limit ${RAW_STAGING_READ_PAGE_SIZE}
        offset ${offset}
      `;

      rows.push(...page);

      if (page.length < RAW_STAGING_READ_PAGE_SIZE) {
        return rows;
      }
    }
  }

  async getPendingRawMarkets(batchId: string) {
    const rows: RawStagedMarket[] = [];

    for (let offset = 0; ; offset += RAW_STAGING_READ_PAGE_SIZE) {
      const page = await this.sql<RawStagedMarket[]>`
        select
          id,
          external_event_id as "externalEventId",
          external_market_id as "externalMarketId",
          payload
        from gamma_raw_markets
        where batch_id = ${batchId}
          and normalization_status = 'pending'
        order by created_at, external_market_id
        limit ${RAW_STAGING_READ_PAGE_SIZE}
        offset ${offset}
      `;

      rows.push(...page);

      if (page.length < RAW_STAGING_READ_PAGE_SIZE) {
        return rows;
      }
    }
  }

  async markRawEvents(rows: Array<{
    id: string;
    status: "normalized" | "excluded" | "failed";
    exclusionReasons?: string[];
    errorMessage?: string | null;
  }>) {
    for (const batch of chunked(rows)) {
      if (batch.length === 0) continue;
      await this.sql`
        update gamma_raw_events raw set
          normalization_status = incoming.status,
          exclusion_reasons = incoming.exclusion_reasons,
          error_message = incoming.error_message,
          normalized_at = now()
        from jsonb_to_recordset(${this.sql.json(batch.map((row) => ({
          id: row.id,
          status: row.status,
          exclusion_reasons: row.exclusionReasons ?? [],
          error_message: row.errorMessage ?? null
        })))}::jsonb) as incoming(
          id uuid,
          status text,
          exclusion_reasons text[],
          error_message text
        )
        where raw.id = incoming.id
      `;
    }
  }

  async markRawMarkets(rows: Array<{
    id: string;
    status: "normalized" | "excluded" | "failed";
    exclusionReasons?: string[];
    errorMessage?: string | null;
  }>) {
    for (const batch of chunked(rows)) {
      if (batch.length === 0) continue;
      await this.sql`
        update gamma_raw_markets raw set
          normalization_status = incoming.status,
          exclusion_reasons = incoming.exclusion_reasons,
          error_message = incoming.error_message,
          normalized_at = now()
        from jsonb_to_recordset(${this.sql.json(batch.map((row) => ({
          id: row.id,
          status: row.status,
          exclusion_reasons: row.exclusionReasons ?? [],
          error_message: row.errorMessage ?? null
        })))}::jsonb) as incoming(
          id uuid,
          status text,
          exclusion_reasons text[],
          error_message text
        )
        where raw.id = incoming.id
      `;
    }
  }

  async cleanupRawStaging({
    keepSuccessfulBatches,
    failedRetentionMinutes,
    otherRetentionMinutes
  }: RawCleanupPolicy): Promise<RawCleanupStats> {
    return this.sql.begin(async (transaction) => {
      const deletedMarkets = await transaction<{ batch_id: string }[]>`
        with successful_batches as (
          select id, row_number() over (
            partition by feed_kind
            order by completed_at desc nulls last, started_at desc
          ) as recency_rank
          from gamma_ingestion_batches
          where status in ('fetched', 'normalized')
        ),
        removable_batches as (
          select id from successful_batches where recency_rank > ${keepSuccessfulBatches}
          union
          select id from gamma_ingestion_batches
          where status = 'failed'
            and created_at < now() - (${failedRetentionMinutes} * interval '1 minute')
          union
          select id from gamma_ingestion_batches
          where status not in ('fetched', 'normalized', 'failed')
            and created_at < now() - (${otherRetentionMinutes} * interval '1 minute')
        )
        delete from gamma_raw_markets raw
        using removable_batches removable
        where raw.batch_id = removable.id
        returning batch_id
      `;
      const deletedEvents = await transaction<{ batch_id: string }[]>`
        with successful_batches as (
          select id, row_number() over (
            partition by feed_kind
            order by completed_at desc nulls last, started_at desc
          ) as recency_rank
          from gamma_ingestion_batches
          where status in ('fetched', 'normalized')
        ),
        removable_batches as (
          select id from successful_batches where recency_rank > ${keepSuccessfulBatches}
          union
          select id from gamma_ingestion_batches
          where status = 'failed'
            and created_at < now() - (${failedRetentionMinutes} * interval '1 minute')
          union
          select id from gamma_ingestion_batches
          where status not in ('fetched', 'normalized', 'failed')
            and created_at < now() - (${otherRetentionMinutes} * interval '1 minute')
        )
        delete from gamma_raw_events raw
        using removable_batches removable
        where raw.batch_id = removable.id
        returning batch_id
      `;
      const batchIds = [...new Set([...deletedEvents, ...deletedMarkets].map((row) => row.batch_id))];
      if (batchIds.length > 0) {
        await transaction`
          update gamma_ingestion_batches
          set raw_cleanup_at = now()
          where id in ${transaction(batchIds)}
        `;
      }
      return {
        rawEventsDeleted: deletedEvents.length,
        rawMarketsDeleted: deletedMarkets.length,
        affectedBatches: batchIds.length
      };
    });
  }
}
