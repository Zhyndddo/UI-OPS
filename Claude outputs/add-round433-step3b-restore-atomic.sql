-- Round 433 Step 3 (ATOMIC) -- restores the 28 confirmed-corrupted locked-package
-- lines, self-verified in the SAME statement so there is no separate
-- begin/commit/rollback to coordinate across tool tabs or connections.
--
-- Why this version exists: the plain begin/update/select-sanity-check/commit
-- version (still below, and still correct) depends on all of those
-- statements running in ONE continuous session. Run as separate 'chunks' in
-- a SQL editor that opens a new connection per Run, each chunk gets its own
-- transaction -- the updates commit or roll back before the next chunk ever
-- sees them, so a sanity check run afterward as a separate chunk can (and, in
-- your last run, did) show stale/original data even though nothing is wrong
-- with the restore logic itself.
--
-- This version is a single PL/pgSQL statement: Postgres treats one submitted
-- statement as one atomic unit regardless of how your tool manages
-- connections/chunks. It updates all 28 lines, then re-reads every one of
-- them and RAISEs an exception (which automatically rolls back everything in
-- this statement, restoring nothing was ever run) if even one doesn't match
-- the expected restored quantity. If it completes without error, all 28 rows
-- are committed -- Postgres commits a successful top-level statement
-- automatically, no separate 'commit;' needed. Paste this whole block and
-- run it as ONE execution/one Run click.

do $$
begin
  -- Anh Được Gì (AĐ#T-07092026-0033) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 20000,
    brand_column_quantities = NULL,
    metric_quantities = NULL,
    detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
    amount = 1100000
  where id = '776ae362-f307-4c38-b39f-6c9cb82499eb';

  -- SODA CREAM (SCTT-20082026-0485) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 20000,
    brand_column_quantities = NULL,
    metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
    detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
    amount = 1100000
  where id = 'd5a7127d-e174-4ecc-9429-549f42bffb56';

  -- Then I Met You (TIS#-18082026-0504) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 30000,
    brand_column_quantities = NULL,
    metric_quantities = '{"Thruplay (Views)": 30000}'::jsonb,
    detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
    amount = 1650000
  where id = '99164d31-36e8-4e3a-b36d-d84a55c115a2';

  -- EP TRƯỚC SAU (ETDH-26092026-0070) | Social | (no brand) | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 23,
    brand_column_quantities = '{"VIEENT::TikTok": 6, "VIEENT::YouTube": 7, "VIEENT::Facebook": 5, "VIEENT::Instagram": 5}'::jsonb,
    metric_quantities = NULL,
    detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News/Congrats dự án',
    amount = 4600000
  where id = '54ec75ab-e259-4317-a99d-c507bfd2b059';

  -- EP TRƯỚC SAU (ETDH-26092026-0070) | TikTok Channel | (no brand) | locked package "Độc Quyền 5 năm"
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

  -- em từng là cả thế giới trong anh (ETH#-16092026-0064) | Community | (no brand) | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 20,
    brand_column_quantities = '{"PAGE VPOP::Thread": 4, "PAGE VPOP::TikTok": 4, "PAGE INDIE::TikTok": 2, "PAGE VPOP::Facebook": 4, "PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3}'::jsonb,
    metric_quantities = NULL,
    detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News: Thông tin và ý nghĩa của dự án',
    amount = 4000000
  where id = '5528cd29-6f2d-465d-b122-ce28210af68b';

  -- The Other Side Of Regret (TONO-08102026-0032) | Social | (no brand) | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 28,
    brand_column_quantities = '{"VIEENT::TikTok": 9, "VIEENT::YouTube": 9, "VIEENT::Facebook": 5, "VIEENT::Instagram": 5}'::jsonb,
    metric_quantities = NULL,
    detail = 'New Release: Thông báo ra mắt (2 single + 1 full EP)
Listen Now: Clip ngắn cắt từ MV (nếu có MV)',
    amount = 5600000
  where id = '66cf7123-8231-42ac-9906-0cf1a2586fc1';

  -- The Other Side Of Regret (TONO-08102026-0032) | TikTok Channel | (no brand) | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 45,
    brand_column_quantities = '{"TIKTOK INDIE::TIKTOK LYRICS": 15, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 30}'::jsonb,
    metric_quantities = NULL,
    detail = '50 kênh tiktok tổng hợp
- Mỗi key track 15 post ( 2 bài, 2 bài có MV)
- Mỗi side track 5 post (3 bài còn lại)',
    amount = 31500000
  where id = '322ad595-1eb2-498a-9079-7c85c7d2a212';

  -- Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo) (NĐH#-17092026-0081) | Community | (no brand) | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 10,
    brand_column_quantities = '{"PAGE VPOP::Thread": 2, "PAGE VPOP::TikTok": 4, "PAGE VPOP::Facebook": 4}'::jsonb,
    metric_quantities = NULL,
    detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News: Thông tin và ý nghĩa của dự án',
    amount = 2000000
  where id = '723f3bfc-2066-4579-b2ec-f437d638778a';

  -- Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo) (NĐH#-17092026-0081) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 20000,
    brand_column_quantities = NULL,
    metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
    detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
    amount = 1100000
  where id = '5f6208bd-401a-43b3-a214-7def11654c9d';

  -- Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo) (NĐH#-17092026-0081) | Social | (no brand) | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 11,
    brand_column_quantities = '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 4, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2}'::jsonb,
    metric_quantities = NULL,
    detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News: Thông tin và ý nghĩa của dự án',
    amount = 2200000
  where id = '720471b5-7d22-4794-9b31-edc2d5daab99';

  -- Ánh Trăng Bật Khóc (ÁTCT-25092026-0088) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 20000,
    brand_column_quantities = NULL,
    metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
    detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
    amount = 1100000
  where id = 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4';

  -- Muốn Lấy Anh Làm Chồng (MLHK-11092026-0061) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 20000,
    brand_column_quantities = NULL,
    metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
    detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
    amount = 1100000
  where id = '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf';

  -- Đồng Hương Đồng Nai (ĐHKL-19092026-0080) | Ads | YouTube Ads | locked package "Độc Quyền Vĩnh Viễn"
  update media_booking_package_lines set
    quantity = 30000,
    brand_column_quantities = NULL,
    metric_quantities = '{"Thruplay (Views)": 30000}'::jsonb,
    detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
    amount = 1650000
  where id = '30d373c7-f731-4a76-8455-aa2abf672e94';

  -- Lặng Nhìn Yêu Thương (LNNH-20082026-0480) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 20000,
    brand_column_quantities = NULL,
    metric_quantities = NULL,
    detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
    amount = 1100000
  where id = '11b2f48d-b396-4152-ab1d-c75a157ec2b6';

  -- Lặng Nhìn Yêu Thương (LNNH-20082026-0480) | Social | (no brand) | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 12,
    brand_column_quantities = '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 2, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2}'::jsonb,
    metric_quantities = NULL,
    detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV',
    amount = 2400000
  where id = 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678';

  -- The Next Artist (Live at Final Stage) (TNTN-27082026-0010) | Social | (no brand) | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 35,
    brand_column_quantities = '{"VIEENT::TikTok": 12, "VIEENT::YouTube": 13, "VIEENT::Facebook": 5, "VIEENT::Instagram": 5}'::jsonb,
    metric_quantities = NULL,
    detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV',
    amount = 7000000
  where id = '3c7ced09-d4d4-4119-86d4-171b805771f7';

  -- The Next Artist (Live at Final Stage) (TNTN-27082026-0010) | Community | (no brand) | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 24,
    brand_column_quantities = '{"PAGE VPOP::TikTok": 10, "PAGE VPOP::Facebook": 10, "PAGE INDIE::Facebook": 2, "PAGE INDIE::Instagram": 2}'::jsonb,
    metric_quantities = NULL,
    detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV',
    amount = 4800000
  where id = '256c846d-2066-4618-beb3-7636258fcc39';

  -- The Next Artist (Live at Final Stage) (TNTN-27082026-0010) | TikTok Channel | (no brand) | locked package "Độc Quyền 5 năm"
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

  -- The Next Artist (Live at Final Stage) (TNTN-27082026-0010) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 150000,
    brand_column_quantities = NULL,
    metric_quantities = '{"Thruplay (Views)": 150000}'::jsonb,
    detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
    amount = 8250000
  where id = 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4';

  -- Mình Không Chia Tay	 (MKSB-14082026-0481) | Social | (no brand) | locked package "Độc Quyền 2 năm"
  update media_booking_package_lines set
    quantity = 10,
    brand_column_quantities = '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 4, "VIEENT::Facebook": 4, "VIEENT::Instagram": 4}'::jsonb,
    metric_quantities = NULL,
    detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV ',
    amount = 2000000
  where id = 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa';

  -- Bình Yên Là Tự Rời Đi  (BYLN-20082026-0512) | Social | (no brand) | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 9,
    brand_column_quantities = '{"ENVI::TikTok": 3, "ENVI::YouTube": 2, "ENVI::Facebook": 2, "ENVI::Instagram": 2}'::jsonb,
    metric_quantities = NULL,
    detail = 'New Release: Thông báo ra mắt
Listen Now: Clip ngắn cắt từ MV',
    amount = 1800000
  where id = 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd';

  -- Bình Yên Là Tự Rời Đi  (BYLN-20082026-0512) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 20000,
    brand_column_quantities = NULL,
    metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
    detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
    amount = 1100000
  where id = '780de0a4-052f-4a59-93b1-707502e1d62e';

  -- tìm và trốn (TVDV-05092026-0003) | TikTok Channel | (no brand) | locked package "Độc Quyền 2 năm"
  update media_booking_package_lines set
    quantity = 9,
    brand_column_quantities = '{"CAPCUT::TIKTOK CAPCUT": 2, "TIKTOK INDIE::TIKTOK LYRICS": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 2}'::jsonb,
    metric_quantities = NULL,
    detail = '- 10 kênh tiktok tổng hợp 

- 1 mẫu capcut

 (Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) ',
    amount = 6300000
  where id = 'dd38de32-3cf4-4095-8cf6-087693378815';

  -- Hèn Hạ (HHW#-11092026-0507) | TikTok Channel | (no brand) | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 40,
    brand_column_quantities = '{"CAPCUT::TIKTOK CAPCUT": 10, "TIKTOK INDIE::TIKTOK LYRICS": 10, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0}'::jsonb,
    metric_quantities = NULL,
    detail = '- 20 post tiktok/key track (1 key track)
- 10 post tiktok/side track (2 side track)

 (Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) ',
    amount = 28000000
  where id = 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca';

  -- Hèn Hạ (HHW#-11092026-0507) | Social | (no brand) | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 13,
    brand_column_quantities = '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 4, "VIEENT::Facebook": 3, "VIEENT::Instagram": 3}'::jsonb,
    metric_quantities = NULL,
    detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV',
    amount = 2600000
  where id = '9db2108c-c1b9-4b97-b296-35ef9b2114a0';

  -- Hèn Hạ (HHW#-11092026-0507) | Community | (no brand) | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 10,
    brand_column_quantities = '{"PAGE INDIE::TikTok": 2, "PAGE INDIE::Facebook": 4, "PAGE INDIE::Instagram": 4}'::jsonb,
    metric_quantities = NULL,
    detail = '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV',
    amount = 2000000
  where id = '6ad9ac2d-7ebf-436d-a665-2143c5a672ba';

  -- Hèn Hạ (HHW#-11092026-0507) | Ads | YouTube Ads | locked package "Độc Quyền 5 năm"
  update media_booking_package_lines set
    quantity = 20000,
    brand_column_quantities = NULL,
    metric_quantities = '{"Thruplay (Views)": 20000}'::jsonb,
    detail = 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút',
    amount = 1100000
  where id = 'a6eced61-995e-45e6-b2a8-707311b1e009';

  if (select quantity from media_booking_package_lines where id = '776ae362-f307-4c38-b39f-6c9cb82499eb') is distinct from 20000 then
    raise exception 'Round 433 restore verification failed for line % (AĐ#T-07092026-0033 / Ads / YouTube Ads): quantity is % expected 20000', '776ae362-f307-4c38-b39f-6c9cb82499eb', (select quantity from media_booking_package_lines where id = '776ae362-f307-4c38-b39f-6c9cb82499eb');
  end if;
  if (select quantity from media_booking_package_lines where id = 'd5a7127d-e174-4ecc-9429-549f42bffb56') is distinct from 20000 then
    raise exception 'Round 433 restore verification failed for line % (SCTT-20082026-0485 / Ads / YouTube Ads): quantity is % expected 20000', 'd5a7127d-e174-4ecc-9429-549f42bffb56', (select quantity from media_booking_package_lines where id = 'd5a7127d-e174-4ecc-9429-549f42bffb56');
  end if;
  if (select quantity from media_booking_package_lines where id = '99164d31-36e8-4e3a-b36d-d84a55c115a2') is distinct from 30000 then
    raise exception 'Round 433 restore verification failed for line % (TIS#-18082026-0504 / Ads / YouTube Ads): quantity is % expected 30000', '99164d31-36e8-4e3a-b36d-d84a55c115a2', (select quantity from media_booking_package_lines where id = '99164d31-36e8-4e3a-b36d-d84a55c115a2');
  end if;
  if (select quantity from media_booking_package_lines where id = '54ec75ab-e259-4317-a99d-c507bfd2b059') is distinct from 23 then
    raise exception 'Round 433 restore verification failed for line % (ETDH-26092026-0070 / Social / (no brand)): quantity is % expected 23', '54ec75ab-e259-4317-a99d-c507bfd2b059', (select quantity from media_booking_package_lines where id = '54ec75ab-e259-4317-a99d-c507bfd2b059');
  end if;
  if (select quantity from media_booking_package_lines where id = 'db0a5548-5324-4658-8ecf-3413063461c4') is distinct from 50 then
    raise exception 'Round 433 restore verification failed for line % (ETDH-26092026-0070 / TikTok Channel / (no brand)): quantity is % expected 50', 'db0a5548-5324-4658-8ecf-3413063461c4', (select quantity from media_booking_package_lines where id = 'db0a5548-5324-4658-8ecf-3413063461c4');
  end if;
  if (select quantity from media_booking_package_lines where id = '5528cd29-6f2d-465d-b122-ce28210af68b') is distinct from 20 then
    raise exception 'Round 433 restore verification failed for line % (ETH#-16092026-0064 / Community / (no brand)): quantity is % expected 20', '5528cd29-6f2d-465d-b122-ce28210af68b', (select quantity from media_booking_package_lines where id = '5528cd29-6f2d-465d-b122-ce28210af68b');
  end if;
  if (select quantity from media_booking_package_lines where id = '66cf7123-8231-42ac-9906-0cf1a2586fc1') is distinct from 28 then
    raise exception 'Round 433 restore verification failed for line % (TONO-08102026-0032 / Social / (no brand)): quantity is % expected 28', '66cf7123-8231-42ac-9906-0cf1a2586fc1', (select quantity from media_booking_package_lines where id = '66cf7123-8231-42ac-9906-0cf1a2586fc1');
  end if;
  if (select quantity from media_booking_package_lines where id = '322ad595-1eb2-498a-9079-7c85c7d2a212') is distinct from 45 then
    raise exception 'Round 433 restore verification failed for line % (TONO-08102026-0032 / TikTok Channel / (no brand)): quantity is % expected 45', '322ad595-1eb2-498a-9079-7c85c7d2a212', (select quantity from media_booking_package_lines where id = '322ad595-1eb2-498a-9079-7c85c7d2a212');
  end if;
  if (select quantity from media_booking_package_lines where id = '723f3bfc-2066-4579-b2ec-f437d638778a') is distinct from 10 then
    raise exception 'Round 433 restore verification failed for line % (NĐH#-17092026-0081 / Community / (no brand)): quantity is % expected 10', '723f3bfc-2066-4579-b2ec-f437d638778a', (select quantity from media_booking_package_lines where id = '723f3bfc-2066-4579-b2ec-f437d638778a');
  end if;
  if (select quantity from media_booking_package_lines where id = '5f6208bd-401a-43b3-a214-7def11654c9d') is distinct from 20000 then
    raise exception 'Round 433 restore verification failed for line % (NĐH#-17092026-0081 / Ads / YouTube Ads): quantity is % expected 20000', '5f6208bd-401a-43b3-a214-7def11654c9d', (select quantity from media_booking_package_lines where id = '5f6208bd-401a-43b3-a214-7def11654c9d');
  end if;
  if (select quantity from media_booking_package_lines where id = '720471b5-7d22-4794-9b31-edc2d5daab99') is distinct from 11 then
    raise exception 'Round 433 restore verification failed for line % (NĐH#-17092026-0081 / Social / (no brand)): quantity is % expected 11', '720471b5-7d22-4794-9b31-edc2d5daab99', (select quantity from media_booking_package_lines where id = '720471b5-7d22-4794-9b31-edc2d5daab99');
  end if;
  if (select quantity from media_booking_package_lines where id = 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4') is distinct from 20000 then
    raise exception 'Round 433 restore verification failed for line % (ÁTCT-25092026-0088 / Ads / YouTube Ads): quantity is % expected 20000', 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4', (select quantity from media_booking_package_lines where id = 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4');
  end if;
  if (select quantity from media_booking_package_lines where id = '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf') is distinct from 20000 then
    raise exception 'Round 433 restore verification failed for line % (MLHK-11092026-0061 / Ads / YouTube Ads): quantity is % expected 20000', '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf', (select quantity from media_booking_package_lines where id = '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf');
  end if;
  if (select quantity from media_booking_package_lines where id = '30d373c7-f731-4a76-8455-aa2abf672e94') is distinct from 30000 then
    raise exception 'Round 433 restore verification failed for line % (ĐHKL-19092026-0080 / Ads / YouTube Ads): quantity is % expected 30000', '30d373c7-f731-4a76-8455-aa2abf672e94', (select quantity from media_booking_package_lines where id = '30d373c7-f731-4a76-8455-aa2abf672e94');
  end if;
  if (select quantity from media_booking_package_lines where id = '11b2f48d-b396-4152-ab1d-c75a157ec2b6') is distinct from 20000 then
    raise exception 'Round 433 restore verification failed for line % (LNNH-20082026-0480 / Ads / YouTube Ads): quantity is % expected 20000', '11b2f48d-b396-4152-ab1d-c75a157ec2b6', (select quantity from media_booking_package_lines where id = '11b2f48d-b396-4152-ab1d-c75a157ec2b6');
  end if;
  if (select quantity from media_booking_package_lines where id = 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678') is distinct from 12 then
    raise exception 'Round 433 restore verification failed for line % (LNNH-20082026-0480 / Social / (no brand)): quantity is % expected 12', 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678', (select quantity from media_booking_package_lines where id = 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678');
  end if;
  if (select quantity from media_booking_package_lines where id = '3c7ced09-d4d4-4119-86d4-171b805771f7') is distinct from 35 then
    raise exception 'Round 433 restore verification failed for line % (TNTN-27082026-0010 / Social / (no brand)): quantity is % expected 35', '3c7ced09-d4d4-4119-86d4-171b805771f7', (select quantity from media_booking_package_lines where id = '3c7ced09-d4d4-4119-86d4-171b805771f7');
  end if;
  if (select quantity from media_booking_package_lines where id = '256c846d-2066-4618-beb3-7636258fcc39') is distinct from 24 then
    raise exception 'Round 433 restore verification failed for line % (TNTN-27082026-0010 / Community / (no brand)): quantity is % expected 24', '256c846d-2066-4618-beb3-7636258fcc39', (select quantity from media_booking_package_lines where id = '256c846d-2066-4618-beb3-7636258fcc39');
  end if;
  if (select quantity from media_booking_package_lines where id = '6db25ccf-a99b-45c5-bbde-136f6e725012') is distinct from 96 then
    raise exception 'Round 433 restore verification failed for line % (TNTN-27082026-0010 / TikTok Channel / (no brand)): quantity is % expected 96', '6db25ccf-a99b-45c5-bbde-136f6e725012', (select quantity from media_booking_package_lines where id = '6db25ccf-a99b-45c5-bbde-136f6e725012');
  end if;
  if (select quantity from media_booking_package_lines where id = 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4') is distinct from 150000 then
    raise exception 'Round 433 restore verification failed for line % (TNTN-27082026-0010 / Ads / YouTube Ads): quantity is % expected 150000', 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4', (select quantity from media_booking_package_lines where id = 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4');
  end if;
  if (select quantity from media_booking_package_lines where id = 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa') is distinct from 10 then
    raise exception 'Round 433 restore verification failed for line % (MKSB-14082026-0481 / Social / (no brand)): quantity is % expected 10', 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa', (select quantity from media_booking_package_lines where id = 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa');
  end if;
  if (select quantity from media_booking_package_lines where id = 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd') is distinct from 9 then
    raise exception 'Round 433 restore verification failed for line % (BYLN-20082026-0512 / Social / (no brand)): quantity is % expected 9', 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd', (select quantity from media_booking_package_lines where id = 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd');
  end if;
  if (select quantity from media_booking_package_lines where id = '780de0a4-052f-4a59-93b1-707502e1d62e') is distinct from 20000 then
    raise exception 'Round 433 restore verification failed for line % (BYLN-20082026-0512 / Ads / YouTube Ads): quantity is % expected 20000', '780de0a4-052f-4a59-93b1-707502e1d62e', (select quantity from media_booking_package_lines where id = '780de0a4-052f-4a59-93b1-707502e1d62e');
  end if;
  if (select quantity from media_booking_package_lines where id = 'dd38de32-3cf4-4095-8cf6-087693378815') is distinct from 9 then
    raise exception 'Round 433 restore verification failed for line % (TVDV-05092026-0003 / TikTok Channel / (no brand)): quantity is % expected 9', 'dd38de32-3cf4-4095-8cf6-087693378815', (select quantity from media_booking_package_lines where id = 'dd38de32-3cf4-4095-8cf6-087693378815');
  end if;
  if (select quantity from media_booking_package_lines where id = 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca') is distinct from 40 then
    raise exception 'Round 433 restore verification failed for line % (HHW#-11092026-0507 / TikTok Channel / (no brand)): quantity is % expected 40', 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca', (select quantity from media_booking_package_lines where id = 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca');
  end if;
  if (select quantity from media_booking_package_lines where id = '9db2108c-c1b9-4b97-b296-35ef9b2114a0') is distinct from 13 then
    raise exception 'Round 433 restore verification failed for line % (HHW#-11092026-0507 / Social / (no brand)): quantity is % expected 13', '9db2108c-c1b9-4b97-b296-35ef9b2114a0', (select quantity from media_booking_package_lines where id = '9db2108c-c1b9-4b97-b296-35ef9b2114a0');
  end if;
  if (select quantity from media_booking_package_lines where id = '6ad9ac2d-7ebf-436d-a665-2143c5a672ba') is distinct from 10 then
    raise exception 'Round 433 restore verification failed for line % (HHW#-11092026-0507 / Community / (no brand)): quantity is % expected 10', '6ad9ac2d-7ebf-436d-a665-2143c5a672ba', (select quantity from media_booking_package_lines where id = '6ad9ac2d-7ebf-436d-a665-2143c5a672ba');
  end if;
  if (select quantity from media_booking_package_lines where id = 'a6eced61-995e-45e6-b2a8-707311b1e009') is distinct from 20000 then
    raise exception 'Round 433 restore verification failed for line % (HHW#-11092026-0507 / Ads / YouTube Ads): quantity is % expected 20000', 'a6eced61-995e-45e6-b2a8-707311b1e009', (select quantity from media_booking_package_lines where id = 'a6eced61-995e-45e6-b2a8-707311b1e009');
  end if;

  raise notice 'Round 433 Step 3 restore: all 28 lines verified and committed.';
end $$;
