-- Round 433 -- FINAL VERIFY (read-only) after running the atomic Step 3b
-- restore. Re-checks all 5 fields (quantity, brand_column_quantities,
-- metric_quantities, detail, amount) for all 28 restored lines against the
-- confirmed pre-corruption values -- not just quantity, unlike the earlier
-- sanity check baked into Step 3b itself.
--
-- Expect ZERO rows back. Any row returned names exactly which field(s) on
-- that line still don't match what the restore should have written.

select
  l.id as line_id,
  r.did as release_did,
  r.title as release_title,
  cat.name as category_name,
  l.brand,
  pkg.name as package_name,
  (l.quantity is distinct from (case l.id
    when '776ae362-f307-4c38-b39f-6c9cb82499eb' then 20000
    when 'd5a7127d-e174-4ecc-9429-549f42bffb56' then 20000
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
    when '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf' then 20000
    when '30d373c7-f731-4a76-8455-aa2abf672e94' then 30000
    when '11b2f48d-b396-4152-ab1d-c75a157ec2b6' then 20000
    when 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678' then 12
    when '3c7ced09-d4d4-4119-86d4-171b805771f7' then 35
    when '256c846d-2066-4618-beb3-7636258fcc39' then 24
    when '6db25ccf-a99b-45c5-bbde-136f6e725012' then 96
    when 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4' then 150000
    when 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa' then 10
    when 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd' then 9
    when '780de0a4-052f-4a59-93b1-707502e1d62e' then 20000
    when 'dd38de32-3cf4-4095-8cf6-087693378815' then 9
    when 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca' then 40
    when '9db2108c-c1b9-4b97-b296-35ef9b2114a0' then 13
    when '6ad9ac2d-7ebf-436d-a665-2143c5a672ba' then 10
    when 'a6eced61-995e-45e6-b2a8-707311b1e009' then 20000
  end)) as quantity_mismatch,
  (l.brand_column_quantities is distinct from (case l.id
    when '776ae362-f307-4c38-b39f-6c9cb82499eb' then NULL
    when 'd5a7127d-e174-4ecc-9429-549f42bffb56' then NULL
    when '99164d31-36e8-4e3a-b36d-d84a55c115a2' then NULL
    when '54ec75ab-e259-4317-a99d-c507bfd2b059' then '{"VIEENT::TikTok": 6, "VIEENT::YouTube": 7, "VIEENT::Facebook": 5, "VIEENT::Instagram": 5}'::jsonb
    when 'db0a5548-5324-4658-8ecf-3413063461c4' then '{"CAPCUT::TIKTOK CAPCUT": 5, "TIKTOK INDIE::TIKTOK LYRICS": 20, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 25, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0}'::jsonb
    when '5528cd29-6f2d-465d-b122-ce28210af68b' then '{"PAGE VPOP::Thread": 4, "PAGE VPOP::TikTok": 4, "PAGE INDIE::TikTok": 2, "PAGE VPOP::Facebook": 4, "PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3}'::jsonb
    when '66cf7123-8231-42ac-9906-0cf1a2586fc1' then '{"VIEENT::TikTok": 9, "VIEENT::YouTube": 9, "VIEENT::Facebook": 5, "VIEENT::Instagram": 5}'::jsonb
    when '322ad595-1eb2-498a-9079-7c85c7d2a212' then '{"TIKTOK INDIE::TIKTOK LYRICS": 15, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 30}'::jsonb
    when '723f3bfc-2066-4579-b2ec-f437d638778a' then '{"PAGE VPOP::Thread": 2, "PAGE VPOP::TikTok": 4, "PAGE VPOP::Facebook": 4}'::jsonb
    when '5f6208bd-401a-43b3-a214-7def11654c9d' then NULL
    when '720471b5-7d22-4794-9b31-edc2d5daab99' then '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 4, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2}'::jsonb
    when 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4' then NULL
    when '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf' then NULL
    when '30d373c7-f731-4a76-8455-aa2abf672e94' then NULL
    when '11b2f48d-b396-4152-ab1d-c75a157ec2b6' then NULL
    when 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678' then '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 2, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2}'::jsonb
    when '3c7ced09-d4d4-4119-86d4-171b805771f7' then '{"VIEENT::TikTok": 12, "VIEENT::YouTube": 13, "VIEENT::Facebook": 5, "VIEENT::Instagram": 5}'::jsonb
    when '256c846d-2066-4618-beb3-7636258fcc39' then '{"PAGE VPOP::TikTok": 10, "PAGE VPOP::Facebook": 10, "PAGE INDIE::Facebook": 2, "PAGE INDIE::Instagram": 2}'::jsonb
    when '6db25ccf-a99b-45c5-bbde-136f6e725012' then '{"CAPCUT::TIKTOK CAPCUT": 4, "TIKTOK VPOP::TIKTOK LYRICS": 25, "TIKTOK INDIE::TIKTOK LYRICS": 31, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 30, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 6}'::jsonb
    when 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4' then NULL
    when 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa' then '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 4, "VIEENT::Facebook": 4, "VIEENT::Instagram": 4}'::jsonb
    when 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd' then '{"ENVI::TikTok": 3, "ENVI::YouTube": 2, "ENVI::Facebook": 2, "ENVI::Instagram": 2}'::jsonb
    when '780de0a4-052f-4a59-93b1-707502e1d62e' then NULL
    when 'dd38de32-3cf4-4095-8cf6-087693378815' then '{"CAPCUT::TIKTOK CAPCUT": 2, "TIKTOK INDIE::TIKTOK LYRICS": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 2}'::jsonb
    when 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca' then '{"CAPCUT::TIKTOK CAPCUT": 10, "TIKTOK INDIE::TIKTOK LYRICS": 10, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0}'::jsonb
    when '9db2108c-c1b9-4b97-b296-35ef9b2114a0' then '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 4, "VIEENT::Facebook": 3, "VIEENT::Instagram": 3}'::jsonb
    when '6ad9ac2d-7ebf-436d-a665-2143c5a672ba' then '{"PAGE INDIE::TikTok": 2, "PAGE INDIE::Facebook": 4, "PAGE INDIE::Instagram": 4}'::jsonb
    when 'a6eced61-995e-45e6-b2a8-707311b1e009' then NULL
  end)) as brand_column_quantities_mismatch,
  (l.metric_quantities is distinct from (case l.id
    when '776ae362-f307-4c38-b39f-6c9cb82499eb' then NULL
    when 'd5a7127d-e174-4ecc-9429-549f42bffb56' then '{"Thruplay (Views)": 20000}'::jsonb
    when '99164d31-36e8-4e3a-b36d-d84a55c115a2' then '{"Thruplay (Views)": 30000}'::jsonb
    when '54ec75ab-e259-4317-a99d-c507bfd2b059' then NULL
    when 'db0a5548-5324-4658-8ecf-3413063461c4' then NULL
    when '5528cd29-6f2d-465d-b122-ce28210af68b' then NULL
    when '66cf7123-8231-42ac-9906-0cf1a2586fc1' then NULL
    when '322ad595-1eb2-498a-9079-7c85c7d2a212' then NULL
    when '723f3bfc-2066-4579-b2ec-f437d638778a' then NULL
    when '5f6208bd-401a-43b3-a214-7def11654c9d' then '{"Thruplay (Views)": 20000}'::jsonb
    when '720471b5-7d22-4794-9b31-edc2d5daab99' then NULL
    when 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4' then '{"Thruplay (Views)": 20000}'::jsonb
    when '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf' then '{"Thruplay (Views)": 20000}'::jsonb
    when '30d373c7-f731-4a76-8455-aa2abf672e94' then '{"Thruplay (Views)": 30000}'::jsonb
    when '11b2f48d-b396-4152-ab1d-c75a157ec2b6' then NULL
    when 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678' then NULL
    when '3c7ced09-d4d4-4119-86d4-171b805771f7' then NULL
    when '256c846d-2066-4618-beb3-7636258fcc39' then NULL
    when '6db25ccf-a99b-45c5-bbde-136f6e725012' then NULL
    when 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4' then '{"Thruplay (Views)": 150000}'::jsonb
    when 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa' then NULL
    when 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd' then NULL
    when '780de0a4-052f-4a59-93b1-707502e1d62e' then '{"Thruplay (Views)": 20000}'::jsonb
    when 'dd38de32-3cf4-4095-8cf6-087693378815' then NULL
    when 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca' then NULL
    when '9db2108c-c1b9-4b97-b296-35ef9b2114a0' then NULL
    when '6ad9ac2d-7ebf-436d-a665-2143c5a672ba' then NULL
    when 'a6eced61-995e-45e6-b2a8-707311b1e009' then '{"Thruplay (Views)": 20000}'::jsonb
  end)) as metric_quantities_mismatch,
  (l.detail is distinct from (case l.id
    when '776ae362-f307-4c38-b39f-6c9cb82499eb' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when 'd5a7127d-e174-4ecc-9429-549f42bffb56' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when '99164d31-36e8-4e3a-b36d-d84a55c115a2' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when '54ec75ab-e259-4317-a99d-c507bfd2b059' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News/Congrats dự án'
    when 'db0a5548-5324-4658-8ecf-3413063461c4' then '- 20 post tiktok/key track (1 key track)
- 10 post tiktok/side track (3 side track)

- 4 mẫu capcut

 (Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) '
    when '5528cd29-6f2d-465d-b122-ce28210af68b' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News: Thông tin và ý nghĩa của dự án'
    when '66cf7123-8231-42ac-9906-0cf1a2586fc1' then 'New Release: Thông báo ra mắt (2 single + 1 full EP)
Listen Now: Clip ngắn cắt từ MV (nếu có MV)'
    when '322ad595-1eb2-498a-9079-7c85c7d2a212' then '50 kênh tiktok tổng hợp
- Mỗi key track 15 post ( 2 bài, 2 bài có MV)
- Mỗi side track 5 post (3 bài còn lại)'
    when '723f3bfc-2066-4579-b2ec-f437d638778a' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News: Thông tin và ý nghĩa của dự án'
    when '5f6208bd-401a-43b3-a214-7def11654c9d' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when '720471b5-7d22-4794-9b31-edc2d5daab99' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News: Thông tin và ý nghĩa của dự án'
    when 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when '30d373c7-f731-4a76-8455-aa2abf672e94' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when '11b2f48d-b396-4152-ab1d-c75a157ec2b6' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV'
    when '3c7ced09-d4d4-4119-86d4-171b805771f7' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV'
    when '256c846d-2066-4618-beb3-7636258fcc39' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV'
    when '6db25ccf-a99b-45c5-bbde-136f6e725012' then '- 30 post tiktok capcut 
- 31 post tiktok tổng hợp indie
- 25 post tiktok tổng hợp vpop

(Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) '
    when 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV '
    when 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd' then 'New Release: Thông báo ra mắt
Listen Now: Clip ngắn cắt từ MV'
    when '780de0a4-052f-4a59-93b1-707502e1d62e' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when 'dd38de32-3cf4-4095-8cf6-087693378815' then '- 10 kênh tiktok tổng hợp 

- 1 mẫu capcut

 (Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) '
    when 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca' then '- 20 post tiktok/key track (1 key track)
- 10 post tiktok/side track (2 side track)

 (Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) '
    when '9db2108c-c1b9-4b97-b296-35ef9b2114a0' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV'
    when '6ad9ac2d-7ebf-436d-a665-2143c5a672ba' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV'
    when 'a6eced61-995e-45e6-b2a8-707311b1e009' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
  end)) as detail_mismatch,
  (l.amount is distinct from (case l.id
    when '776ae362-f307-4c38-b39f-6c9cb82499eb' then 1100000
    when 'd5a7127d-e174-4ecc-9429-549f42bffb56' then 1100000
    when '99164d31-36e8-4e3a-b36d-d84a55c115a2' then 1650000
    when '54ec75ab-e259-4317-a99d-c507bfd2b059' then 4600000
    when 'db0a5548-5324-4658-8ecf-3413063461c4' then 35000000
    when '5528cd29-6f2d-465d-b122-ce28210af68b' then 4000000
    when '66cf7123-8231-42ac-9906-0cf1a2586fc1' then 5600000
    when '322ad595-1eb2-498a-9079-7c85c7d2a212' then 31500000
    when '723f3bfc-2066-4579-b2ec-f437d638778a' then 2000000
    when '5f6208bd-401a-43b3-a214-7def11654c9d' then 1100000
    when '720471b5-7d22-4794-9b31-edc2d5daab99' then 2200000
    when 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4' then 1100000
    when '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf' then 1100000
    when '30d373c7-f731-4a76-8455-aa2abf672e94' then 1650000
    when '11b2f48d-b396-4152-ab1d-c75a157ec2b6' then 1100000
    when 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678' then 2400000
    when '3c7ced09-d4d4-4119-86d4-171b805771f7' then 7000000
    when '256c846d-2066-4618-beb3-7636258fcc39' then 4800000
    when '6db25ccf-a99b-45c5-bbde-136f6e725012' then 67200000
    when 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4' then 8250000
    when 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa' then 2000000
    when 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd' then 1800000
    when '780de0a4-052f-4a59-93b1-707502e1d62e' then 1100000
    when 'dd38de32-3cf4-4095-8cf6-087693378815' then 6300000
    when 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca' then 28000000
    when '9db2108c-c1b9-4b97-b296-35ef9b2114a0' then 2600000
    when '6ad9ac2d-7ebf-436d-a665-2143c5a672ba' then 2000000
    when 'a6eced61-995e-45e6-b2a8-707311b1e009' then 1100000
  end)) as amount_mismatch,
  l.quantity as current_quantity,
  l.brand_column_quantities as current_brand_column_quantities,
  l.metric_quantities as current_metric_quantities,
  l.detail as current_detail,
  l.amount as current_amount
from media_booking_package_lines l
join media_booking_packages pkg on pkg.id = l.package_id
join releases r on r.id = pkg.release_id
join package_categories cat on cat.id = l.category_id
where l.id in (
  '776ae362-f307-4c38-b39f-6c9cb82499eb',
  'd5a7127d-e174-4ecc-9429-549f42bffb56',
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
  '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf',
  '30d373c7-f731-4a76-8455-aa2abf672e94',
  '11b2f48d-b396-4152-ab1d-c75a157ec2b6',
  'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678',
  '3c7ced09-d4d4-4119-86d4-171b805771f7',
  '256c846d-2066-4618-beb3-7636258fcc39',
  '6db25ccf-a99b-45c5-bbde-136f6e725012',
  'a17718a6-e7a5-48e9-a2d0-ee1b905205e4',
  'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa',
  'f72b6fe1-8fc5-419e-9b6f-48ce151670cd',
  '780de0a4-052f-4a59-93b1-707502e1d62e',
  'dd38de32-3cf4-4095-8cf6-087693378815',
  'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca',
  '9db2108c-c1b9-4b97-b296-35ef9b2114a0',
  '6ad9ac2d-7ebf-436d-a665-2143c5a672ba',
  'a6eced61-995e-45e6-b2a8-707311b1e009'
)
and (
  l.quantity is distinct from (case l.id
    when '776ae362-f307-4c38-b39f-6c9cb82499eb' then 20000
    when 'd5a7127d-e174-4ecc-9429-549f42bffb56' then 20000
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
    when '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf' then 20000
    when '30d373c7-f731-4a76-8455-aa2abf672e94' then 30000
    when '11b2f48d-b396-4152-ab1d-c75a157ec2b6' then 20000
    when 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678' then 12
    when '3c7ced09-d4d4-4119-86d4-171b805771f7' then 35
    when '256c846d-2066-4618-beb3-7636258fcc39' then 24
    when '6db25ccf-a99b-45c5-bbde-136f6e725012' then 96
    when 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4' then 150000
    when 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa' then 10
    when 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd' then 9
    when '780de0a4-052f-4a59-93b1-707502e1d62e' then 20000
    when 'dd38de32-3cf4-4095-8cf6-087693378815' then 9
    when 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca' then 40
    when '9db2108c-c1b9-4b97-b296-35ef9b2114a0' then 13
    when '6ad9ac2d-7ebf-436d-a665-2143c5a672ba' then 10
    when 'a6eced61-995e-45e6-b2a8-707311b1e009' then 20000
  end)
  or l.brand_column_quantities is distinct from (case l.id
    when '776ae362-f307-4c38-b39f-6c9cb82499eb' then NULL
    when 'd5a7127d-e174-4ecc-9429-549f42bffb56' then NULL
    when '99164d31-36e8-4e3a-b36d-d84a55c115a2' then NULL
    when '54ec75ab-e259-4317-a99d-c507bfd2b059' then '{"VIEENT::TikTok": 6, "VIEENT::YouTube": 7, "VIEENT::Facebook": 5, "VIEENT::Instagram": 5}'::jsonb
    when 'db0a5548-5324-4658-8ecf-3413063461c4' then '{"CAPCUT::TIKTOK CAPCUT": 5, "TIKTOK INDIE::TIKTOK LYRICS": 20, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 25, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0}'::jsonb
    when '5528cd29-6f2d-465d-b122-ce28210af68b' then '{"PAGE VPOP::Thread": 4, "PAGE VPOP::TikTok": 4, "PAGE INDIE::TikTok": 2, "PAGE VPOP::Facebook": 4, "PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3}'::jsonb
    when '66cf7123-8231-42ac-9906-0cf1a2586fc1' then '{"VIEENT::TikTok": 9, "VIEENT::YouTube": 9, "VIEENT::Facebook": 5, "VIEENT::Instagram": 5}'::jsonb
    when '322ad595-1eb2-498a-9079-7c85c7d2a212' then '{"TIKTOK INDIE::TIKTOK LYRICS": 15, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 30}'::jsonb
    when '723f3bfc-2066-4579-b2ec-f437d638778a' then '{"PAGE VPOP::Thread": 2, "PAGE VPOP::TikTok": 4, "PAGE VPOP::Facebook": 4}'::jsonb
    when '5f6208bd-401a-43b3-a214-7def11654c9d' then NULL
    when '720471b5-7d22-4794-9b31-edc2d5daab99' then '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 4, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2}'::jsonb
    when 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4' then NULL
    when '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf' then NULL
    when '30d373c7-f731-4a76-8455-aa2abf672e94' then NULL
    when '11b2f48d-b396-4152-ab1d-c75a157ec2b6' then NULL
    when 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678' then '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 2, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2}'::jsonb
    when '3c7ced09-d4d4-4119-86d4-171b805771f7' then '{"VIEENT::TikTok": 12, "VIEENT::YouTube": 13, "VIEENT::Facebook": 5, "VIEENT::Instagram": 5}'::jsonb
    when '256c846d-2066-4618-beb3-7636258fcc39' then '{"PAGE VPOP::TikTok": 10, "PAGE VPOP::Facebook": 10, "PAGE INDIE::Facebook": 2, "PAGE INDIE::Instagram": 2}'::jsonb
    when '6db25ccf-a99b-45c5-bbde-136f6e725012' then '{"CAPCUT::TIKTOK CAPCUT": 4, "TIKTOK VPOP::TIKTOK LYRICS": 25, "TIKTOK INDIE::TIKTOK LYRICS": 31, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 30, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 6}'::jsonb
    when 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4' then NULL
    when 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa' then '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 4, "VIEENT::Facebook": 4, "VIEENT::Instagram": 4}'::jsonb
    when 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd' then '{"ENVI::TikTok": 3, "ENVI::YouTube": 2, "ENVI::Facebook": 2, "ENVI::Instagram": 2}'::jsonb
    when '780de0a4-052f-4a59-93b1-707502e1d62e' then NULL
    when 'dd38de32-3cf4-4095-8cf6-087693378815' then '{"CAPCUT::TIKTOK CAPCUT": 2, "TIKTOK INDIE::TIKTOK LYRICS": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 2}'::jsonb
    when 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca' then '{"CAPCUT::TIKTOK CAPCUT": 10, "TIKTOK INDIE::TIKTOK LYRICS": 10, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0}'::jsonb
    when '9db2108c-c1b9-4b97-b296-35ef9b2114a0' then '{"VIEENT::TikTok": 3, "VIEENT::YouTube": 4, "VIEENT::Facebook": 3, "VIEENT::Instagram": 3}'::jsonb
    when '6ad9ac2d-7ebf-436d-a665-2143c5a672ba' then '{"PAGE INDIE::TikTok": 2, "PAGE INDIE::Facebook": 4, "PAGE INDIE::Instagram": 4}'::jsonb
    when 'a6eced61-995e-45e6-b2a8-707311b1e009' then NULL
  end)
  or l.metric_quantities is distinct from (case l.id
    when '776ae362-f307-4c38-b39f-6c9cb82499eb' then NULL
    when 'd5a7127d-e174-4ecc-9429-549f42bffb56' then '{"Thruplay (Views)": 20000}'::jsonb
    when '99164d31-36e8-4e3a-b36d-d84a55c115a2' then '{"Thruplay (Views)": 30000}'::jsonb
    when '54ec75ab-e259-4317-a99d-c507bfd2b059' then NULL
    when 'db0a5548-5324-4658-8ecf-3413063461c4' then NULL
    when '5528cd29-6f2d-465d-b122-ce28210af68b' then NULL
    when '66cf7123-8231-42ac-9906-0cf1a2586fc1' then NULL
    when '322ad595-1eb2-498a-9079-7c85c7d2a212' then NULL
    when '723f3bfc-2066-4579-b2ec-f437d638778a' then NULL
    when '5f6208bd-401a-43b3-a214-7def11654c9d' then '{"Thruplay (Views)": 20000}'::jsonb
    when '720471b5-7d22-4794-9b31-edc2d5daab99' then NULL
    when 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4' then '{"Thruplay (Views)": 20000}'::jsonb
    when '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf' then '{"Thruplay (Views)": 20000}'::jsonb
    when '30d373c7-f731-4a76-8455-aa2abf672e94' then '{"Thruplay (Views)": 30000}'::jsonb
    when '11b2f48d-b396-4152-ab1d-c75a157ec2b6' then NULL
    when 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678' then NULL
    when '3c7ced09-d4d4-4119-86d4-171b805771f7' then NULL
    when '256c846d-2066-4618-beb3-7636258fcc39' then NULL
    when '6db25ccf-a99b-45c5-bbde-136f6e725012' then NULL
    when 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4' then '{"Thruplay (Views)": 150000}'::jsonb
    when 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa' then NULL
    when 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd' then NULL
    when '780de0a4-052f-4a59-93b1-707502e1d62e' then '{"Thruplay (Views)": 20000}'::jsonb
    when 'dd38de32-3cf4-4095-8cf6-087693378815' then NULL
    when 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca' then NULL
    when '9db2108c-c1b9-4b97-b296-35ef9b2114a0' then NULL
    when '6ad9ac2d-7ebf-436d-a665-2143c5a672ba' then NULL
    when 'a6eced61-995e-45e6-b2a8-707311b1e009' then '{"Thruplay (Views)": 20000}'::jsonb
  end)
  or l.detail is distinct from (case l.id
    when '776ae362-f307-4c38-b39f-6c9cb82499eb' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when 'd5a7127d-e174-4ecc-9429-549f42bffb56' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when '99164d31-36e8-4e3a-b36d-d84a55c115a2' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when '54ec75ab-e259-4317-a99d-c507bfd2b059' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News/Congrats dự án'
    when 'db0a5548-5324-4658-8ecf-3413063461c4' then '- 20 post tiktok/key track (1 key track)
- 10 post tiktok/side track (3 side track)

- 4 mẫu capcut

 (Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) '
    when '5528cd29-6f2d-465d-b122-ce28210af68b' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News: Thông tin và ý nghĩa của dự án'
    when '66cf7123-8231-42ac-9906-0cf1a2586fc1' then 'New Release: Thông báo ra mắt (2 single + 1 full EP)
Listen Now: Clip ngắn cắt từ MV (nếu có MV)'
    when '322ad595-1eb2-498a-9079-7c85c7d2a212' then '50 kênh tiktok tổng hợp
- Mỗi key track 15 post ( 2 bài, 2 bài có MV)
- Mỗi side track 5 post (3 bài còn lại)'
    when '723f3bfc-2066-4579-b2ec-f437d638778a' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News: Thông tin và ý nghĩa của dự án'
    when '5f6208bd-401a-43b3-a214-7def11654c9d' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when '720471b5-7d22-4794-9b31-edc2d5daab99' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV
- News: Thông tin và ý nghĩa của dự án'
    when 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when '30d373c7-f731-4a76-8455-aa2abf672e94' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when '11b2f48d-b396-4152-ab1d-c75a157ec2b6' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV'
    when '3c7ced09-d4d4-4119-86d4-171b805771f7' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV'
    when '256c846d-2066-4618-beb3-7636258fcc39' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV'
    when '6db25ccf-a99b-45c5-bbde-136f6e725012' then '- 30 post tiktok capcut 
- 31 post tiktok tổng hợp indie
- 25 post tiktok tổng hợp vpop

(Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) '
    when 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV '
    when 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd' then 'New Release: Thông báo ra mắt
Listen Now: Clip ngắn cắt từ MV'
    when '780de0a4-052f-4a59-93b1-707502e1d62e' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
    when 'dd38de32-3cf4-4095-8cf6-087693378815' then '- 10 kênh tiktok tổng hợp 

- 1 mẫu capcut

 (Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) '
    when 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca' then '- 20 post tiktok/key track (1 key track)
- 10 post tiktok/side track (2 side track)

 (Số lượng bài đăng không giới hạn - phụ thuộc vào kế hoạch nội dung nghệ sĩ cần khai thác) '
    when '9db2108c-c1b9-4b97-b296-35ef9b2114a0' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV'
    when '6ad9ac2d-7ebf-436d-a665-2143c5a672ba' then '- New Release: Thông báo ra mắt
- Listen Now: Clip ngắn cắt từ MV'
    when 'a6eced61-995e-45e6-b2a8-707311b1e009' then 'Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút'
  end)
  or l.amount is distinct from (case l.id
    when '776ae362-f307-4c38-b39f-6c9cb82499eb' then 1100000
    when 'd5a7127d-e174-4ecc-9429-549f42bffb56' then 1100000
    when '99164d31-36e8-4e3a-b36d-d84a55c115a2' then 1650000
    when '54ec75ab-e259-4317-a99d-c507bfd2b059' then 4600000
    when 'db0a5548-5324-4658-8ecf-3413063461c4' then 35000000
    when '5528cd29-6f2d-465d-b122-ce28210af68b' then 4000000
    when '66cf7123-8231-42ac-9906-0cf1a2586fc1' then 5600000
    when '322ad595-1eb2-498a-9079-7c85c7d2a212' then 31500000
    when '723f3bfc-2066-4579-b2ec-f437d638778a' then 2000000
    when '5f6208bd-401a-43b3-a214-7def11654c9d' then 1100000
    when '720471b5-7d22-4794-9b31-edc2d5daab99' then 2200000
    when 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4' then 1100000
    when '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf' then 1100000
    when '30d373c7-f731-4a76-8455-aa2abf672e94' then 1650000
    when '11b2f48d-b396-4152-ab1d-c75a157ec2b6' then 1100000
    when 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678' then 2400000
    when '3c7ced09-d4d4-4119-86d4-171b805771f7' then 7000000
    when '256c846d-2066-4618-beb3-7636258fcc39' then 4800000
    when '6db25ccf-a99b-45c5-bbde-136f6e725012' then 67200000
    when 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4' then 8250000
    when 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa' then 2000000
    when 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd' then 1800000
    when '780de0a4-052f-4a59-93b1-707502e1d62e' then 1100000
    when 'dd38de32-3cf4-4095-8cf6-087693378815' then 6300000
    when 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca' then 28000000
    when '9db2108c-c1b9-4b97-b296-35ef9b2114a0' then 2600000
    when '6ad9ac2d-7ebf-436d-a665-2143c5a672ba' then 2000000
    when 'a6eced61-995e-45e6-b2a8-707311b1e009' then 1100000
  end)
)
order by r.title, cat.name, l.brand;
