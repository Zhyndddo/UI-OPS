-- ============================================================================
-- Round 592 — artist / label name dedupe (step 1 of 2: safe, run any time)
-- ============================================================================
-- Adds public.norm_name() (ignores case, accents, đ, extra spaces) and two lookups the app calls
-- before creating an artist / label. Creates NO unique rule yet — see add-round592b-name-unique.sql
-- (run it only after the duplicate list below is empty). Idempotent. Nothing here changes data.

create or replace function public.norm_name(t text) returns text
language sql immutable parallel safe as $$
  select btrim(regexp_replace(translate(regexp_replace(normalize(lower(coalesce(t,'')), NFD), '[̀-ͯ]', '', 'g'), 'đ', 'd'), '\s+', ' ', 'g'))
$$;

-- label names carry a "HĐ - " prefix until the contract is signed; the prefix must not make two labels "different"
create or replace function public.norm_label(t text) returns text
language sql immutable parallel safe as $$
  select public.norm_name(regexp_replace(btrim(coalesce(t,'')), '^\s*[Hh][Đđ]\s*-\s*', ''))
$$;

create or replace function public.find_artist_by_name(p_name text) returns table(id uuid, stage_name text)
language sql stable as $$
  select a.id, a.stage_name from public.artists a where public.norm_name(a.stage_name) = public.norm_name(p_name) and public.norm_name(p_name) <> '' limit 1
$$;

create or replace function public.find_label_by_name(p_name text) returns table(id uuid, label_name text)
language sql stable as $$
  select l.id, l.label_name from public.labels l where public.norm_label(l.label_name) = public.norm_label(p_name) and public.norm_label(p_name) <> '' limit 1
$$;

grant execute on function public.norm_name(text), public.norm_label(text), public.find_artist_by_name(text), public.find_label_by_name(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- CHECK — existing duplicates (run these SELECTs; fix/merge what they list before step 2)
-- ---------------------------------------------------------------------------
-- select public.norm_name(stage_name) as key, count(*) n, array_agg(stage_name order by created_at) names, array_agg(id order by created_at) ids
--   from public.artists group by 1 having count(*) > 1 order by n desc, key;
-- select public.norm_label(label_name) as key, count(*) n, array_agg(label_name order by created_at) names, array_agg(id order by created_at) ids
--   from public.labels group by 1 having count(*) > 1 order by n desc, key;
