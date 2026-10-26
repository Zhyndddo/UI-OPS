-- ============================================================================
-- Round 556 — RLS ON (baseline "signed-in staff can do everything") + profiles lock
-- ============================================================================
-- Run on a WEEKEND when nobody is working. Run the sections ONE AT A TIME in the Supabase SQL
-- editor (select the section, Run), smoke-testing between them. Pre-flight (Data Backup + the
-- Round 542 VERIFY returning zero rows) must already be done.
--
-- WHAT IT DOES
--   * Turns RLS ON for every ordinary table in `public` that does not have it yet, with one policy:
--       "staff_all_r556": signed-in (authenticated) users: everything — same behaviour as today.
--     Logged-out visitors (anon) get nothing (they already have no grants; RLS is the second lock).
--   * profiles gets REAL rules instead (section 5): nobody can change role / team / email / auth link
--     except admin/dev (admins cannot touch dev accounts or email/auth link), a new person can only be
--     added by admin/dev (team leads: only an "exc" in their own team), and no one can delete from the browser.
--   * The service key (server routes, cron, admin API, short links, /api/magic) ignores RLS: unaffected.
--   * Every change is recorded in rls_state_r556 and each table can be switched back off.
--
-- UNDO, any time:   select * from rls_r556_disable(null);          -- all tables this round enabled
--                   select * from rls_r556_disable(array['tickets']);  -- just some
--                   (profiles guard: drop trigger trg_profiles_guard_r556 on profiles;)
--
-- Tables with RLS already ON before this round (package_change_log, config_change_log) are left alone.
-- ============================================================================


-- ============================================================================
-- SECTION 0 — helper functions + state table (run first, safe to re-run)
-- ============================================================================
create table if not exists rls_state_r556 (
  table_name text primary key,
  was_enabled boolean not null,          -- RLS state BEFORE this round touched it
  applied_at timestamptz,
  batch text
);
revoke all on rls_state_r556 from public, anon, authenticated;
alter table rls_state_r556 enable row level security;   -- no policy = invisible to the browser

create or replace function public.rls_r556_enable(p_tables text[], p_batch text default null)
returns table(tbl text, res text)
language plpgsql security invoker set search_path = public as $$
declare t record;
begin
  for t in
    select c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and c.relname <> 'rls_state_r556'
      and (p_tables is null or c.relname = any (p_tables))
    order by c.relname
  loop
    tbl := t.relname;
    if t.relrowsecurity then
      if exists (select 1 from rls_state_r556 s where s.table_name = t.relname and s.was_enabled = false) then
        res := 'already done earlier this round'; return next; continue;
      end if;
      insert into rls_state_r556 (table_name, was_enabled) values (t.relname, true) on conflict do nothing;
      res := 'skipped (RLS was already on before this round — left alone)'; return next; continue;
    end if;
    begin
      insert into rls_state_r556 (table_name, was_enabled, applied_at, batch) values (t.relname, false, now(), p_batch)
        on conflict (table_name) do update set applied_at = now(), batch = excluded.batch;
      execute format('alter table public.%I enable row level security', t.relname);
      execute format('drop policy if exists staff_all_r556 on public.%I', t.relname);
      execute format('create policy staff_all_r556 on public.%I for all to authenticated using (true) with check (true)', t.relname);
      res := 'RLS ON'; return next;
    exception when others then
      res := 'FAILED: ' || sqlerrm; return next;
    end;
  end loop;
end $$;

create or replace function public.rls_r556_disable(p_tables text[] default null)
returns table(tbl text, res text)
language plpgsql security invoker set search_path = public as $$
declare t record;
begin
  for t in select s.table_name as nm from rls_state_r556 s
           where s.was_enabled = false and (p_tables is null or s.table_name = any (p_tables)) order by 1
  loop
    tbl := t.nm;
    begin
      execute format('drop policy if exists staff_all_r556 on public.%I', t.nm);
      execute format('alter table public.%I disable row level security', t.nm);
      res := 'RLS OFF'; return next;
    exception when others then
      res := 'FAILED: ' || sqlerrm; return next;
    end;
  end loop;
end $$;
revoke all on function public.rls_r556_enable(text[], text), public.rls_r556_disable(text[]) from public, anon, authenticated;


-- ============================================================================
-- SECTION 1 — BATCH A: scratch / backup tables (lowest risk). Nothing in the app reads them.
-- ============================================================================
select * from rls_r556_enable(
  (select array_agg(c.relname::text) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p')
     and (c.relname ~ '^_r[0-9]' or c.relname ~ '_backup' or c.relname ~ '_bak$' or c.relname ~ '_r5[0-9][0-9]$' or c.relname ~ '^rls_anon_grants_backup')),
  'A');
-- SMOKE TEST A: nothing visible to staff changes. Just open the app logged in.


-- ============================================================================
-- SECTION 2 — BATCH B: everything except the "core" list below and profiles
-- ============================================================================
select * from rls_r556_enable(
  (select array_agg(c.relname::text) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p')
     and c.relname not in ('profiles','releases','tickets','ticket_tabs','notifications','magic_links','app_settings','global_settings')),
  'B');
-- SMOKE TEST B (logged IN as staff): Booking Board, Media Booking, New Release Setup, Re-Check, Pitching,
--   Stream, Tools, Calendar, KPI/Reports, Chat (send a message + see it live).
-- SMOKE TEST B (logged OUT): pick-package link, channel reference link, cost report, performance report, a short link.


-- ============================================================================
-- SECTION 3 — BATCH C: core tables (still the same "staff can do everything" policy)
-- ============================================================================
select * from rls_r556_enable(array['releases','tickets','ticket_tabs','notifications','magic_links','app_settings','global_settings'], 'C');
-- SMOKE TEST C: Releases list + a release page, create + edit a ticket, bell loads, Config → settings, Tools directory.


-- ============================================================================
-- SECTION 4 — check what is on / off
-- ============================================================================
select c.relname as table_name, c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p')
order by c.relrowsecurity, c.relname;
-- expect: only `profiles` still rls_on = false (until section 5); everything else true with >= 1 policy.


-- ============================================================================
-- SECTION 5 — profiles: real rules (replaces the baseline for this one table)
-- ============================================================================
create or replace function public.rls_actor_role() returns text
language sql stable security definer set search_path = public as $$
  select role::text from profiles where auth_id = auth.uid() limit 1
$$;
create or replace function public.rls_actor_segment() returns text
language sql stable security definer set search_path = public as $$
  select segment::text from profiles where auth_id = auth.uid() limit 1
$$;
revoke all on function public.rls_actor_role(), public.rls_actor_segment() from public, anon;
grant execute on function public.rls_actor_role(), public.rls_actor_segment() to authenticated;

-- column-level guard (RLS cannot compare old vs new values; a trigger can)
create or replace function public.profiles_guard_r556() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  arole text;
  jwt_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  sensitive boolean;
begin
  if uid is null then return new; end if;            -- SQL editor, service key, server routes
  sensitive := new.role is distinct from old.role
            or new.segment is distinct from old.segment
            or new.email is distinct from old.email
            or new.auth_id is distinct from old.auth_id
            or new.subteam is distinct from old.subteam;
  if not sensitive then return new; end if;
  -- first login: a person linking THEIR OWN unlinked profile (matched by email) — only the link may change
  if old.auth_id is null and new.auth_id = uid and lower(old.email) = jwt_email
     and new.role is not distinct from old.role and new.segment is not distinct from old.segment
     and new.email is not distinct from old.email and new.subteam is not distinct from old.subteam then
    return new;
  end if;
  select role::text into arole from profiles where auth_id = uid limit 1;
  if arole = 'dev' then return new; end if;
  if arole = 'admin' then
    if new.auth_id is distinct from old.auth_id or new.email is distinct from old.email then
      raise exception 'Email and login link are changed through the admin API only' using errcode = '42501';
    end if;
    if new.role::text = 'dev' or old.role::text = 'dev' then
      raise exception 'Only a dev can change a dev account' using errcode = '42501';
    end if;
    return new;
  end if;
  raise exception 'Only an admin can change role, team, subteam or email' using errcode = '42501';
end $$;
drop trigger if exists trg_profiles_guard_r556 on profiles;
create trigger trg_profiles_guard_r556 before update on profiles
  for each row execute function public.profiles_guard_r556();

do $$
begin
  insert into rls_state_r556 (table_name, was_enabled, applied_at, batch)
    select 'profiles', c.relrowsecurity, now(), 'profiles' from pg_class c where c.oid = 'public.profiles'::regclass
    on conflict (table_name) do nothing;
end $$;

alter table public.profiles enable row level security;
drop policy if exists staff_all_r556 on public.profiles;
drop policy if exists profiles_select_r556 on public.profiles;
drop policy if exists profiles_insert_r556 on public.profiles;
drop policy if exists profiles_update_r556 on public.profiles;

-- everyone signed in can read the roster (names, teams — the app needs it everywhere)
create policy profiles_select_r556 on public.profiles for select to authenticated using (true);

-- adding someone: admin/dev (only a dev can add a dev); a team lead can add an "exc" in their own team
create policy profiles_insert_r556 on public.profiles for insert to authenticated with check (
  (public.rls_actor_role() = 'dev')
  or (public.rls_actor_role() = 'admin' and role::text <> 'dev')
  or (public.rls_actor_role() = 'teamlead' and role::text = 'exc' and segment::text = public.rls_actor_segment())
);

-- editing: your own row, or admin/dev on anyone's; the trigger above decides which columns
create policy profiles_update_r556 on public.profiles for update to authenticated
  using (
    auth_id = auth.uid()
    or public.rls_actor_role() in ('admin', 'dev')
    or (auth_id is null and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  )
  with check (
    auth_id = auth.uid()
    or public.rls_actor_role() in ('admin', 'dev')
  );
-- (no DELETE policy: removing a person goes through the admin API route only)
-- SMOKE TEST 5: log in as a normal staff member (profile loads, bell toggle works), then as admin: Config → change someone's
--   team (works), try to change a dev (blocked), add a person (works). As a team lead: add an "exc" in own team.


-- ============================================================================
-- SECTION 6 — final check
-- ============================================================================
-- (a) logged-out (anon) must be denied on a table: run these two lines together
--   begin; set local role anon; select count(*) from releases; rollback;       -- expect: permission denied / 0 rows
-- (b) a signed-in impersonation test (replace the uuid with a real auth user id):
--   begin; set local role authenticated; set local request.jwt.claims = '{"sub":"<AUTH-USER-UUID>","email":"you@vieent.vn"}';
--   select count(*) from releases; rollback;                                   -- expect: the normal count
select table_name, was_enabled, batch from rls_state_r556 order by batch, table_name;
