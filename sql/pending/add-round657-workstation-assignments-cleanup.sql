-- Round 657 — workstation_assignments write storm cleanup.
-- Safe to run: read-only checks first, then one optional audit_log trim.

-- CHECK 1: live rows per workstation (should be roughly releases x workstations)
select workstation, auto_assigned, count(*) as n
from public.workstation_assignments group by 1, 2 order by 1, 2;

-- CHECK 2: dead tuples / last vacuum (dead >> live = bloat from the old failed inserts)
select relname, n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze
from pg_stat_user_tables where relname in ('workstation_assignments', 'audit_log');

-- CHECK 3: how many auto_assign audit rows the old page loads piled up
select count(*) as auto_assign_audit_rows,
       count(*) filter (where created_at < now() - interval '30 days') as older_than_30d
from public.audit_log where action = 'auto_assign';

-- CLEANUP (optional): drop old auto_assign audit noise, keep the last 30 days
delete from public.audit_log
where action = 'auto_assign' and created_at < now() - interval '30 days';

-- After the deploy: reset this table's counters so the next check is clean
-- select pg_stat_reset_single_table_counters('public.workstation_assignments'::regclass);
