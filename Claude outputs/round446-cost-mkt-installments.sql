-- Round 446 — Cost Marketing: Tháng Chi Trả becomes real installment rows
-- instead of one free-text cell, per explicit request ("a release that
-- hasn't finished paying in a month needs a 2nd or 3rd — the column
-- should be able to add that"). See claude/round446-cost-mkt-installments.md
-- for the full design writeup (what moved, what didn't, UI behavior).
--
-- Nothing destructive: workstation_cost_mkt_entries keeps every one of its
-- existing columns, including thang_chi_tra/cost_thuc_chay/report_link/
-- vieent_ho_tro/artist_tra/sup_cashback — a release that never gets its
-- new is_installment switch turned on keeps reading/writing those exactly
-- as it always has (this is what app/workstation/cost-mkt/page.js falls
-- back to for any row where is_installment is false). Only once a row
-- opts in does it start reading/writing the new table below instead for
-- those 5 fields; cost_du_kien stays on workstation_cost_mkt_entries
-- either way, since the estimate is a per-release/brand figure, not a
-- per-payment one.

begin;

create table if not exists workstation_cost_mkt_installments (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references releases(id) on delete cascade,
  funded_by text not null,
  channel_kind text not null,
  brand text not null,
  -- Always stored as the 1st of the month (e.g. 2026-08-01) — the UI only
  -- ever lets someone pick a month via <input type="month">, never a real
  -- day, so this is a date column purely for easy sorting/range queries,
  -- not because a specific day within the month means anything.
  month date not null,
  cost_thuc_chay numeric,
  report_link text,
  vieent_ho_tro numeric,
  artist_tra numeric,
  sup_cashback numeric,
  updated_at timestamptz default now(),
  updated_by uuid references profiles(id),
  unique (release_id, funded_by, channel_kind, brand, month)
);

create index if not exists idx_cost_mkt_installments_lookup
  on workstation_cost_mkt_installments (release_id, funded_by, channel_kind, brand);

alter table workstation_cost_mkt_entries
  add column if not exists is_installment boolean not null default false;

commit;
