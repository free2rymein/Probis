import { and, asc, eq, inArray, not, sql } from "drizzle-orm";
import { markets, walletMarketActivity, type ProbisDatabase } from "@probis/database";
import type { NormalizedMarket } from "../types/events";
import { serializeJson } from "../utils/serialization";

export const createMarketsRepository = (db: ProbisDatabase) => ({
  async upsertMany(items: NormalizedMarket[]) {
    if (items.length === 0) return [];

    return db
      .insert(markets)
      .values(
        items.map((item) => ({
          source: item.source,
          externalId: item.externalId,
          slug: item.slug,
          title: item.title,
          description: item.description,
          category: item.category,
          status: item.status,
          conditionId: item.conditionId,
          clobTokenIds: item.clobTokenIds,
          currentProbability: item.currentProbability,
          currentProbabilityYes: item.currentProbabilityYes ?? item.currentProbability,
          currentProbabilityNo: item.currentProbabilityNo ?? null,
          volume24h: item.volume24h,
          liquidity: item.liquidity,
          isActiveUniverse: item.isActiveUniverse ?? false,
          marketQualityScore: item.marketQualityScore ?? null,
          universeTier: item.universeTier ?? null,
          intelligenceWeightedScore: item.intelligenceWeightedScore ?? null,
          repricingVelocityScore: item.repricingVelocityScore ?? null,
          narrativeRelevanceScore: item.narrativeRelevanceScore ?? null,
          walletActivityScore: item.walletActivityScore ?? null,
          exclusionReason: item.exclusionReason ?? null,
          universeRank: item.universeRank ?? null,
          lastSelectedAt: item.lastSelectedAt ?? null,
          metadata: serializeJson(item.metadata),
          resolutionDate: item.resolutionDate,
          updatedAt: new Date()
        }))
      )
      .onConflictDoUpdate({
        target: [markets.source, markets.externalId],
        set: {
          slug: sql`excluded.slug`,
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          category: sql`excluded.category`,
          status: sql`excluded.status`,
          conditionId: sql`excluded.condition_id`,
          clobTokenIds: sql`excluded.clob_token_ids`,
          currentProbability: sql`excluded.current_probability`,
          currentProbabilityYes: sql`excluded.current_probability_yes`,
          currentProbabilityNo: sql`excluded.current_probability_no`,
          volume24h: sql`excluded.volume_24h`,
          liquidity: sql`excluded.liquidity`,
          isActiveUniverse: sql`excluded.is_active_universe`,
          marketQualityScore: sql`excluded.market_quality_score`,
          universeTier: sql`excluded.universe_tier`,
          intelligenceWeightedScore: sql`excluded.intelligence_weighted_score`,
          repricingVelocityScore: sql`excluded.repricing_velocity_score`,
          narrativeRelevanceScore: sql`excluded.narrative_relevance_score`,
          walletActivityScore: sql`excluded.wallet_activity_score`,
          exclusionReason: sql`excluded.exclusion_reason`,
          universeRank: sql`excluded.universe_rank`,
          lastSelectedAt: sql`excluded.last_selected_at`,
          metadata: sql`excluded.metadata`,
          resolutionDate: sql`excluded.resolution_date`,
          updatedAt: new Date()
        }
      })
      .returning();
  },

  async resolveIds(source: NormalizedMarket["source"], externalIds: string[]) {
    if (externalIds.length === 0) return new Map<string, string>();

    const rows = await db
      .select({ id: markets.id, externalId: markets.externalId })
      .from(markets)
      .where(and(eq(markets.source, source), inArray(markets.externalId, externalIds)));

    return new Map(rows.map((row) => [row.externalId, row.id]));
  },

  async getUniverseContext(source: NormalizedMarket["source"], externalIds: string[]) {
    if (externalIds.length === 0)
      return new Map<
        string,
        {
          previousProbability: number | null;
          previousUpdatedAt: Date | null;
          recentWalletCount: number;
          recentWalletVolumeUsd: number;
        }
      >();

    const existing = await db
      .select({
        id: markets.id,
        externalId: markets.externalId,
        currentProbability: markets.currentProbabilityYes,
        updatedAt: markets.updatedAt
      })
      .from(markets)
      .where(and(eq(markets.source, source), inArray(markets.externalId, externalIds)));

    const marketIdToExternalId = new Map(existing.map((row) => [row.id, row.externalId]));
    const byExternalId = new Map(
      existing.map((row) => [
        row.externalId,
        {
          previousProbability:
            row.currentProbability === null || row.currentProbability === undefined
              ? null
              : Number(row.currentProbability),
          previousUpdatedAt: row.updatedAt ?? null,
          recentWalletCount: 0,
          recentWalletVolumeUsd: 0
        }
      ])
    );

    if (existing.length === 0) return byExternalId;

    const activityRows = await db
      .select({
        marketId: walletMarketActivity.marketId,
        recentWalletCount: sql<string>`COUNT(DISTINCT ${walletMarketActivity.walletAddress})::text`,
        recentWalletVolumeUsd: sql<string>`COALESCE(SUM(${walletMarketActivity.totalVolumeUsd}), 0)::text`
      })
      .from(walletMarketActivity)
      .where(
        and(
          inArray(
            walletMarketActivity.marketId,
            existing.map((row) => row.id)
          ),
          sql`${walletMarketActivity.lastTradeAt} >= now() - interval '24 hours'`
        )
      )
      .groupBy(walletMarketActivity.marketId);

    for (const row of activityRows) {
      const externalId = marketIdToExternalId.get(row.marketId);
      if (!externalId) continue;

      const context = byExternalId.get(externalId);
      if (!context) continue;

      context.recentWalletCount = Number(row.recentWalletCount);
      context.recentWalletVolumeUsd = Number(row.recentWalletVolumeUsd);
    }

    return byExternalId;
  },

  async findIdByExternalId(source: NormalizedMarket["source"], externalId: string) {
    const [row] = await db
      .select({ id: markets.id })
      .from(markets)
      .where(and(eq(markets.source, source), eq(markets.externalId, externalId)))
      .limit(1);

    return row?.id ?? null;
  },

  async findIdByClobTokenId(source: NormalizedMarket["source"], tokenId: string) {
    const [row] = await db
      .select({ id: markets.id })
      .from(markets)
      .where(
        and(eq(markets.source, source), sql`${markets.clobTokenIds} @> ARRAY[${tokenId}]::text[]`)
      )
      .limit(1);

    return row?.id ?? null;
  },

  async listActiveMarketRefs(source: NormalizedMarket["source"], limit: number) {
    return db
      .select({
        id: markets.id,
        externalId: markets.externalId,
        conditionId: markets.conditionId,
        clobTokenIds: markets.clobTokenIds
      })
      .from(markets)
      .where(and(eq(markets.source, source), eq(markets.status, "open")))
      .limit(limit);
  },

  async replaceActiveUniverse(source: NormalizedMarket["source"], selectedExternalIds: string[]) {
    const deselectWhere =
      selectedExternalIds.length === 0
        ? eq(markets.source, source)
        : and(eq(markets.source, source), not(inArray(markets.externalId, selectedExternalIds)));

    await db
      .update(markets)
      .set({
        isActiveUniverse: false,
        universeTier: null,
        universeRank: null,
        lastSelectedAt: null
      })
      .where(deselectWhere);
  },

  async listActiveUniverseMarketRefs(source: NormalizedMarket["source"], limit: number) {
    return db
      .select({
        id: markets.id,
        externalId: markets.externalId,
        conditionId: markets.conditionId,
        clobTokenIds: markets.clobTokenIds
      })
      .from(markets)
      .where(and(eq(markets.source, source), eq(markets.isActiveUniverse, true)))
      .orderBy(asc(markets.universeRank))
      .limit(limit);
  }
});
