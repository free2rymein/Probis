import { z } from "zod";

export const workerConfigSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url().optional(),
  WORKER_MODE: z.enum(["live", "mock"]).default("live"),
  POLYMARKET_GAMMA_API_URL: z.string().url().default("https://gamma-api.polymarket.com"),
  POLYMARKET_CLOB_API_URL: z.string().url().default("https://clob.polymarket.com"),
  POLYMARKET_DATA_API_URL: z.string().url().default("https://data-api.polymarket.com"),
  POLYMARKET_TRADE_SOURCE: z.enum(["data_api", "clob"]).default("data_api"),
  POLYMARKET_WS_URL: z.string().url().optional(),
  MARKET_SYNC_LIMIT: z.coerce.number().int().min(1).max(1_000).default(250),
  MARKET_UNIVERSE_STRATEGY: z
    .enum(["quality_ranked", "latest_active", "intelligence_weighted", "mvp_interest"])
    .default("mvp_interest"),
  ACTIVE_MARKET_UNIVERSE_LIMIT: z.coerce.number().int().min(1).max(1_000).default(100),
  STORE_ONLY_ACTIVE_UNIVERSE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  RAW_MARKET_FETCH_LIMIT: z.coerce.number().int().min(1).max(500).default(100),
  MAX_MARKET_FETCH_PAGES: z.coerce.number().int().min(1).max(200).default(100),
  MAX_DAYS_TO_RESOLUTION: z.coerce.number().int().min(1).max(365).default(45),
  MIN_MARKET_LIQUIDITY: z.coerce.number().min(0).default(1_000),
  MIN_MARKET_VOLUME_24H: z.coerce.number().min(0).default(500),
  MIN_MARKET_VOLUME_TOTAL: z.coerce.number().min(0).default(5_000),
  MIN_EXCEPTION_LIQUIDITY: z.coerce.number().min(0).default(250),
  MIN_EXCEPTION_VOLUME_24H: z.coerce.number().min(0).default(100),
  EXCLUDE_SPORTS_MARKETS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  EXCLUDE_ESPORTS_MARKETS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  EXCLUDE_MICRO_MARKETS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  MARKET_QUALITY_VOLUME_WEIGHT: z.coerce.number().min(0).default(0.55),
  MARKET_QUALITY_LIQUIDITY_WEIGHT: z.coerce.number().min(0).default(0.35),
  MARKET_QUALITY_RECENCY_WEIGHT: z.coerce.number().min(0).default(0.1),
  TIER_CORE_SHARE: z.coerce.number().min(0).max(1).default(0.5),
  TIER_REPRICING_SHARE: z.coerce.number().min(0).max(1).default(0.3),
  TIER_NARRATIVE_SHARE: z.coerce.number().min(0).max(1).default(0.15),
  TIER_WATCHLIST_SHARE: z.coerce.number().min(0).max(1).default(0.05),
  MARKET_SYNC_ACTIVE_ONLY: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  TRADE_MARKETS_PER_REQUEST: z.coerce.number().int().min(1).max(50).default(5),
  TRADE_POLL_LIMIT: z.coerce.number().int().min(1).max(2_000).default(100),
  TRADE_POLL_TAKER_ONLY: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  MIN_TRADE_USD_TO_STORE: z.coerce.number().min(0).default(25),
  MAX_TRADES_PER_POLL_CYCLE: z.coerce.number().int().min(1).max(10_000).default(500),
  MAX_MARKETS_PER_TRADE_POLL: z.coerce.number().int().min(1).max(1_000).default(50),
  SKIP_DUPLICATE_BEFORE_INSERT: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  MARKET_DISCOVERY_INTERVAL_MS: z.coerce.number().int().min(10_000).default(180_000),
  TRADE_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).default(60_000),
  TRADE_BATCH_SIZE: z.coerce.number().int().min(1).max(5_000).default(500),
  TRADE_FLUSH_INTERVAL_MS: z.coerce.number().int().min(250).default(2_000),
  AGGREGATE_FLUSH_INTERVAL_MS: z.coerce.number().int().min(500).default(2_500),
  INTELLIGENCE_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  INTELLIGENCE_INTERVAL_MS: z.coerce.number().int().min(10_000).default(60_000),
  INTELLIGENCE_MAX_MARKETS_PER_RUN: z.coerce.number().int().min(1).max(1_000).default(200),
  PROB_SHOCK_5M_THRESHOLD: z.coerce.number().min(0.001).max(1).default(0.05),
  PROB_SHOCK_15M_THRESHOLD: z.coerce.number().min(0.001).max(1).default(0.08),
  PROB_SHOCK_60M_THRESHOLD: z.coerce.number().min(0.001).max(1).default(0.12),
  VOLUME_SPIKE_MULTIPLE: z.coerce.number().min(1).default(3),
  VOLUME_SPIKE_MIN_VOLUME: z.coerce.number().min(0).default(100),
  ACTIVITY_SPIKE_MULTIPLE: z.coerce.number().min(1).default(3),
  ACTIVITY_SPIKE_MIN_TRADES: z.coerce.number().int().min(1).default(10),
  WHALE_TRADE_USD_THRESHOLD: z.coerce.number().min(1).default(5_000),
  WALLET_INTELLIGENCE_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  WALLET_ANALYSIS_INTERVAL_MS: z.coerce.number().int().min(60_000).default(300_000),
  SMART_MONEY_MIN_VOLUME_USD: z.coerce.number().min(0).default(1),
  WALLET_LOOKBACK_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  COORDINATED_ACTIVITY_THRESHOLD: z.coerce.number().int().min(2).default(4),
  RECONNECT_MIN_MS: z.coerce.number().int().min(250).default(1_000),
  RECONNECT_MAX_MS: z.coerce.number().int().min(1_000).default(30_000),
  HTTP_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(15_000),
  MAX_MARKETS_PER_POLL: z.coerce.number().int().min(1).max(1_000).default(100),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
});

export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export const loadWorkerConfig = (env: NodeJS.ProcessEnv = process.env): WorkerConfig =>
  workerConfigSchema.parse(env);
