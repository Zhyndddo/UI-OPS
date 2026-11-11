-- ============================================================================
-- Round 594 — Teachers' Day (20/11) thank-you notes
-- ============================================================================
-- Run BEFORE pushing round 594. Idempotent. Notes are PRIVATE to the receiver; the sender (an id column the receiver can NOT read) may be
-- shown by name or sent anonymously. On 20/11 (Vietnam date) thank_board() returns every note of the year WITHOUT any names, for the
-- blackboard panel. dev accounts can read the board on any date (testing). Undo at the bottom.

create table if not exists public.thank_notes (
  id uuid primary key default gen_random_uuid(),
  from_profile uuid not null,
  to_profile uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 280),
  anonymous boolean not null default false,
  from_name text,                         -- snapshot, only filled when the sender chose to show the name
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists idx_thank_notes_to on public.thank_notes (to_profile, created_at desc);
create index if not exists idx_thank_notes_from on public.thank_notes (from_profile, created_at desc);

-- who am I (profile id of the signed-in user)
create or replace function public.my_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where auth_id = auth.uid() limit 1
$$;

create or replace function public.thank_sent_today() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.thank_notes where from_profile = public.my_profile_id() and created_at > now() - interval '1 day'
$$;

alter table public.thank_notes enable row level security;
drop policy if exists thank_notes_receiver_sel on public.thank_notes;
create policy thank_notes_receiver_sel on public.thank_notes for select to authenticated using (to_profile = public.my_profile_id());
drop policy if exists thank_notes_sender_ins on public.thank_notes;
create policy thank_notes_sender_ins on public.thank_notes for insert to authenticated
  with check (from_profile = public.my_profile_id() and public.thank_sent_today() < 30);
drop policy if exists thank_notes_receiver_upd on public.thank_notes;
create policy thank_notes_receiver_upd on public.thank_notes for update to authenticated
  using (to_profile = public.my_profile_id()) with check (to_profile = public.my_profile_id());

-- column-level rights: the receiver can never read from_profile (that is what keeps "anonymous" anonymous)
revoke all on public.thank_notes from public, anon, authenticated;
grant select (id, to_profile, body, anonymous, from_name, created_at, read_at) on public.thank_notes to authenticated;
grant insert (from_profile, to_profile, body, anonymous, from_name) on public.thank_notes to authenticated;
grant update (read_at) on public.thank_notes to authenticated;
grant all on public.thank_notes to service_role;

-- the sender's own list ("Đã gửi") — recipient name + text, never anybody else's
create or replace function public.thank_sent() returns table(id uuid, to_name text, body text, anonymous boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select n.id, p.name, n.body, n.anonymous, n.created_at
  from public.thank_notes n left join public.profiles p on p.id = n.to_profile
  where n.from_profile = public.my_profile_id() order by n.created_at desc limit 100
$$;

-- the blackboard: every note of this year, no names at all; only on 20/11 (Vietnam date) or later in the same year, or any day for dev
create or replace function public.thank_board() returns table(id uuid, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare vn date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; is_dev boolean;
begin
  select (role = 'dev') into is_dev from public.profiles where auth_id = auth.uid() limit 1;
  if coalesce(is_dev, false) or vn >= make_date(extract(year from vn)::int, 11, 20) then
    return query select n.id, n.body, n.created_at from public.thank_notes n
      where n.created_at >= make_date(extract(year from vn)::int, 1, 1)::timestamptz order by n.created_at desc limit 500;
  end if;
end $$;

revoke all on function public.my_profile_id(), public.thank_sent_today(), public.thank_sent(), public.thank_board() from public, anon;
grant execute on function public.my_profile_id(), public.thank_sent_today(), public.thank_sent(), public.thank_board() to authenticated, service_role;

-- UNDO:  drop table public.thank_notes; drop function public.thank_board(), public.thank_sent(), public.thank_sent_today(), public.my_profile_id();
