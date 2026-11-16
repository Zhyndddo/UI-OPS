-- Round 632 — profiles that get a private Telegram DM copy of every recap / digest (picked in Config).
-- Safe to re-run.
alter table public.notification_settings
  add column if not exists recap_dm_profiles uuid[] not null default '{}';
