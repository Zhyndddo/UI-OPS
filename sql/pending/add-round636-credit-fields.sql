-- Round 636 — Producer / Mixer credits on the release detail page. (Composer reuses the existing releases.publishing_composer.)
-- Safe to re-run. Run BEFORE pushing the code, or saving the detail page will fail on the unknown column.
alter table public.releases add column if not exists credit_producer text;
alter table public.releases add column if not exists credit_mixer text;
-- UNDO: alter table public.releases drop column credit_producer, drop column credit_mixer;
