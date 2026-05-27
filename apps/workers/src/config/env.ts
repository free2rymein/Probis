import { z } from "zod";

export const workerConfigSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url().optional(),
  WORKER_MODE: z.enum(["live", "mock"]).default("live"),
  POLYMARKET_GAMMA_API_URL: z.string().url().default("https://gamma-api.polymarket.com"),
  POLYMARKET_CLOB_API_URL: z.string().url().default("https://clob.polymarket.com"),
  POLYMARKET_WS_URL: z.string().url().optional(),
  MARKET_DISCOVERY_INTERVAL_MS: z.coerce.number().int().min(10_000).default(180_000),
  TRADE_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).default(5_000),
  TRADE_BATCH_SIZE: z.coerce.number().int().min(1).max(5_000).default(500),
  TRADE_FLUSH_INTERVAL_MS: z.coerce.number().int().min(250).default(2_000),
  AGGREGATE_FLUSH_INTERVAL_MS: z.coerce.number().int().min(500).default(2_500),
  RECONNECT_MIN_MS: z.coerce.number().int().min(250).default(1_000),
  RECONNECT_MAX_MS: z.coerce.number().int().min(1_000).default(30_000),
  HTTP_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(15_000),
  MAX_MARKETS_PER_POLL: z.coerce.number().int().min(1).max(1_000).default(200),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
});

export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export const loadWorkerConfig = (env: NodeJS.ProcessEnv = process.env): WorkerConfig =>
  workerConfigSchema.parse(env);
