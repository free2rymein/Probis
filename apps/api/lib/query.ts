import { z } from "zod";

export const queryObject = (request: Request) =>
  Object.fromEntries(new URL(request.url).searchParams.entries());

const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const categoriesQuerySchema = z.object({
  venue: z.string().trim().min(1).max(100).optional()
});

export type CategoriesQuery = z.infer<typeof categoriesQuerySchema>;

export const marketsQuerySchema = pagination.extend({
  category: z.string().trim().min(1).max(100).optional(),
  venue: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["draft", "open", "paused", "closed", "resolved", "archived"]).optional()
});

export const eventsQuerySchema = pagination.extend({
  category: z.string().trim().min(1).max(100).optional(),
  venue: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(["trending", "volume", "open-interest", "newest", "ending-soon"]).default("trending"),
  status: z.enum(["open"]).default("open")
});

export type EventsQuery = z.infer<typeof eventsQuerySchema>;

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(2_000).default(288),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});
