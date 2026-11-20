-- Round 668 — the 18:00 chat recap now goes through Claude first (relay task at 18:02). Move the app's own recap job to a FALLBACK at 18:25 VN
-- (11:25 UTC; the digest fallback is 18:20) and add &fallback=1 to its URL. Keeps the URL + secret already stored in the job.
do $$
declare j record;
begin
  for j in select jobid, command from cron.job where jobname = 'tg-recap-group' loop
    perform cron.alter_job(j.jobid, schedule := '25 11 * * 1-5',
      command := case when j.command like '%fallback=1%' then j.command else replace(j.command, 'slot=group', 'slot=group&fallback=1') end);
  end loop;
end $$;
-- VERIFY: schedule 25 11 * * 1-5, has_fallback = true
select jobname, schedule, active, command like '%fallback=1%' as has_fallback from cron.job where jobname = 'tg-recap-group';
-- UNDO: select cron.alter_job((select jobid from cron.job where jobname='tg-recap-group'), schedule := '0 11 * * 1-5', command := replace((select command from cron.job where jobname='tg-recap-group'), 'slot=group&fallback=1', 'slot=group'));
