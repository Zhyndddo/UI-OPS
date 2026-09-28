-- Round 433 Step 3 — CORRECTIVE UPDATE. Targeted restore of the specific
-- media_booking_package_lines rows confirmed corrupted by the pre-Round-433
-- resync bug.
--
-- How this was derived: the git-tracked 2-hourly Supabase backup (branch
-- data-backups) let us bisect every snapshot from 2026-09-22 through today
-- for the 113 locked-package lines Step 1 flagged as suspects. All 28 real
-- changes happened at EXACTLY the same boundary: between the
-- 2026-09-23_07h and 2026-09-23_13h snapshots (i.e. Wednesday morning, not
-- "last Friday" as first thought -- the Friday run either didn't touch
-- these particular brackets again, or ran after they were already
-- flattened).
-- Every one of these 28 lines still holds that Wednesday-onward
-- (corrupted) value in production today -- confirmed by comparing against
-- the current values pulled in Step 1.
--
-- Each UPDATE restores exactly one locked-package line to its last known-
-- good value (the 2026-09-23_07h snapshot, the last one before the
-- resync ran) -- quantity, brand_column_quantities, metric_quantities,
-- detail, and amount. Nothing else is touched: not other packages on the
-- same release (those are the ones Resync is SUPPOSED to update), not
-- unit_price, not is_package_priced/package_count.
--
-- Run inside a transaction; the SELECT at the end is a sanity check that
-- should return 0 rows (i.e. every line now matches its restored value).

begin;

-- Then I Met You | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 30000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 30000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1650000
where id = '99164d31-36e8-4e3a-b36d-d84a55c115a2';

-- Bình Yên Là Tự Rời Đi | Social | (no brand) | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 9,
  brand_column_quantities = '{"ENVI::TikTok": 3, "ENVI::YouTube": 2, "ENVI::Facebook": 2, "ENVI::Instagram": 2}'::jsonb,
  metric_quantities = NULL,
  detail = 'New Release: Thông báo ra mắt
Listen Now: Clip ngắn cắt từ MV',
  amount = 1800000
where id = 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd';

-- Bình Yên Là Tự Rời Đi | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 20000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1100000
where id = '780de0a4-052f-4a59-93b1-707502e1d62e';

-- SODA CREAM | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 20000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1100000
where id = 'd5a7127d-e174-4ecc-9429-549f42bffb56';

-- Mình Không Chia Tay | Social | (no brand) | locked package "Độc Quyền 2 năm"
update media_booking_package_lines set
  quantity = 10,
  brand_column_quantities = '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 4, "VIEENT::Facebook": 4, "VIEENT::Instagram": 4}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV ',
  amount = 2000000
where id = 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa';

-- Lặng Nhìn Yêu Thương | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 20000,
  brand_column_quantities = NULL,
  metric_quantities = NULL,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1100000
where id = '11b2f48d-b396-4152-ab1d-c75a157ec2b6';

-- Lặng Nhìn Yêu Thương | Social | (no brand) | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 12,
  brand_column_quantities = '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 2, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV',
  amount = 2400000
where id = 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678';

-- The Next Artist (Live at Final Stage) | Social | (no brand) | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 35,
  brand_column_quantities = '{"VIEENT::TikTok": 12, "VIEENT::YouTube": 13, "VIEENT::Facebook": 5, "VIEENT::Instagram": 5}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV',
  amount = 7000000
where id = '3c7ced09-d4d4-4119-86d4-171b805771f7';

-- The Next Artist (Live at Final Stage) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 150000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 150000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 8250000
where id = 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4';

-- The Next Artist (Live at Final Stage) | TikTok Channel | (no brand) | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 96,
  brand_column_quantities = '{"CAPCUT::TIKTOK CAPCUT": 4, "TIKTOK VPOP::TIKTOK LYRICS": 25, "TIKTOK INDIE::TIKTOK LYRICS": 31, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 30, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 6}'::jsonb,
  metric_quantities = NULL,
  detail = '- 30 post tiktok capcut 
- 31 post tiktok tổng hợp indie
- 25 post tiktok tổng hợp vpop

(Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) ',
  amount = 67200000
where id = '6db25ccf-a99b-45c5-bbde-136f6e725012';

-- The Next Artist (Live at Final Stage) | Community | (no brand) | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 24,
  brand_column_quantities = '{"PAGE VPOP::TikTok": 10, "PAGE VPOP::Facebook": 10, "PAGE INDIE::Facebook": 2, "PAGE INDIE::Instagram": 2}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV',
  amount = 4800000
where id = '256c846d-2066-4618-beb3-7636258fcc39';

-- Anh Được Gì | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 20000,
  brand_column_quantities = NULL,
  metric_quantities = NULL,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1100000
where id = '776ae362-f307-4c38-b39f-6c9cb82499eb';

-- Hèn Hạ | Social | (no brand) | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 13,
  brand_column_quantities = '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 4, "VIEENT::Facebook": 3, "VIEENT::Instagram": 3}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV',
  amount = 2600000
where id = '9db2108c-c1b9-4b97-b296-35ef9b2114a0';

-- Hèn Hạ | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 20000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1100000
where id = 'a6eced61-995e-45e6-b2a8-707311b1e009';

-- Hèn Hạ | Community | (no brand) | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 10,
  brand_column_quantities = '{"PAGE INDIE::TikTok": 2, "PAGE INDIE::Facebook": 4, "PAGE INDIE::Instagram": 4}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV',
  amount = 2000000
where id = '6ad9ac2d-7ebf-436d-a665-2143c5a672ba';

-- Hèn Hạ | TikTok Channel | (no brand) | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 40,
  brand_column_quantities = '{"CAPCUT::TIKTOK CAPCUT": 10, "TIKTOK INDIE::TIKTOK LYRICS": 10, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0}'::jsonb,
  metric_quantities = NULL,
  detail = '- 20 post tiktok/key track (1 key track)
- 10 post tiktok/side track (2 side track)

 (Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) ',
  amount = 28000000
where id = 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca';

-- tìm và trốn | TikTok Channel | (no brand) | locked package "Độc Quyền 2 năm"
update media_booking_package_lines set
  quantity = 9,
  brand_column_quantities = '{"CAPCUT::TIKTOK CAPCUT": 2, "TIKTOK INDIE::TIKTOK LYRICS": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 2}'::jsonb,
  metric_quantities = NULL,
  detail = '- 10 kênh tiktok tổng hợp 

- 1 mẫu capcut

 (Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) ',
  amount = 6300000
where id = 'dd38de32-3cf4-4095-8cf6-087693378815';

-- Muốn Lấy Anh Làm Chồng | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 20000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1100000
where id = '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf';

-- The Other Side Of Regret | Social | (no brand) | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 28,
  brand_column_quantities = '{"VIEENT::TikTok": 9, "VIEENT::YouTube": 9, "VIEENT::Facebook": 5, "VIEENT::Instagram": 5}'::jsonb,
  metric_quantities = NULL,
  detail = 'New Release: Thông báo ra mắt (2 single + 1 full EP)
Listen Now: Clip ngắn cắt từ MV (nếu có MV)',
  amount = 5600000
where id = '66cf7123-8231-42ac-9906-0cf1a2586fc1';

-- The Other Side Of Regret | TikTok Channel | (no brand) | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 45,
  brand_column_quantities = '{"TIKTOK INDIE::TIKTOK LYRICS": 15, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 30}'::jsonb,
  metric_quantities = NULL,
  detail = '50 kênh tiktok tổng hợp
- Mỗi key track 15 post ( 2 bài, 2 bài có MV)
- Mỗi side track 5 post (3 bài còn lại)',
  amount = 31500000
where id = '322ad595-1eb2-498a-9079-7c85c7d2a212';

-- em từng là cả thế giới trong anh | Community | (no brand) | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 20,
  brand_column_quantities = '{"PAGE VPOP::Thread": 4, "PAGE VPOP::TikTok": 4, "PAGE INDIE::TikTok": 2, "PAGE VPOP::Facebook": 4, "PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News: Thông tin và ý nghĩa của dự án',
  amount = 4000000
where id = '5528cd29-6f2d-465d-b122-ce28210af68b';

-- Đồng Hương Đồng Nai | Ads | YouTube Ads | locked package "Độc Quyền Vĩnh Viễn"
update media_booking_package_lines set
  quantity = 30000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 30000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1650000
where id = '30d373c7-f731-4a76-8455-aa2abf672e94';

-- EP TRƯỚC SAU | Social | (no brand) | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 23,
  brand_column_quantities = '{"VIEENT::TikTok": 6, "VIEENT::YouTube": 7, "VIEENT::Facebook": 5, "VIEENT::Instagram": 5}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News/Congrats dự án',
  amount = 4600000
where id = '54ec75ab-e259-4317-a99d-c507bfd2b059';

-- EP TRƯỚC SAU | TikTok Channel | (no brand) | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 50,
  brand_column_quantities = '{"CAPCUT::TIKTOK CAPCUT": 5, "TIKTOK INDIE::TIKTOK LYRICS": 20, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 25, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0}'::jsonb,
  metric_quantities = NULL,
  detail = '- 20 post tiktok/key track (1 key track)
- 10 post tiktok/side track (3 side track)

- 4 mẫu capcut

 (Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) ',
  amount = 35000000
where id = 'db0a5548-5324-4658-8ecf-3413063461c4';

-- Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo) | Social | (no brand) | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 11,
  brand_column_quantities = '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 4, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News: Thông tin và ý nghĩa của dự án',
  amount = 2200000
where id = '720471b5-7d22-4794-9b31-edc2d5daab99';

-- Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo) | Community | (no brand) | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 10,
  brand_column_quantities = '{"PAGE VPOP::Thread": 2, "PAGE VPOP::TikTok": 4, "PAGE VPOP::Facebook": 4}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News: Thông tin và ý nghĩa của dự án',
  amount = 2000000
where id = '723f3bfc-2066-4579-b2ec-f437d638778a';

-- Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 20000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1100000
where id = '5f6208bd-401a-43b3-a214-7def11654c9d';

-- Ánh Trăng Bật Khóc | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
update media_booking_package_lines set
  quantity = 20000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1100000
where id = 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4';

-- Sanity check: should return 0 rows after the updates above
select id, quantity
from media_booking_package_lines
where id in (
  '99164d31-36e8-4e3a-b36d-d84a55c115a2',
  'f72b6fe1-8fc5-419e-9b6f-48ce151670cd',
  '780de0a4-052f-4a59-93b1-707502e1d62e',
  'd5a7127d-e174-4ecc-9429-549f42bffb56',
  'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa',
  '11b2f48d-b396-4152-ab1d-c75a157ec2b6',
  'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678',
  '3c7ced09-d4d4-4119-86d4-171b805771f7',
  'a17718a6-e7a5-48e9-a2d0-ee1b905205e4',
  '6db25ccf-a99b-45c5-bbde-136f6e725012',
  '256c846d-2066-4618-beb3-7636258fcc39',
  '776ae362-f307-4c38-b39f-6c9cb82499eb',
  '9db2108c-c1b9-4b97-b296-35ef9b2114a0',
  'a6eced61-995e-45e6-b2a8-707311b1e009',
  '6ad9ac2d-7ebf-436d-a665-2143c5a672ba',
  'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca',
  'dd38de32-3cf4-4095-8cf6-087693378815',
  '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf',
  '66cf7123-8231-42ac-9906-0cf1a2586fc1',
  '322ad595-1eb2-498a-9079-7c85c7d2a212',
  '5528cd29-6f2d-465d-b122-ce28210af68b',
  '30d373c7-f731-4a76-8455-aa2abf672e94',
  '54ec75ab-e259-4317-a99d-c507bfd2b059',
  'db0a5548-5324-4658-8ecf-3413063461c4',
  '720471b5-7d22-4794-9b31-edc2d5daab99',
  '723f3bfc-2066-4579-b2ec-f437d638778a',
  '5f6208bd-401a-43b3-a214-7def11654c9d',
  'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4'
)
and quantity is distinct from (
  case id
    when '99164d31-36e8-4e3a-b36d-d84a55c115a2' then 30000
    when 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd' then 9
    when '780de0a4-052f-4a59-93b1-707502e1d62e' then 20000
    when 'd5a7127d-e174-4ecc-9429-549f42bffb56' then 20000
    when 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa' then 10
    when '11b2f48d-b396-4152-ab1d-c75a157ec2b6' then 20000
    when 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678' then 12
    when '3c7ced09-d4d4-4119-86d4-171b805771f7' then 35
    when 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4' then 150000
    when '6db25ccf-a99b-45c5-bbde-136f6e725012' then 96
    when '256c846d-2066-4618-beb3-7636258fcc39' then 24
    when '776ae362-f307-4c38-b39f-6c9cb82499eb' then 20000
    when '9db2108c-c1b9-4b97-b296-35ef9b2114a0' then 13
    when 'a6eced61-995e-45e6-b2a8-707311b1e009' then 20000
    when '6ad9ac2d-7ebf-436d-a665-2143c5a672ba' then 10
    when 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca' then 40
    when 'dd38de32-3cf4-4095-8cf6-087693378815' then 9
    when '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf' then 20000
    when '66cf7123-8231-42ac-9906-0cf1a2586fc1' then 28
    when '322ad595-1eb2-498a-9079-7c85c7d2a212' then 45
    when '5528cd29-6f2d-465d-b122-ce28210af68b' then 20
    when '30d373c7-f731-4a76-8455-aa2abf672e94' then 30000
    when '54ec75ab-e259-4317-a99d-c507bfd2b059' then 23
    when 'db0a5548-5324-4658-8ecf-3413063461c4' then 50
    when '720471b5-7d22-4794-9b31-edc2d5daab99' then 11
    when '723f3bfc-2066-4579-b2ec-f437d638778a' then 10
    when '5f6208bd-401a-43b3-a214-7def11654c9d' then 20000
    when 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4' then 20000
  end
);

-- If the sanity check above returns 0 rows, run:
-- commit;
-- Otherwise, investigate before committing:
-- rollback;
