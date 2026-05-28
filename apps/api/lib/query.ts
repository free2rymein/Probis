import { z } from "zod";

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0)
});

export const marketListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["draft", "open", "paused", "closed", "settled", "cancelled"]).optional(),
  source: z.enum(["polymarket", "kalshi", "manifold", "internal"]).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(["updated_at", "title", "status", "volume", "probability"]).default("updated_at"),
  direction: z.enum(["asc", "desc"]).default("desc")
});

export const aggregatesQuerySchema = z.object({
  marketId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(1500).default(240),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

export const timelineQuerySchema = paginationQuerySchema.extend({
  marketId: z.string().uuid().optional(),
  eventType: z
    .enum(["trade", "aggregate", "anomaly", "narrative", "alert", "resolution", "system"])
    .optional()
});

export const signalsQuerySchema = paginationQuerySchema.extend({
  anomalyType: z.string().trim().min(1).max(64).optional(),
  minSeverity: z.coerce.number().min(0).max(100).optional(),
  lookbackHours: z.coerce.number().int().min(1).max(720).default(168),
  sort: z.enum(["severity_score", "detected_at"]).default("severity_score"),
  direction: z.enum(["asc", "desc"]).default("desc")
});

export const queryObject = (request: Request) =>
  Object.fromEntries(new URL(request.url).searchParams.entries());
