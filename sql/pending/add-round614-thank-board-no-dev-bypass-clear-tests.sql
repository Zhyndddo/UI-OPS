-- Round 614 — Teachers' Day: (1) dev accounts no longer read the thank-you board before 20/11; (2) clear the test notes. Idempotent.

-- (1) board opens for everybody only on/after 20/11 (Vietnam date) of the same year
create or replace function public.thank_board() returns table(id uuid, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare vn date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if vn >= make_date(extract(year from vn)::int, 11, 20) then
    return query select n.id, n.body, n.created_at from public.thank_notes n
      where n.created_at >= make_date(extract(year from vn)::int, 1, 1)::timestamptz order by n.created_at desc limit 500;
  end if;
end $$;
revoke all on function public.thank_board() from public, anon;
grant execute on function public.thank_board() to authenticated, service_role;

-- (2) STEP A — look first: every note so far (test mode only allowed dev recipients, so these should be your 2 tests)
select n.id, n.created_at, n.body, n.anonymous, n.to_board, pf.name as from_name_real, pt.name as to_name_real
from public.thank_notes n
left join public.profiles pf on pf.id = n.from_profile
left join public.profiles pt on pt.id = n.to_profile
order by n.created_at;

-- STEP B — only if STEP A shows nothing but test notes, run this to clear them:
-- delete from public.thank_notes;
