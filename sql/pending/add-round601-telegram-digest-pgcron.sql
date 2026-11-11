-- Round 601 — Telegram digest schedule (Supabase pg_cron calls the Vercel route; Vercel Hobby can't run 3x/day itself).
-- Vietnam times, Mon-Fri.  pg_cron runs in UTC:  08:30 VN = 01:30 UTC · 13:30 VN = 06:30 UTC · 18:00 VN = 11:00 UTC.
-- Do this AFTER the Telegram test buttons in Config work. Replace the two placeholders, run once.
-- Do NOT paste your real CRON_SECRET into chat; type it only in the SQL editor.
--   <YOUR_VERCEL_URL>  e.g. https://internal.vieent.com
--   <CRON_SECRET>      the CRON_SECRET env var from Vercel (this route REQUIRES it)
-- UNDO:  select cron.unschedule('tg-digest-morning'); select cron.unschedule('tg-digest-noon'); select cron.unschedule('tg-digest-evening');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('tg-digest-morning', '30 1 * * 1-5',
  $$ select net.http_get(url := 'https://<YOUR_VERCEL_URL>/api/cron/telegram-digest?slot=morning', headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'), timeout_milliseconds := 55000); $$);
select cron.schedule('tg-digest-noon', '30 6 * * 1-5',
  $$ select net.http_get(url := 'https://<YOUR_VERCEL_URL>/api/cron/telegram-digest?slot=noon', headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'), timeout_milliseconds := 55000); $$);
select cron.schedule('tg-digest-evening', '0 11 * * 1-5',
  $$ select net.http_get(url := 'https://<YOUR_VERCEL_URL>/api/cron/telegram-digest?slot=evening', headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'), timeout_milliseconds := 55000); $$);

-- VERIFY
select jobname, schedule, active from cron.job where jobname like 'tg-digest-%';
-- after a run:  select status, return_message, start_time from cron.job_run_details order by start_time desc limit 6;
