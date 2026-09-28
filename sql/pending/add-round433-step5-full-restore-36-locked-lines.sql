-- Round 433 Step 5 -- FULL RESTORE of every locked-package line the sweep
-- confirmed corrupted AND still showing the corrupted value (36 lines, 19
-- releases). This SUPERSEDES Step 3 -- it includes all 28 of Step 3's rows
-- plus 8 more the full sweep found. Run this INSTEAD of Step 3, not both
-- (running both is harmless -- the 28 overlapping rows just get written
-- twice with the same values -- but there's no reason to).
--
-- IMPORTANT: run Step 4 first and diff its result against the comments below
-- (each block names the expected corrupted/current quantity). If any of
-- these 36 lines shows something OTHER than the corrupted value Step 4
-- expects, someone touched it since the 2026-09-28 04h backup this restore
-- was built from -- pull that one out and move it to manual review instead
-- of running this against it.
--
-- Values restored are each line's confirmed pre-corruption state, read from
-- the 2026-09-23_07h git-backed snapshot (before the Wednesday-morning
-- resync run that corrupted it) on the data-backups branch.
--
-- Separately confirmed and DELIBERATELY EXCLUDED from this restore: 3 more
-- lines the sweep also found corrupted, but whose current value no longer
-- matches the corrupted snapshot -- meaning the team already hand-fixed
-- them. Auto-restoring those would overwrite real manual work, so they're
-- reported separately for manual review, not included here.

begin;

-- Sống Lại Qua Cơn Bão Giông (SLBL-14032028-0001) | Community | (no brand) | locked package "Độc Quyền Vĩnh Viễn" [NEW]
update media_booking_package_lines set
  quantity = 12,
  brand_column_quantities = '{"PAGE INDIE::Facebook": 36}'::jsonb,
  metric_quantities = NULL,
  detail = NULL,
  amount = NULL
where id = '53141e9f-f902-44ad-af00-755fddd1019e';

-- Gửi H (GHL#-22082026-0441) | Community | (no brand) | locked package "Độc Quyền 2 năm" [NEW]
update media_booking_package_lines set
  quantity = 55,
  brand_column_quantities = '{"PAGE INDIE::Thread": 3, "PAGE INDIE::TikTok": 14, "PAGE INDIE::Facebook": 14}'::jsonb,
  metric_quantities = NULL,
  detail = '- Pre-Release: Hint/Trailer/Poster
- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- Artist/News: câu chuyện về nghệ sĩ/thông tin về dự án',
  amount = 11000000
where id = 'ddda953e-bbc0-4d9d-8ef0-22e2ca6743f5';

-- Anh Được Gì (AĐ#T-07092026-0033) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 20000,
  brand_column_quantities = NULL,
  metric_quantities = NULL,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1100000
where id = '776ae362-f307-4c38-b39f-6c9cb82499eb';

-- SODA CREAM (SCTT-20082026-0485) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 20000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1100000
where id = 'd5a7127d-e174-4ecc-9429-549f42bffb56';

-- mục đích là gì (MĐTS-12082026-0492) | Ads | Facebook Ads | locked package "INT MEDIA" [NEW]
update media_booking_package_lines set
  quantity = NULL,
  brand_column_quantities = NULL,
  metric_quantities = NULL,
  detail = '5000 lượt tiếp cận cho post outnow',
  amount = 150000
where id = '960bbec3-0b62-4a23-9eb2-20fcaba30c43';

-- Then I Met You (TIS#-18082026-0504) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 30000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 30000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1650000
where id = '99164d31-36e8-4e3a-b36d-d84a55c115a2';

-- EP TRƯỚC SAU (ETDH-26092026-0070) | Social | (no brand) | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 23,
  brand_column_quantities = '{"VIEENT::TikTok": 6, "VIEENT::YouTube": 7, "VIEENT::Facebook": 5, "VIEENT::Instagram": 5}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News/Congrats dự án',
  amount = 4600000
where id = '54ec75ab-e259-4317-a99d-c507bfd2b059';

-- EP TRƯỚC SAU (ETDH-26092026-0070) | TikTok Channel | (no brand) | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
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

-- em từng là cả thế giới trong anh (ETH#-16092026-0064) | Community | (no brand) | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 20,
  brand_column_quantities = '{"PAGE VPOP::Thread": 4, "PAGE VPOP::TikTok": 4, "PAGE INDIE::TikTok": 2, "PAGE VPOP::Facebook": 4, "PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News: Thông tin và ý nghĩa của dự án',
  amount = 4000000
where id = '5528cd29-6f2d-465d-b122-ce28210af68b';

-- The Other Side Of Regret (TONO-08102026-0032) | Social | (no brand) | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 28,
  brand_column_quantities = '{"VIEENT::TikTok": 9, "VIEENT::YouTube": 9, "VIEENT::Facebook": 5, "VIEENT::Instagram": 5}'::jsonb,
  metric_quantities = NULL,
  detail = 'New Release: Thông báo ra mắt (2 single + 1 full EP)
Listen Now: Clip ngắn cắt từ MV (nếu có MV)',
  amount = 5600000
where id = '66cf7123-8231-42ac-9906-0cf1a2586fc1';

-- The Other Side Of Regret (TONO-08102026-0032) | TikTok Channel | (no brand) | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 45,
  brand_column_quantities = '{"TIKTOK INDIE::TIKTOK LYRICS": 15, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 30}'::jsonb,
  metric_quantities = NULL,
  detail = '50 kênh tiktok tổng hợp
- Mỗi key track 15 post ( 2 bài, 2 bài có MV)
- Mỗi side track 5 post (3 bài còn lại)',
  amount = 31500000
where id = '322ad595-1eb2-498a-9079-7c85c7d2a212';

-- Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo) (NĐH#-17092026-0081) | Community | (no brand) | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 10,
  brand_column_quantities = '{"PAGE VPOP::Thread": 2, "PAGE VPOP::TikTok": 4, "PAGE VPOP::Facebook": 4}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News: Thông tin và ý nghĩa của dự án',
  amount = 2000000
where id = '723f3bfc-2066-4579-b2ec-f437d638778a';

-- Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo) (NĐH#-17092026-0081) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 20000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1100000
where id = '5f6208bd-401a-43b3-a214-7def11654c9d';

-- Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo) (NĐH#-17092026-0081) | Social | (no brand) | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 11,
  brand_column_quantities = '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 4, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News: Thông tin và ý nghĩa của dự án',
  amount = 2200000
where id = '720471b5-7d22-4794-9b31-edc2d5daab99';

-- Ánh Trăng Bật Khóc (ÁTCT-25092026-0088) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 20000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1100000
where id = 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4';

-- Ánh Trăng Bật Khóc (ÁTCT-25092026-0088) | TikTok Channel | (no brand) | locked package "Độc Quyền 5 năm" [NEW]
update media_booking_package_lines set
  quantity = 30,
  brand_column_quantities = '{"TIKTOK BOLERO / MT::TIKTOK LYRICS": 20, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0}'::jsonb,
  metric_quantities = NULL,
  detail = '- 10 kênh tiktok tổng hợp
- 20 kênh tiktok seeding

(Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) ',
  amount = 21000000
where id = '099bc560-51de-47f3-8590-4e0d5feff500';

-- Muốn Lấy Anh Làm Chồng (MLHK-11092026-0061) | Community | (no brand) | locked package "Độc Quyền 5 năm" [NEW]
update media_booking_package_lines set
  quantity = 9,
  brand_column_quantities = '{"PAGE BOLERO / MT::YouTube": 5, "PAGE BOLERO / MT::Facebook": 4}'::jsonb,
  metric_quantities = NULL,
  detail = '- Listen Now: Clip ngắn cắt từ MV',
  amount = 1800000
where id = '8a64a572-c8c0-4b6a-8f99-279c40bf7ec7';

-- Muốn Lấy Anh Làm Chồng (MLHK-11092026-0061) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 20000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1100000
where id = '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf';

-- Đồng Hương Đồng Nai (ĐHKL-19092026-0080) | Ads | YouTube Ads | locked package "Độc Quyền Vĩnh Viễn" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 30000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 30000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1650000
where id = '30d373c7-f731-4a76-8455-aa2abf672e94';

-- Vượt Nghìn Cây Số (VNBL-06082026-0296) | Community | (no brand) | locked package "INT MEDIA" [NEW]
update media_booking_package_lines set
  quantity = 10,
  brand_column_quantities = '{"PAGE INDIE::TikTok": 2, "PAGE INDIE::Facebook": 5, "PAGE INDIE::Instagram": 3}'::jsonb,
  metric_quantities = NULL,
  detail = 'New Release: Thông báo ra mắt
Listen Now: Clip ngắn cắt từ MV',
  amount = 2000000
where id = 'eeebe9d6-8a93-47f2-9c5d-56b0c56f5eaf';

-- Lặng Nhìn Yêu Thương (LNNH-20082026-0480) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 20000,
  brand_column_quantities = NULL,
  metric_quantities = NULL,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1100000
where id = '11b2f48d-b396-4152-ab1d-c75a157ec2b6';

-- Lặng Nhìn Yêu Thương (LNNH-20082026-0480) | Social | (no brand) | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 12,
  brand_column_quantities = '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 2, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV',
  amount = 2400000
where id = 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678';

-- The Next Artist (Live at Final Stage) (TNTN-27082026-0010) | Social | (no brand) | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 35,
  brand_column_quantities = '{"VIEENT::TikTok": 12, "VIEENT::YouTube": 13, "VIEENT::Facebook": 5, "VIEENT::Instagram": 5}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV',
  amount = 7000000
where id = '3c7ced09-d4d4-4119-86d4-171b805771f7';

-- The Next Artist (Live at Final Stage) (TNTN-27082026-0010) | Community | (no brand) | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 24,
  brand_column_quantities = '{"PAGE VPOP::TikTok": 10, "PAGE VPOP::Facebook": 10, "PAGE INDIE::Facebook": 2, "PAGE INDIE::Instagram": 2}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV',
  amount = 4800000
where id = '256c846d-2066-4618-beb3-7636258fcc39';

-- The Next Artist (Live at Final Stage) (TNTN-27082026-0010) | Ads | Facebook Ads | locked package "Độc Quyền 5 năm" [NEW]
update media_booking_package_lines set
  quantity = NULL,
  brand_column_quantities = NULL,
  metric_quantities = '{"Lượt tiếp cận": 30000}'::jsonb,
  detail = '30.000 Lượt tiếp cận

- Ads post new release
- Ads post video listen now',
  amount = 3000000
where id = '80e289b9-9f56-4c8b-b5ad-a3705f456ba8';

-- The Next Artist (Live at Final Stage) (TNTN-27082026-0010) | TikTok Channel | (no brand) | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
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

-- The Next Artist (Live at Final Stage) (TNTN-27082026-0010) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 150000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 150000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 8250000
where id = 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4';

-- Mình Không Chia Tay	 (MKSB-14082026-0481) | Social | (no brand) | locked package "Độc Quyền 2 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 10,
  brand_column_quantities = '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 4, "VIEENT::Facebook": 4, "VIEENT::Instagram": 4}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV ',
  amount = 2000000
where id = 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa';

-- Bình Yên Là Tự Rời Đi  (BYLN-20082026-0512) | Community | (no brand) | locked package "Độc Quyền 5 năm" [NEW]
update media_booking_package_lines set
  quantity = 4,
  brand_column_quantities = '{"PAGE BOLERO / MT::YouTube": 3, "PAGE BOLERO / MT::Facebook": 1}'::jsonb,
  metric_quantities = NULL,
  detail = 'New Release: Thông báo ra mắt
Listen Now: Clip ngắn cắt từ MV',
  amount = 800000
where id = 'a184f996-f669-4a6e-aaae-7d4a3e48c3a8';

-- Bình Yên Là Tự Rời Đi  (BYLN-20082026-0512) | Social | (no brand) | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 9,
  brand_column_quantities = '{"ENVI::TikTok": 3, "ENVI::YouTube": 2, "ENVI::Facebook": 2, "ENVI::Instagram": 2}'::jsonb,
  metric_quantities = NULL,
  detail = 'New Release: Thông báo ra mắt
Listen Now: Clip ngắn cắt từ MV',
  amount = 1800000
where id = 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd';

-- Bình Yên Là Tự Rời Đi  (BYLN-20082026-0512) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 20000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1100000
where id = '780de0a4-052f-4a59-93b1-707502e1d62e';

-- tìm và trốn (TVDV-05092026-0003) | TikTok Channel | (no brand) | locked package "Độc Quyền 2 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 9,
  brand_column_quantities = '{"CAPCUT::TIKTOK CAPCUT": 2, "TIKTOK INDIE::TIKTOK LYRICS": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 2}'::jsonb,
  metric_quantities = NULL,
  detail = '- 10 kênh tiktok tổng hợp 

- 1 mẫu capcut

 (Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) ',
  amount = 6300000
where id = 'dd38de32-3cf4-4095-8cf6-087693378815';

-- Hèn Hạ (HHW#-11092026-0507) | TikTok Channel | (no brand) | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 40,
  brand_column_quantities = '{"CAPCUT::TIKTOK CAPCUT": 10, "TIKTOK INDIE::TIKTOK LYRICS": 10, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0}'::jsonb,
  metric_quantities = NULL,
  detail = '- 20 post tiktok/key track (1 key track)
- 10 post tiktok/side track (2 side track)

 (Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) ',
  amount = 28000000
where id = 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca';

-- Hèn Hạ (HHW#-11092026-0507) | Social | (no brand) | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 13,
  brand_column_quantities = '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 4, "VIEENT::Facebook": 3, "VIEENT::Instagram": 3}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV',
  amount = 2600000
where id = '9db2108c-c1b9-4b97-b296-35ef9b2114a0';

-- Hèn Hạ (HHW#-11092026-0507) | Community | (no brand) | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 10,
  brand_column_quantities = '{"PAGE INDIE::TikTok": 2, "PAGE INDIE::Facebook": 4, "PAGE INDIE::Instagram": 4}'::jsonb,
  metric_quantities = NULL,
  detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV',
  amount = 2000000
where id = '6ad9ac2d-7ebf-436d-a665-2143c5a672ba';

-- Hèn Hạ (HHW#-11092026-0507) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm" [already delivered in Step 3]
update media_booking_package_lines set
  quantity = 20000,
  brand_column_quantities = NULL,
  metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
  detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
  amount = 1100000
where id = 'a6eced61-995e-45e6-b2a8-707311b1e009';

-- Sanity check: should return 0 rows after the updates above
select id, quantity
from media_booking_package_lines
where id in (
  '53141e9f-f902-44ad-af00-755fddd1019e',
  'ddda953e-bbc0-4d9d-8ef0-22e2ca6743f5',
  '776ae362-f307-4c38-b39f-6c9cb82499eb',
  'd5a7127d-e174-4ecc-9429-549f42bffb56',
  '960bbec3-0b62-4a23-9eb2-20fcaba30c43',
  '99164d31-36e8-4e3a-b36d-d84a55c115a2',
  '54ec75ab-e259-4317-a99d-c507bfd2b059',
  'db0a5548-5324-4658-8ecf-3413063461c4',
  '5528cd29-6f2d-465d-b122-ce28210af68b',
  '66cf7123-8231-42ac-9906-0cf1a2586fc1',
  '322ad595-1eb2-498a-9079-7c85c7d2a212',
  '723f3bfc-2066-4579-b2ec-f437d638778a',
  '5f6208bd-401a-43b3-a214-7def11654c9d',
  '720471b5-7d22-4794-9b31-edc2d5daab99',
  'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4',
  '099bc560-51de-47f3-8590-4e0d5feff500',
  '8a64a572-c8c0-4b6a-8f99-279c40bf7ec7',
  '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf',
  '30d373c7-f731-4a76-8455-aa2abf672e94',
  'eeebe9d6-8a93-47f2-9c5d-56b0c56f5eaf',
  '11b2f48d-b396-4152-ab1d-c75a157ec2b6',
  'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678',
  '3c7ced09-d4d4-4119-86d4-171b805771f7',
  '256c846d-2066-4618-beb3-7636258fcc39',
  '80e289b9-9f56-4c8b-b5ad-a3705f456ba8',
  '6db25ccf-a99b-45c5-bbde-136f6e725012',
  'a17718a6-e7a5-48e9-a2d0-ee1b905205e4',
  'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa',
  'a184f996-f669-4a6e-aaae-7d4a3e48c3a8',
  'f72b6fe1-8fc5-419e-9b6f-48ce151670cd',
  '780de0a4-052f-4a59-93b1-707502e1d62e',
  'dd38de32-3cf4-4095-8cf6-087693378815',
  'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca',
  '9db2108c-c1b9-4b97-b296-35ef9b2114a0',
  '6ad9ac2d-7ebf-436d-a665-2143c5a672ba',
  'a6eced61-995e-45e6-b2a8-707311b1e009'
)
and quantity is distinct from (
  case id
    when '53141e9f-f902-44ad-af00-755fddd1019e' then 12
    when 'ddda953e-bbc0-4d9d-8ef0-22e2ca6743f5' then 55
    when '776ae362-f307-4c38-b39f-6c9cb82499eb' then 20000
    when 'd5a7127d-e174-4ecc-9429-549f42bffb56' then 20000
    when '960bbec3-0b62-4a23-9eb2-20fcaba30c43' then NULL
    when '99164d31-36e8-4e3a-b36d-d84a55c115a2' then 30000
    when '54ec75ab-e259-4317-a99d-c507bfd2b059' then 23
    when 'db0a5548-5324-4658-8ecf-3413063461c4' then 50
    when '5528cd29-6f2d-465d-b122-ce28210af68b' then 20
    when '66cf7123-8231-42ac-9906-0cf1a2586fc1' then 28
    when '322ad595-1eb2-498a-9079-7c85c7d2a212' then 45
    when '723f3bfc-2066-4579-b2ec-f437d638778a' then 10
    when '5f6208bd-401a-43b3-a214-7def11654c9d' then 20000
    when '720471b5-7d22-4794-9b31-edc2d5daab99' then 11
    when 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4' then 20000
    when '099bc560-51de-47f3-8590-4e0d5feff500' then 30
    when '8a64a572-c8c0-4b6a-8f99-279c40bf7ec7' then 9
    when '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf' then 20000
    when '30d373c7-f731-4a76-8455-aa2abf672e94' then 30000
    when 'eeebe9d6-8a93-47f2-9c5d-56b0c56f5eaf' then 10
    when '11b2f48d-b396-4152-ab1d-c75a157ec2b6' then 20000
    when 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678' then 12
    when '3c7ced09-d4d4-4119-86d4-171b805771f7' then 35
    when '256c846d-2066-4618-beb3-7636258fcc39' then 24
    when '80e289b9-9f56-4c8b-b5ad-a3705f456ba8' then NULL
    when '6db25ccf-a99b-45c5-bbde-136f6e725012' then 96
    when 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4' then 150000
    when 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa' then 10
    when 'a184f996-f669-4a6e-aaae-7d4a3e48c3a8' then 4
    when 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd' then 9
    when '780de0a4-052f-4a59-93b1-707502e1d62e' then 20000
    when 'dd38de32-3cf4-4095-8cf6-087693378815' then 9
    when 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca' then 40
    when '9db2108c-c1b9-4b97-b296-35ef9b2114a0' then 13
    when '6ad9ac2d-7ebf-436d-a665-2143c5a672ba' then 10
    when 'a6eced61-995e-45e6-b2a8-707311b1e009' then 20000
  end
);

-- If the sanity check above returns 0 rows, run:
-- commit;
-- Otherwise, investigate before committing:
-- rollback;
