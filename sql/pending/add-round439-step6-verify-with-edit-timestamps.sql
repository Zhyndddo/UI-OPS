-- Round 439 -- step6 v2 (read-only). Same mismatch detection as Round 433's
-- step6-final-verify-all-fields.sql, but adds two timestamp columns so a
-- flagged line can be told apart from real work without archaeology:
--
--   latest_category_update   -- the most recent updated_at across every
--                                media_booking_package_categories row for
--                                this RELEASE + this line's category (any
--                                brand under it). This only moves when
--                                someone Summarizes that Hạng Mục for real
--                                (handleSummarize always upserts categories
--                                alongside the line -- see that function's
--                                own comments in app/tickets/media-booking/
--                                page.js) or via resyncReleasePackages.
--
--   latest_entry_snapshot     -- the most recent updated_at across every
--                                media_booking_package_entry_snapshots row
--                                for THIS PACKAGE + this line's category
--                                (any brand). This is the strongest signal:
--                                it's written ONLY by saveEntrySnapshot,
--                                called right alongside syncPackageLine in
--                                handleSummarize -- i.e. it only moves when
--                                a human had this exact package's tab open
--                                and clicked Summarize. A resync-style bulk
--                                write never touches this table at all.
--
-- How to read a flagged row:
--   - latest_entry_snapshot is recent (matches roughly when the value
--     changed) -> real human edit on this package. Not corruption.
--   - latest_entry_snapshot is old/NULL but the line's value just changed
--     anyway -> nothing legitimate wrote it. That's the bypass-write
--     signature the original bug had. Worth investigating who/what touched
--     it (direct SQL, a stray script, or a genuinely new code path).
--
-- Same 28 originally-restored line ids as Round 433's step6 (plus this
-- covers only those -- it is NOT a general going-forward monitor; see
-- add-round439-locked-package-drift-monitor.sql for that).
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
  l.quantity as current_quantity,
  l.brand_column_quantities as current_brand_column_quantities,
  l.amount as current_amount,
  -- The two "is this real work" signals -- see the header comment.
  (
    select max(c.updated_at) from media_booking_package_categories c
    where c.release_id = r.id and c.category_id = l.category_id
  ) as latest_category_update,
  (
    select max(s.updated_at) from media_booking_package_entry_snapshots s
    where s.package_id = l.package_id and s.category_id = l.category_id
  ) as latest_entry_snapshot
from media_booking_package_lines l
join media_booking_packages pkg on pkg.id = l.package_id
join releases r on r.id = pkg.release_id
join package_categories cat on cat.id = l.category_id
where l.id in (
  '776ae362-f307-4c38-b39f-6c9cb82499eb','d5a7127d-e174-4ecc-9429-549f42bffb56','99164d31-36e8-4e3a-b36d-d84a55c115a2',
  '54ec75ab-e259-4317-a99d-c507bfd2b059','db0a5548-5324-4658-8ecf-3413063461c4','5528cd29-6f2d-465d-b122-ce28210af68b',
  '66cf7123-8231-42ac-9906-0cf1a2586fc1','322ad595-1eb2-498a-9079-7c85c7d2a212','723f3bfc-2066-4579-b2ec-f437d638778a',
  '5f6208bd-401a-43b3-a214-7def11654c9d','720471b5-7d22-4794-9b31-edc2d5daab99','c81da73a-1a7d-4623-9d34-0f6b24a0b2e4',
  '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf','30d373c7-f731-4a76-8455-aa2abf672e94','11b2f48d-b396-4152-ab1d-c75a157ec2b6',
  'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678','3c7ced09-d4d4-4119-86d4-171b805771f7','256c846d-2066-4618-beb3-7636258fcc39',
  '6db25ccf-a99b-45c5-bbde-136f6e725012','a17718a6-e7a5-48e9-a2d0-ee1b905205e4','fc9bfe9e-8304-4ad1-9e2a-19beea0590fa',
  'f72b6fe1-8fc5-419e-9b6f-48ce151670cd','780de0a4-052f-4a59-93b1-707502e1d62e','dd38de32-3cf4-4095-8cf6-087693378815',
  'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca','9db2108c-c1b9-4b97-b296-35ef9b2114a0','6ad9ac2d-7ebf-436d-a665-2143c5a672ba',
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
)
order by r.title, cat.name, l.brand;
