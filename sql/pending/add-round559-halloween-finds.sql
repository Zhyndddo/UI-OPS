-- Round 559 — who found the Halloween pumpkin prize (one row per person). Run once in the Supabase SQL editor.
create table if not exists public.halloween_finds (
  profile_id uuid primary key,
  name text,
  found_at timestamptz not null default now()
);
revoke all on public.halloween_finds from anon;
grant select, insert on public.halloween_finds to authenticated;
-- VERIFY: select * from public.halloween_finds;  (to reset someone: delete from public.halloween_finds where name = '...';)
