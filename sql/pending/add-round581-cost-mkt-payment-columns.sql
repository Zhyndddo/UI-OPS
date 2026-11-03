-- Round 581 — Cost Marketing, Booking Không Package side: "Status Thanh Toán" and "Hình Thức Thanh Toán" (manual).
-- Additive + idempotent. Run BEFORE pushing Round 581 (until then these two cells cannot save).
-- UNDO: alter table workstation_cost_mkt_entries drop column if exists payment_status, drop column if exists payment_method;
alter table workstation_cost_mkt_entries add column if not exists payment_status text;
alter table workstation_cost_mkt_entries add column if not exists payment_method text;

-- VERIFY (expect 2 rows)
select column_name from information_schema.columns
 where table_name = 'workstation_cost_mkt_entries' and column_name in ('payment_status','payment_method') order by 1;
