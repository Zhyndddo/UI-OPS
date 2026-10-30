-- Round 567 - EGRESS: which queries / tables cost the most. READ-ONLY (nothing is changed except the optional reset in step 0).
-- Run each block separately in the Supabase SQL editor and paste me the result grids.

-- 0) OPTIONAL, for a clean measurement: run this at the START of a working day, run blocks 1-2 at the END of that day.
--    (pg_stat_statements counts since the last reset; without a reset the numbers mix many weeks.)
-- select pg_stat_statements_reset();

-- 1) Top PostgREST (app) queries by rows returned. More rows x wide rows = more egress.
select left(regexp_replace(query, '\s+', ' ', 'g'), 180) as query,
       calls, rows,
       round(rows::numeric / nullif(calls, 0), 1) as rows_per_call,
       round(total_exec_time::numeric / 1000, 1) as total_seconds
from pg_stat_statements
where query ilike '%pgrst_source%'
order by rows desc
limit 25;

-- 2) Most-called queries (polling shows up here: chat, notifications, session checks, Halloween GET).
select left(regexp_replace(query, '\s+', ' ', 'g'), 180) as query, calls, rows,
       round(rows::numeric / nullif(calls, 0), 1) as rows_per_call
from pg_stat_statements
where query ilike '%pgrst_source%'
order by calls desc
limit 25;

-- 3) Tables with the heaviest rows (estimated average bytes per row x row count).
select s.tablename,
       c.reltuples::bigint as est_rows,
       sum(s.avg_width) as avg_row_bytes,
       pg_size_pretty((c.reltuples * sum(s.avg_width))::bigint) as est_full_read_size
from pg_stats s
join pg_namespace n on n.nspname = s.schemaname
join pg_class c on c.relnamespace = n.oid and c.relname = s.tablename
where s.schemaname = 'public' and c.reltuples > 0
group by s.tablename, c.reltuples
order by c.reltuples * sum(s.avg_width) desc
limit 15;
