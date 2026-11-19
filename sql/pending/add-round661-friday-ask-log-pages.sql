-- Round 661 — Friday: questions log (misses + 👍/👎 + which button people picked) and "Xem tiếp" pages for long answers.
create table if not exists public.tg_ask_log (
  id bigserial primary key,
  chat_id text,
  tg_user_id bigint,
  question text not null,
  outcome text not null,          -- ok | miss | batch | redirect
  rating smallint,                -- 1 = 👍, -1 = 👎
  picked text,                    -- the suggestion button chosen after a miss
  created_at timestamptz not null default now()
);
create index if not exists tg_ask_log_created_idx on public.tg_ask_log (created_at desc);

create table if not exists public.tg_pages (
  id bigserial primary key,
  chat_id text not null,
  parts jsonb not null,           -- remaining message parts, in order
  last_markup jsonb,              -- buttons for the final part (e.g. 👍/👎)
  created_at timestamptz not null default now()
);
create index if not exists tg_pages_created_idx on public.tg_pages (created_at);

alter table public.tg_ask_log enable row level security;
alter table public.tg_pages enable row level security;

-- nightly purge (VN 03:20 = 20:20 UTC): questions 60 days, pages 2 days
select cron.unschedule(jobid) from cron.job where jobname in ('tg-ask-log-purge', 'tg-pages-purge');
select cron.schedule('tg-ask-log-purge', '20 20 * * *', $$ delete from public.tg_ask_log where created_at < now() - interval '60 days'; $$);
select cron.schedule('tg-pages-purge', '25 20 * * *', $$ delete from public.tg_pages where created_at < now() - interval '2 days'; $$);

-- VERIFY
select jobname, schedule, active from cron.job where jobname in ('tg-ask-log-purge', 'tg-pages-purge');
-- Read the misses yourself any time:
-- select question, count(*) n, max(created_at) last from public.tg_ask_log where outcome = 'miss' group by 1 order by n desc, last desc limit 30;
-- select question, created_at from public.tg_ask_log where rating = -1 order by created_at desc limit 30;
