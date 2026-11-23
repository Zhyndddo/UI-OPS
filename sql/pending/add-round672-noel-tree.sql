-- Round 672 — shared Noel tree: one row per person per day they open the app in December (Vietnam date).
-- Nobody can read/write the table directly; the app only calls noel_tree_light(), which records MY login and returns the totals.
create table if not exists public.noel_tree_lights (
  profile_id uuid not null,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, day)
);
alter table public.noel_tree_lights enable row level security;
revoke all on public.noel_tree_lights from anon, authenticated;

create or replace function public.noel_tree_light() returns table(total int, lit int, today int)
language plpgsql security definer set search_path = public as $$
declare
  me uuid := (select id from public.profiles where auth_id = auth.uid() limit 1);
  d date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  y int := extract(year from d);
begin
  if me is not null and extract(month from d) = 12 then
    insert into public.noel_tree_lights (profile_id, day) values (me, d) on conflict do nothing;
  end if;
  return query select
    (select count(*)::int from public.profiles),
    (select count(distinct profile_id)::int from public.noel_tree_lights where extract(year from day) = y),
    (select count(*)::int from public.noel_tree_lights where day = d);
end $$;
revoke all on function public.noel_tree_light() from public, anon;
grant execute on function public.noel_tree_light() to authenticated;

-- VERIFY (as yourself in the app, not the SQL editor): the tree shows. UNDO: drop function public.noel_tree_light(); drop table public.noel_tree_lights;
