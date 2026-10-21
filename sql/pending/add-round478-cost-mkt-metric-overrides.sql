-- Round 478 — Cost Marketing: post-count cells (TIKTOK CAPCUT etc.) can be
-- typed/imported as manual values. Stored per cost-entry row as
-- { "<column label>": { "added": n, "booked": n? } }. Additive, idempotent,
-- nothing deleted. Needs NO Round 418 resync.
alter table workstation_cost_mkt_entries
  add column if not exists metric_overrides jsonb;

-- CHECK (read-only): should return one row once applied.
select column_name, data_type from information_schema.columns
where table_name = 'workstation_cost_mkt_entries' and column_name = 'metric_overrides';
