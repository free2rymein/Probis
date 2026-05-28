import { and, eq, inArray, sql } from "drizzle-orm";
import { markets, type ProbisDatabase } from "@probis/database";
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
          volume24h: item.volume24h,
          liquidity: item.liquidity,
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
          volume24h: sql`excluded.volume_24h`,
          liquidity: sql`excluded.liquidity`,
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
  }
});
