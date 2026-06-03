CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE market_source AS ENUM ('polymarket', 'kalshi', 'manifold', 'internal');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  CREATE TYPE market_status AS ENUM ('draft', 'open', 'paused', 'closed', 'settled', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  CREATE TYPE trade_side AS ENUM ('buy', 'sell');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  CREATE TYPE anomaly_type AS ENUM (
    'probability_gap',
    'volume_spike',
    'liquidity_drain',
    'wallet_cluster',
    'timeline_discontinuity',
    'narrative_correlation',
    'price_dislocation'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  CREATE TYPE timeline_event_type AS ENUM (
    'trade',
    'aggregate',
    'anomaly',
    'narrative',
    'alert',
    'resolution',
    'system'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  CREATE TYPE alert_type AS ENUM ('market', 'wallet', 'anomaly', 'narrative', 'system');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source market_source NOT NULL,
  external_id text NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  description text,
  category text NOT NULL,
  status market_status NOT NULL DEFAULT 'open',
  resolution_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT markets_source_external_id_unique UNIQUE (source, external_id),
  CONSTRAINT markets_slug_unique UNIQUE (slug)
);

CREATE INDEX markets_external_id_idx ON markets (external_id);
CREATE INDEX markets_category_idx ON markets (category);
CREATE INDEX markets_status_idx ON markets (status);

CREATE TABLE trades (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets (id) ON DELETE RESTRICT,
  wallet_address text NOT NULL,
  side trade_side NOT NULL,
  price numeric(18, 8) NOT NULL,
  quantity numeric(30, 12) NOT NULL,
  usd_value numeric(30, 8) NOT NULL,
  transaction_hash text NOT NULL,
  trade_timestamp timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trades_pk PRIMARY KEY (id, trade_timestamp),
  CONSTRAINT trades_price_check CHECK (price >= 0),
  CONSTRAINT trades_quantity_check CHECK (quantity > 0),
  CONSTRAINT trades_usd_value_check CHECK (usd_value >= 0)
) PARTITION BY RANGE (trade_timestamp);

CREATE TABLE trades_default PARTITION OF trades DEFAULT;

CREATE INDEX trades_market_id_trade_timestamp_idx ON trades (market_id, trade_timestamp);
CREATE INDEX trades_wallet_address_idx ON trades (wallet_address);
CREATE INDEX trades_trade_timestamp_desc_idx ON trades (trade_timestamp DESC);
CREATE INDEX trades_transaction_hash_idx ON trades (transaction_hash);

CREATE TABLE market_aggregates_1m (
  market_id uuid NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
  bucket timestamptz NOT NULL,
  open numeric(18, 8) NOT NULL,
  high numeric(18, 8) NOT NULL,
  low numeric(18, 8) NOT NULL,
  close numeric(18, 8) NOT NULL,
  volume numeric(30, 8) NOT NULL,
  trade_count integer NOT NULL,
  CONSTRAINT market_aggregates_1m_pk PRIMARY KEY (market_id, bucket),
  CONSTRAINT market_aggregates_1m_prices_check CHECK (open >= 0 AND high >= 0 AND low >= 0 AND close >= 0),
  CONSTRAINT market_aggregates_1m_volume_check CHECK (volume >= 0),
  CONSTRAINT market_aggregates_1m_trade_count_check CHECK (trade_count >= 0)
);

CREATE INDEX market_aggregates_1m_market_id_bucket_idx ON market_aggregates_1m (market_id, bucket);

CREATE TABLE wallet_stats (
  wallet_address text PRIMARY KEY,
  realized_pnl numeric(30, 8) NOT NULL DEFAULT 0,
  unrealized_pnl numeric(30, 8) NOT NULL DEFAULT 0,
  win_rate numeric(6, 5) NOT NULL DEFAULT 0,
  avg_hold_time integer NOT NULL DEFAULT 0,
  conviction_score numeric(8, 4) NOT NULL DEFAULT 0,
  reputation_score numeric(8, 4) NOT NULL DEFAULT 0,
  information_advantage_score numeric(8, 4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_stats_win_rate_check CHECK (win_rate >= 0 AND win_rate <= 1),
  CONSTRAINT wallet_stats_avg_hold_time_check CHECK (avg_hold_time >= 0),
  CONSTRAINT wallet_stats_scores_check CHECK (
    conviction_score >= 0
    AND reputation_score >= 0
    AND information_advantage_score >= 0
  )
);

CREATE INDEX wallet_stats_reputation_score_desc_idx ON wallet_stats (reputation_score DESC);
CREATE INDEX wallet_stats_information_advantage_score_desc_idx ON wallet_stats (information_advantage_score DESC);

CREATE TABLE anomaly_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
  anomaly_type anomaly_type NOT NULL,
  severity_score numeric(8, 4) NOT NULL,
  summary text NOT NULL,
  confidence_score numeric(8, 4) NOT NULL,
  wallet_addresses text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anomaly_events_severity_check CHECK (severity_score >= 0 AND severity_score <= 100),
  CONSTRAINT anomaly_events_confidence_check CHECK (confidence_score >= 0 AND confidence_score <= 100)
);

CREATE INDEX anomaly_events_severity_detected_idx ON anomaly_events (severity_score DESC, detected_at DESC);
CREATE INDEX anomaly_events_detected_at_desc_idx ON anomaly_events (detected_at DESC);
CREATE INDEX anomaly_events_anomaly_type_idx ON anomaly_events (anomaly_type);
CREATE INDEX anomaly_events_market_id_detected_at_idx ON anomaly_events (market_id, detected_at);
CREATE INDEX anomaly_events_metadata_gin_idx ON anomaly_events USING gin (metadata jsonb_path_ops);

CREATE TABLE narrative_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  event_timestamp timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX narrative_events_event_timestamp_desc_idx ON narrative_events (event_timestamp DESC);
CREATE INDEX narrative_events_tags_gin_idx ON narrative_events USING gin (tags);
CREATE INDEX narrative_events_metadata_gin_idx ON narrative_events USING gin (metadata jsonb_path_ops);

CREATE TABLE market_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
  event_type timeline_event_type NOT NULL,
  event_timestamp timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX market_timeline_market_id_event_timestamp_idx ON market_timeline (market_id, event_timestamp);
CREATE INDEX market_timeline_event_type_idx ON market_timeline (event_type);
CREATE INDEX market_timeline_payload_gin_idx ON market_timeline USING gin (payload jsonb_path_ops);

CREATE TABLE alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  alert_type alert_type NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX alerts_user_id_is_active_idx ON alerts (user_id, is_active);
CREATE INDEX alerts_alert_type_idx ON alerts (alert_type);
CREATE INDEX alerts_conditions_gin_idx ON alerts USING gin (conditions jsonb_path_ops);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER markets_set_updated_at
BEFORE UPDATE ON markets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER wallet_stats_set_updated_at
BEFORE UPDATE ON wallet_stats
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION block_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER trades_block_update
BEFORE UPDATE ON trades
FOR EACH ROW
EXECUTE FUNCTION block_append_only_mutation();

CREATE TRIGGER trades_block_delete
BEFORE DELETE ON trades
FOR EACH ROW
EXECUTE FUNCTION block_append_only_mutation();

CREATE OR REPLACE FUNCTION create_trade_partition_month(partition_month date)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  partition_start timestamptz := date_trunc('month', partition_month)::timestamptz;
  partition_end timestamptz := (date_trunc('month', partition_month) + interval '1 month')::timestamptz;
  partition_name text := 'trades_' || to_char(partition_start, 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF trades FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    partition_start,
    partition_end
  );
END;
$$;

SELECT create_trade_partition_month(date_trunc('month', now())::date);
SELECT create_trade_partition_month((date_trunc('month', now()) + interval '1 month')::date);

ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_aggregates_1m ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE narrative_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE markets;
    ALTER PUBLICATION supabase_realtime ADD TABLE market_aggregates_1m;
    ALTER PUBLICATION supabase_realtime ADD TABLE anomaly_events;
    ALTER PUBLICATION supabase_realtime ADD TABLE market_timeline;
    ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

COMMENT ON TABLE trades IS
  'High-throughput append-only raw trade stream. Partition by trade_timestamp monthly or daily as volume grows; keep recent partitions hot and archive old partitions to parquet.';
COMMENT ON TABLE market_aggregates_1m IS
  'Primary UI datasource. Query aggregates first; only inspect raw trades for drilldown and replay.';
COMMENT ON TABLE anomaly_events IS
  'Primary intelligence event table. Keep compact summaries and structured metadata for filtering; move large AI artifacts to object storage.';
COMMENT ON TABLE market_timeline IS
  'Unified replay stream. Payload JSONB is intentionally bounded and indexed for replay filters.';
COMMENT ON COLUMN narrative_events.content IS
  'Store normalized narrative text here. For full articles or embeddings, prefer object/vector storage keyed by narrative_events.id.';
