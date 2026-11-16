-- ==== RUN-ME: rounds 627 / 628 / 629 (all parts are safe to re-run). Paste the whole file into the Supabase SQL editor and press Run. ====

-- ---------- 627  views -> security invoker ----------
alter view public.milestone_rank_history set (security_invoker = on);
alter view public.package_change_log_unexpected set (security_invoker = on);
revoke all on public.milestone_rank_history from anon;
revoke all on public.package_change_log_unexpected from anon;

-- ---------- 627b  pin function search_path ----------
do $$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure as sig, case when p.prokind = 'p' then 'procedure' else 'function' end as kind
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter %s %s set search_path = public, extensions, pg_temp', r.kind, r.sig);
    n := n + 1;
  end loop;
  raise notice 'search_path pinned on % functions/procedures', n;
end $$;

-- ---------- 628  indexes ----------
create index if not exists notifications_profile_created on public.notifications (profile_id, created_at desc);
create index if not exists notifications_profile_unread on public.notifications (profile_id) where read_at is null;
create index if not exists milestone_chart_entries_date_id on public.milestone_chart_entries (entry_date desc, id desc);
analyze public.notifications;
analyze public.milestone_chart_entries;

-- ---------- 628b  notifications purge (30 days, nightly) ----------
create or replace function public.notifications_purge() returns integer language plpgsql security definer set search_path = public, extensions, pg_temp as
$$ declare n integer; begin delete from public.notifications where created_at < now() - interval '30 days'; get diagnostics n = row_count; return n; end $$;
revoke all on function public.notifications_purge() from public, anon, authenticated;
select public.notifications_purge() as deleted_now;
select cron.unschedule('notifications-purge') where exists (select 1 from cron.job where jobname = 'notifications-purge');
select cron.schedule('notifications-purge', '40 20 * * *', $$ select public.notifications_purge(); $$);

-- ---------- 629  archive old backups, profiles index, faster access rules ----------
create schema if not exists archive;
revoke all on schema archive from public, anon, authenticated;

-- A) move backup tables
do $$
declare t text; n int := 0;
begin
  foreach t in array array['app_settings_backup_r518','package_entries_backup_r513','package_grid_fix_r513','package_grid_insert_r513','package_grid_lines_r513',
    'package_lines_backup_r510','package_lines_restore_r510','package_rollup_fix_r513','package_rollup_insert_r513','package_rollups_backup_r513',
    'phu_luc_backfill_r522','rls_anon_grants_backup_r537','rls_anon_grants_backup_r540','rls_anon_grants_backup_r541','rls_anon_grants_backup_r542']
  loop
    if to_regclass('public.' || t) is not null and to_regclass('archive.' || t) is null then
      execute format('alter table public.%I set schema archive', t); n := n + 1;
    end if;
  end loop;
  raise notice 'A) moved % backup tables to schema archive', n;
end $$;

-- B) index
create index if not exists profiles_auth_id_idx on public.profiles (auth_id);

-- C) policies
create table if not exists archive.policy_backup_r629 (
  schemaname text, tablename text, policyname text, qual text, with_check text, saved_at timestamptz default now(),
  primary key (schemaname, tablename, policyname)
);
do $$
declare
  p record; n int := 0;
  pat text := '((?:public\.)?(?:rls_actor_role|rls_actor_segment|my_profile_id|chat_me|chat_is_admin|chat_is_dev|team_access_is_dev)\(\)|auth\.uid\(\))';
  skip text := 'select\s+(public\.)?(rls_actor_|my_profile_id|chat_me|chat_is_|team_access_is_dev|auth\.uid)';
  q text; w text; sql text;
begin
  for p in select * from pg_policies where schemaname = 'public' and (coalesce(qual,'') ~ pat or coalesce(with_check,'') ~ pat)
  loop
    if coalesce(p.qual,'') ~* skip or coalesce(p.with_check,'') ~* skip then continue; end if;   -- already wrapped
    q := case when p.qual is null then null else regexp_replace(p.qual, pat, '(select \1)', 'g') end;
    w := case when p.with_check is null then null else regexp_replace(p.with_check, pat, '(select \1)', 'g') end;
    insert into archive.policy_backup_r629 (schemaname, tablename, policyname, qual, with_check) values (p.schemaname, p.tablename, p.policyname, p.qual, p.with_check) on conflict do nothing;
    sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if q is not null then sql := sql || ' using (' || q || ')'; end if;
    if w is not null then sql := sql || ' with check (' || w || ')'; end if;
    execute sql; n := n + 1;
  end loop;
  raise notice 'C) rewrote % policies (originals saved in archive.policy_backup_r629)', n;
end $$;

-- CHECK: policies still calling a helper un-wrapped (expect 0 rows)
-- select tablename, policyname from pg_policies where schemaname='public' and (coalesce(qual,'')||coalesce(with_check,'')) ~ '(rls_actor_|my_profile_id|chat_me|chat_is_|team_access_is_dev|auth\.uid)' and (coalesce(qual,'')||coalesce(with_check,'')) !~* 'select\s+(public\.)?(rls_actor_|my_profile_id|chat_me|chat_is_|team_access_is_dev|auth\.uid)';
-- SMOKE TEST after running: log in as a normal user, an admin and a dev: Releases list, a ticket, Chat, Config -> Team access all open as before.
-- UNDO policies:  do $u$ declare b record; s text; begin for b in select * from archive.policy_backup_r629 loop s := format('alter policy %I on %I.%I', b.policyname, b.schemaname, b.tablename); if b.qual is not null then s := s || ' using (' || b.qual || ')'; end if; if b.with_check is not null then s := s || ' with check (' || b.with_check || ')'; end if; execute s; end loop; end $u$;
