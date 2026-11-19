-- Round 665 — hourly pull of the Report Conflict tracking sheet. Reuses the URL + secret already in the evening digest job (nothing to retype).
do $$
declare cmd text;
begin
  select command into cmd from cron.job where jobname = 'tg-digest-evening';
  if cmd is null then raise exception 'tg-digest-evening job not found'; end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'report-conflict-sync';
  perform cron.schedule('report-conflict-sync', '5 * * * *', regexp_replace(cmd, 'telegram-digest\?slot=[a-z]+(&fallback=1)?', 'report-conflict-sync'));
end $$;
-- VERIFY: one row, ok = true
select jobname, schedule, active, command like '%report-conflict-sync%' as ok from cron.job where jobname = 'report-conflict-sync';
-- UNDO: select cron.unschedule('report-conflict-sync');
