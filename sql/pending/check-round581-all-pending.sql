-- Round 581 — read-only: which pending SQL has been run? Paste the whole file into the Supabase SQL editor and Run.
-- One result grid, MISSING lines first. Empty "run_this" next to every OK. Changes nothing.
-- The editor only shows the LAST result, so everything is in one query.
with t(tbl) as (select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p')),
     col(tbl, col) as (select table_name::text, column_name::text from information_schema.columns where table_schema = 'public'),
     fn(name) as (select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'),
     ix(name) as (select indexname::text from pg_indexes where schemaname = 'public'),
checks as (
select * from (values
  ('543', 'function cost_mkt_entry_totals',       exists(select 1 from fn where name = 'cost_mkt_entry_totals'), 'add-round543-cost-mkt-entry-totals.sql'),
  ('543', 'function cost_mkt_content_totals',     exists(select 1 from fn where name = 'cost_mkt_content_totals'), 'add-round543-cost-mkt-entry-totals.sql'),
  ('552', 'chatx_messages.sender_name',           exists(select 1 from col where tbl = 'chatx_messages' and col = 'sender_name'), 'add-round552-chat-open.sql'),
  ('553', 'index releases_did_trgm_idx',          exists(select 1 from ix where name = 'releases_did_trgm_idx'), 'add-round553-chat-cleanup-search-speed.sql'),
  ('555', 'chatx_messages.mention_ids',           exists(select 1 from col where tbl = 'chatx_messages' and col = 'mention_ids'), 'add-round555-chat-mentions.sql'),
  ('559', 'table chatx_members',                  exists(select 1 from t where tbl = 'chatx_members'), 'add-round559-chat-private-dm-subscribe.sql'),
  ('559', 'chatx_channels.visibility',            exists(select 1 from col where tbl = 'chatx_channels' and col = 'visibility'), 'add-round559-chat-private-dm-subscribe.sql'),
  ('559', 'table halloween_finds',                exists(select 1 from t where tbl = 'halloween_finds'), 'add-round559-halloween-finds.sql'),
  ('561', 'table kworb_vn_tracks',                exists(select 1 from t where tbl = 'kworb_vn_tracks'), 'add-round561-kworb-vn.sql'),
  ('561', 'table kworb_vn_snapshots',             exists(select 1 from t where tbl = 'kworb_vn_snapshots'), 'add-round561-kworb-vn.sql'),
  ('562', 'table team_access',                    exists(select 1 from t where tbl = 'team_access'), 'add-round562-team-access.sql'),
  ('562', 'function save_team_access',            exists(select 1 from fn where name = 'save_team_access'), 'add-round562-team-access.sql'),
  ('563', 'kworb_vn_snapshots.streams_7d',        exists(select 1 from col where tbl = 'kworb_vn_snapshots' and col = 'streams_7d'), 'add-round563-kworb-sources.sql'),
  ('563', 'table kworb_vn_videos',                exists(select 1 from t where tbl = 'kworb_vn_videos'), 'add-round563-kworb-sources.sql'),
  ('563', 'table kworb_vn_video_snapshots',       exists(select 1 from t where tbl = 'kworb_vn_video_snapshots'), 'add-round563-kworb-sources.sql'),
  ('565', 'table kworb_vn_ignored',               exists(select 1 from t where tbl = 'kworb_vn_ignored'), 'add-round565-kworb-ignore.sql'),
  ('565', 'trigger kworb_tracks_ignore',          exists(select 1 from pg_trigger where tgname = 'kworb_tracks_ignore'), 'add-round565-kworb-ignore.sql'),
  ('565', 'trigger kworb_videos_ignore',          exists(select 1 from pg_trigger where tgname = 'kworb_videos_ignore'), 'add-round565-kworb-ignore.sql'),
  ('566', 'table halloween_daily_prize',          exists(select 1 from t where tbl = 'halloween_daily_prize'), 'add-round566-halloween-face.sql'),
  ('566', 'table halloween_drawings',             exists(select 1 from t where tbl = 'halloween_drawings'), 'add-round566-halloween-face.sql'),
  ('566', 'function halloween_claim_prize',       exists(select 1 from fn where name = 'halloween_claim_prize'), 'add-round566-halloween-face.sql'),
  ('576', 'table ms_games',                       exists(select 1 from t where tbl = 'ms_games'), 'add-round576-ma-soi.sql'),
  ('576', 'table ms_templates',                   exists(select 1 from t where tbl = 'ms_templates'), 'add-round576-ma-soi.sql'),
  ('576', 'function ms_state',                    exists(select 1 from fn where name = 'ms_state'), 'add-round576-ma-soi.sql'),
  ('576', 'function ms_advance',                  exists(select 1 from fn where name = 'ms_advance'), 'add-round576-ma-soi.sql'),
  ('577', 'table full_catalog',                   exists(select 1 from t where tbl = 'full_catalog'), 'add-round577-full-catalog.sql'),
  ('577', 'table full_catalog_meta',              exists(select 1 from t where tbl = 'full_catalog_meta'), 'add-round577-full-catalog.sql'),
  ('577', 'function kworb_catalog_in_text',       exists(select 1 from fn where name = 'kworb_catalog_in_text'), 'add-round577-full-catalog.sql'),
  ('577', 'kworb_vn_tracks.catalog_id',           exists(select 1 from col where tbl = 'kworb_vn_tracks' and col = 'catalog_id'), 'add-round577-full-catalog.sql'),
  ('577', 'kworb_vn_videos.catalog_id',           exists(select 1 from col where tbl = 'kworb_vn_videos' and col = 'catalog_id'), 'add-round577-full-catalog.sql'),
  ('579', 'installments.no_booking_post',        exists(select 1 from col where tbl = 'workstation_cost_mkt_installments' and col = 'no_booking_post'), 'add-round579-cost-mkt-month-numbers.sql'),
  ('579', 'installments.no_support_post',        exists(select 1 from col where tbl = 'workstation_cost_mkt_installments' and col = 'no_support_post'), 'add-round579-cost-mkt-month-numbers.sql'),
  ('579', 'installments.cost_du_kien',           exists(select 1 from col where tbl = 'workstation_cost_mkt_installments' and col = 'cost_du_kien'), 'add-round579-cost-mkt-month-numbers.sql'),
  ('581', 'entries.payment_status',              exists(select 1 from col where tbl = 'workstation_cost_mkt_entries' and col = 'payment_status'), 'add-round581-cost-mkt-payment-columns.sql'),
  ('581', 'entries.payment_method',              exists(select 1 from col where tbl = 'workstation_cost_mkt_entries' and col = 'payment_method'), 'add-round581-cost-mkt-payment-columns.sql')
  ) as v(round, what, ok, run_file)
)
select round, what, case when ok then 'OK' else 'MISSING' end as status, case when ok then '' else run_file end as run_this
  from checks
union all
select '556', 'RLS baseline applied (rls_state_r556 table exists)',
       case when to_regclass('public.rls_state_r556') is not null then 'OK' else 'MISSING' end,
       case when to_regclass('public.rls_state_r556') is not null then '' else 'rls-round556-enable-baseline.sql (weekend, section by section)' end
union all
select '—', 'ordinary public tables with RLS still OFF: ' || count(*)::text, 'INFO', ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 3 desc, 1, 2;
