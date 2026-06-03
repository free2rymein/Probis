import { and, desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { anomalyEvents } from "../schema";
import type { AnomalyEvent, NewAnomalyEvent } from "../schema/types";
import { pageFromRows, parsePagination } from "../queries/pagination";
import type { Page } from "../queries/pagination";
import type { RepositoryContext } from "./types";

export const anomalyFiltersSchema = z.object({
  marketId: z.string().uuid().optional(),
  anomalyType: z
    .enum([
      "probability_gap",
      "volume_spike",
      "liquidity_drain",
      "wallet_cluster",
      "timeline_discontinuity",
      "narrative_correlation",
      "price_dislocation"
    ])
    .optional(),
  minSeverityScore: z.number().min(0).max(100).optional(),
  from: z.date().optional(),
  to: z.date().optional()
});

export type AnomalyFilters = z.infer<typeof anomalyFiltersSchema>;

export const createAnomalyRepository = ({ db }: RepositoryContext) => ({
  async list(
    input: AnomalyFilters & { limit?: number; cursor?: string } = {}
  ): Promise<Page<AnomalyEvent>> {
    const pagination = parsePagination(input);
    const filters = anomalyFiltersSchema.parse(input);

    const where = and(
      filters.marketId ? eq(anomalyEvents.marketId, filters.marketId) : undefined,
      filters.anomalyType ? eq(anomalyEvents.anomalyType, filters.anomalyType) : undefined,
      filters.minSeverityScore
        ? sql`${anomalyEvents.severityScore} >= ${filters.minSeverityScore}`
        : undefined,
      filters.from ? sql`${anomalyEvents.detectedAt} >= ${filters.from}` : undefined,
      filters.to ? sql`${anomalyEvents.detectedAt} <= ${filters.to}` : undefined,
      pagination.cursor ? lt(anomalyEvents.detectedAt, new Date(pagination.cursor)) : undefined
    );

    const rows = await db
      .select()
      .from(anomalyEvents)
      .where(where)
      .orderBy(desc(anomalyEvents.severityScore), desc(anomalyEvents.detectedAt))
      .limit(pagination.limit + 1);

    return pageFromRows(rows, pagination.limit, "detectedAt");
  },

  async create(input: NewAnomalyEvent): Promise<AnomalyEvent> {
    const [row] = await db.insert(anomalyEvents).values(input).returning();

    if (!row) {
      throw new Error("Failed to create anomaly event");
    }

    return row;
  }
});
