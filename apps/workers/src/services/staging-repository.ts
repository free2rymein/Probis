import type postgres from "postgres";
import type { GammaEvent, GammaMarket, GammaTag } from "./polymarket";

const chunked = <T>(items: T[], size = 250) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

const DEFAULT_RAW_STAGING_PAGE_SIZE = 250;
const normalizedPageSize = (value: number | undefined): number => {
  if (value === undefined) return DEFAULT_RAW_STAGING_PAGE_SIZE;
  return Number.isInteger(value) && value >= 50 ? value : DEFAULT_RAW_STAGING_PAGE_SIZE;
};

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

export type RawReadStats = {
  paginationMode: "keyset-id";
  pageSize: number;
  pages: number;
  rows: number;
  totalDurationMs: number;
  averagePageDurationMs: number;
  maxPageDurationMs: number;
  selectedColumns: string[];
};

export type RawReadResult<T> = {
  rows: T[];
  stats: RawReadStats;
};

export type RawStatusUpdateRow = {
  id: string;
  status: "normalized" | "excluded" | "failed";
  exclusionReasons?: string[];
  errorMessage?: string | null;
};

export type RawEventStatusUpdateByExternalIdRow = Omit<RawStatusUpdateRow, "id"> & {
  externalEventId: string;
};

export type RawMarketStatusUpdateByExternalIdRow = Omit<RawStatusUpdateRow, "id"> & {
  externalMarketId: string;
};

export type RawStatusUpdateStats = {
  rowsUpdated: number;
  skippedRows: number;
  failedRows: number;
  groups: number;
  statements: number;
  batchSize: number;
  mode: "grouped-bulk";
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
  private readonly readPageSize: number;
  private readonly writePageSize: number;
  private readonly statusUpdateBatchSize: number;

  constructor(
    private readonly sql: postgres.Sql,
    options: { readPageSize?: number; writePageSize?: number; statusUpdateBatchSize?: number } = {}
  ) {
    this.readPageSize = normalizedPageSize(options.readPageSize);
    this.writePageSize = normalizedPageSize(options.writePageSize);
    this.statusUpdateBatchSize = normalizedPageSize(options.statusUpdateBatchSize);
  }

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
    for (const batch of chunked(rows, this.writePageSize)) {
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
    for (const batch of chunked(rows, this.writePageSize)) {
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
    const result = await this.getPendingRawEventsWithStats(batchId);
    return result.rows;
  }

  async getRawEventsForBatch(batchId: string): Promise<RawStagedEvent[]> {
    return this.sql<RawStagedEvent[]>`
      select
        id,
        external_event_id as "externalEventId",
        payload
      from gamma_raw_events
      where batch_id = ${batchId}
      order by id
    `;
  }

  async getPendingRawEventsWithStats(batchId: string): Promise<RawReadResult<RawStagedEvent>> {
    const rows: RawStagedEvent[] = [];
    const pageDurations: number[] = [];
    const startedAt = Date.now();
    const selectedColumns = ["id", "external_event_id", "payload"];
    let lastId: string | null = null;

    for (;;) {
      const pageStartedAt = Date.now();
      const page: RawStagedEvent[] = await this.sql<RawStagedEvent[]>`
        select
          id,
          external_event_id as "externalEventId",
          payload
        from gamma_raw_events
        where batch_id = ${batchId}
          and normalization_status = 'pending'
          and (${lastId}::uuid is null or id > ${lastId}::uuid)
        order by id
        limit ${this.readPageSize}
      `;
      pageDurations.push(Date.now() - pageStartedAt);

      rows.push(...page);

      const lastRow: RawStagedEvent | undefined = page[page.length - 1];
      if (lastRow) {
        lastId = lastRow.id;
      }

      if (page.length < this.readPageSize) {
        const totalDurationMs = Date.now() - startedAt;
        return {
          rows,
          stats: {
            paginationMode: "keyset-id",
            pageSize: this.readPageSize,
            pages: pageDurations.length,
            rows: rows.length,
            totalDurationMs,
            averagePageDurationMs: pageDurations.length === 0
              ? 0
              : Number((pageDurations.reduce((total, duration) => total + duration, 0) / pageDurations.length).toFixed(1)),
            maxPageDurationMs: Math.max(0, ...pageDurations),
            selectedColumns
          }
        };
      }
    }
  }

  async getPendingRawMarkets(batchId: string) {
    const result = await this.getPendingRawMarketsWithStats(batchId);
    return result.rows;
  }

  async getRawMarketsForBatch(batchId: string): Promise<RawStagedMarket[]> {
    return this.sql<RawStagedMarket[]>`
      select
        id,
        external_event_id as "externalEventId",
        external_market_id as "externalMarketId",
        payload
      from gamma_raw_markets
      where batch_id = ${batchId}
      order by id
    `;
  }

  async getPendingRawMarketsWithStats(batchId: string): Promise<RawReadResult<RawStagedMarket>> {
    const rows: RawStagedMarket[] = [];
    const pageDurations: number[] = [];
    const startedAt = Date.now();
    const selectedColumns = ["id", "external_event_id", "external_market_id", "payload"];
    let lastId: string | null = null;

    for (;;) {
      const pageStartedAt = Date.now();
      const page: RawStagedMarket[] = await this.sql<RawStagedMarket[]>`
        select
          id,
          external_event_id as "externalEventId",
          external_market_id as "externalMarketId",
          payload
        from gamma_raw_markets
        where batch_id = ${batchId}
          and normalization_status = 'pending'
          and (${lastId}::uuid is null or id > ${lastId}::uuid)
        order by id
        limit ${this.readPageSize}
      `;
      pageDurations.push(Date.now() - pageStartedAt);

      rows.push(...page);

      const lastRow: RawStagedMarket | undefined = page[page.length - 1];
      if (lastRow) {
        lastId = lastRow.id;
      }

      if (page.length < this.readPageSize) {
        const totalDurationMs = Date.now() - startedAt;
        return {
          rows,
          stats: {
            paginationMode: "keyset-id",
            pageSize: this.readPageSize,
            pages: pageDurations.length,
            rows: rows.length,
            totalDurationMs,
            averagePageDurationMs: pageDurations.length === 0
              ? 0
              : Number((pageDurations.reduce((total, duration) => total + duration, 0) / pageDurations.length).toFixed(1)),
            maxPageDurationMs: Math.max(0, ...pageDurations),
            selectedColumns
          }
        };
      }
    }
  }

  async markRawEvents(rows: RawStatusUpdateRow[]): Promise<RawStatusUpdateStats> {
    return this.markRawRows("gamma_raw_events", rows);
  }

  async markRawMarkets(rows: RawStatusUpdateRow[]): Promise<RawStatusUpdateStats> {
    return this.markRawRows("gamma_raw_markets", rows);
  }

  async markRawEventsByExternalId(batchId: string, rows: RawEventStatusUpdateByExternalIdRow[]): Promise<RawStatusUpdateStats> {
    return this.markRawRowsByExternalId("gamma_raw_events", batchId, rows);
  }

  async markRawMarketsByExternalId(batchId: string, rows: RawMarketStatusUpdateByExternalIdRow[]): Promise<RawStatusUpdateStats> {
    return this.markRawRowsByExternalId("gamma_raw_markets", batchId, rows);
  }

  private async markRawRows(tableName: "gamma_raw_events" | "gamma_raw_markets", rows: RawStatusUpdateRow[]): Promise<RawStatusUpdateStats> {
    const groups = new Map<string, {
      status: RawStatusUpdateRow["status"];
      exclusionReasons: string[];
      errorMessage: string | null;
      ids: string[];
    }>();
    let failedRows = 0;

    for (const row of rows) {
      const exclusionReasons = row.exclusionReasons ?? [];
      const errorMessage = row.errorMessage ?? null;
      const key = JSON.stringify([row.status, exclusionReasons, errorMessage]);
      const group = groups.get(key) ?? {
        status: row.status,
        exclusionReasons,
        errorMessage,
        ids: []
      };
      group.ids.push(row.id);
      groups.set(key, group);
      if (row.status === "failed") failedRows += 1;
    }

    let statements = 0;
    const updateTable = tableName === "gamma_raw_events" ? this.sql`gamma_raw_events` : this.sql`gamma_raw_markets`;
    for (const group of groups.values()) {
      for (const ids of chunked(group.ids, this.statusUpdateBatchSize)) {
        if (ids.length === 0) continue;
        statements += 1;
        await this.sql`
          update ${updateTable} set
            normalization_status = ${group.status},
            exclusion_reasons = ${group.exclusionReasons},
            error_message = ${group.errorMessage},
            normalized_at = now()
          where id in ${this.sql(ids)}
        `;
      }
    }

    return {
      rowsUpdated: rows.length,
      skippedRows: 0,
      failedRows,
      groups: groups.size,
      statements,
      batchSize: this.statusUpdateBatchSize,
      mode: "grouped-bulk"
    };
  }

  private async markRawRowsByExternalId(
    tableName: "gamma_raw_events" | "gamma_raw_markets",
    batchId: string,
    rows: Array<RawEventStatusUpdateByExternalIdRow | RawMarketStatusUpdateByExternalIdRow>
  ): Promise<RawStatusUpdateStats> {
    const groups = new Map<string, {
      status: RawStatusUpdateRow["status"];
      exclusionReasons: string[];
      errorMessage: string | null;
      externalIds: string[];
    }>();
    let failedRows = 0;

    for (const row of rows) {
      const externalId = "externalEventId" in row ? row.externalEventId : row.externalMarketId;
      const exclusionReasons = row.exclusionReasons ?? [];
      const errorMessage = row.errorMessage ?? null;
      const key = JSON.stringify([row.status, exclusionReasons, errorMessage]);
      const group = groups.get(key) ?? {
        status: row.status,
        exclusionReasons,
        errorMessage,
        externalIds: []
      };
      group.externalIds.push(externalId);
      groups.set(key, group);
      if (row.status === "failed") failedRows += 1;
    }

    let statements = 0;
    let rowsUpdated = 0;
    const updateTable = tableName === "gamma_raw_events" ? this.sql`gamma_raw_events` : this.sql`gamma_raw_markets`;
    const externalColumn = tableName === "gamma_raw_events" ? this.sql`external_event_id` : this.sql`external_market_id`;
    for (const group of groups.values()) {
      for (const externalIds of chunked(group.externalIds, this.statusUpdateBatchSize)) {
        if (externalIds.length === 0) continue;
        statements += 1;
        const updated = await this.sql<{ id: string }[]>`
          update ${updateTable} set
            normalization_status = ${group.status},
            exclusion_reasons = ${group.exclusionReasons},
            error_message = ${group.errorMessage},
            normalized_at = now()
          where batch_id = ${batchId}
            and ${externalColumn} in ${this.sql(externalIds)}
          returning id
        `;
        rowsUpdated += updated.length;
      }
    }

    return {
      rowsUpdated,
      skippedRows: Math.max(0, rows.length - rowsUpdated),
      failedRows,
      groups: groups.size,
      statements,
      batchSize: this.statusUpdateBatchSize,
      mode: "grouped-bulk"
    };
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

  async truncateRawStaging(): Promise<RawCleanupStats> {
    return this.sql.begin(async (transaction) => {
      const [eventCount] = await transaction<{ count: number }[]>`
        select count(*)::int as count from gamma_raw_events
      `;
      const [marketCount] = await transaction<{ count: number }[]>`
        select count(*)::int as count from gamma_raw_markets
      `;
      const affectedBatches = await transaction<{ id: string }[]>`
        with affected_batches as (
          select batch_id from gamma_raw_events
          union
          select batch_id from gamma_raw_markets
        )
        update gamma_ingestion_batches batches set
          raw_cleanup_at = now()
        from affected_batches affected
        where batches.id = affected.batch_id
        returning batches.id
      `;

      await transaction`
        truncate table gamma_raw_events, gamma_raw_markets
      `;

      return {
        rawEventsDeleted: eventCount?.count ?? 0,
        rawMarketsDeleted: marketCount?.count ?? 0,
        affectedBatches: affectedBatches.length
      };
    });
  }
}
