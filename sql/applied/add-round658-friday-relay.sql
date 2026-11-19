-- Round 658 — Claude relay for the 13:30 and 18:00 Friday digests.
-- 1) claim table so the relay post and the fallback never both send
create table if not exists public.friday_posts (
  day date not null,
  slot text not null,
  posted_by text not null,
  posted_at timestamptz not null default now(),
  primary key (day, slot)
);
alter table public.friday_posts enable row level security;   -- service role only, no policies
create index if not exists friday_posts_day_idx on public.friday_posts (day);

-- 2) move the existing noon/evening jobs to a FALLBACK 20 minutes later (13:50 VN = 06:50 UTC, 18:20 VN = 11:20 UTC)
--    and add &fallback=1 to their URL. Keeps the URL + secret already stored in the job: nothing to retype.
do $$
declare j record;
begin
  for j in select jobid, jobname, command from cron.job where jobname in ('tg-digest-noon', 'tg-digest-evening') loop
    perform cron.alter_job(
      j.jobid,
      schedule := case j.jobname when 'tg-digest-noon' then '50 6 * * 1-5' else '20 11 * * 1-5' end,
      command := case when j.command like '%fallback=1%' then j.command
                      else replace(replace(j.command, 'slot=noon', 'slot=noon&fallback=1'), 'slot=evening', 'slot=evening&fallback=1') end
    );
  end loop;
end $$;

-- VERIFY: noon 50 6 * * 1-5, evening 20 11 * * 1-5, both commands contain fallback=1
select jobname, schedule, active, command like '%fallback=1%' as has_fallback from cron.job where jobname like 'tg-digest-%' order by jobname;

-- UNDO (back to the old times, no relay):
-- select cron.alter_job((select jobid from cron.job where jobname='tg-digest-noon'), schedule := '30 6 * * 1-5');
-- select cron.alter_job((select jobid from cron.job where jobname='tg-digest-evening'), schedule := '0 11 * * 1-5');
