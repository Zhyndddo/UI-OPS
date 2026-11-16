-- Round 628b — keep the notifications table small (Disk IO). The bell is switched off, so rows are never read any more;
-- everything older than 30 days is deleted every night (03:40 Vietnam = 20:40 UTC). One immediate clean-up runs when you paste this.
-- Notification rows are still created by the ticket triggers (left as is — Telegram is replacing them later).
-- package_change_log is an audit log and is deliberately NOT purged.
create or replace function public.notifications_purge() returns integer language plpgsql security definer set search_path = public, extensions, pg_temp as
$$ declare n integer; begin delete from public.notifications where created_at < now() - interval '30 days'; get diagnostics n = row_count; return n; end $$;
revoke all on function public.notifications_purge() from public, anon, authenticated;
select public.notifications_purge() as deleted_now;
select cron.unschedule('notifications-purge') where exists (select 1 from cron.job where jobname = 'notifications-purge');
select cron.schedule('notifications-purge', '40 20 * * *', $$ select public.notifications_purge(); $$);
-- UNDO: select cron.unschedule('notifications-purge'); drop function public.notifications_purge();
