import { z } from "zod";

export const workerConfigSchema = z.object({
  DATABASE_URL: z.string().min(1),
  POLYMARKET_GAMMA_API_URL: z.string().url().default("https://gamma-api.polymarket.com"),
  MARKET_FETCH_LIMIT: z.coerce.number().int().min(1).max(500).default(100),
  MAX_MARKET_FETCH_PAGES: z.coerce.number().int().min(1).max(100).default(100),
  POLYMARKET_EVENT_PAGE_LIMIT: z.coerce.number().int().min(1).max(100).default(100),
  POLYMARKET_EVENT_MAX_PAGES: z.coerce.number().int().min(1).max(100).default(10),
  MARKET_DISCOVERY_INTERVAL_MS: z.coerce.number().int().min(60_000).default(900_000),
  MARKET_SNAPSHOT_INTERVAL_MS: z.coerce.number().int().min(60_000).default(300_000),
  HTTP_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(15_000),
  MIN_EVENT_VOLUME: z.coerce.number().nonnegative().default(5_000),
  MIN_EVENT_LIQUIDITY: z.coerce.number().nonnegative().default(500),
  MIN_EVENT_VOLUME_24H: z.coerce.number().nonnegative().default(0),
  LIFECYCLE_RECONCILE_LIMIT: z.coerce.number().int().min(1).max(1_000).default(25),
  LIFECYCLE_RECONCILE_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),
  LIFECYCLE_RECONCILE_STALE_MINUTES: z.coerce.number().int().min(1).default(60),
  CLOSED_EVENT_PAGE_LIMIT: z.coerce.number().int().min(1).max(500).default(100),
  CLOSED_EVENT_MAX_PAGES: z.coerce.number().int().min(1).max(100).default(10),
  OPEN_FEED_STALE_GRACE_MINUTES: z.coerce.number().int().min(1).default(60),
  STALE_CLOSE_END_DATE_BUFFER_HOURS: z.coerce.number().int().min(0).default(6),
  ENABLE_SET_BASED_STALE_CLOSE: z.string().toLowerCase().transform((value) => value === "true").default("false"),
  GAMMA_INGESTION_MODE: z.enum(["direct", "stage-shadow", "stage-normalize"]).default("direct"),
  GAMMA_STAGING_ENABLED: z.string().toLowerCase().transform((value) => value === "true").default("false"),
  GAMMA_STAGING_REFRESH_INTERVAL_MS: z.coerce.number().int().min(60_000).default(300_000),
  RAW_STAGING_RETENTION_MINUTES: z.coerce.number().int().min(1).default(60),
  RAW_STAGING_KEEP_SUCCESSFUL_BATCHES: z.coerce.number().int().min(1).default(2),
  RAW_FAILED_STAGING_RETENTION_MINUTES: z.coerce.number().int().min(1).default(360),
  RAW_STAGING_CLEANUP_MODE: z.enum(["retain-latest", "truncate-after-success"]).default("retain-latest"),
  INGESTION_BATCH_RETENTION_DAYS: z.coerce.number().int().min(1).default(7),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
});

export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export const loadWorkerConfig = (env: NodeJS.ProcessEnv = process.env): WorkerConfig =>
  workerConfigSchema.parse(env);
