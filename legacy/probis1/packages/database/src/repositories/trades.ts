import { and, desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { trades } from "../schema";
import type { NewTrade, Trade } from "../schema/types";
import { pageFromRows, parsePagination } from "../queries/pagination";
import type { Page } from "../queries/pagination";
import type { RepositoryContext } from "./types";

export const tradeFiltersSchema = z.object({
  marketId: z.string().uuid().optional(),
  walletAddress: z.string().min(1).optional(),
  side: z.enum(["buy", "sell"]).optional(),
  from: z.date().optional(),
  to: z.date().optional()
});

export type TradeFilters = z.infer<typeof tradeFiltersSchema>;

export const createTradesRepository = ({ db }: RepositoryContext) => ({
  async list(input: TradeFilters & { limit?: number; cursor?: string } = {}): Promise<Page<Trade>> {
    const pagination = parsePagination(input);
    const filters = tradeFiltersSchema.parse(input);

    const where = and(
      filters.marketId ? eq(trades.marketId, filters.marketId) : undefined,
      filters.walletAddress ? eq(trades.walletAddress, filters.walletAddress) : undefined,
      filters.side ? eq(trades.side, filters.side) : undefined,
      filters.from ? sql`${trades.tradeTimestamp} >= ${filters.from}` : undefined,
      filters.to ? sql`${trades.tradeTimestamp} <= ${filters.to}` : undefined,
      pagination.cursor ? lt(trades.tradeTimestamp, new Date(pagination.cursor)) : undefined
    );

    const rows = await db
      .select()
      .from(trades)
      .where(where)
      .orderBy(desc(trades.tradeTimestamp))
      .limit(pagination.limit + 1);

    return pageFromRows(rows, pagination.limit, "tradeTimestamp");
  },

  async append(input: NewTrade): Promise<Trade> {
    const [row] = await db.insert(trades).values(input).returning();

    if (!row) {
      throw new Error("Failed to append trade");
    }

    return row;
  },

  async appendMany(input: NewTrade[]): Promise<Trade[]> {
    if (input.length === 0) {
      return [];
    }

    return db.insert(trades).values(input).returning();
  }
});
