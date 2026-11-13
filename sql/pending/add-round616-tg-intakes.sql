-- Round 616 — Friday collects request messages from the group as data (service-role only; RLS on, no policies). Idempotent.
create table if not exists public.tg_intakes (
  id bigserial primary key,
  chat_id text not null,
  thread_id bigint,
  msg_id bigint not null,
  poster_tg_id bigint,
  poster_name text,
  kind text not null check (kind in ('upload','phai_sinh','presave')),
  pic_text text,
  pic_profile_id uuid,
  pic_name text,
  allowed_usernames text[] not null default '{}',
  label text,
  title text not null,
  artists text[] not null default '{}',
  release_text text,
  release_date date,
  release_time text,
  link text,
  links jsonb not null default '{}',
  notes text,
  raw text,
  status text not null default 'pending' check (status in ('pending','confirmed','dismissed')),
  confirmed_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (chat_id, msg_id)
);
create index if not exists tg_intakes_created on public.tg_intakes (created_at);
alter table public.tg_intakes enable row level security;
revoke all on public.tg_intakes from anon, authenticated;
-- UNDO: drop table public.tg_intakes;
