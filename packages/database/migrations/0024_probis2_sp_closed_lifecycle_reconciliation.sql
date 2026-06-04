-- Add closed-feed / lifecycle reconciliation for the stored-procedure pipeline.
--
-- This function consumes a staged Gamma closed_events batch and applies only
-- feed-derived lifecycle/finality signals. It does not fetch per-event Gamma
-- detail and does not delete core rows. TypeScript staging-db and memory modes
-- remain available as fallback/debug paths.

create or replace function probis2_gamma_bool_prototype(value text)
returns boolean
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;
  return value::boolean;
exception when others then
  return null;
end;
$$;

create or replace function probis2_gamma_timestamp_prototype(value text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;
  return value::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function probis2_reconcile_gamma_closed_batch_prototype(p_closed_batch_id uuid)
returns jsonb
language plpgsql
as $$
declare
  started_at timestamptz := clock_timestamp();
  v_batch_feed_kind text;
  v_closed_events_seen integer := 0;
  v_closed_markets_seen integer := 0;
  v_events_matched integer := 0;
  v_markets_matched integer := 0;
  v_events_closed integer := 0;
  v_events_archived integer := 0;
  v_markets_closed integer := 0;
  v_markets_archived integer := 0;
  v_markets_resolved integer := 0;
  v_markets_automatically_resolved integer := 0;
  v_markets_final_period_ft integer := 0;
  v_markets_finished_timestamp integer := 0;
  v_markets_closed_time_set integer := 0;
  v_markets_lifecycle_updated integer := 0;
  v_duration_ms integer;
  v_summary jsonb;
begin
  select feed_kind
  into v_batch_feed_kind
  from gamma_ingestion_batches
  where id = p_closed_batch_id;

  if v_batch_feed_kind is null then
    raise exception 'Gamma staging batch not found: %', p_closed_batch_id;
  end if;

  if v_batch_feed_kind <> 'closed_events' then
    raise exception 'Expected closed_events batch, received %', v_batch_feed_kind;
  end if;

  create temp table tmp_sp_closed_events_raw on commit drop as
  select
    raw.external_event_id,
    raw.payload,
    probis2_gamma_bool_prototype(raw.payload->>'active') as active,
    probis2_gamma_bool_prototype(raw.payload->>'closed') as closed,
    probis2_gamma_bool_prototype(raw.payload->>'archived') as archived,
    probis2_gamma_bool_prototype(raw.payload->>'ended') as ended,
    probis2_gamma_bool_prototype(raw.payload->>'live') as live,
    probis2_gamma_bool_prototype(raw.payload->>'automaticallyResolved') as automatically_resolved,
    probis2_gamma_timestamp_prototype(coalesce(raw.payload->>'closedTime', raw.payload->>'closed_time')) as closed_time,
    raw.payload->>'period' as period,
    probis2_gamma_timestamp_prototype(coalesce(raw.payload->>'finishedTimestamp', raw.payload->>'finished_timestamp')) as finished_timestamp,
    raw.payload->>'score' as score,
    probis2_gamma_timestamp_prototype(raw.payload->>'updatedAt') as gamma_updated_at
  from gamma_raw_events raw
  where raw.batch_id = p_closed_batch_id
    and raw.feed_kind = 'closed_events';

  get diagnostics v_closed_events_seen = row_count;

  create temp table tmp_sp_closed_markets_raw on commit drop as
  select
    raw.external_event_id,
    raw.external_market_id,
    raw.payload,
    probis2_gamma_bool_prototype(raw.payload->>'active') as active,
    probis2_gamma_bool_prototype(raw.payload->>'closed') as closed,
    probis2_gamma_bool_prototype(raw.payload->>'archived') as archived,
    probis2_gamma_bool_prototype(raw.payload->>'acceptingOrders') as accepting_orders,
    probis2_gamma_bool_prototype(raw.payload->>'enableOrderBook') as enable_order_book,
    probis2_gamma_bool_prototype(raw.payload->>'resolved') as resolved,
    probis2_gamma_bool_prototype(raw.payload->>'automaticallyResolved') as automatically_resolved,
    probis2_gamma_timestamp_prototype(coalesce(raw.payload->>'closedTime', raw.payload->>'closed_time')) as closed_time,
    raw.payload->>'umaResolutionStatus' as uma_resolution_status,
    case
      when raw.payload ? 'umaResolutionStatuses' then probis2_gamma_text_array_prototype(raw.payload->'umaResolutionStatuses')
      else null
    end as uma_resolution_statuses,
    raw.payload->>'resolvedBy' as resolved_by,
    probis2_gamma_bool_prototype(raw.payload->>'ready') as ready,
    probis2_gamma_bool_prototype(raw.payload->>'approved') as approved,
    raw.payload->>'period' as period,
    probis2_gamma_timestamp_prototype(coalesce(raw.payload->>'finishedTimestamp', raw.payload->>'finished_timestamp')) as finished_timestamp,
    probis2_gamma_timestamp_prototype(raw.payload->>'gameStartTime') as game_start_time,
    raw.payload->>'sportsMarketType' as sports_market_type,
    probis2_gamma_timestamp_prototype(raw.payload->>'updatedAt') as gamma_updated_at,
    (
      raw.external_market_id is not null
      and (
        probis2_gamma_bool_prototype(raw.payload->>'closed') = true
        or probis2_gamma_bool_prototype(raw.payload->>'active') = false
        or probis2_gamma_bool_prototype(raw.payload->>'archived') = true
        or probis2_gamma_bool_prototype(raw.payload->>'resolved') = true
        or probis2_gamma_bool_prototype(raw.payload->>'automaticallyResolved') = true
        or probis2_gamma_timestamp_prototype(coalesce(raw.payload->>'closedTime', raw.payload->>'closed_time')) is not null
        or lower(coalesce(raw.payload->>'period', '')) = 'ft'
        or probis2_gamma_timestamp_prototype(coalesce(raw.payload->>'finishedTimestamp', raw.payload->>'finished_timestamp')) is not null
        or lower(coalesce(raw.payload->>'umaResolutionStatus', '')) in ('resolved', 'proposed', 'final')
      )
    ) as final_state
  from gamma_raw_markets raw
  where raw.batch_id = p_closed_batch_id
    and raw.feed_kind = 'closed_events';

  get diagnostics v_closed_markets_seen = row_count;

  with incoming as (
    select
      raw.*,
      (
        raw.closed = true
        or raw.active = false
        or raw.archived = true
        or raw.ended = true
        or raw.automatically_resolved = true
        or raw.closed_time is not null
        or lower(coalesce(raw.period, '')) = 'ft'
        or raw.finished_timestamp is not null
      ) as final_state
    from tmp_sp_closed_events_raw raw
  ),
  updated_events as (
    update events event set
      active = case when incoming.final_state then false else coalesce(incoming.active, event.active) end,
      closed = case when incoming.final_state then true else coalesce(incoming.closed, event.closed) end,
      archived = coalesce(incoming.archived, event.archived),
      closed_time = coalesce(incoming.closed_time, event.closed_time),
      ended = coalesce(incoming.ended, event.ended),
      live = case when incoming.final_state then coalesce(incoming.live, false) else coalesce(incoming.live, event.live) end,
      period = coalesce(incoming.period, event.period),
      finished_timestamp = coalesce(incoming.finished_timestamp, event.finished_timestamp),
      score = coalesce(incoming.score, event.score),
      automatically_resolved = coalesce(incoming.automatically_resolved, event.automatically_resolved),
      gamma_updated_at = coalesce(incoming.gamma_updated_at, event.gamma_updated_at),
      last_lifecycle_checked_at = now(),
      updated_at = now()
    from incoming
    where event.external_event_id = incoming.external_event_id
    returning
      event.id,
      incoming.final_state,
      coalesce(incoming.archived, false) as incoming_archived
  )
  select
    count(*)::int,
    count(*) filter (where final_state)::int,
    count(*) filter (where incoming_archived)::int
  into v_events_matched, v_events_closed, v_events_archived
  from updated_events;

  with event_closed_markets as (
    update markets market set
      status = case when lower(coalesce(market.uma_resolution_status, '')) = 'resolved' or coalesce(market.resolved, false) then 'resolved' else 'closed' end,
      active = false,
      closed = true,
      accepting_orders = false,
      last_lifecycle_checked_at = now(),
      updated_at = now()
    from event_markets event_market
    join events event on event.id = event_market.event_id
    join tmp_sp_closed_events_raw incoming_event on incoming_event.external_event_id = event.external_event_id
    where market.id = event_market.market_id
      and (
        incoming_event.closed = true
        or incoming_event.active = false
        or incoming_event.archived = true
        or incoming_event.ended = true
        or incoming_event.automatically_resolved = true
        or incoming_event.closed_time is not null
        or lower(coalesce(incoming_event.period, '')) = 'ft'
        or incoming_event.finished_timestamp is not null
      )
    returning market.id
  )
  select count(distinct id)::int
  into v_markets_lifecycle_updated
  from event_closed_markets;

  with updated_markets as (
    update markets market set
      status = case
        when incoming.final_state and lower(coalesce(incoming.uma_resolution_status, market.uma_resolution_status, '')) = 'resolved' then 'resolved'
        when incoming.final_state and incoming.resolved = true then 'resolved'
        when incoming.final_state then 'closed'
        else market.status
      end,
      active = case when incoming.final_state then false else coalesce(incoming.active, market.active) end,
      closed = case when incoming.final_state then true else coalesce(incoming.closed, market.closed) end,
      archived = coalesce(incoming.archived, market.archived),
      accepting_orders = case when incoming.final_state then false else coalesce(incoming.accepting_orders, market.accepting_orders) end,
      enable_order_book = coalesce(incoming.enable_order_book, market.enable_order_book),
      closed_time = coalesce(incoming.closed_time, market.closed_time),
      uma_resolution_status = coalesce(incoming.uma_resolution_status, market.uma_resolution_status),
      uma_resolution_statuses = coalesce(incoming.uma_resolution_statuses, market.uma_resolution_statuses),
      resolved_by = coalesce(incoming.resolved_by, market.resolved_by),
      ready = coalesce(incoming.ready, market.ready),
      approved = coalesce(incoming.approved, market.approved),
      resolved = coalesce(incoming.resolved, market.resolved),
      period = coalesce(incoming.period, market.period),
      finished_timestamp = coalesce(incoming.finished_timestamp, market.finished_timestamp),
      automatically_resolved = coalesce(incoming.automatically_resolved, market.automatically_resolved),
      game_start_time = coalesce(incoming.game_start_time, market.game_start_time),
      sports_market_type = coalesce(incoming.sports_market_type, market.sports_market_type),
      gamma_updated_at = coalesce(incoming.gamma_updated_at, market.gamma_updated_at),
      last_lifecycle_checked_at = now(),
      updated_at = now()
    from tmp_sp_closed_markets_raw incoming
    where market.external_market_id = incoming.external_market_id
    returning
      market.id,
      incoming.final_state,
      coalesce(incoming.archived, false) as incoming_archived,
      coalesce(incoming.resolved, false) or lower(coalesce(incoming.uma_resolution_status, '')) = 'resolved' as incoming_resolved,
      coalesce(incoming.automatically_resolved, false) as incoming_automatically_resolved,
      lower(coalesce(incoming.period, '')) = 'ft' as incoming_period_ft,
      incoming.finished_timestamp is not null as incoming_finished_timestamp,
      incoming.closed_time is not null as incoming_closed_time_set
  )
  select
    count(*)::int,
    count(*) filter (where final_state)::int,
    count(*) filter (where incoming_archived)::int,
    count(*) filter (where incoming_resolved)::int,
    count(*) filter (where incoming_automatically_resolved)::int,
    count(*) filter (where incoming_period_ft)::int,
    count(*) filter (where incoming_finished_timestamp)::int,
    count(*) filter (where incoming_closed_time_set)::int
  into
    v_markets_matched,
    v_markets_closed,
    v_markets_archived,
    v_markets_resolved,
    v_markets_automatically_resolved,
    v_markets_final_period_ft,
    v_markets_finished_timestamp,
    v_markets_closed_time_set
  from updated_markets;

  v_markets_lifecycle_updated := v_markets_lifecycle_updated + v_markets_matched;
  v_duration_ms := (extract(epoch from (clock_timestamp() - started_at)) * 1000)::int;

  v_summary := jsonb_build_object(
    'mode', 'stored-procedure-closed-lifecycle-prototype',
    'batch_id', p_closed_batch_id,
    'closed_events_seen', v_closed_events_seen,
    'closed_markets_seen', v_closed_markets_seen,
    'events_matched', v_events_matched,
    'markets_matched', v_markets_matched,
    'events_closed', v_events_closed,
    'events_archived', v_events_archived,
    'markets_closed', v_markets_closed,
    'markets_archived', v_markets_archived,
    'markets_resolved', v_markets_resolved,
    'markets_automatically_resolved', v_markets_automatically_resolved,
    'markets_final_period_ft', v_markets_final_period_ft,
    'markets_finished_timestamp', v_markets_finished_timestamp,
    'markets_closed_time_set', v_markets_closed_time_set,
    'markets_lifecycle_updated', v_markets_lifecycle_updated,
    'duration_ms', v_duration_ms,
    'limitation_notes', jsonb_build_array(
      'Closed reconciliation uses staged Gamma closed_events feed payloads only.',
      'Per-event detail fetch lifecycle reconciliation remains outside this stored-procedure function.',
      'Core rows are updated, not deleted.'
    )
  );

  update gamma_raw_events raw
  set
    normalization_status = case when event.id is null then 'excluded' else 'normalized' end,
    exclusion_reasons = case when event.id is null then array['closed_event_not_found_locally'] else '{}'::text[] end,
    normalized_at = now(),
    error_message = null
  from tmp_sp_closed_events_raw seen
  left join events event on event.external_event_id = seen.external_event_id
  where raw.batch_id = p_closed_batch_id
    and raw.external_event_id = seen.external_event_id;

  update gamma_raw_markets raw
  set
    normalization_status = case when market.id is null then 'excluded' else 'normalized' end,
    exclusion_reasons = case when market.id is null then array['closed_market_not_found_locally'] else '{}'::text[] end,
    normalized_at = now(),
    error_message = null
  from tmp_sp_closed_markets_raw seen
  left join markets market on market.external_market_id = seen.external_market_id
  where raw.batch_id = p_closed_batch_id
    and raw.external_market_id = seen.external_market_id;

  update gamma_ingestion_batches
  set
    status = 'normalized',
    normalized_at = now(),
    completed_at = now(),
    normalized_event_count = v_events_matched,
    normalized_market_count = v_markets_matched,
    excluded_event_count = greatest(0, v_closed_events_seen - v_events_matched),
    excluded_market_count = greatest(0, v_closed_markets_seen - v_markets_matched),
    timings = timings || jsonb_build_object('storedProcedureClosedLifecycle', v_summary),
    error_message = null
  where id = p_closed_batch_id;

  return v_summary;
exception when others then
  update gamma_ingestion_batches
  set
    status = 'failed',
    completed_at = now(),
    error_message = sqlerrm
  where id = p_closed_batch_id;
  raise;
end;
$$;
