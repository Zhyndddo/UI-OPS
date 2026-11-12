-- Round 610 — storage for the Telegram group-chat recap + schedule.
-- Run in Supabase SQL editor. Service-role only (RLS on, no policies): the app/browser can never read the chat log.
create table if not exists public.tg_chat_log (
  id bigserial primary key,
  chat_id text not null,
  thread_id bigint,
  msg_id bigint not null,
  sender text not null,
  text text not null,
  sent_at timestamptz not null default now(),
  unique (chat_id, msg_id)
);
create index if not exists tg_chat_log_chat_time on public.tg_chat_log (chat_id, sent_at);
alter table public.tg_chat_log enable row level security;
revoke all on public.tg_chat_log from anon, authenticated;

-- keep only 30 days of chat
create or replace function public.tg_chat_log_purge() returns void language sql security definer set search_path = public as
$$ delete from public.tg_chat_log where sent_at < now() - interval '30 days'; $$;
revoke all on function public.tg_chat_log_purge() from public, anon, authenticated;

create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('tg-chat-purge', '15 20 * * *', $$ select public.tg_chat_log_purge(); $$);

-- Schedules (UTC). Replace the two placeholders like last time: <YOUR_VERCEL_URL> = host only, NO https:// (e.g. internal.vieent.com)
-- but keep the https:// that is already written below. <CRON_SECRET> = your CRON_SECRET.
select cron.schedule('tg-recap-group', '0 11 * * 1-5',
  $$ select net.http_get(url := 'https://<YOUR_VERCEL_URL>/api/cron/telegram-recap?slot=group', headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'), timeout_milliseconds := 55000); $$);
select cron.schedule('tg-recap-email', '0 1 * * 2-6',
  $$ select net.http_get(url := 'https://<YOUR_VERCEL_URL>/api/cron/telegram-recap?slot=email', headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'), timeout_milliseconds := 55000); $$);

select jobname, schedule, active from cron.job where jobname like 'tg-%';
-- UNDO: select cron.unschedule('tg-recap-group'); select cron.unschedule('tg-recap-email'); select cron.unschedule('tg-chat-purge'); drop table public.tg_chat_log;
