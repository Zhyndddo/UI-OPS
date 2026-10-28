-- Round 562 — Config > "Team Access" (the authorizor).
-- RUN ORDER: this file only (after Round 556's RLS baseline, which is already live). Then push the code.
-- Safe to run twice. Adds NOTHING that changes behaviour by itself: with an empty table the app uses the
-- hardcoded defaults in lib/teamTypes.js exactly as before. Only rows saved from Config > Team Access override them.

create table if not exists public.team_access (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('ticket','workstation')),
  type_key    text not null,
  team        text not null check (team in ('AR','Marketing','Design','OPS','Legal')),
  can_view    boolean not null default true,
  is_executor boolean not null default false,   -- tickets only: this team is the type's executor (the others viewing it are requesters)
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  unique (kind, type_key, team)
);
comment on table public.team_access is
  'Round 562 — OVERRIDES on top of lib/teamTypes.js defaults (one row per kind/type/team that differs). Empty table = pure code defaults. Edited only from Config > Team Access (dev). Delete a row (or use Reset in the UI) to fall back to the code default.';

alter table public.team_access enable row level security;

drop policy if exists team_access_read on public.team_access;
create policy team_access_read on public.team_access for select to authenticated using (true);
-- no insert/update/delete policy on purpose: writes go through save_team_access() below.

revoke all on public.team_access from anon, authenticated;
grant select on public.team_access to authenticated;

create or replace function public.team_access_is_dev()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.auth_id = auth.uid() and p.role = 'dev');
$$;

-- Replaces the whole override set in ONE transaction (so a failed save never leaves a half-empty table).
-- p_rows: [{kind, type_key, team, can_view, is_executor}, ...]  — [] resets everything to the code defaults.
-- p_sync_tabs: [{key, executor_team}] — ticket_tabs.executor_team is what the new-ticket notification
--   trigger reads, so a deliberately changed executor is mirrored there (null/absent = leave the tab alone).
create or replace function public.save_team_access(p_rows jsonb, p_sync_tabs jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  if not public.team_access_is_dev() then
    raise exception 'only a dev can change team access';
  end if;
  select id into me from profiles where auth_id = auth.uid();
  delete from team_access where true;
  insert into team_access (kind, type_key, team, can_view, is_executor, updated_by)
  select r->>'kind', r->>'type_key', r->>'team',
         coalesce((r->>'can_view')::boolean, true), coalesce((r->>'is_executor')::boolean, false), me
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r;
  update ticket_tabs tt set executor_team = s->>'executor_team'
  from jsonb_array_elements(coalesce(p_sync_tabs, '[]'::jsonb)) s
  where tt.key = s->>'key' and (s->>'executor_team') in ('AR','Marketing','Design','OPS','Legal');
end $$;

revoke all on function public.save_team_access(jsonb, jsonb) from public, anon;
revoke all on function public.team_access_is_dev() from public, anon;
grant execute on function public.save_team_access(jsonb, jsonb) to authenticated;
grant execute on function public.team_access_is_dev() to authenticated;

-- Verify (expect: 0 rows, rls on, 1 policy):
select (select count(*) from team_access) as override_rows,
       (select relrowsecurity from pg_class where oid = 'public.team_access'::regclass) as rls_on,
       (select count(*) from pg_policies where tablename = 'team_access') as policies;
