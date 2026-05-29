CREATE TABLE IF NOT EXISTS system_status (
  service_name text PRIMARY KEY,
  status text NOT NULL DEFAULT 'standby',
  status_message text,
  last_heartbeat_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_status_last_heartbeat_at_idx
  ON system_status (last_heartbeat_at DESC);

COMMENT ON TABLE system_status IS
  'Compact service heartbeat/status table. One row per service; not a raw event log.';
