-- Round 653 — keep Friday's chat log small: delete tg_chat_log rows older than 90 days, every night (03:10 Vietnam = 20:10 UTC).
-- Recaps only look back a day or a week, so nothing visible changes. tg_intakes / tg_tags / tg_links are NOT touched.
-- Needs pg_cron (already enabled by the Round 601 digest schedule). Safe to rerun.
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'tg-chat-log-cleanup';
select cron.schedule('tg-chat-log-cleanup', '10 20 * * *',
  $$ delete from public.tg_chat_log where sent_at < now() - interval '90 days' $$);

-- VERIFY
select jobname, schedule, active from cron.job where jobname = 'tg-chat-log-cleanup';
-- after the first night:  select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'tg-chat-log-cleanup') order by start_time desc limit 3;
-- UNDO: select cron.unschedule('tg-chat-log-cleanup');
