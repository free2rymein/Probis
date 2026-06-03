-- Experimental table-driven category mapping for the stored-procedure normalization prototype.
-- This does not change TypeScript normalization and does not make stored-procedure mode authoritative.

create table if not exists gamma_tag_category_map (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'gamma',
  match_type text not null,
  match_value text not null,
  category_slug text not null,
  priority integer not null default 100,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gamma_tag_category_map_match_type_check check (
    match_type in ('tag_slug', 'tag_label', 'category_slug', 'category_label', 'sport', 'series', 'keyword')
  ),
  constraint gamma_tag_category_map_category_slug_check check (
    category_slug in ('politics', 'geopolitics', 'macro', 'crypto', 'technology', 'sports', 'culture', 'science', 'weather', 'other')
  )
);

create unique index if not exists gamma_tag_category_map_lookup_unique
  on gamma_tag_category_map (source, match_type, lower(match_value));

create index if not exists gamma_tag_category_map_active_lookup_idx
  on gamma_tag_category_map (match_type, lower(match_value), priority)
  where is_active = true;

create index if not exists gamma_tag_category_map_category_slug_idx
  on gamma_tag_category_map (category_slug);

insert into gamma_tag_category_map (match_type, match_value, category_slug, priority, notes)
select match_type, match_value, category_slug, priority, 'Seeded from TypeScript categoryRules for stored-procedure parity.'
from (
  values
    ('keyword', 'esports', 'sports', 10),
    ('keyword', 'sports', 'sports', 10),
    ('keyword', 'nba', 'sports', 10),
    ('keyword', 'nfl', 'sports', 10),
    ('keyword', 'mlb', 'sports', 10),
    ('keyword', 'nhl', 'sports', 10),
    ('keyword', 'soccer', 'sports', 10),
    ('keyword', 'football', 'sports', 10),
    ('keyword', 'ufc', 'sports', 10),
    ('keyword', 'tennis', 'sports', 10),
    ('keyword', 'baseball', 'sports', 10),
    ('keyword', 'basketball', 'sports', 10),
    ('keyword', 'hockey', 'sports', 10),
    ('keyword', 'golf', 'sports', 10),
    ('keyword', 'cricket', 'sports', 10),
    ('keyword', 'formula-1', 'sports', 10),
    ('keyword', 'f1', 'sports', 10),
    ('keyword', 'epl', 'sports', 10),
    ('keyword', 'fifa', 'sports', 10),
    ('keyword', 'boxing', 'sports', 10),

    ('keyword', 'geopolitics', 'geopolitics', 20),
    ('keyword', 'iran', 'geopolitics', 20),
    ('keyword', 'war', 'geopolitics', 20),
    ('keyword', 'conflict', 'geopolitics', 20),
    ('keyword', 'russia', 'geopolitics', 20),
    ('keyword', 'ukraine', 'geopolitics', 20),
    ('keyword', 'israel', 'geopolitics', 20),
    ('keyword', 'china', 'geopolitics', 20),
    ('keyword', 'taiwan', 'geopolitics', 20),
    ('keyword', 'nato', 'geopolitics', 20),
    ('keyword', 'ceasefire', 'geopolitics', 20),
    ('keyword', 'gaza', 'geopolitics', 20),

    ('keyword', 'politics', 'politics', 30),
    ('keyword', 'elections', 'politics', 30),
    ('keyword', 'election', 'politics', 30),
    ('keyword', 'president', 'politics', 30),
    ('keyword', 'senate', 'politics', 30),
    ('keyword', 'house', 'politics', 30),
    ('keyword', 'congress', 'politics', 30),
    ('keyword', 'trump', 'politics', 30),
    ('keyword', 'biden', 'politics', 30),
    ('keyword', 'midterm', 'politics', 30),

    ('keyword', 'crypto', 'crypto', 40),
    ('keyword', 'crypto-prices', 'crypto', 40),
    ('keyword', 'bitcoin', 'crypto', 40),
    ('keyword', 'btc', 'crypto', 40),
    ('keyword', 'ethereum', 'crypto', 40),
    ('keyword', 'eth', 'crypto', 40),
    ('keyword', 'solana', 'crypto', 40),
    ('keyword', 'sol', 'crypto', 40),
    ('keyword', 'xrp', 'crypto', 40),
    ('keyword', 'doge', 'crypto', 40),
    ('keyword', 'token', 'crypto', 40),

    ('keyword', 'economy', 'macro', 50),
    ('keyword', 'fed-rates', 'macro', 50),
    ('keyword', 'inflation', 'macro', 50),
    ('keyword', 'recession', 'macro', 50),
    ('keyword', 'macro', 'macro', 50),
    ('keyword', 'interest-rates', 'macro', 50),
    ('keyword', 'interest rate', 'macro', 50),
    ('keyword', 'finance', 'macro', 50),
    ('keyword', 'stocks', 'macro', 50),
    ('keyword', 'fed', 'macro', 50),
    ('keyword', 'fomc', 'macro', 50),
    ('keyword', 'cpi', 'macro', 50),
    ('keyword', 'gdp', 'macro', 50),
    ('keyword', 'treasury', 'macro', 50),

    ('keyword', 'ai', 'technology', 60),
    ('keyword', 'tech', 'technology', 60),
    ('keyword', 'technology', 'technology', 60),
    ('keyword', 'openai', 'technology', 60),
    ('keyword', 'nvidia', 'technology', 60),
    ('keyword', 'tesla', 'technology', 60),
    ('keyword', 'spacex', 'technology', 60),
    ('keyword', 'big-tech', 'technology', 60),
    ('keyword', 'apple', 'technology', 60),
    ('keyword', 'google', 'technology', 60),
    ('keyword', 'microsoft', 'technology', 60),

    ('keyword', 'weather', 'weather', 70),
    ('keyword', 'hurricane', 'weather', 70),
    ('keyword', 'temperature', 'weather', 70),
    ('keyword', 'climate', 'weather', 70),
    ('keyword', 'climate-science', 'weather', 70),
    ('keyword', 'tornado', 'weather', 70),
    ('keyword', 'storm', 'weather', 70),
    ('keyword', 'rainfall', 'weather', 70),
    ('keyword', 'snow', 'weather', 70),

    ('keyword', 'oscars', 'culture', 80),
    ('keyword', 'oscar', 'culture', 80),
    ('keyword', 'music', 'culture', 80),
    ('keyword', 'movies', 'culture', 80),
    ('keyword', 'movie', 'culture', 80),
    ('keyword', 'culture', 'culture', 80),
    ('keyword', 'pop-culture', 'culture', 80),
    ('keyword', 'entertainment', 'culture', 80),
    ('keyword', 'celebrity', 'culture', 80),
    ('keyword', 'grammy', 'culture', 80),

    ('keyword', 'science', 'science', 90),
    ('keyword', 'space', 'science', 90),
    ('keyword', 'medicine', 'science', 90)
) as seeded(match_type, match_value, category_slug, priority)
on conflict (source, match_type, lower(match_value)) do update set
  category_slug = excluded.category_slug,
  priority = excluded.priority,
  is_active = true,
  notes = excluded.notes,
  updated_at = now();

insert into gamma_tag_category_map (match_type, match_value, category_slug, priority, notes)
select match_type, match_value, category_slug, priority, 'Exact category/tag slug mapping for stored-procedure parity.'
from (
  values
    ('tag_slug', 'sports', 'sports', 3),
    ('tag_slug', 'geopolitics', 'geopolitics', 3),
    ('tag_slug', 'politics', 'politics', 3),
    ('tag_slug', 'crypto', 'crypto', 3),
    ('tag_slug', 'crypto-prices', 'crypto', 3),
    ('tag_slug', 'macro', 'macro', 3),
    ('tag_slug', 'economy', 'macro', 3),
    ('tag_slug', 'technology', 'technology', 3),
    ('tag_slug', 'tech', 'technology', 3),
    ('tag_slug', 'weather', 'weather', 3),
    ('tag_slug', 'culture', 'culture', 3),
    ('tag_slug', 'science', 'science', 3),
    ('category_slug', 'sports', 'sports', 5),
    ('category_slug', 'geopolitics', 'geopolitics', 5),
    ('category_slug', 'politics', 'politics', 5),
    ('category_slug', 'crypto', 'crypto', 5),
    ('category_slug', 'crypto-prices', 'crypto', 5),
    ('category_slug', 'macro', 'macro', 5),
    ('category_slug', 'economy', 'macro', 5),
    ('category_slug', 'technology', 'technology', 5),
    ('category_slug', 'tech', 'technology', 5),
    ('category_slug', 'weather', 'weather', 5),
    ('category_slug', 'culture', 'culture', 5),
    ('category_slug', 'science', 'science', 5),
    ('category_label', 'sports', 'sports', 5),
    ('category_label', 'geopolitics', 'geopolitics', 5),
    ('category_label', 'politics', 'politics', 5),
    ('category_label', 'crypto', 'crypto', 5),
    ('category_label', 'macro', 'macro', 5),
    ('category_label', 'technology', 'technology', 5),
    ('category_label', 'weather', 'weather', 5),
    ('category_label', 'culture', 'culture', 5),
    ('category_label', 'science', 'science', 5),
    ('sport', 'esports', 'sports', 6),
    ('sport', 'sports', 'sports', 6),
    ('sport', 'basketball', 'sports', 6),
    ('sport', 'baseball', 'sports', 6),
    ('sport', 'football', 'sports', 6),
    ('sport', 'soccer', 'sports', 6),
    ('sport', 'tennis', 'sports', 6),
    ('sport', 'hockey', 'sports', 6),
    ('sport', 'golf', 'sports', 6),
    ('sport', 'cricket', 'sports', 6),
    ('sport', 'mma', 'sports', 6),
    ('sport', 'boxing', 'sports', 6),
    ('sport', 'formula-1', 'sports', 6),
    ('sport', 'f1', 'sports', 6)
) as seeded(match_type, match_value, category_slug, priority)
on conflict (source, match_type, lower(match_value)) do update set
  category_slug = excluded.category_slug,
  priority = excluded.priority,
  is_active = true,
  notes = excluded.notes,
  updated_at = now();

create or replace function probis2_category_name_from_slug_prototype(category_slug text)
returns text
language sql
immutable
as $$
  select case category_slug
    when 'politics' then 'Politics'
    when 'geopolitics' then 'Geopolitics'
    when 'macro' then 'Macro'
    when 'crypto' then 'Crypto'
    when 'technology' then 'Technology'
    when 'sports' then 'Sports'
    when 'culture' then 'Culture'
    when 'science' then 'Science'
    when 'weather' then 'Weather'
    else 'Other'
  end
$$;

create or replace function probis2_classify_category_prototype(value text)
returns text
language sql
stable
as $$
  with candidates as (
    select category_slug, priority, match_value
    from gamma_tag_category_map
    where is_active = true
      and (
        (
          match_type in ('category_slug', 'category_label', 'tag_slug', 'tag_label', 'sport', 'series')
          and (
            lower(trim(match_value)) = lower(trim(coalesce(value, '')))
            or lower(trim(match_value)) = probis2_slugify_prototype(value)
          )
        )
        or (
          match_type = 'keyword'
          and coalesce(value, '') ~* ('(^|[^a-z0-9])' || regexp_replace(match_value, '([\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:\-])', '\\\1', 'g') || '([^a-z0-9]|$)')
        )
      )
    order by priority asc, length(match_value) desc, category_slug asc
    limit 1
  )
  select coalesce(
    (select probis2_category_name_from_slug_prototype(category_slug) from candidates),
    'Other'
  )
$$;

create or replace function probis2_classify_category_from_gamma_prototype(payload jsonb, fallback_text text)
returns text
language sql
stable
as $$
  with candidate_values as (
    select 'category_slug'::text as match_type, probis2_slugify_prototype(payload->>'category') as match_value
    where nullif(payload->>'category', '') is not null
    union all
    select 'category_label', lower(trim(payload->>'category'))
    where nullif(payload->>'category', '') is not null
    union all
    select 'sport', probis2_slugify_prototype(payload->>'sport')
    where nullif(payload->>'sport', '') is not null
    union all
    select 'series', probis2_slugify_prototype(payload->>'series')
    where nullif(payload->>'series', '') is not null
    union all
    select 'tag_slug', probis2_slugify_prototype(tag->>'slug')
    from jsonb_array_elements(
      case
        when jsonb_typeof(payload->'tags') = 'array' then payload->'tags'
        else '[]'::jsonb
      end
    ) as tags(tag)
    where nullif(tag->>'slug', '') is not null
    union all
    select 'tag_label', lower(trim(coalesce(tag->>'label', tag->>'name')))
    from jsonb_array_elements(
      case
        when jsonb_typeof(payload->'tags') = 'array' then payload->'tags'
        else '[]'::jsonb
      end
    ) as tags(tag)
    where nullif(coalesce(tag->>'label', tag->>'name'), '') is not null
  ),
  mapped as (
    select category_slug, priority, map.match_type, map.match_value
    from candidate_values candidate
    join gamma_tag_category_map map
      on map.is_active = true
      and map.match_type = candidate.match_type
      and (
        lower(trim(map.match_value)) = lower(trim(candidate.match_value))
        or lower(trim(map.match_value)) = probis2_slugify_prototype(candidate.match_value)
      )
    order by map.priority asc, length(map.match_value) desc, map.category_slug asc
    limit 1
  )
  select coalesce(
    (select probis2_category_name_from_slug_prototype(category_slug) from mapped),
    probis2_classify_category_prototype(fallback_text),
    'Other'
  )
$$;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('probis2_normalize_gamma_open_batch_prototype(uuid)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    $old$
probis2_classify_category_prototype(concat_ws(
      ' ',
      raw.payload->>'category',
      raw.payload->>'title',
      raw.payload->>'description'
    )) as category_name$old$,
    $new$
probis2_classify_category_from_gamma_prototype(raw.payload, concat_ws(
      ' ',
      raw.payload->>'category',
      raw.payload->>'title',
      raw.payload->>'description'
    )) as category_name$new$
  );

  function_definition := replace(
    function_definition,
    $old$
probis2_classify_category_prototype(concat_ws(
      ' ',
      raw.payload->>'category',
      raw.payload->>'question',
      raw.payload->>'title',
      raw.payload->>'description'
    )) as category_name$old$,
    $new$
probis2_classify_category_from_gamma_prototype(
      jsonb_set(
        raw.payload,
        '{tags}',
        (
          case
            when jsonb_typeof(raw.payload->'tags') = 'array' then raw.payload->'tags'
            else '[]'::jsonb
          end
        ) || coalesce(
          (
            select case
              when jsonb_typeof(event_raw.payload->'tags') = 'array' then event_raw.payload->'tags'
              else '[]'::jsonb
            end
            from gamma_raw_events event_raw
            where event_raw.batch_id = p_batch_id
              and event_raw.feed_kind = 'open_events'
              and event_raw.external_event_id = raw.external_event_id
            limit 1
          ),
          '[]'::jsonb
        ),
        true
      ),
      concat_ws(
      ' ',
      raw.payload->>'category',
      raw.payload->>'question',
      raw.payload->>'title',
      raw.payload->>'description'
    )) as category_name$new$
  );

  execute function_definition;
end;
$$;
