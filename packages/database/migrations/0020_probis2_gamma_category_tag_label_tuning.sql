-- Broad canonical tag labels are too coarse for stored-procedure parity:
-- TS checks tag text through ordered keyword rules, while these exact label rows
-- can overpower that order. Keep tag_slug/native-field mappings active and let
-- tag labels fall through to keyword classification unless explicitly mapped.

update gamma_tag_category_map
set
  is_active = false,
  notes = 'Disabled broad canonical tag-label shortcut; keyword fallback better matches TypeScript category rule order.',
  updated_at = now()
where source = 'gamma'
  and match_type = 'tag_label'
  and lower(match_value) in (
    'sports',
    'geopolitics',
    'politics',
    'crypto',
    'macro',
    'technology',
    'weather',
    'culture',
    'science'
  );
