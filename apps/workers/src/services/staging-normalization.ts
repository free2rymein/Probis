import type postgres from "postgres";
import type { MarketRepository } from "./market-repository";
import {
  createExclusionCounts,
  normalizeEvent,
  normalizeMarket,
  type ExclusionCounts,
  type NormalizedEvent
} from "./normalization";
import type { GammaEvent } from "./polymarket";
import { StagingRepository, type GammaIngestionBatch, type RawStagedMarket } from "./staging-repository";

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
};

export class StagingNormalizationService {
  private readonly staging: StagingRepository;

  constructor(
    sql: postgres.Sql,
    private readonly core: MarketRepository
  ) {
    this.staging = new StagingRepository(sql);
  }

  async normalizeLatestOpenEvents(batchId?: string): Promise<StagingNormalizationStats> {
    const startedAt = Date.now();
    const runStartedAt = new Date();
    const batch = await this.loadBatch(batchId);
    const [rawEvents, rawMarkets] = await Promise.all([
      this.staging.getPendingRawEvents(batch.id),
      this.staging.getPendingRawMarkets(batch.id)
    ]);
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
    const exclusionCounts = createExclusionCounts();
    const normalizedEvents: NormalizedEvent[] = [];
    const eventRows: Parameters<StagingRepository["markRawEvents"]>[0] = [];
    const failedEventIds = new Set<string>();
    const excludedEventIds = new Set<string>();

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

    try {
      await this.core.applyOpenFeedGuardrails(hydratedEvents.map((rawEvent) => rawEvent.payload), runStartedAt);
      await this.core.syncEvents(normalizedEvents, [], runStartedAt);
      await Promise.all([
        this.staging.markRawEvents(eventRows),
        this.staging.markRawMarkets(marketRows)
      ]);
      const excludedEvents = eventRows.filter((row) => row.status === "excluded").length;
      const excludedMarkets = marketRows.filter((row) => row.status === "excluded").length;
      const failedRows = eventRows.filter((row) => row.status === "failed").length
        + marketRows.filter((row) => row.status === "failed").length;
      const durationMs = Date.now() - startedAt;
      await this.staging.markBatchNormalized(batch.id, {
        normalizedEventCount: normalizedEvents.length,
        normalizedMarketCount: normalizedMarketIds.size,
        excludedEventCount: excludedEvents,
        excludedMarketCount: excludedMarkets,
        timings: { stagedNormalizationDurationMs: durationMs, stagedNormalizationFailedRows: failedRows }
      });
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
        durationMs
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
}
