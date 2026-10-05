-- Round 464 — HIKARI II (HIW#-24092026-0091): restore "Độc Quyền 2 năm" lines.
-- Between the 2026-09-20 and 2026-09-27 backups the 4 lines below were
-- overwritten in place with the "Độc Quyền 4 năm" numbers (same line ids,
-- 2-năm total 19,475,000 -> 29,300,000). Values restored from the
-- 2026-09-20 weekly backup. Cloning from HIKARI II copied the bad numbers
-- into T#TN-08102026-0123 on 2026-10-03.
-- Safe to re-run: each UPDATE only fires while the line still holds the
-- overwritten value, so it will not touch a line someone has since edited.
-- The Design line (10,000,000) was never changed and is not touched.

-- STEP 1 (read-only): current state of the 5 lines.
select l.id, l.platform, l.brand, l.quantity, l.amount
from media_booking_package_lines l
where l.package_id = 'c34b9d44-f13f-44c3-afb4-7216d9e3baec'
order by l.sort_order;

-- STEP 2: restore.
begin;

update media_booking_package_lines set
  quantity = 10, amount = 7000000,
  brand_column_quantities = '{"CAPCUT::TIKTOK CAPCUT":3,"TIKTOK INDIE::TIKTOK LYRICS":5,"EXT TIKTOK - BK GROUP::TIKTOK CAPCUT":0,"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT":2,"EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT":0}'::jsonb
where id = 'dc193d4b-3ab7-4374-840c-4f820ce3e683'
  and package_id = 'c34b9d44-f13f-44c3-afb4-7216d9e3baec'
  and amount = 14000000;

update media_booking_package_lines set
  quantity = 3, amount = 600000,
  brand_column_quantities = '{"VIEENT::YouTube":1,"VIEENT::Facebook":1,"VIEENT::Instagram":1}'::jsonb
where id = '521fe53f-65eb-45c1-ab41-fa5282a33202'
  and package_id = 'c34b9d44-f13f-44c3-afb4-7216d9e3baec'
  and amount = 2200000;

update media_booking_package_lines set
  quantity = 8, amount = 1600000,
  brand_column_quantities = '{"PAGE INDIE::TikTok":2,"PAGE INDIE::Facebook":3,"PAGE INDIE::Instagram":3}'::jsonb
where id = '24f2eb89-4297-44a7-a299-809931ab9ca5'
  and package_id = 'c34b9d44-f13f-44c3-afb4-7216d9e3baec'
  and amount = 2000000;

update media_booking_package_lines set
  quantity = 5000, amount = 275000,
  metric_quantities = '{"Thruplay (Views)":5000}'::jsonb
where id = '40f2ba8c-160e-4190-a7f0-55c9a5690049'
  and package_id = 'c34b9d44-f13f-44c3-afb4-7216d9e3baec'
  and amount = 1100000;

-- Expect total 19,475,000.
select sum(amount) as total_2_nam
from media_booking_package_lines
where package_id = 'c34b9d44-f13f-44c3-afb4-7216d9e3baec';

commit;
