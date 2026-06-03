import type postgres from "postgres";
import type { MarketRepository } from "./market-repository";
import {
  createExclusionCounts,
  normalizeEvent,
  normalizeMarket,
  type ExclusionCounts,
  type NormalizedEvent
} from "./normalization";
import type { GammaEvent, GammaMarket } from "./polymarket";
import {
  StagingRepository,
  type GammaIngestionBatch,
  type RawEventStatusUpdateByExternalIdRow,
  type RawMarketStatusUpdateByExternalIdRow,
  type RawStagedMarket
} from "./staging-repository";

const changedReasons = (before: ExclusionCounts, after: ExclusionCounts) =>
  Object.keys(after).filter((reason) => after[reason as keyof ExclusionCounts] > before[reason as keyof ExclusionCounts]);

const cloneCounts = (counts: ExclusionCounts): ExclusionCounts => ({ ...counts });

export type StagingNormalizationStats = {
  batchId: string;
  fetchedRawMarketCount: number;
  insertedRawEventRows: number;
  insertedRawMarketRows: number;
  skippedOrDuplicateRawMarketCount: number;
  normalizedEvents: number;
  normalizedMarkets: number;
  excludedEvents: number;
  excludedMarkets: number;
  failedRows: number;
  durationMs: number;
  timingBreakdown: Record<string, unknown>;
};

export class StagingNormalizationService {
  private readonly staging: StagingRepository;
  private readonly cleanupMode: "retain-latest" | "truncate-after-success";

  constructor(
    sql: postgres.Sql,
    private readonly core: MarketRepository,
    options: {
      readPageSize?: number;
      writePageSize?: number;
      statusUpdateBatchSize?: number;
      cleanupMode?: "retain-latest" | "truncate-after-success";
    } = {}
  ) {
    this.staging = new StagingRepository(sql, options);
    this.cleanupMode = options.cleanupMode ?? "retain-latest";
  }

  async normalizeLatestOpenEvents(batchId?: string): Promise<StagingNormalizationStats> {
    const startedAt = Date.now();
    const timings: Record<string, unknown> = {};
    const timed = async <T>(name: string, task: () => Promise<T>) => {
      const phaseStartedAt = Date.now();
      try {
        return await task();
      } finally {
        timings[name] = Date.now() - phaseStartedAt;
      }
    };
    const runStartedAt = new Date();
    const batch = await timed("loadBatchMs", () => this.loadBatch(batchId));
    const rawLoadStartedAt = Date.now();
    const [rawEventsResult, rawMarketsResult] = await Promise.all([
      timed("loadRawEventsMs", () => this.staging.getPendingRawEventsWithStats(batch.id)),
      timed("loadRawMarketsMs", () => this.staging.getPendingRawMarketsWithStats(batch.id))
    ]);
    const rawEvents = rawEventsResult.rows;
    const rawMarkets = rawMarketsResult.rows;
    timings.rawEventReadStats = rawEventsResult.stats;
    timings.rawMarketReadStats = rawMarketsResult.stats;
    timings.loadRawTotalMs = Date.now() - rawLoadStartedAt;
    const hydrateStartedAt = Date.now();
    const marketsByExternalId = new Map(rawMarkets.map((rawMarket) => [rawMarket.externalMarketId, rawMarket.payload]));
    const marketsByEventId = new Map<string, RawStagedMarket[]>();
    for (const rawMarket of rawMarkets) {
      if (!rawMarket.externalEventId) continue;
      const eventMarkets = marketsByEventId.get(rawMarket.externalEventId) ?? [];
      eventMarkets.push(rawMarket);
      marketsByEventId.set(rawMarket.externalEventId, eventMarkets);
    }
    const hydratedEvents = rawEvents.map((rawEvent) => ({
      ...rawEvent,
      payload: {
        ...rawEvent.payload,
        markets: rawEvent.payload.stagedMarketIds
          ? rawEvent.payload.stagedMarketIds.flatMap((externalMarketId) => {
            const market = marketsByExternalId.get(externalMarketId);
            return market ? [market] : [];
          })
          : rawEvent.payload.markets ?? (marketsByEventId.get(rawEvent.externalEventId) ?? []).map((market) => market.payload)
      }
    }));
    timings.hydrateEventsMs = Date.now() - hydrateStartedAt;
    const exclusionCounts = createExclusionCounts();
    const normalizedEvents: NormalizedEvent[] = [];
    const eventRows: Parameters<StagingRepository["markRawEvents"]>[0] = [];
    const failedEventIds = new Set<string>();
    const excludedEventIds = new Set<string>();

    const eventNormalizationStartedAt = Date.now();
    for (const rawEvent of hydratedEvents) {
      try {
        const before = cloneCounts(exclusionCounts);
        const normalized = normalizeEvent(rawEvent.payload as GammaEvent, exclusionCounts);
        if (normalized) {
          normalizedEvents.push(normalized);
          eventRows.push({ id: rawEvent.id, status: "normalized" });
        } else {
          excludedEventIds.add(rawEvent.externalEventId);
          eventRows.push({
            id: rawEvent.id,
            status: "excluded",
            exclusionReasons: changedReasons(before, exclusionCounts)
          });
        }
      } catch (error: unknown) {
        failedEventIds.add(rawEvent.externalEventId);
        eventRows.push({
          id: rawEvent.id,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
    }
    timings.normalizeEventsCpuMs = Date.now() - eventNormalizationStartedAt;

    const marketStatusStartedAt = Date.now();
    const normalizedMarketIds = new Set(
      normalizedEvents.flatMap((event) => event.markets.map((market) => market.externalMarketId))
    );
    const marketRows: Parameters<StagingRepository["markRawMarkets"]>[0] = rawMarkets.map((rawMarket) => {
      if (failedEventIds.has(rawMarket.externalEventId ?? "")) {
        return { id: rawMarket.id, status: "failed", errorMessage: "Parent event normalization failed" };
      }
      if (normalizedMarketIds.has(rawMarket.externalMarketId)) {
        return { id: rawMarket.id, status: "normalized" };
      }
      if (excludedEventIds.has(rawMarket.externalEventId ?? "")) {
        return { id: rawMarket.id, status: "excluded", exclusionReasons: ["parent_event_excluded"] };
      }
      const marketExclusions = createExclusionCounts();
      normalizeMarket(rawMarket.payload, [], "market_fallback", marketExclusions);
      const reasons = changedReasons(createExclusionCounts(), marketExclusions);
      return {
        id: rawMarket.id,
        status: "excluded",
        exclusionReasons: reasons.length > 0 ? reasons : ["not_normalized_from_parent_event"]
      };
    });
    timings.buildRawMarketStatusRowsMs = Date.now() - marketStatusStartedAt;

    try {
      const guardrailStats = await timed("openFeedGuardrailsMs", () =>
        this.core.applyOpenFeedGuardrails(hydratedEvents.map((rawEvent) => rawEvent.payload), runStartedAt));
      timings.openFeedGuardrailRows = {
        eventsStamped: guardrailStats.eventsStamped,
        finalEventsClosed: guardrailStats.finalEventsClosed,
        marketsStamped: guardrailStats.marketsStamped,
        finalMarketsClosed: guardrailStats.finalMarketsClosed
      };
      const syncStats = await timed("syncEventsTotalMs", () => this.core.syncEvents(normalizedEvents, [], runStartedAt));
      timings.syncEventsSubphases = syncStats.timings;
      const statusUpdateStartedAt = Date.now();
      const [eventStatusStats, marketStatusStats] = await Promise.all([
        timed("markRawEventsMs", () => this.staging.markRawEvents(eventRows)),
        timed("markRawMarketsMs", () => this.staging.markRawMarkets(marketRows))
      ]);
      timings.statusUpdateMode = "grouped-bulk";
      timings.statusUpdateCleanupMode = this.cleanupMode;
      timings.rawStatusUpdateStats = {
        cleanupMode: this.cleanupMode,
        statusUpdateMode: "grouped-bulk",
        rawEventRowsUpdated: eventStatusStats.rowsUpdated,
        rawMarketRowsUpdated: marketStatusStats.rowsUpdated,
        rawEventRowsSkipped: eventStatusStats.skippedRows,
        rawMarketRowsSkipped: marketStatusStats.skippedRows,
        failedRowsPreserved: eventStatusStats.failedRows + marketStatusStats.failedRows,
        rawEventStatusGroups: eventStatusStats.groups,
        rawMarketStatusGroups: marketStatusStats.groups,
        rawEventStatusUpdateStatements: eventStatusStats.statements,
        rawMarketStatusUpdateStatements: marketStatusStats.statements,
        statusUpdateBatchSize: marketStatusStats.batchSize,
        totalStatusUpdateMs: Date.now() - statusUpdateStartedAt
      };
      const excludedEvents = eventRows.filter((row) => row.status === "excluded").length;
      const excludedMarkets = marketRows.filter((row) => row.status === "excluded").length;
      const failedRows = eventRows.filter((row) => row.status === "failed").length
        + marketRows.filter((row) => row.status === "failed").length;
      const durationMs = Date.now() - startedAt;
      timings.totalMs = durationMs;
      await timed("markBatchNormalizedMs", () => this.staging.markBatchNormalized(batch.id, {
        normalizedEventCount: normalizedEvents.length,
        normalizedMarketCount: normalizedMarketIds.size,
        excludedEventCount: excludedEvents,
        excludedMarketCount: excludedMarkets,
        timings: {
          stagedNormalizationDurationMs: durationMs,
          stagedNormalizationFailedRows: failedRows,
          stagedNormalizationTimings: timings
        }
      }));
      return {
        batchId: batch.id,
        fetchedRawMarketCount: batch.marketCount,
        insertedRawEventRows: rawEvents.length,
        insertedRawMarketRows: rawMarkets.length,
        skippedOrDuplicateRawMarketCount: Math.max(0, batch.marketCount - rawMarkets.length),
        normalizedEvents: normalizedEvents.length,
        normalizedMarkets: normalizedMarketIds.size,
        excludedEvents,
        excludedMarkets,
        failedRows,
        durationMs,
        timingBreakdown: timings
      };
    } catch (error: unknown) {
      await this.staging.markBatchFailed(batch.id, error);
      throw error;
    }
  }

  async normalizeOpenEventsFromMemory({
    batchId,
    events,
    insertedRawEventRows,
    insertedRawMarketRows,
    fetchedRawMarketCount
  }: {
    batchId: string;
    events: GammaEvent[];
    insertedRawEventRows: number;
    insertedRawMarketRows: number;
    fetchedRawMarketCount: number;
  }): Promise<StagingNormalizationStats> {
    const startedAt = Date.now();
    const timings: Record<string, unknown> = {};
    const timed = async <T>(name: string, task: () => Promise<T>) => {
      const phaseStartedAt = Date.now();
      try {
        return await task();
      } finally {
        timings[name] = Date.now() - phaseStartedAt;
      }
    };
    const runStartedAt = new Date();
    const batch = await timed("loadBatchMs", () => this.loadBatch(batchId));
    timings.normalizationSource = "memory";
    timings.loadRawEventsMs = 0;
    timings.loadRawMarketsMs = 0;
    timings.loadRawTotalMs = 0;
    timings.rawEventReadStats = {
      paginationMode: "memory",
      pageSize: events.length,
      pages: events.length > 0 ? 1 : 0,
      rows: events.length,
      totalDurationMs: 0,
      averagePageDurationMs: 0,
      maxPageDurationMs: 0,
      selectedColumns: ["in_memory_gamma_event_payload"]
    };

    const rawMarkets = this.flattenEventMarkets(events);
    timings.rawMarketReadStats = {
      paginationMode: "memory",
      pageSize: rawMarkets.length,
      pages: rawMarkets.length > 0 ? 1 : 0,
      rows: rawMarkets.length,
      totalDurationMs: 0,
      averagePageDurationMs: 0,
      maxPageDurationMs: 0,
      selectedColumns: ["in_memory_gamma_market_payload"]
    };

    const exclusionCounts = createExclusionCounts();
    const normalizedEvents: NormalizedEvent[] = [];
    const eventRows: RawEventStatusUpdateByExternalIdRow[] = [];
    const failedEventIds = new Set<string>();
    const excludedEventIds = new Set<string>();

    const eventNormalizationStartedAt = Date.now();
    for (const event of events) {
      const externalEventId = event.id;
      if (!externalEventId) continue;
      try {
        const before = cloneCounts(exclusionCounts);
        const normalized = normalizeEvent(event, exclusionCounts);
        if (normalized) {
          normalizedEvents.push(normalized);
          eventRows.push({ externalEventId, status: "normalized" });
        } else {
          excludedEventIds.add(externalEventId);
          eventRows.push({
            externalEventId,
            status: "excluded",
            exclusionReasons: changedReasons(before, exclusionCounts)
          });
        }
      } catch (error: unknown) {
        failedEventIds.add(externalEventId);
        eventRows.push({
          externalEventId,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
    }
    timings.normalizeEventsCpuMs = Date.now() - eventNormalizationStartedAt;

    const marketStatusStartedAt = Date.now();
    const normalizedMarketIds = new Set(
      normalizedEvents.flatMap((event) => event.markets.map((market) => market.externalMarketId))
    );
    const marketRows: RawMarketStatusUpdateByExternalIdRow[] = rawMarkets.flatMap(({ externalEventId, market }): RawMarketStatusUpdateByExternalIdRow[] => {
      const externalMarketId = market.conditionId ?? market.id;
      if (!externalMarketId) return [];
      if (failedEventIds.has(externalEventId ?? "")) {
        return [{ externalMarketId, status: "failed", errorMessage: "Parent event normalization failed" }];
      }
      if (normalizedMarketIds.has(externalMarketId)) {
        return [{ externalMarketId, status: "normalized" }];
      }
      if (excludedEventIds.has(externalEventId ?? "")) {
        return [{ externalMarketId, status: "excluded", exclusionReasons: ["parent_event_excluded"] }];
      }
      const marketExclusions = createExclusionCounts();
      normalizeMarket(market, [], "market_fallback", marketExclusions);
      const reasons = changedReasons(createExclusionCounts(), marketExclusions);
      return [{
        externalMarketId,
        status: "excluded",
        exclusionReasons: reasons.length > 0 ? reasons : ["not_normalized_from_parent_event"]
      }];
    });
    timings.buildRawMarketStatusRowsMs = Date.now() - marketStatusStartedAt;

    try {
      const guardrailStats = await timed("openFeedGuardrailsMs", () =>
        this.core.applyOpenFeedGuardrails(events, runStartedAt));
      timings.openFeedGuardrailRows = {
        eventsStamped: guardrailStats.eventsStamped,
        finalEventsClosed: guardrailStats.finalEventsClosed,
        marketsStamped: guardrailStats.marketsStamped,
        finalMarketsClosed: guardrailStats.finalMarketsClosed
      };
      const syncStats = await timed("syncEventsTotalMs", () => this.core.syncEvents(normalizedEvents, [], runStartedAt));
      timings.syncEventsSubphases = syncStats.timings;

      const excludedEvents = eventRows.filter((row) => row.status === "excluded").length;
      const excludedMarkets = marketRows.filter((row) => row.status === "excluded").length;
      const failedRows = eventRows.filter((row) => row.status === "failed").length
        + marketRows.filter((row) => row.status === "failed").length;

      const shouldSkipDetailedRawStatus = this.cleanupMode === "truncate-after-success" && failedRows === 0;
      if (shouldSkipDetailedRawStatus) {
        timings.markRawEventsMs = 0;
        timings.markRawMarketsMs = 0;
        timings.statusUpdateMode = "skipped-memory-truncate";
        timings.statusUpdateCleanupMode = this.cleanupMode;
        timings.rawStatusUpdateStats = {
          cleanupMode: this.cleanupMode,
          statusUpdateMode: "skipped-memory-truncate",
          rawEventRowsUpdated: 0,
          rawMarketRowsUpdated: 0,
          rawEventRowsSkipped: eventRows.length,
          rawMarketRowsSkipped: marketRows.length,
          failedRowsPreserved: 0,
          rawEventStatusGroups: 0,
          rawMarketStatusGroups: 0,
          rawEventStatusUpdateStatements: 0,
          rawMarketStatusUpdateStatements: 0,
          statusUpdateBatchSize: 0,
          totalStatusUpdateMs: 0
        };
      } else {
        const statusUpdateStartedAt = Date.now();
        const [eventStatusStats, marketStatusStats] = await Promise.all([
          timed("markRawEventsMs", () => this.staging.markRawEventsByExternalId(batch.id, eventRows)),
          timed("markRawMarketsMs", () => this.staging.markRawMarketsByExternalId(batch.id, marketRows))
        ]);
        timings.statusUpdateMode = "grouped-bulk-external-id";
        timings.statusUpdateCleanupMode = this.cleanupMode;
        timings.rawStatusUpdateStats = {
          cleanupMode: this.cleanupMode,
          statusUpdateMode: "grouped-bulk-external-id",
          rawEventRowsUpdated: eventStatusStats.rowsUpdated,
          rawMarketRowsUpdated: marketStatusStats.rowsUpdated,
          rawEventRowsSkipped: eventStatusStats.skippedRows,
          rawMarketRowsSkipped: marketStatusStats.skippedRows,
          failedRowsPreserved: eventStatusStats.failedRows + marketStatusStats.failedRows,
          rawEventStatusGroups: eventStatusStats.groups,
          rawMarketStatusGroups: marketStatusStats.groups,
          rawEventStatusUpdateStatements: eventStatusStats.statements,
          rawMarketStatusUpdateStatements: marketStatusStats.statements,
          statusUpdateBatchSize: marketStatusStats.batchSize,
          totalStatusUpdateMs: Date.now() - statusUpdateStartedAt
        };
      }

      const durationMs = Date.now() - startedAt;
      timings.totalMs = durationMs;
      await timed("markBatchNormalizedMs", () => this.staging.markBatchNormalized(batch.id, {
        normalizedEventCount: normalizedEvents.length,
        normalizedMarketCount: normalizedMarketIds.size,
        excludedEventCount: excludedEvents,
        excludedMarketCount: excludedMarkets,
        timings: {
          stagedNormalizationDurationMs: durationMs,
          stagedNormalizationFailedRows: failedRows,
          stagedNormalizationSource: "memory",
          stagedNormalizationTimings: timings
        }
      }));
      return {
        batchId: batch.id,
        fetchedRawMarketCount,
        insertedRawEventRows,
        insertedRawMarketRows,
        skippedOrDuplicateRawMarketCount: Math.max(0, fetchedRawMarketCount - insertedRawMarketRows),
        normalizedEvents: normalizedEvents.length,
        normalizedMarkets: normalizedMarketIds.size,
        excludedEvents,
        excludedMarkets,
        failedRows,
        durationMs,
        timingBreakdown: timings
      };
    } catch (error: unknown) {
      await this.staging.markBatchFailed(batch.id, error);
      throw error;
    }
  }

  private async loadBatch(batchId?: string): Promise<GammaIngestionBatch> {
    const batch = batchId
      ? await this.staging.getBatch(batchId)
      : await this.staging.getLatestFetchedBatch("open_events");
    if (!batch) throw new Error(batchId ? `Gamma staging batch not found: ${batchId}` : "No fetched open_events staging batch found");
    if (batch.feedKind !== "open_events") throw new Error(`Expected an open_events batch, received ${batch.feedKind}`);
    if (batch.status !== "fetched") throw new Error(`Expected a fetched batch, received ${batch.status}`);
    return batch;
  }

  private flattenEventMarkets(events: GammaEvent[]): Array<{ externalEventId: string | null; market: GammaMarket }> {
    return events.flatMap((event) => (event.markets ?? []).map((market) => ({
      externalEventId: event.id ?? null,
      market
    })));
  }
}
