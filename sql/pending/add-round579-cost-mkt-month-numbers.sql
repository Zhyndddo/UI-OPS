-- Round 579 — Cost Marketing: No. Booking Post, No. Support Post and Cost Dự Kiến get a value PER MONTH (like Cost Thực Chạy).
-- Additive + idempotent. Run BEFORE pushing Round 579 (until then typing in those cells of a month row just fails to save).
-- UNDO: alter table workstation_cost_mkt_installments drop column if exists no_booking_post, drop column if exists no_support_post, drop column if exists cost_du_kien;
alter table workstation_cost_mkt_installments add column if not exists no_booking_post numeric;
alter table workstation_cost_mkt_installments add column if not exists no_support_post numeric;
alter table workstation_cost_mkt_installments add column if not exists cost_du_kien numeric;

-- VERIFY (expect 3 rows)
select column_name from information_schema.columns
 where table_name = 'workstation_cost_mkt_installments' and column_name in ('no_booking_post','no_support_post','cost_du_kien') order by 1;
