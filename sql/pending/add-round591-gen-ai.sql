-- ============================================================================
-- Round 591 — Gen AI field on releases ("No AI" | "Partly AI" | "Fully AI")
-- ============================================================================
-- Run this BEFORE the code is pushed (the New Release form and the release page write this column).
-- Idempotent. Existing releases stay empty (= not set) until someone picks a value.
alter table public.releases add column if not exists gen_ai text;
alter table public.releases drop constraint if exists releases_gen_ai_check;
alter table public.releases add constraint releases_gen_ai_check check (gen_ai is null or gen_ai in ('', 'No AI', 'Partly AI', 'Fully AI'));

-- The "Fully held" ticks on the Rights tab need NO SQL: they are stored inside the existing copyright_checklist json
-- (releases.copyright_checklist and release_tracks.copyright_checklist), as fullyHeld = 'yes' | 'no'.

-- VERIFY (read-only):  select column_name, data_type from information_schema.columns where table_name = 'releases' and column_name = 'gen_ai';   -- 1 row
