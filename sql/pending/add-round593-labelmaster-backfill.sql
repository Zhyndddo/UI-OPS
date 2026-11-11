-- ============================================================================
-- Round 593 — Labelmaster daily report backfill: change log (lets a whole run be undone)
-- ============================================================================
-- Run BEFORE pushing round 593. Idempotent. Only the server route (service role) touches this table.
create table if not exists public.lm_backfill_log (
  id bigserial primary key,
  run_id uuid not null,
  release_id uuid not null,
  did text,
  field text not null,
  old_value text,
  new_value text,
  by_name text,
  undone boolean not null default false,
  at timestamptz not null default now()
);
create index if not exists idx_lm_backfill_log_run on public.lm_backfill_log (run_id);
create index if not exists idx_lm_backfill_log_release on public.lm_backfill_log (release_id);
alter table public.lm_backfill_log enable row level security;
revoke all on public.lm_backfill_log from public, anon, authenticated;
grant all on public.lm_backfill_log to service_role;
grant usage, select on sequence public.lm_backfill_log_id_seq to service_role;
-- Undo of one run from SQL, if ever needed: look at  select * from public.lm_backfill_log where run_id = '<id>' order by id;
