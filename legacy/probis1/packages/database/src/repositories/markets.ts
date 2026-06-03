import { and, desc, eq, ilike, lt } from "drizzle-orm";
import { z } from "zod";
import { markets } from "../schema";
import type { Market, NewMarket } from "../schema/types";
import { pageFromRows, parsePagination } from "../queries/pagination";
import type { Page } from "../queries/pagination";
import type { RepositoryContext } from "./types";

export const marketFiltersSchema = z.object({
  category: z.string().optional(),
  status: z.enum(["draft", "open", "paused", "closed", "settled", "cancelled"]).optional(),
  source: z.enum(["polymarket", "kalshi", "manifold", "internal"]).optional(),
  search: z.string().optional()
});

export type MarketFilters = z.infer<typeof marketFiltersSchema>;

export const createMarketsRepository = ({ db }: RepositoryContext) => ({
  async list(
    input: MarketFilters & { limit?: number; cursor?: string } = {}
  ): Promise<Page<Market>> {
    const pagination = parsePagination(input);
    const filters = marketFiltersSchema.parse(input);

    const where = and(
      filters.category ? eq(markets.category, filters.category) : undefined,
      filters.status ? eq(markets.status, filters.status) : undefined,
      filters.source ? eq(markets.source, filters.source) : undefined,
      filters.search ? ilike(markets.title, `%${filters.search}%`) : undefined,
      pagination.cursor ? lt(markets.createdAt, new Date(pagination.cursor)) : undefined
    );

    const rows = await db
      .select()
      .from(markets)
      .where(where)
      .orderBy(desc(markets.createdAt))
      .limit(pagination.limit + 1);

    return pageFromRows(rows, pagination.limit, "createdAt");
  },

  async findById(id: string): Promise<Market | null> {
    const [row] = await db.select().from(markets).where(eq(markets.id, id)).limit(1);
    return row ?? null;
  },

  async findBySourceExternalId(
    source: NewMarket["source"],
    externalId: string
  ): Promise<Market | null> {
    const [row] = await db
      .select()
      .from(markets)
      .where(and(eq(markets.source, source), eq(markets.externalId, externalId)))
      .limit(1);

    return row ?? null;
  },

  async upsert(input: NewMarket): Promise<Market> {
    const [row] = await db
      .insert(markets)
      .values(input)
      .onConflictDoUpdate({
        target: [markets.source, markets.externalId],
        set: {
          slug: input.slug,
          title: input.title,
          description: input.description,
          category: input.category,
          status: input.status,
          resolutionDate: input.resolutionDate,
          updatedAt: new Date()
        }
      })
      .returning();

    if (!row) {
      throw new Error("Failed to upsert market");
    }

    return row;
  }
});
