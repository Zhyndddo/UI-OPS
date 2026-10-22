-- Round 541 — RLS plan step 3: the pick-package magic-link page now reads AND writes through the server route
-- /api/magic (token-scoped, service role). So the logged-out (anon) role no longer needs these tables at all:
--   magic_links, tickets, ticket_tabs, media_booking_entries, media_booking_packages, media_booking_package_lines,
--   media_booking_content_entries, milestone_viral_posts, package_categories, release_package_items,
--   contract_type_packages            -> ALL access revoked from anon
--   releases, release_stream_metrics, milestone_chart_entries, global_settings
--                                     -> anon keeps SELECT only (the performance report + theme/intro still read
--                                        them directly; next round moves those server-side too). All anon
--                                        INSERT/UPDATE/DELETE on them is revoked.
--   function fanout_notification()    -> EXECUTE revoked from anon/PUBLIC (kept for authenticated + service_role)
--
-- ORDER (important): 1) push + deploy the Round 541 code FIRST, 2) THEN run this SQL once.
--                    Round 540's SQL should already be run.
-- Staff (authenticated role) are not affected. Idempotent. Everything removed is saved for UNDO.
--
-- SMOKE TEST right after, logged OUT (private window), on a real link:
--   1. open a pick-package link for a release whose package is built  -> offer cards / itemized table show
--   2. (on a TEST release) confirm a package -> it locks, shows confirmed, a Phụ Lục ticket appears for AR
--   3. (on a TEST release with an open Media Booking ticket) leave Feed Back -> AR gets the notification
--   4. open a Media Report style link (booking progress, stream numbers, viral posts) -> all sections fill
--   5. performance report link + a short link still work (untouched)
-- If anything is empty/errors: run UNDO, tell me which step.
--
-- UNDO:
--   do $u$ declare r record; begin
--     for r in select * from rls_anon_grants_backup_r541 loop
--       execute format('grant %s on public.%I to anon', r.privilege, r.table_name);
--     end loop; end $u$;
--   grant execute on function public.fanout_notification to anon;   -- see function note below

create table if not exists rls_anon_grants_backup_r541 (
  table_name text not null,
  privilege text not null,
  saved_at timestamptz not null default now(),
  primary key (table_name, privilege)
);

do $$
declare
  t text; p text; n int := 0;
  all_revoke text[] := array[
    'magic_links','tickets','ticket_tabs','media_booking_entries','media_booking_packages',
    'media_booking_package_lines','media_booking_content_entries','milestone_viral_posts','package_categories',
    'release_package_items','contract_type_packages'];
  select_only text[] := array['releases','release_stream_metrics','milestone_chart_entries','global_settings'];
begin
  foreach t in array all_revoke loop
    if to_regclass('public.' || t) is null then continue; end if;
    foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('anon', ('public.' || t)::regclass, p) then
        insert into rls_anon_grants_backup_r541 (table_name, privilege) values (t, p) on conflict do nothing;
      end if;
    end loop;
    execute format('revoke all on public.%I from anon', t);
    n := n + 1;
  end loop;

  foreach t in array select_only loop
    if to_regclass('public.' || t) is null then continue; end if;
    foreach p in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('anon', ('public.' || t)::regclass, p) then
        insert into rls_anon_grants_backup_r541 (table_name, privilege) values (t, p) on conflict do nothing;
      end if;
    end loop;
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon', t);
    n := n + 1;
  end loop;
  raise notice 'Adjusted anon access on % tables', n;
end $$;

revoke all on rls_anon_grants_backup_r541 from anon;

-- fanout_notification: only the server (service role) and staff call it now. (Functions grant EXECUTE to PUBLIC
-- by default, which anon inherits, so revoke from PUBLIC and re-grant to the roles that need it.)
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'fanout_notification' loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- VERIFY: re-run STEP 2 of check-round536-rls-audit.sql
--   expected anon-readable tables: global_settings, releases, release_stream_metrics, milestone_chart_entries
--   (4 tables, SELECT only; no anon writes anywhere).
-- Next round: performance report → server route, then revoke those 4 as well.
