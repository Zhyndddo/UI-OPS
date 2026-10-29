-- Round 566 — Halloween "draw the pumpkin face" teaser (30 Oct – 1 Nov 2026). Additive, idempotent.
-- RUN ORDER: this file, then push, then set the two Vercel env vars for Google Drive (see doc566.md).
-- UNDO: drop table if exists halloween_drawings, halloween_daily_prize; drop function if exists halloween_claim_prize(date, uuid, text);

-- ONE row per day = the day's single prize. The primary key on `day` is what makes "first valid drawing wins" safe
-- even when two people finish at the same second.
create table if not exists public.halloween_daily_prize (
  day        date primary key,               -- Vietnam calendar day
  profile_id uuid not null,
  name       text,
  claimed_at timestamptz not null default now(),
  drive_url  text
);

-- Every submitted drawing (winner or not). PNG kept here too, so nothing is lost if Google Drive is not set up yet.
create table if not exists public.halloween_drawings (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  profile_id uuid not null,
  name       text,
  won        boolean not null default false,
  practice   boolean not null default false,  -- the owner testing: never uses up the day's prize
  png_b64    text,                            -- data after "base64,"
  drive_url  text,
  created_at timestamptz not null default now()
);
create index if not exists halloween_drawings_day_idx on public.halloween_drawings (day, profile_id);

alter table public.halloween_daily_prize enable row level security;
alter table public.halloween_drawings enable row level security;
drop policy if exists hw_prize_sel on public.halloween_daily_prize;
create policy hw_prize_sel on public.halloween_daily_prize for select to authenticated using (true);
-- drawings: no policy on purpose = nobody from the browser; the server route (service role) reads/writes.

revoke all on public.halloween_daily_prize, public.halloween_drawings from public, anon, authenticated;
grant select on public.halloween_daily_prize to authenticated;

-- true = this call took the day's prize
create or replace function public.halloween_claim_prize(p_day date, p_profile uuid, p_name text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into halloween_daily_prize (day, profile_id, name) values (p_day, p_profile, p_name) on conflict (day) do nothing;
  return found;
end $$;
revoke all on function public.halloween_claim_prize(date, uuid, text) from public, anon, authenticated;

-- VERIFY (expect 2 tables with RLS on, function present)
select c.relname, c.relrowsecurity from pg_class c where c.relname in ('halloween_daily_prize','halloween_drawings') order by 1;
select proname from pg_proc where proname = 'halloween_claim_prize';
