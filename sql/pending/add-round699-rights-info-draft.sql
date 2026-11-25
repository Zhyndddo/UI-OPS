-- Round 699 — blank (no-token) combined form: the release-info answers of a song that is not linked to a product yet
-- are kept on the declaration; AR's "confirm" copies them to release_info_forms. Re-runnable.
alter table public.rights_declarations add column if not exists info jsonb;
