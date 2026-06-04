-- Tune the experimental stored-procedure category classifier toward TypeScript parity.
--
-- TypeScript normalization does not give native Gamma category/sport/series fields
-- or exact tag slugs a direct winning shortcut. It builds tag text from tag
-- slug/label, checks ordered keyword rules, then checks event/market fallback text.
-- Keep the table-driven keyword map, but make the SQL helper follow that same
-- two-step order. This does not change TypeScript normalization and does not make
-- stored-procedure mode authoritative.

update gamma_tag_category_map
set
  is_active = false,
  notes = 'Disabled for stored-procedure parity; this keyword is not present in TypeScript categoryRules.',
  updated_at = now()
where source = 'gamma'
  and match_type = 'keyword'
  and lower(match_value) in (
    'epl',
    'fifa',
    'boxing',
    'nato',
    'ceasefire',
    'gaza',
    'trump',
    'biden',
    'midterm',
    'btc',
    'eth',
    'sol',
    'xrp',
    'doge',
    'token',
    'fomc',
    'cpi',
    'gdp',
    'treasury',
    'apple',
    'google',
    'microsoft',
    'tornado',
    'storm',
    'rainfall',
    'snow',
    'grammy'
  );

create or replace function probis2_classify_category_prototype(value text)
returns text
language sql
stable
as $$
  with candidates as (
    select category_slug, priority, match_value
    from gamma_tag_category_map
    where source = 'gamma'
      and is_active = true
      and match_type = 'keyword'
      and coalesce(value, '') ~* ('(^|[^a-z0-9])' || regexp_replace(match_value, '([\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:\-])', '\\\1', 'g') || '([^a-z0-9]|$)')
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
  with tag_values as (
    select concat_ws(' ', tag->>'slug', coalesce(tag->>'label', tag->>'name')) as value
    from jsonb_array_elements(
      case
        when jsonb_typeof(payload->'tags') = 'array' then payload->'tags'
        else '[]'::jsonb
      end
    ) as tags(tag)
  ),
  tag_category as (
    select probis2_classify_category_prototype(string_agg(value, ' ')) as category_name
    from tag_values
  ),
  fallback_category as (
    select probis2_classify_category_prototype(fallback_text) as category_name
  )
  select case
    when coalesce((select category_name from tag_category), 'Other') <> 'Other'
      then (select category_name from tag_category)
    else coalesce((select category_name from fallback_category), 'Other')
  end
$$;

do $$
declare
  function_definition text;
  patched_definition text;
begin
  select pg_get_functiondef('probis2_normalize_gamma_open_batch_prototype(uuid)'::regprocedure)
  into function_definition;

  patched_definition := regexp_replace(
    function_definition,
    $pattern$probis2_classify_category_from_gamma_prototype\([[:space:]]*raw\.payload,[[:space:]]*concat_ws\([[:space:]]*' ',[[:space:]]*raw\.payload->>'category',[[:space:]]*raw\.payload->>'title',[[:space:]]*raw\.payload->>'description'[[:space:]]*\)[[:space:]]*\)[[:space:]]+as[[:space:]]+category_name$pattern$,
    $new$
probis2_classify_category_from_gamma_prototype(raw.payload, concat_ws(
      ' ',
      raw.payload->>'title',
      raw.payload->>'description'
    )) as category_name$new$,
    'g'
  );

  if patched_definition = function_definition then
    raise exception 'Failed to patch event category fallback text in probis2_normalize_gamma_open_batch_prototype';
  end if;

  execute patched_definition;
end;
$$;
