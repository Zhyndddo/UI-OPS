-- Round 630 — Friday reminders (service-role only; Friday's own memory, nothing here changes releases/tickets). Idempotent.
create table if not exists public.tg_reminders (
  id bigserial primary key,
  profile_id uuid not null,
  release_id uuid not null,
  release_title text,
  status text not null default 'open' check (status in ('open','done','snoozed')),
  snooze_until timestamptz,
  last_sent_on date,
  created_at timestamptz not null default now(),
  unique (profile_id, release_id)
);
alter table public.tg_reminders enable row level security;
revoke all on public.tg_reminders from anon, authenticated;
-- UNDO: drop table public.tg_reminders;
