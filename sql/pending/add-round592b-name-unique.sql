-- ============================================================================
-- Round 592 (step 2 of 2) — hard unique rule on artist / label names
-- ============================================================================
-- Blocks two rows whose names differ only by UPPER/lower case or extra spaces (labels: also the "HĐ - " prefix).
-- Names that differ by accents (Văn Hương / Văn Hưởng) are deliberately still allowed in the database; the app
-- still warns on those when someone types a new one (see lib/nameDedupe.js).
-- Run after merge-round592-duplicates.sql and merge-round592c-artist-case.sql. Idempotent.
-- Undo:  drop index if exists public.uq_artists_exact_name; drop index if exists public.uq_labels_exact_name;
drop index if exists public.uq_artists_norm_name;   -- from the earlier version of this file, if it ever got created
drop index if exists public.uq_labels_norm_name;

create or replace function public.norm_exact(t text) returns text
language sql immutable parallel safe as $$ select lower(btrim(regexp_replace(coalesce(t,''), '\s+', ' ', 'g'))) $$;
grant execute on function public.norm_exact(text) to anon, authenticated, service_role;

create unique index if not exists uq_artists_exact_name on public.artists (public.norm_exact(stage_name));
create unique index if not exists uq_labels_exact_name  on public.labels  (public.norm_exact(regexp_replace(btrim(label_name), '^\s*[Hh][Đđ]\s*-\s*', '')));
