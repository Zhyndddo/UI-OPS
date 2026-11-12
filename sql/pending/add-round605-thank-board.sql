-- Round 605 — Teachers' Day: a thank-you note can be addressed to the BOARD itself (no single receiver). Run before pushing. Idempotent.
alter table public.thank_notes alter column to_profile drop not null;
alter table public.thank_notes add column if not exists to_board boolean not null default false;
alter table public.thank_notes drop constraint if exists thank_notes_has_target;
alter table public.thank_notes add constraint thank_notes_has_target check (to_board or to_profile is not null);
grant insert (from_profile, to_profile, body, anonymous, from_name, to_board) on public.thank_notes to authenticated;
grant select (to_board) on public.thank_notes to authenticated;

-- the sender's own list: a board note shows "Bảng tri ân chung" instead of a person
create or replace function public.thank_sent() returns table(id uuid, to_name text, body text, anonymous boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select n.id, case when n.to_board then 'Bảng tri ân chung 🌼' else p.name end, n.body, n.anonymous, n.created_at
  from public.thank_notes n left join public.profiles p on p.id = n.to_profile
  where n.from_profile = public.my_profile_id() order by n.created_at desc limit 100
$$;
revoke all on function public.thank_sent() from public, anon;
grant execute on function public.thank_sent() to authenticated, service_role;
-- (thank_board() already returns every note of the year, board notes included, so it needs no change)
-- UNDO: alter table public.thank_notes drop column to_board;  (only if no board notes exist; also re-add NOT NULL on to_profile)
