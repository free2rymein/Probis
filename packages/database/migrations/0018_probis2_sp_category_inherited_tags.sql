-- Correct the stored-procedure normalization prototype to classify child markets
-- with inherited event tags, matching the TypeScript normalizer more closely.
-- This remains experimental and does not change TypeScript normalization.

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('probis2_normalize_gamma_open_batch_prototype(uuid)'::regprocedure)
  into function_definition;

  function_definition := regexp_replace(
    function_definition,
    $pattern$probis2_classify_category_prototype\([[:space:]]*concat_ws\([[:space:]]*' ',[[:space:]]*raw\.payload->>'category',[[:space:]]*raw\.payload->>'title',[[:space:]]*raw\.payload->>'description'[[:space:]]*\)[[:space:]]*\)[[:space:]]+as[[:space:]]+category_name$pattern$,
    $new$
probis2_classify_category_from_gamma_prototype(raw.payload, concat_ws(
      ' ',
      raw.payload->>'category',
      raw.payload->>'title',
      raw.payload->>'description'
    )) as category_name$new$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$probis2_classify_category_prototype\([[:space:]]*concat_ws\([[:space:]]*' ',[[:space:]]*raw\.payload->>'category',[[:space:]]*raw\.payload->>'question',[[:space:]]*raw\.payload->>'title',[[:space:]]*raw\.payload->>'description'[[:space:]]*\)[[:space:]]*\)[[:space:]]+as[[:space:]]+category_name$pattern$,
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
    )) as category_name$new$,
    'g'
  );

  if position('event_raw.external_event_id = raw.external_event_id' in function_definition) = 0 then
    raise exception 'Failed to patch probis2_normalize_gamma_open_batch_prototype with inherited event tags';
  end if;

  execute function_definition;
end;
$$;
