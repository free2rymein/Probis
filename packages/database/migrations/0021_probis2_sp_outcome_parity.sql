-- Experimental stored-procedure prototype parity fix.
-- The remaining TS-only markets were not outcome parser failures: their outcomes,
-- prices, and token IDs parsed correctly. They were excluded because the prototype
-- normalized-path SQL still applied an explorer-only completed sports artifact
-- exclusion. TypeScript normalization keeps those rows in core tables and lets
-- explorer lifecycle filtering hide them later, so remove that exclusion here.
-- This does not make stored-procedure mode authoritative.

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
      )$old$,
    ''
  );

  if patched_definition = function_definition then
    raise exception 'Failed to remove completed-match exclusion from probis2_normalize_gamma_open_batch_prototype';
  end if;

  execute patched_definition;
end;
$$;
