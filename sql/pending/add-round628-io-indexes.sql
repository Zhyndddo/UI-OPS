-- Round 628 — Disk IO: three full-table scans found in pg_stat_user_tables. Indexes only, no data change. Idempotent.
-- notifications: the bell asks "my newest" + "my unread count" every 30 s per open tab → was reading ~11,700 rows per ask.
create index if not exists notifications_profile_created on public.notifications (profile_id, created_at desc);
create index if not exists notifications_profile_unread on public.notifications (profile_id) where read_at is null;
-- milestone_chart_entries: the Milestone page loads "entry_date >= cutoff order by entry_date desc, id desc" → was reading ~19,500 rows per load.
create index if not exists milestone_chart_entries_date_id on public.milestone_chart_entries (entry_date desc, id desc);
analyze public.notifications;
analyze public.milestone_chart_entries;
-- CHECK (a few hours later; seq_scan should stop climbing, idx_scan should rise):
-- select relname, seq_scan, idx_scan from pg_stat_user_tables where relname in ('notifications','milestone_chart_entries');
-- UNDO: drop index public.notifications_profile_created, public.notifications_profile_unread, public.milestone_chart_entries_date_id;
