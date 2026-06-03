-- Experimental Probis 2.0 stored-procedure normalization prototype.
-- This is benchmark-only infrastructure. TypeScript normalization remains the source of truth.
-- The prototype reads compact raw Gamma staging JSONB and writes enough normalized rows to
-- refresh explorer_event_cards. It intentionally favors readable SQL over full parity.

create or replace function probis2_slugify_prototype(value text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(regexp_replace(regexp_replace(lower(trim(coalesce(value, ''))), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'), ''), 'other')
$$;

create or replace function probis2_gamma_numeric_prototype(value text)
returns numeric
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;
  return value::numeric;
exception when others then
  return null;
end;
$$;

create or replace function probis2_gamma_text_array_prototype(value jsonb)
returns text[]
language plpgsql
stable
as $$
declare
  parsed jsonb;
  raw_text text;
  result text[];
begin
  if value is null or value = 'null'::jsonb then
    return '{}'::text[];
  end if;

  if jsonb_typeof(value) = 'array' then
    select coalesce(array_agg(item), '{}'::text[])
    into result
    from jsonb_array_elements_text(value) as items(item);
    return result;
  end if;

  if jsonb_typeof(value) = 'string' then
    raw_text := value #>> '{}';
    if raw_text is null or btrim(raw_text) = '' then
      return '{}'::text[];
    end if;

    begin
      parsed := raw_text::jsonb;
      if jsonb_typeof(parsed) = 'array' then
        select coalesce(array_agg(item), '{}'::text[])
        into result
        from jsonb_array_elements_text(parsed) as items(item);
        return result;
      end if;
    exception when others then
      return '{}'::text[];
    end;
  end if;

  return '{}'::text[];
end;
$$;

create or replace function probis2_classify_category_prototype(value text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(value, '') ~* '(^|[^a-z0-9])(esports|sports|nba|nfl|mlb|nhl|soccer|football|ufc|tennis|baseball|basketball|hockey|golf|cricket|formula-1|f1)([^a-z0-9]|$)' then 'Sports'
    when coalesce(value, '') ~* '(^|[^a-z0-9])(geopolitics|iran|war|conflict|russia|ukraine|israel|china|taiwan)([^a-z0-9]|$)' then 'Geopolitics'
    when coalesce(value, '') ~* '(^|[^a-z0-9])(politics|elections|election|president|senate|house|congress)([^a-z0-9]|$)' then 'Politics'
    when coalesce(value, '') ~* '(^|[^a-z0-9])(crypto|crypto-prices|bitcoin|ethereum|solana)([^a-z0-9]|$)' then 'Crypto'
    when coalesce(value, '') ~* '(^|[^a-z0-9])(economy|fed-rates|inflation|recession|macro|interest-rates|interest rate|finance|stocks|fed)([^a-z0-9]|$)' then 'Macro'
    when coalesce(value, '') ~* '(^|[^a-z0-9])(ai|tech|technology|openai|nvidia|tesla|spacex|big-tech)([^a-z0-9]|$)' then 'Technology'
    when coalesce(value, '') ~* '(^|[^a-z0-9])(weather|hurricane|temperature|climate|climate-science)([^a-z0-9]|$)' then 'Weather'
    when coalesce(value, '') ~* '(^|[^a-z0-9])(oscars|oscar|music|movies|movie|culture|pop-culture|entertainment|celebrity)([^a-z0-9]|$)' then 'Culture'
    when coalesce(value, '') ~* '(^|[^a-z0-9])(science|space|medicine)([^a-z0-9]|$)' then 'Science'
    else 'Other'
  end
$$;

create or replace function probis2_normalize_gamma_open_batch_prototype(p_batch_id uuid)
returns jsonb
language plpgsql
as $$
declare
  started_at timestamptz := clock_timestamp();
  run_started_at timestamptz := now();
  v_venue_id uuid;
  v_events_seen integer := 0;
  v_events_upserted integer := 0;
  v_events_excluded integer := 0;
  v_markets_seen integer := 0;
  v_markets_upserted integer := 0;
  v_markets_excluded integer := 0;
  v_outcomes_upserted integer := 0;
  v_event_markets_upserted integer := 0;
  v_market_categories_upserted integer := 0;
  v_batch_feed_kind text;
  v_duration_ms integer;
  v_summary jsonb;
begin
  select feed_kind
  into v_batch_feed_kind
  from gamma_ingestion_batches
  where id = p_batch_id;

  if v_batch_feed_kind is null then
    raise exception 'Gamma staging batch not found: %', p_batch_id;
  end if;

  if v_batch_feed_kind <> 'open_events' then
    raise exception 'Expected open_events batch, received %', v_batch_feed_kind;
  end if;

  insert into venues (slug, name)
  values ('polymarket', 'Polymarket')
  on conflict (slug) do update set name = excluded.name
  returning id into v_venue_id;

  insert into categories (venue_id, slug, name)
  select v_venue_id, probis2_slugify_prototype(name), name
  from unnest(array[
    'Politics', 'Geopolitics', 'Macro', 'Crypto', 'Technology',
    'Sports', 'Culture', 'Science', 'Weather', 'Other'
  ]) as canonical(name)
  on conflict (venue_id, slug) do update set name = excluded.name;

  create temp table tmp_sp_events_raw on commit drop as
  select
    raw.external_event_id,
    raw.payload,
    coalesce(raw.payload->>'title', '') as title,
    probis2_slugify_prototype(coalesce(raw.payload->>'slug', raw.payload->>'title', raw.external_event_id)) as slug,
    probis2_classify_category_prototype(concat_ws(
      ' ',
      raw.payload->>'category',
      raw.payload->>'title',
      raw.payload->>'description'
    )) as category_name,
    (
      raw.external_event_id is not null
      and coalesce(raw.payload->>'title', '') <> ''
      and coalesce((raw.payload->>'active')::boolean, true) = true
      and coalesce((raw.payload->>'closed')::boolean, false) = false
      and coalesce((raw.payload->>'ended')::boolean, false) = false
      and coalesce((raw.payload->>'archived')::boolean, false) = false
      and coalesce((raw.payload->>'automaticallyResolved')::boolean, false) = false
      and nullif(raw.payload->>'closedTime', '') is null
      and lower(coalesce(raw.payload->>'period', '')) <> 'ft'
      and nullif(raw.payload->>'finishedTimestamp', '') is null
    ) as base_valid
  from gamma_raw_events raw
  where raw.batch_id = p_batch_id
    and raw.feed_kind = 'open_events';

  get diagnostics v_events_seen = row_count;

  create temp table tmp_sp_markets_raw on commit drop as
  with raw as (
    select
      raw.external_event_id,
      raw.external_market_id,
      raw.payload,
      coalesce(raw.payload->>'question', raw.payload->>'title', '') as title,
      probis2_gamma_text_array_prototype(raw.payload->'outcomes') as outcome_labels,
      probis2_gamma_text_array_prototype(raw.payload->'outcomePrices') as outcome_prices,
      probis2_gamma_text_array_prototype(raw.payload->'clobTokenIds') as token_ids
    from gamma_raw_markets raw
    where raw.batch_id = p_batch_id
      and raw.feed_kind = 'open_events'
  )
  select
    raw.*,
    probis2_slugify_prototype(coalesce(raw.payload->>'slug', raw.title, raw.external_market_id)) as slug,
    probis2_classify_category_prototype(concat_ws(
      ' ',
      raw.payload->>'category',
      raw.payload->>'question',
      raw.payload->>'title',
      raw.payload->>'description'
    )) as category_name,
    coalesce(
      nullif(raw.payload->>'endDateIso', '')::timestamptz,
      nullif(raw.payload->>'endDate', '')::timestamptz,
      nullif(raw.payload->>'resolutionDate', '')::timestamptz
    ) as end_date,
    (
      raw.external_market_id is not null
      and raw.title <> ''
      and coalesce((raw.payload->>'active')::boolean, false) = true
      and coalesce((raw.payload->>'closed')::boolean, true) = false
      and coalesce((raw.payload->>'archived')::boolean, true) = false
      and coalesce((raw.payload->>'acceptingOrders')::boolean, false) = true
      and coalesce((raw.payload->>'enableOrderBook')::boolean, false) = true
      and coalesce((raw.payload->>'resolved')::boolean, false) = false
      and coalesce((raw.payload->>'automaticallyResolved')::boolean, false) = false
      and nullif(raw.payload->>'closedTime', '') is null
      and lower(coalesce(raw.payload->>'umaResolutionStatus', '')) <> 'resolved'
      and lower(coalesce(raw.payload->>'period', '')) <> 'ft'
      and nullif(raw.payload->>'finishedTimestamp', '') is null
      and coalesce(array_length(raw.outcome_labels, 1), 0) > 0
      and exists (
        select 1
        from unnest(raw.outcome_prices) as prices(price)
        where probis2_gamma_numeric_prototype(price) is not null
      )
      and not (
        lower(coalesce(raw.payload->>'groupItemTitle', '')) = 'completed match'
        and (
          lower(coalesce(raw.payload->>'sportsMarketType', '')) like '%completed_match%'
          or lower(raw.title) like '%: completed match:%'
          or (
            nullif(raw.payload->>'gameStartTime', '')::timestamptz <= now()
            and lower(coalesce(raw.payload->>'umaResolutionStatus', '')) in ('proposed', 'resolved')
          )
        )
      )
    ) as base_valid
  from raw;

  get diagnostics v_markets_seen = row_count;

  create temp table tmp_sp_valid_markets on commit drop as
  select m.*
  from tmp_sp_markets_raw m
  join tmp_sp_events_raw e on e.external_event_id = m.external_event_id
  where e.base_valid
    and m.base_valid
    and m.end_date >= now();

  create temp table tmp_sp_valid_events on commit drop as
  select distinct e.*
  from tmp_sp_events_raw e
  join tmp_sp_valid_markets m on m.external_event_id = e.external_event_id;

  insert into events (
    venue_id, external_event_id, slug, title, description, primary_category_id,
    start_date, end_date, active, closed, archived, closed_time, live, ended,
    period, finished_timestamp, score, automatically_resolved, gamma_updated_at,
    last_seen_in_open_feed_at, volume, volume_24h, liquidity, open_interest
  )
  select
    v_venue_id,
    e.external_event_id,
    e.slug,
    e.title,
    e.payload->>'description',
    c.id,
    nullif(e.payload->>'startDate', '')::timestamptz,
    nullif(e.payload->>'endDate', '')::timestamptz,
    true,
    false,
    coalesce((e.payload->>'archived')::boolean, false),
    nullif(e.payload->>'closedTime', '')::timestamptz,
    nullif(e.payload->>'live', '')::boolean,
    nullif(e.payload->>'ended', '')::boolean,
    e.payload->>'period',
    nullif(e.payload->>'finishedTimestamp', '')::timestamptz,
    e.payload->>'score',
    nullif(e.payload->>'automaticallyResolved', '')::boolean,
    nullif(e.payload->>'updatedAt', '')::timestamptz,
    run_started_at,
    probis2_gamma_numeric_prototype(e.payload->>'volume'),
    probis2_gamma_numeric_prototype(e.payload->>'volume24hr'),
    probis2_gamma_numeric_prototype(e.payload->>'liquidity'),
    probis2_gamma_numeric_prototype(e.payload->>'openInterest')
  from tmp_sp_valid_events e
  join categories c on c.venue_id = v_venue_id and c.slug = probis2_slugify_prototype(e.category_name)
  on conflict (venue_id, external_event_id) do update set
    slug = excluded.slug,
    title = excluded.title,
    description = excluded.description,
    primary_category_id = excluded.primary_category_id,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    active = excluded.active,
    closed = excluded.closed,
    archived = excluded.archived,
    closed_time = excluded.closed_time,
    live = excluded.live,
    ended = excluded.ended,
    period = excluded.period,
    finished_timestamp = excluded.finished_timestamp,
    score = excluded.score,
    automatically_resolved = excluded.automatically_resolved,
    gamma_updated_at = excluded.gamma_updated_at,
    last_seen_in_open_feed_at = excluded.last_seen_in_open_feed_at,
    volume = excluded.volume,
    volume_24h = excluded.volume_24h,
    liquidity = excluded.liquidity,
    open_interest = excluded.open_interest,
    updated_at = now();

  get diagnostics v_events_upserted = row_count;

  insert into markets (
    venue_id, external_market_id, slug, title, description, group_item_title,
    sports_market_type, game_start_time, uma_resolution_status, uma_resolution_statuses,
    resolved_by, ready, approved, resolved, period, finished_timestamp,
    automatically_resolved, last_seen_in_open_feed_at, category_id, primary_category_id,
    status, end_date, active, closed, archived, accepting_orders, enable_order_book,
    closed_time, volume, volume_24h, liquidity, featured, is_new, competitive,
    one_day_price_change, one_hour_price_change, one_week_price_change, gamma_updated_at
  )
  select
    v_venue_id,
    m.external_market_id,
    m.slug,
    m.title,
    m.payload->>'description',
    m.payload->>'groupItemTitle',
    m.payload->>'sportsMarketType',
    nullif(m.payload->>'gameStartTime', '')::timestamptz,
    m.payload->>'umaResolutionStatus',
    probis2_gamma_text_array_prototype(m.payload->'umaResolutionStatuses'),
    m.payload->>'resolvedBy',
    nullif(m.payload->>'ready', '')::boolean,
    nullif(m.payload->>'approved', '')::boolean,
    nullif(m.payload->>'resolved', '')::boolean,
    m.payload->>'period',
    nullif(m.payload->>'finishedTimestamp', '')::timestamptz,
    nullif(m.payload->>'automaticallyResolved', '')::boolean,
    run_started_at,
    c.id,
    c.id,
    'open',
    m.end_date,
    true,
    false,
    false,
    true,
    true,
    nullif(m.payload->>'closedTime', '')::timestamptz,
    coalesce(probis2_gamma_numeric_prototype(m.payload->>'volumeNum'), probis2_gamma_numeric_prototype(m.payload->>'volume')),
    coalesce(probis2_gamma_numeric_prototype(m.payload->>'volume24hr'), probis2_gamma_numeric_prototype(m.payload->>'volume24h')),
    coalesce(probis2_gamma_numeric_prototype(m.payload->>'liquidityNum'), probis2_gamma_numeric_prototype(m.payload->>'liquidity')),
    nullif(m.payload->>'featured', '')::boolean,
    nullif(m.payload->>'new', '')::boolean,
    probis2_gamma_numeric_prototype(m.payload->>'competitive'),
    probis2_gamma_numeric_prototype(m.payload->>'oneDayPriceChange'),
    probis2_gamma_numeric_prototype(m.payload->>'oneHourPriceChange'),
    probis2_gamma_numeric_prototype(m.payload->>'oneWeekPriceChange'),
    nullif(m.payload->>'updatedAt', '')::timestamptz
  from tmp_sp_valid_markets m
  join categories c on c.venue_id = v_venue_id and c.slug = probis2_slugify_prototype(m.category_name)
  on conflict (venue_id, external_market_id) do update set
    slug = excluded.slug,
    title = excluded.title,
    description = excluded.description,
    group_item_title = excluded.group_item_title,
    sports_market_type = excluded.sports_market_type,
    game_start_time = excluded.game_start_time,
    uma_resolution_status = excluded.uma_resolution_status,
    uma_resolution_statuses = excluded.uma_resolution_statuses,
    resolved_by = excluded.resolved_by,
    ready = excluded.ready,
    approved = excluded.approved,
    resolved = excluded.resolved,
    period = excluded.period,
    finished_timestamp = excluded.finished_timestamp,
    automatically_resolved = excluded.automatically_resolved,
    last_seen_in_open_feed_at = excluded.last_seen_in_open_feed_at,
    category_id = excluded.category_id,
    primary_category_id = excluded.primary_category_id,
    status = excluded.status,
    end_date = excluded.end_date,
    active = excluded.active,
    closed = excluded.closed,
    archived = excluded.archived,
    accepting_orders = excluded.accepting_orders,
    enable_order_book = excluded.enable_order_book,
    closed_time = excluded.closed_time,
    volume = excluded.volume,
    volume_24h = excluded.volume_24h,
    liquidity = excluded.liquidity,
    featured = excluded.featured,
    is_new = excluded.is_new,
    competitive = excluded.competitive,
    one_day_price_change = excluded.one_day_price_change,
    one_hour_price_change = excluded.one_hour_price_change,
    one_week_price_change = excluded.one_week_price_change,
    gamma_updated_at = excluded.gamma_updated_at,
    updated_at = now();

  get diagnostics v_markets_upserted = row_count;

  insert into event_markets (event_id, market_id)
  select distinct e.id, m.id
  from tmp_sp_valid_markets raw
  join events e on e.venue_id = v_venue_id and e.external_event_id = raw.external_event_id
  join markets m on m.venue_id = v_venue_id and m.external_market_id = raw.external_market_id
  on conflict (event_id, market_id) do nothing;

  get diagnostics v_event_markets_upserted = row_count;

  update market_categories
  set is_primary = false
  where market_id in (
    select m.id
    from tmp_sp_valid_markets raw
    join markets m on m.venue_id = v_venue_id and m.external_market_id = raw.external_market_id
  )
  and is_primary = true;

  insert into market_categories (market_id, category_id, is_primary, source, confidence)
  select distinct
    m.id,
    c.id,
    true,
    'market_fallback',
    case when raw.category_name = 'Other' then 0.4 else 0.7 end
  from tmp_sp_valid_markets raw
  join markets m on m.venue_id = v_venue_id and m.external_market_id = raw.external_market_id
  join categories c on c.venue_id = v_venue_id and c.slug = probis2_slugify_prototype(raw.category_name)
  on conflict (market_id, category_id, source) do update set
    is_primary = excluded.is_primary,
    confidence = excluded.confidence;

  get diagnostics v_market_categories_upserted = row_count;

  insert into market_outcomes (market_id, outcome_name, external_token_id, probability, volume, rank)
  select
    m.id,
    outcome.outcome_name,
    nullif(raw.token_ids[outcome.rank + 1], ''),
    probis2_gamma_numeric_prototype(raw.outcome_prices[outcome.rank + 1]),
    coalesce(probis2_gamma_numeric_prototype(raw.payload->>'volumeNum'), probis2_gamma_numeric_prototype(raw.payload->>'volume'), 0),
    outcome.rank
  from tmp_sp_valid_markets raw
  join markets m on m.venue_id = v_venue_id and m.external_market_id = raw.external_market_id
  cross join lateral (
    select
      label as outcome_name,
      ordinality::int - 1 as rank
    from unnest(raw.outcome_labels) with ordinality as labels(label, ordinality)
    where nullif(label, '') is not null
  ) outcome
  on conflict (market_id, outcome_name) do update set
    external_token_id = excluded.external_token_id,
    probability = excluded.probability,
    volume = excluded.volume,
    rank = excluded.rank,
    updated_at = now();

  get diagnostics v_outcomes_upserted = row_count;

  update gamma_raw_events raw
  set
    normalization_status = case when valid.external_event_id is null then 'excluded' else 'normalized' end,
    exclusion_reasons = case when valid.external_event_id is null then array['prototype_excluded_or_no_valid_markets'] else '{}'::text[] end,
    normalized_at = now(),
    error_message = null
  from tmp_sp_events_raw seen
  left join tmp_sp_valid_events valid on valid.external_event_id = seen.external_event_id
  where raw.batch_id = p_batch_id
    and raw.external_event_id = seen.external_event_id;

  update gamma_raw_markets raw
  set
    normalization_status = case when valid.external_market_id is null then 'excluded' else 'normalized' end,
    exclusion_reasons = case when valid.external_market_id is null then array['prototype_excluded'] else '{}'::text[] end,
    normalized_at = now(),
    error_message = null
  from tmp_sp_markets_raw seen
  left join tmp_sp_valid_markets valid on valid.external_market_id = seen.external_market_id
  where raw.batch_id = p_batch_id
    and raw.external_market_id = seen.external_market_id;

  v_events_excluded := greatest(0, v_events_seen - v_events_upserted);
  v_markets_excluded := greatest(0, v_markets_seen - v_markets_upserted);
  v_duration_ms := (extract(epoch from (clock_timestamp() - started_at)) * 1000)::int;

  v_summary := jsonb_build_object(
    'mode', 'stored-procedure-prototype',
    'batch_id', p_batch_id,
    'events_seen', v_events_seen,
    'events_upserted', v_events_upserted,
    'events_excluded', v_events_excluded,
    'markets_seen', v_markets_seen,
    'markets_upserted', v_markets_upserted,
    'markets_excluded', v_markets_excluded,
    'outcomes_upserted', v_outcomes_upserted,
    'event_markets_upserted', v_event_markets_upserted,
    'market_categories_upserted', v_market_categories_upserted,
    'event_tags_upserted', 0,
    'market_tags_upserted', 0,
    'duration_ms', v_duration_ms,
    'limitation_notes', jsonb_build_array(
      'Prototype only; TypeScript normalization remains source of truth.',
      'Category classification is SQL keyword-based and approximate.',
      'Event and market tag relationships are not populated in this prototype.',
      'Outcome parsing primarily uses Gamma outcomes/outcomePrices/clobTokenIds fields.',
      'Closed-feed reconciliation and stale cleanup remain outside this prototype function.'
    )
  );

  update gamma_ingestion_batches
  set
    status = 'normalized',
    normalized_at = now(),
    completed_at = now(),
    normalized_event_count = v_events_upserted,
    normalized_market_count = v_markets_upserted,
    excluded_event_count = v_events_excluded,
    excluded_market_count = v_markets_excluded,
    timings = timings || jsonb_build_object(
      'storedProcedurePrototype', v_summary
    ),
    error_message = null
  where id = p_batch_id;

  return v_summary;
exception when others then
  update gamma_ingestion_batches
  set
    status = 'failed',
    completed_at = now(),
    error_message = sqlerrm
  where id = p_batch_id;
  raise;
end;
$$;
