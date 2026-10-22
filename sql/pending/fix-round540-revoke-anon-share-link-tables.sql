-- Round 540 — RLS plan step 2: the cost-report, performance-report and channels magic-link pages now read
-- through the server route /api/magic (token-scoped, service role), so the logged-out (anon) role no longer
-- needs ANY access to these 4 tables:
--   cost_mkt_snapshots, performance_share_links, channel_reference_share_links, booking_channels
-- That closes: anyone with the public browser key listing every share token / every snapshot / all channels.
--
-- ORDER (important): 1) push + deploy the Round 540 code FIRST (the new pages must be live),
--                    2) THEN run this SQL once. Running it before the deploy breaks those 3 public pages.
-- Logged-in staff are not affected (authenticated role). Idempotent. Grants removed are saved for UNDO.
--
-- SMOKE TEST right after, logged OUT (private window): open one cost report link, one performance report
-- link, one channel reference link (check the channel lists + counters show, incl. the Distribution tab).
-- Also confirm /pick-package and a short link still work (untouched). If anything is empty: run UNDO and
-- tell me which page.
--
-- UNDO:
--   do $u$ declare r record; begin
--     for r in select * from rls_anon_grants_backup_r540 loop
--       execute format('grant %s on public.%I to anon', r.privilege, r.table_name);
--     end loop; end $u$;

create table if not exists rls_anon_grants_backup_r540 (
  table_name text not null,
  privilege text not null,
  saved_at timestamptz not null default now(),
  primary key (table_name, privilege)
);

do $$
declare
  t text; p text; n int := 0;
begin
  foreach t in array array['cost_mkt_snapshots','performance_share_links','channel_reference_share_links','booking_channels'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('anon', ('public.' || t)::regclass, p) then
        insert into rls_anon_grants_backup_r540 (table_name, privilege) values (t, p) on conflict do nothing;
      end if;
    end loop;
    execute format('revoke all on public.%I from anon', t);
    n := n + 1;
  end loop;
  raise notice 'Revoked anon access on % tables', n;
end $$;

revoke all on rls_anon_grants_backup_r540 from anon;

-- VERIFY (logged-out role should now be blocked on all 4):
begin;
set local role anon;
select 'cost_mkt_snapshots' t, (select count(*) from cost_mkt_snapshots) c;
rollback;
-- ^ expect: ERROR permission denied for table cost_mkt_snapshots   (that error = success)
-- Full check: re-run STEP 2 of check-round536-rls-audit.sql; readable-by-anon should drop from 17 to 13.
