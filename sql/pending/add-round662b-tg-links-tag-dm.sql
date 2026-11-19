-- Round 662b — tg_links.tag_dm was missing (an older copy of the Round 650 SQL was run). Safe to run any time.
alter table public.tg_links add column if not exists tg_username text;
alter table public.tg_links add column if not exists tag_dm boolean not null default true;
-- VERIFY: 4 rows (tg_username, tag_dm, quiet_from, quiet_to, quiet_weekend, alerts ... all must be present)
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'tg_links'
  and column_name in ('tg_username', 'tag_dm', 'quiet_from', 'quiet_to', 'quiet_weekend', 'alerts', 'last_alert_on');
