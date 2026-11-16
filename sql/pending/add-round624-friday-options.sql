-- Round 624 — Friday: more intake kinds + DM alert switch. Idempotent.
alter table public.tg_intakes drop constraint if exists tg_intakes_kind_check;
alter table public.tg_intakes add constraint tg_intakes_kind_check
  check (kind in ('upload','phai_sinh','presave','time_change','deliver','confirm','pitching','lyric_fix','sound_cut'));
alter table public.tg_links add column if not exists alerts boolean not null default false;   -- opt-in: /alert in the private chat turns it on
alter table public.tg_links add column if not exists last_alert_on date;
-- UNDO: alter table public.tg_links drop column alerts, drop column last_alert_on;

-- Round 625 — "#" song tags from the group chat (service-role only).
create table if not exists public.tg_tags (
  id bigserial primary key,
  chat_id text not null,
  thread_id bigint,
  msg_id bigint not null,
  tg_user_id bigint,
  sender text,
  query text not null,
  text text,
  candidates jsonb not null default '[]',
  release_id uuid,
  release_title text,
  status text not null default 'pick' check (status in ('pick','linked','dismissed')),
  picked_by text,
  created_at timestamptz not null default now(),
  unique (chat_id, msg_id, query)
);
create index if not exists tg_tags_created on public.tg_tags (created_at);
alter table public.tg_tags enable row level security;
revoke all on public.tg_tags from anon, authenticated;
-- UNDO: drop table public.tg_tags;
