-- Add event_tags and market_tags relationship support to the experimental
-- stored-procedure normalization prototype.
--
-- TypeScript normalization:
-- - normalizes Gamma event tags from event.tags
-- - normalizes market tags from inherited event tags followed by market.tags
-- - dedupes by slug with later duplicates winning
-- - stores venue_tags, event_tags, and market_tags(source = categorySource)
--
-- This keeps stored-procedure mode experimental and does not change TypeScript
-- normalization or runtime defaults.

create or replace function probis2_gamma_tags_prototype(value jsonb)
returns table (
  external_tag_id text,
  slug text,
  label text,
  raw_type text,
  ordinality integer
)
language sql
stable
as $$
  select
    case
      when jsonb_typeof(tag) = 'object' and tag ? 'id' then tag->>'id'
      else null
    end as external_tag_id,
    case
      when jsonb_typeof(tag) = 'string' then probis2_slugify_prototype(tag #>> '{}')
      when jsonb_typeof(tag) = 'object' then coalesce(
        tag->>'slug',
        probis2_slugify_prototype(coalesce(tag->>'label', tag->>'name', tag->>'slug'))
      )
      else null
    end as slug,
    case
      when jsonb_typeof(tag) = 'string' then tag #>> '{}'
      when jsonb_typeof(tag) = 'object' then coalesce(tag->>'label', tag->>'name', tag->>'slug')
      else null
    end as label,
    case
      when jsonb_typeof(tag) = 'object' then tag->>'type'
      else null
    end as raw_type,
    ordinality::integer
  from jsonb_array_elements(
    case
      when jsonb_typeof(value) = 'array' then value
      else '[]'::jsonb
    end
  ) with ordinality as tags(tag, ordinality)
  where case
    when jsonb_typeof(tag) = 'string' then nullif(tag #>> '{}', '') is not null
    when jsonb_typeof(tag) = 'object' then nullif(coalesce(tag->>'label', tag->>'name', tag->>'slug'), '') is not null
    else false
  end
$$;

do $$
declare
  function_definition text;
  patched_definition text;
begin
  select pg_get_functiondef('probis2_normalize_gamma_open_batch_prototype(uuid)'::regprocedure)
  into function_definition;

  patched_definition := replace(
    function_definition,
    $old$
  v_market_categories_upserted integer := 0;
  v_batch_feed_kind text;$old$,
    $new$
  v_market_categories_upserted integer := 0;
  v_tags_upserted integer := 0;
  v_event_tag_candidates integer := 0;
  v_market_tag_candidates integer := 0;
  v_event_tags_upserted integer := 0;
  v_market_tags_upserted integer := 0;
  v_unique_tags integer := 0;
  v_deduped_relationships integer := 0;
  v_batch_feed_kind text;$new$
  );

  patched_definition := replace(
    patched_definition,
    $old$
  get diagnostics v_market_categories_upserted = row_count;

  insert into market_outcomes (market_id, outcome_name, external_token_id, probability, volume, rank)$old$,
    $new$
  get diagnostics v_market_categories_upserted = row_count;

  create temp table tmp_sp_event_tag_candidates on commit drop as
  select distinct on (raw.external_event_id, tag.slug)
    raw.external_event_id,
    tag.external_tag_id,
    tag.slug,
    tag.label,
    tag.raw_type,
    tag.ordinality
  from tmp_sp_valid_events raw
  cross join lateral probis2_gamma_tags_prototype(raw.payload->'tags') tag
  where nullif(tag.slug, '') is not null
  order by raw.external_event_id, tag.slug, tag.ordinality desc;

  get diagnostics v_event_tag_candidates = row_count;

  create temp table tmp_sp_market_tag_candidates on commit drop as
  with inherited_tags as (
    select
      market.external_market_id,
      tag.external_tag_id,
      tag.slug,
      tag.label,
      tag.raw_type,
      tag.ordinality
    from tmp_sp_valid_markets market
    join tmp_sp_valid_events event on event.external_event_id = market.external_event_id
    cross join lateral probis2_gamma_tags_prototype(event.payload->'tags') tag
  ),
  direct_tags as (
    select
      market.external_market_id,
      tag.external_tag_id,
      tag.slug,
      tag.label,
      tag.raw_type,
      tag.ordinality + 100000 as ordinality
    from tmp_sp_valid_markets market
    cross join lateral probis2_gamma_tags_prototype(market.payload->'tags') tag
  )
  select distinct on (external_market_id, slug)
    external_market_id,
    external_tag_id,
    slug,
    label,
    raw_type,
    ordinality,
    'event_tags'::text as source
  from (
    select * from inherited_tags
    union all
    select * from direct_tags
  ) combined
  where nullif(slug, '') is not null
  order by external_market_id, slug, ordinality desc;

  get diagnostics v_market_tag_candidates = row_count;

  create temp table tmp_sp_unique_tags on commit drop as
  select distinct on (slug)
    external_tag_id,
    slug,
    label,
    raw_type
  from (
    select external_tag_id, slug, label, raw_type, 0 as source_order, ordinality
    from tmp_sp_event_tag_candidates
    union all
    select external_tag_id, slug, label, raw_type, 1 as source_order, ordinality
    from tmp_sp_market_tag_candidates
  ) tags
  where nullif(slug, '') is not null
    and nullif(label, '') is not null
  order by slug, source_order desc, ordinality desc;

  get diagnostics v_unique_tags = row_count;

  insert into venue_tags (venue_id, external_tag_id, slug, label, raw_type)
  select
    v_venue_id,
    external_tag_id,
    slug,
    label,
    raw_type
  from tmp_sp_unique_tags
  on conflict (venue_id, slug) do update set
    external_tag_id = coalesce(excluded.external_tag_id, venue_tags.external_tag_id),
    label = excluded.label,
    raw_type = coalesce(excluded.raw_type, venue_tags.raw_type);

  get diagnostics v_tags_upserted = row_count;

  insert into event_tags (event_id, tag_id)
  select distinct
    event.id,
    tag.id
  from tmp_sp_event_tag_candidates candidate
  join events event on event.venue_id = v_venue_id and event.external_event_id = candidate.external_event_id
  join venue_tags tag on tag.venue_id = v_venue_id and tag.slug = candidate.slug
  on conflict (event_id, tag_id) do nothing;

  get diagnostics v_event_tags_upserted = row_count;

  insert into market_tags (market_id, tag_id, source)
  select distinct
    market.id,
    tag.id,
    candidate.source
  from tmp_sp_market_tag_candidates candidate
  join markets market on market.venue_id = v_venue_id and market.external_market_id = candidate.external_market_id
  join venue_tags tag on tag.venue_id = v_venue_id and tag.slug = candidate.slug
  on conflict (market_id, tag_id, source) do nothing;

  get diagnostics v_market_tags_upserted = row_count;

  v_deduped_relationships := greatest(
    0,
    v_event_tag_candidates + v_market_tag_candidates - v_event_tags_upserted - v_market_tags_upserted
  );

  insert into market_outcomes (market_id, outcome_name, external_token_id, probability, volume, rank)$new$
  );

  patched_definition := replace(
    patched_definition,
    $old$
    'market_categories_upserted', v_market_categories_upserted,
    'event_tags_upserted', 0,
    'market_tags_upserted', 0,
    'duration_ms', v_duration_ms,$old$,
    $new$
    'market_categories_upserted', v_market_categories_upserted,
    'tags_upserted', v_tags_upserted,
    'event_tags_upserted', v_event_tags_upserted,
    'market_tags_upserted', v_market_tags_upserted,
    'event_tag_candidates', v_event_tag_candidates,
    'market_tag_candidates', v_market_tag_candidates,
    'unique_tags', v_unique_tags,
    'deduped_relationships', v_deduped_relationships,
    'duration_ms', v_duration_ms,$new$
  );

  patched_definition := replace(
    patched_definition,
    $old$
      'Category classification is SQL keyword-based and approximate.',
      'Event and market tag relationships are not populated in this prototype.',
      'Outcome parsing primarily uses Gamma outcomes/outcomePrices/clobTokenIds fields.',$old$,
    $new$
      'Category classification is SQL keyword-based and approximate.',
      'Event and market tag relationships are populated from Gamma event/market tags.',
      'Outcome parsing primarily uses Gamma outcomes/outcomePrices/clobTokenIds fields.',$new$
  );

  if patched_definition = function_definition then
    raise exception 'Failed to patch probis2_normalize_gamma_open_batch_prototype for tag relationship parity';
  end if;

  if position('tmp_sp_event_tag_candidates' in patched_definition) = 0
    or position('tags_upserted' in patched_definition) = 0 then
    raise exception 'Stored-procedure tag parity patch did not include expected tag blocks';
  end if;

  execute patched_definition;
end;
$$;
