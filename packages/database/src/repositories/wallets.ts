import { desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { walletStats } from "../schema";
import type { NewWalletStats, WalletStats } from "../schema/types";
import { pageFromRows, parsePagination } from "../queries/pagination";
import type { Page } from "../queries/pagination";
import type { RepositoryContext } from "./types";

export const walletSortSchema = z.enum(["reputation", "information_advantage", "updated_at"]);

export type WalletSort = z.infer<typeof walletSortSchema>;

export const createWalletRepository = ({ db }: RepositoryContext) => ({
  async list(
    input: { limit?: number; cursor?: string; sort?: WalletSort } = {}
  ): Promise<Page<WalletStats>> {
    const pagination = parsePagination(input);
    const sort = walletSortSchema.default("reputation").parse(input.sort);
    const sortColumn =
      sort === "information_advantage"
        ? walletStats.informationAdvantageScore
        : sort === "updated_at"
          ? walletStats.updatedAt
          : walletStats.reputationScore;

    const rows = await db
      .select()
      .from(walletStats)
      .where(pagination.cursor ? lt(walletStats.updatedAt, new Date(pagination.cursor)) : undefined)
      .orderBy(desc(sortColumn), desc(walletStats.updatedAt))
      .limit(pagination.limit + 1);

    return pageFromRows(rows, pagination.limit, "updatedAt");
  },

  async findByAddress(walletAddress: string): Promise<WalletStats | null> {
    const [row] = await db
      .select()
      .from(walletStats)
      .where(eq(walletStats.walletAddress, walletAddress))
      .limit(1);

    return row ?? null;
  },

  async upsert(input: NewWalletStats): Promise<WalletStats> {
    const [row] = await db
      .insert(walletStats)
      .values(input)
      .onConflictDoUpdate({
        target: walletStats.walletAddress,
        set: {
          realizedPnl: sql`excluded.realized_pnl`,
          unrealizedPnl: sql`excluded.unrealized_pnl`,
          winRate: sql`excluded.win_rate`,
          avgHoldTime: sql`excluded.avg_hold_time`,
          convictionScore: sql`excluded.conviction_score`,
          reputationScore: sql`excluded.reputation_score`,
          informationAdvantageScore: sql`excluded.information_advantage_score`,
          updatedAt: new Date()
        }
      })
      .returning();

    if (!row) {
      throw new Error("Failed to upsert wallet stats");
    }

    return row;
  }
});
