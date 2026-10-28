-- OPTIONAL — only if you want the kworb crawl every 12 h while Vercel stays on Hobby (Hobby = daily crons only).
-- Supabase's own scheduler (pg_cron) calls the same route Vercel's cron calls. kworb updates once a day, so the second
-- run mostly just catches the update sooner; it is safe (same chart date just overwrites).
-- Replace the two placeholders, then run once. Do NOT paste your real CRON_SECRET into chat; type it only in the SQL editor.
--   <YOUR_VERCEL_URL>  e.g. https://internal.vieent.com
--   <CRON_SECRET>      the CRON_SECRET env var from Vercel (if it is not set in Vercel, remove the Authorization header line)
-- UNDO: select cron.unschedule('kworb-vn-12h');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'kworb-vn-12h',
  '0 */12 * * *',
  $$ select net.http_get(
       url := 'https://<YOUR_VERCEL_URL>/api/cron/kworb-vn',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
     ); $$
);

-- VERIFY (after the first run, check last results)
select jobname, schedule, active from cron.job where jobname = 'kworb-vn-12h';
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
