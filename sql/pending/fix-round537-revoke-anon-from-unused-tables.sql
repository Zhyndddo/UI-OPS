-- Round 537 — RLS plan, quick win #1: take the LOGGED-OUT (anon) role away from every table the public
-- pages never touch. SQL only, no app change, instantly reversible (see UNDO).
--
-- WHY: the Round 536 audit showed the logged-out role can read 71 of 73 tables (profiles, artists' emails,
-- audit_log, notifications, the 177k-row royalty catalog, ...). A code scan of every public page
-- (pick-package, channels, cost-report, performance-report; short links use the server key, not anon) shows
-- it only needs the 20 tables in KEEP below. Everything else is revoked. What the public pages are allowed
-- to do on those 20 tables is NOT changed here (that is the next step: server routes).
--
-- KEPT for anon (untouched):  contract_type_packages, global_settings, magic_links, media_booking_entries,
--   media_booking_packages, media_booking_package_lines, milestone_chart_entries, milestone_viral_posts,
--   package_categories, release_package_items, release_stream_metrics, releases, ticket_tabs, tickets,
--   booking_channels, channel_reference_share_links, cost_mkt_snapshots, performance_share_links,
--   media_booking_content_entries (not used by the pages, kept for safety until the pages are verified),
--   + the fanout_notification() function.
--
-- Logged-in staff are NOT affected (they use the authenticated role).
--
-- RUN ORDER: back up first (your usual Data Backup run), then this whole file once. Then smoke-test (below).
-- Idempotent. A copy of every grant removed is saved in rls_anon_grants_backup_r537 so UNDO is exact.
--
-- SMOKE TEST right after (logged OUT / private window): open one artist pick-package link, one channel
-- reference link, one cost report link, one performance report link, and a short link. All should load and
-- the pick-package should still let you confirm a choice. Also log in as staff and click through a couple
-- of pages. If ANYTHING looks empty or errors: run the UNDO block below, then tell me which page.
--
-- UNDO (re-grants exactly what was removed):
--   do $u$ declare r record; begin
--     for r in select * from rls_anon_grants_backup_r537 loop
--       execute format('grant %s on public.%I to anon', r.privilege, r.table_name);
--     end loop; end $u$;
--   -- and: alter default privileges in schema public grant all on tables to anon;   (only if you want the old default back)

create table if not exists rls_anon_grants_backup_r537 (
  table_name text not null,
  privilege text not null,
  saved_at timestamptz not null default now(),
  primary key (table_name, privilege)
);

do $$
declare
  keep text[] := array[
    'contract_type_packages','global_settings','magic_links','media_booking_entries','media_booking_packages',
    'media_booking_package_lines','milestone_chart_entries','milestone_viral_posts','package_categories',
    'release_package_items','release_stream_metrics','releases','ticket_tabs','tickets','booking_channels',
    'channel_reference_share_links','cost_mkt_snapshots','performance_share_links','media_booking_content_entries',
    'rls_anon_grants_backup_r537'
  ];
  r record; p text; n int := 0;
begin
  for r in
    select c.oid, c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m') and not (c.relname = any (keep))
  loop
    foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('anon', r.oid, p) then
        insert into rls_anon_grants_backup_r537 (table_name, privilege) values (r.relname, p) on conflict do nothing;
      end if;
    end loop;
    execute format('revoke all on public.%I from anon', r.relname);
    n := n + 1;
  end loop;
  raise notice 'Revoked anon access on % tables/views', n;
end $$;

-- the backup table itself must not be readable by anon
revoke all on rls_anon_grants_backup_r537 from anon;

-- new tables/views created from now on no longer get anon access by default (Supabase grants it by default,
-- which is how 71 tables ended up open). Existing tables are handled above.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- VERIFY (expect only the KEEP tables listed as readable):
--   re-run STEP 2 of check-round536-rls-audit.sql  → everything outside KEEP should say "blocked: permission denied"
--   select count(*) from rls_anon_grants_backup_r537;   -- number of grants removed (a few hundred)
