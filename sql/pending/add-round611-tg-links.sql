-- Round 611 — Telegram ↔ app account link (for /mytasks sent to each person's private chat).
-- Service-role only (RLS on, no policies). Run once in the Supabase SQL editor.
create table if not exists public.tg_links (
  tg_user_id bigint primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  dm_chat_id bigint not null,
  linked_at timestamptz not null default now()
);
create unique index if not exists tg_links_profile on public.tg_links (profile_id);

create table if not exists public.tg_link_codes (
  tg_user_id bigint primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  dm_chat_id bigint not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0
);

alter table public.tg_links enable row level security;
alter table public.tg_link_codes enable row level security;
revoke all on public.tg_links, public.tg_link_codes from anon, authenticated;
-- UNDO: drop table public.tg_link_codes; drop table public.tg_links;
