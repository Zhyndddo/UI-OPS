-- Round 542 — RLS plan step 4 (last of the anon lockdown): the performance report rollup and the three public
-- display settings (theme lock, channel-reference intro, sheet snapshot) now come from the server route
-- /api/magic, so the logged-out (anon) role needs NO table access at all any more.
--   releases, release_stream_metrics, milestone_chart_entries, global_settings  -> ALL access revoked from anon
--
-- ORDER (important): 1) push + deploy the Round 542 code FIRST, 2) THEN run this SQL once.
--                    Rounds 540 and 541 SQL should already be run.
-- Staff (authenticated) are not affected. Idempotent. Removed grants are saved for UNDO.
--
-- SMOKE TEST right after, logged OUT (private window):
--   1. a performance report link (artist mode AND a song-mode link if you have one): numbers, charts, cover image
--   2. a channel reference link: intro text, the embedded sheet, the "auto-refreshed daily" line
--   3. a pick-package link, a cost report link: page theme looks as before (theme lock still applies)
--   4. an expired performance link still says it expired
--   5. staff: /report → Performance tab still loads (it uses the logged-in client)
-- If anything is empty: run UNDO and tell me which step.
--
-- UNDO:
--   do $u$ declare r record; begin
--     for r in select * from rls_anon_grants_backup_r542 loop
--       execute format('grant %s on public.%I to anon', r.privilege, r.table_name);
--     end loop; end $u$;

create table if not exists rls_anon_grants_backup_r542 (
  table_name text not null,
  privilege text not null,
  saved_at timestamptz not null default now(),
  primary key (table_name, privilege)
);

do $$
declare t text; p text;
begin
  foreach t in array array['releases','release_stream_metrics','milestone_chart_entries','global_settings'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('anon', ('public.' || t)::regclass, p) then
        insert into rls_anon_grants_backup_r542 (table_name, privilege) values (t, p) on conflict do nothing;
      end if;
    end loop;
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

revoke all on rls_anon_grants_backup_r542 from anon, authenticated;
-- (tidy-up of the earlier backup tables, same reasoning — they only hold table/privilege names)
revoke all on rls_anon_grants_backup_r537, rls_anon_grants_backup_r540, rls_anon_grants_backup_r541 from authenticated;

-- VERIFY 1 — tables/views the logged-out role can still touch (expect ZERO rows):
select c.relname, string_agg(p.priv, ', ') as anon_privileges
from pg_class c
cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(priv)
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m')
  and has_table_privilege('anon', c.oid, p.priv)
group by c.relname
order by 1;

-- VERIFY 2 — functions the logged-out role can still run (review the list; each one should be intentional):
select p.oid::regprocedure as function
from pg_proc p
where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1;
