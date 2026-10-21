-- Round 513 — ALIGN a tier's DSP GRID (and its rollup) to that tier's own package line (restored lines + every other tier whose grid disagrees with its line).
-- Why: the Round 510 restore put the right numbers back on the package LINES (and locked them), but every tier's grid
-- behind the line was still a copy of one shared grid (e.g. #NOTAPRINCESS 2 năm TikTok: line 35, grid 50). Pressing Summarize
-- and answering OK on the lock prompt would have replaced 35 with 50. This makes the grid say the same as the line.
--
-- Scope: 145 lines listed below — the Round 510 restored/locked lines (restored=true; includes YouTube Ads) PLUS the other Social / Community / TikTok Channel
-- tiers whose line total equals the sum of its own Cells but whose grid does not (restored=false). Ads and old-style lines with no Cells are left alone.
-- What it changes: media_booking_content_entries rows of those tiers (counts only; nothing is deleted — extra duplicate rows
-- are set to 0), the matching media_booking_package_categories rollups, and ADDs a few missing grid rows (46 rows).
-- It never touches the package lines, other tiers, Chi Tiết wording, prices or any other release.
-- Safe: every UPDATE only applies if the row STILL has the value seen in the 13 Oct backup AND its line still has the
-- same total + Cells (restored lines must still be locked). Backup copies are kept. Re-runnable (second run changes nothing). No Round 418 resync (it no longer exists).
--
-- STEP 1  run the STEP 1 block (creates worklists + backup copies + shows a preview). Read the preview.
-- (optional) leave a line out:  delete from package_grid_lines_r513 where line_id = '<id>';   (its grid rows then won't change)
-- STEP 2  run the STEP 2 block, then the CHECK query.
-- UNDO    UNDO block at the bottom.

-- ===== STEP 1 =====
create table if not exists package_grid_lines_r513 (line_id uuid primary key, line_qty int, line_cells jsonb, restored boolean not null default true);
insert into package_grid_lines_r513 (line_id, line_qty, line_cells, restored) values
  -- ##D#-01112026-0084 | #NOTAPRINCESS | Độc Quyền 5 năm | Community
  ('6c755407-3883-41ac-9e2f-bae5bebbac9b'::uuid, 21, $j${"PAGE INDIE::Facebook": 7, "PAGE INDIE::Instagram": 7, "PAGE INDIE::TikTok": 7}$j$::jsonb, true),
  -- NETN-14082026-0476 | Ngày Em Vu Quy | Độc Quyền 5 năm | Social
  ('873547e9-2d51-4195-bb88-3edc38e90442'::uuid, 12, $j${"ENVI::Facebook": 3, "ENVI::Instagram": 3, "ENVI::TikTok": 3, "ENVI::YouTube": 3}$j$::jsonb, true),
  -- TIS#-18082026-0504 | Then I Met You | Độc Quyền 2 năm | TikTok Channel
  ('6e2ce628-0fd0-46d2-b425-0df8ce4eb7c2'::uuid, 35, $j${"CAPCUT::TIKTOK CAPCUT": 15, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 6, "TIKTOK INDIE::TIKTOK LYRICS": 14}$j$::jsonb, true),
  -- AHCS-08092026-0488 | Anh Hứa  | Độc Quyền 5 năm | TikTok Channel
  ('61602cc2-5475-4ace-b97e-b17ce9f2381e'::uuid, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, true),
  -- SCTT-20082026-0485 | SODA CREAM | Độc Quyền 2 năm | Community
  ('d8e42045-b157-404c-b990-ef3abbb73906'::uuid, 9, $j${"PAGE VPOP::Facebook": 9}$j$::jsonb, true),
  -- HPNN-21082026-0503 | Hạnh Phúc Được Nhìn Mẹ Cười | Độc Quyền Vĩnh Viễn | Social
  ('0ac30a10-5705-443a-929c-737bcb0f5573'::uuid, 19, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 3}$j$::jsonb, true),
  -- HPNN-21082026-0503 | Hạnh Phúc Được Nhìn Mẹ Cười | Độc Quyền Vĩnh Viễn | Community
  ('67fe4604-cf55-43c7-a138-9e932153486c'::uuid, 12, $j${"PAGE BOLERO / MT::Facebook": 1, "PAGE BOLERO / MT::YouTube": 3, "PAGE VPOP::Facebook": 4, "PAGE VPOP::TikTok": 4}$j$::jsonb, true),
  -- HPNN-21082026-0503 | Hạnh Phúc Được Nhìn Mẹ Cười | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads
  ('70ecba35-7fdf-46ca-941d-1fe557c4f3a3'::uuid, 30000, NULL, true),
  -- HPNN-21082026-0503 | Hạnh Phúc Được Nhìn Mẹ Cười | Độc Quyền Vĩnh Viễn | TikTok Channel
  ('508e17ea-631f-436e-a765-70d2ae6afd21'::uuid, 30, $j${"CAPCUT::TIKTOK CAPCUT": 2, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb, true),
  -- BYLN-20082026-0512 | Bình Yên Là Tự Rời Đi  | Độc Quyền 2 năm | TikTok Channel
  ('273195bf-2e82-41d8-9ce9-bf5ce8a52dca'::uuid, 15, $j${"CAPCUT::TIKTOK CAPCUT": 2, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, true),
  -- OD20010126-0702 | One Day | Độc Quyền 2 năm | TikTok Channel
  ('1f0e7f03-9e08-46c7-bfab-a332f826a1a4'::uuid, 0, $j${"TIKTOK BOLERO / MT::TIKTOK LYRICS": 3, "TIKTOK VPOP::TIKTOK CAPCUT": 1, "TIKTOK VPOP::TIKTOK NEWS": 1}$j$::jsonb, true),
  -- LNNH-20082026-0480 | Lặng Nhìn Yêu Thương | Độc Quyền 2 năm | Community
  ('7ec01d07-1dda-431c-81ac-b7e101ca55e4'::uuid, 9, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::TikTok": 3}$j$::jsonb, true),
  -- MKSB-14082026-0481 | Mình Không Chia Tay	 | Độc Quyền 5 năm | TikTok Channel
  ('a00c1ab0-b059-442e-8557-d79923f0a655'::uuid, 20, $j${"EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "TIKTOK INDIE::TIKTOK CAPCUT": 5, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb, true),
  -- MKSB-14082026-0481 | Mình Không Chia Tay	 | Độc Quyền 2 năm | Community
  ('ea037666-54e5-40f9-93ac-79ffa6519a00'::uuid, 15, $j${"PAGE INDIE::Facebook": 5, "PAGE INDIE::Instagram": 5, "PAGE INDIE::Thread": 1, "PAGE INDIE::TikTok": 4}$j$::jsonb, true),
  -- MKSB-14082026-0481 | Mình Không Chia Tay	 | Độc Quyền 5 năm | Community
  ('aa1538a0-c08b-4559-9b8b-1bb0c1e18be4'::uuid, 9, $j${"PAGE BOLERO / MT::Facebook": 0, "PAGE INDIE::Facebook": 5, "PAGE INDIE::Instagram": 5, "PAGE INDIE::TikTok": 5}$j$::jsonb, true),
  -- MKSB-14082026-0481 | Mình Không Chia Tay	 | Độc Quyền 5 năm | Ads / YouTube Ads
  ('52891b25-b764-485d-8245-fa2523ad8a11'::uuid, 20000, NULL, true),
  -- LNNH-20082026-0480 | Lặng Nhìn Yêu Thương | Độc Quyền 2 năm | TikTok Channel
  ('31d6a82b-5f7b-4c72-afb2-739d6a7d158c'::uuid, 10, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb, true),
  -- TVDV-05092026-0003 | tìm và trốn | Độc Quyền 5 năm | Social
  ('88c76b7f-bfc6-42cb-bc1a-517b5ac17cf2'::uuid, 13, $j${"VIEENT::Facebook": 3, "VIEENT::Instagram": 3, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb, true),
  -- TVDV-05092026-0003 | tìm và trốn | Độc Quyền 5 năm | TikTok Channel
  ('7d7e4fe8-c739-4828-9c68-7c3c2c2a5ff1'::uuid, 20, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 7, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 3, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb, true),
  -- MHLX-27082026-0016 | Mang Hồn Việt Đi Muôn Nơi | Độc Quyền 2 năm | TikTok Channel
  ('93e8d0db-0d00-4e53-b989-1655f0e37bbe'::uuid, 15, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb, true),
  -- TIS#-18082026-0504 | Then I Met You | Độc Quyền 2 năm | Social
  ('62986a0b-a98e-4000-95be-6a155697adcb'::uuid, 11, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb, true),
  -- MVH#-04092026-0007 | Một Vài Năm Nữa | Độc Quyền 5 năm | Social
  ('cd353c39-252f-4e8e-bc27-5354f40a4c50'::uuid, 12, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 2}$j$::jsonb, true),
  -- MVH#-04092026-0007 | Một Vài Năm Nữa | Độc Quyền 5 năm | Community
  ('efbd91c0-3977-4812-a62c-d56a750b48e8'::uuid, 15, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::TikTok": 3}$j$::jsonb, true),
  -- MHLX-27082026-0016 | Mang Hồn Việt Đi Muôn Nơi | Độc Quyền 2 năm | Social
  ('9dec9a7c-a1d4-47f1-af6d-3b5b3779519f'::uuid, 9, $j${"ENVI::Facebook": 1, "ENVI::YouTube": 1, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3}$j$::jsonb, true),
  -- LHNB-06092026-0037 | Lỡ Hẹn Câu Hò | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads
  ('fca67e39-f128-4bb1-ad62-c3fbf3d284b7'::uuid, 30000, NULL, true),
  -- LHNB-06092026-0037 | Lỡ Hẹn Câu Hò | Độc Quyền Vĩnh Viễn | TikTok Channel
  ('de4f2353-7d24-454f-846a-7e4f8c374811'::uuid, 30, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, true),
  -- CTTM-17092026-0042 | Cáo Từ | Độc Quyền 5 năm | Social
  ('006d1b93-399f-4cc7-9373-23ad9495372e'::uuid, 12, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 2}$j$::jsonb, true),
  -- CTTM-17092026-0042 | Cáo Từ | Độc Quyền 5 năm | Community
  ('3f75c4fc-f92e-4d01-a35a-35a39a3fe58c'::uuid, 9, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::TikTok": 3}$j$::jsonb, true),
  -- YNĐM-30092028-0041 | Yêu Những Ngày Xa | Độc Quyền 5 năm | Community
  ('47a1a406-fb54-445c-8c01-cf865b2b21d6'::uuid, 7, $j${"PAGE VPOP::Facebook": 4, "PAGE VPOP::TikTok": 3}$j$::jsonb, true),
  -- YNĐM-30092028-0041 | Yêu Những Ngày Xa | Độc Quyền 5 năm | Social
  ('988c7f4d-ba9e-4651-82bd-2d9dbd7fd6b4'::uuid, 11, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb, true),
  -- AĐ#T-07092026-0033 | Anh Được Gì | Độc Quyền 2 năm | Social
  ('5787c0db-8462-408b-b3a4-1ccb0d1da3f1'::uuid, 3, $j${"ENVI::Facebook": 1, "ENVI::Instagram": 1, "ENVI::TikTok": 0, "ENVI::YouTube": 1}$j$::jsonb, true),
  -- YNĐM-30092028-0041 | Yêu Những Ngày Xa | Độc Quyền 5 năm | TikTok Channel
  ('dba12070-6a97-4ed2-ac44-dde5399d9279'::uuid, 30, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 0, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb, true),
  -- HHW#-11092026-0507 | Hèn Hạ | Độc Quyền 2 năm | TikTok Channel
  ('d694d6e2-2167-4bd2-a48a-ee0ea563d802'::uuid, 20, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK INDIE::TIKTOK LYRICS": 10}$j$::jsonb, true),
  -- HCVT-14092026-0058 | Hai Chữ Vợ Chồng | Độc Quyền 5 năm | Ads / YouTube Ads
  ('9bac6d89-9220-46c4-b5b9-6c858376356d'::uuid, 20000, NULL, true),
  -- MLHK-11092026-0061 | Muốn Lấy Anh Làm Chồng | Độc Quyền 2 năm | Social
  ('bc4a7e77-18f4-4b91-b4a8-664cf0e37490'::uuid, 9, NULL, true),
  -- HCVT-14092026-0058 | Hai Chữ Vợ Chồng | Độc Quyền 5 năm | TikTok Channel
  ('ef9ba6cb-ad79-42a8-bb48-db92833242ca'::uuid, 30, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 20}$j$::jsonb, true),
  -- ETH#-16092026-0064 | em từng là cả thế giới trong anh | Độc Quyền 2 năm | Social
  ('c6861f03-8d55-4fd6-bac8-bc3e65e984c2'::uuid, 11, NULL, true),
  -- ENKT-19092026-0079 | Em Nhận Anh Làm Chồng  | Độc Quyền 5 năm | TikTok Channel
  ('47e56512-22c3-4d34-b13b-c1fdd5676b9c'::uuid, 40, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 20}$j$::jsonb, true),
  -- ETDH-26092026-0070 | EP TRƯỚC SAU | Độc Quyền 2 năm | TikTok Channel
  ('1494592d-26d1-4c2e-ae66-f1128a9455f3'::uuid, 35, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 20}$j$::jsonb, true),
  -- ENKT-19092026-0079 | Em Nhận Anh Làm Chồng  | Độc Quyền 5 năm | Social
  ('42222e57-9d6f-4cc2-9c11-c11612e00b96'::uuid, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb, true),
  -- ÁTCT-25092026-0088 | Ánh Trăng Bật Khóc | Độc Quyền Vĩnh Viễn | Community
  ('fab1f4c4-ae7c-4ae9-ac9e-794dca71d3c3'::uuid, 9, $j${"PAGE BOLERO / MT::Facebook": 4, "PAGE BOLERO / MT::YouTube": 5}$j$::jsonb, true),
  -- ETDH-26092026-0070 | EP TRƯỚC SAU | Độc Quyền 2 năm | Community
  ('1ecb3a58-d92d-44a1-9ecb-b4f2e0c6b3b6'::uuid, 14, NULL, true),
  -- ĐHKL-19092026-0080 | Đồng Hương Đồng Nai | Độc Quyền 5 năm | Community
  ('a07da9b9-59c2-445a-8fb4-1511b66e53e5'::uuid, 10, NULL, true),
  -- ĐHKL-19092026-0080 | Đồng Hương Đồng Nai | Độc Quyền 5 năm | Social
  ('23977234-cffe-4a8a-b607-542e5e11df92'::uuid, 9, NULL, true),
  -- ##D#-01112026-0084 | #NOTAPRINCESS | Độc Quyền 5 năm | Social
  ('e1e20223-4e2c-4d8d-b973-5e1d8d3fe87a'::uuid, 27, $j${"VIEENT::Facebook": 4, "VIEENT::Instagram": 4, "VIEENT::TikTok": 9, "VIEENT::YouTube": 10}$j$::jsonb, true),
  -- ÁTCT-25092026-0088 | Ánh Trăng Bật Khóc | Độc Quyền 2 năm | Social
  ('0d882b3b-c67d-4fe7-8bcd-e4cc56e2424a'::uuid, 9, NULL, true),
  -- ##D#-01112026-0084 | #NOTAPRINCESS | Độc Quyền 2 năm | Ads / YouTube Ads
  ('0f72eff0-3e99-44d5-bc7d-0865ce517726'::uuid, 20000, NULL, true),
  -- ##D#-01112026-0084 | #NOTAPRINCESS | Độc Quyền 2 năm | TikTok Channel
  ('b102542c-1bd5-4e58-8605-d3cf81db4bb9'::uuid, 35, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 20}$j$::jsonb, true),
  -- CVTM-24092026-0100 | Chầu Văn Huế  | Độc Quyền 2 năm | Social
  ('dbf06173-9bd9-404e-8e57-0d00d0c0916b'::uuid, 9, NULL, true),
  -- BNTM-24092026-0102 | Bến Nước Sân Đình | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads
  ('f5f7d56b-8157-4cb6-85f8-c0ff2d274906'::uuid, 30000, NULL, true),
  -- CVTM-24092026-0100 | Chầu Văn Huế  | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads
  ('0dad6c1e-9b7f-475e-856d-c233cc757abd'::uuid, 30000, NULL, true),
  -- CVTM-24092026-0100 | Chầu Văn Huế  | Độc Quyền 5 năm | TikTok Channel
  ('8fbb747f-9c4a-470e-8e2f-c6fcc7205337'::uuid, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, true),
  -- BNTM-24092026-0102 | Bến Nước Sân Đình | Độc Quyền 2 năm | Social
  ('e0875db0-c9b9-47a7-88e6-01bb9a22e71e'::uuid, 9, NULL, true),
  -- LRTM-24092026-0101 | Lời Ru Của Mẹ | Độc Quyền 2 năm | Social
  ('98f3cc5c-1b74-410c-b271-b77d37189eeb'::uuid, 9, NULL, true),
  -- LRTM-24092026-0101 | Lời Ru Của Mẹ | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads
  ('2e12a5eb-024a-4d71-913e-433e8c753622'::uuid, 30000, NULL, true),
  -- LRTM-24092026-0101 | Lời Ru Của Mẹ | Độc Quyền Vĩnh Viễn | TikTok Channel
  ('4aa66c9c-8a5d-4006-8330-b48870ce05c6'::uuid, 30, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, true),
  -- NETN-14082026-0476 | Ngày Em Vu Quy | Độc Quyền 2 năm | TikTok Channel
  ('c847953b-7f11-4145-ad84-17bcc995d6ff'::uuid, 14, $j${"EXT TIKTOK - CTV MẪU::MẪU CAPCUT": 1, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, true),
  -- ABLN-21092026-0097 | Anh Biết Rồi  | Độc Quyền 2 năm | Social
  ('a6d5b856-4788-4dd0-b3a0-2956a9b77619'::uuid, 9, NULL, true),
  -- SCTT-20082026-0485 | SODA CREAM | Độc Quyền 2 năm | TikTok Channel
  ('54d5120a-cd00-4e7a-a60f-7c475cf0f045'::uuid, 10, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb, true),
  -- DUVT-30092028-0053 | danger unfinished | Độc Quyền 2 năm | Social
  ('32dc8ebe-e683-40b4-8f20-a71e00d4c1d8'::uuid, 9, $j${"VIEENT::Facebook": 3, "VIEENT::Instagram": 3, "VIEENT::TikTok": 3, "VIEENT::YouTube": 0}$j$::jsonb, true),
  -- BNTM-24092026-0102 | Bến Nước Sân Đình | Độc Quyền Vĩnh Viễn | TikTok Channel
  ('bd81df2f-ef9e-450c-b615-1ac2aa2a3521'::uuid, 30, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, true),
  -- CYĐB-01102026-0116 | Còn Yêu Sao Phải Buông | Độc Quyền 2 năm | Ads / YouTube Ads
  ('f1b23ffa-d9cf-4b45-9944-4376355894cd'::uuid, 5000, NULL, true),
  -- CKLN-20102026-0068 | Chiều Không Gian Khác | Độc Quyền 2 năm | Ads / YouTube Ads
  ('3fc23e48-4003-4a27-b41e-1bcd8b9db540'::uuid, 5000, NULL, true),
  -- CKLN-20102026-0068 | Chiều Không Gian Khác | Độc Quyền 2 năm | Social
  ('8faacbb2-f7e1-4a71-9cdf-b70fd3803eb9'::uuid, 3, $j${"ENVI::Facebook": 1, "ENVI::Instagram": 1, "ENVI::YouTube": 1}$j$::jsonb, true),
  -- ECĐL-29092026-0109 | Em Có Ước Mình Là Mây Trắng | Độc Quyền 2 năm | Ads / YouTube Ads
  ('19dfc5c5-817d-4040-a3f5-500d10d1594b'::uuid, 5000, NULL, true),
  -- ECĐL-29092026-0109 | Em Có Ước Mình Là Mây Trắng | Độc Quyền 2 năm | TikTok Channel
  ('b79f1d17-0656-4c06-aae2-18a3ad351e5c'::uuid, 10, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb, true),
  -- CTLQ-01102026-0112 | Cạn Tàu Ráo Máng | Độc Quyền Vĩnh Viễn | TikTok Channel
  ('3df807c5-c6c0-4571-b76a-b6a9b86fa039'::uuid, 30, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, true),
  -- CTLQ-01102026-0112 | Cạn Tàu Ráo Máng | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads
  ('4889bffc-af06-40f4-9484-e991bf1e67b0'::uuid, 30000, NULL, true),
  -- CYĐB-01102026-0116 | Còn Yêu Sao Phải Buông | Độc Quyền 2 năm | TikTok Channel
  ('34f3d1c7-ce39-49a9-a3ee-ff5c618cd798'::uuid, 10, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, true),
  -- CTLQ-01102026-0112 | Cạn Tàu Ráo Máng | Độc Quyền 2 năm | Ads / YouTube Ads
  ('f7650238-7114-4e14-ace7-35f2bddb12a5'::uuid, 5000, NULL, true),
  -- MLHK-11092026-0061 | Muốn Lấy Anh Làm Chồng | Độc Quyền 2 năm | TikTok Channel
  ('264e3c26-a183-4c1e-ae79-d713382eecf7'::uuid, 10, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, true),
  -- 4VHT-30092026-0120 | 4 Vạn Tình 3 Lối | Độc Quyền 5 năm | TikTok Channel
  ('8667efa5-08fb-4c30-b92a-36d9f2eea075'::uuid, 20, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, true),
  -- THLN-29092026-0065 | Tự Hứa Với Bản Thân | Độc Quyền 2 năm | Social
  ('19e9574a-f212-461e-a73d-c01bb4be4ce9'::uuid, 3, $j${"ENVI::Facebook": 1, "ENVI::Instagram": 1, "ENVI::YouTube": 1}$j$::jsonb, true),
  -- THLN-29092026-0065 | Tự Hứa Với Bản Thân | Độc Quyền 2 năm | Ads / YouTube Ads
  ('1e3f75ed-a6c4-4669-9f20-3fa6ddc416ef'::uuid, 5000, NULL, true),
  -- THLN-29092026-0065 | Tự Hứa Với Bản Thân | Độc Quyền 2 năm | TikTok Channel
  ('568288ff-3338-46a0-8b93-82623a45a987'::uuid, 15, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, true),
  -- T#PP-09102026-0119 | TÌM | Độc Quyền Vĩnh Viễn | TikTok Channel
  ('8491ef86-d3ca-4ae6-8c7f-bce63903c7ca'::uuid, 40, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15, "TIKTOK INDIE::TIKTOK LYRICS": 0}$j$::jsonb, true),
  -- T#PP-09102026-0119 | TÌM | Độc Quyền Vĩnh Viễn | Community
  ('84281c14-0558-4156-b6c9-47cfa2814e1c'::uuid, 10, $j${"PAGE BOLERO / MT::Facebook": 5, "PAGE BOLERO / MT::YouTube": 5}$j$::jsonb, true),
  -- T#PP-09102026-0119 | TÌM | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads
  ('f6fa7d7a-ca21-41cf-afee-fc94de9c88ed'::uuid, 30000, NULL, true),
  -- ĐHKL-19092026-0080 | Đồng Hương Đồng Nai | Độc Quyền 5 năm | TikTok Channel
  ('77d0b53e-a0f3-407d-9b3f-f98fff7bd6da'::uuid, 22, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10, "TIKTOK INDIE::TIKTOK LYRICS": 2}$j$::jsonb, true),
  -- T#PP-09102026-0119 | TÌM | Độc Quyền 5 năm | Ads / YouTube Ads
  ('81aced2f-d882-45e4-84b1-9b1b8deb7d07'::uuid, 20000, NULL, true),
  -- NMHT-15102026-0113 | Nhớ Một Vì Sao  | Độc Quyền 5 năm | Social
  ('1906ca88-0e10-45f1-b569-affe43fd29e4'::uuid, 18, $j${"ENVI::Facebook": 4, "ENVI::Instagram": 4, "ENVI::TikTok": 6, "ENVI::YouTube": 4}$j$::jsonb, true),
  -- NMHT-15102026-0113 | Nhớ Một Vì Sao  | Độc Quyền 5 năm | Community
  ('a3ce1665-c059-4222-b2ca-a6f6d36a32bf'::uuid, 18, NULL, true),
  -- NMHT-15102026-0113 | Nhớ Một Vì Sao  | Độc Quyền 5 năm | Ads / YouTube Ads
  ('0fb5028f-58d7-4cfb-99f4-cf8b1281915c'::uuid, 30000, NULL, true),
  -- T#PP-09102026-0119 | TÌM | Độc Quyền 5 năm | TikTok Channel
  ('73da2d5d-f5c9-497a-8c52-495fbeb71801'::uuid, 30, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15, "TIKTOK INDIE::TIKTOK LYRICS": 0}$j$::jsonb, true),
  -- AMKV-16102026-0121 | Anh Mệt Rồi | Độc Quyền Vĩnh Viễn | TikTok Channel
  ('ffd37e91-e40b-469c-a0fb-60e3ee478ca4'::uuid, 40, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, true),
  -- ÁTCT-25092026-0088 | Ánh Trăng Bật Khóc | Độc Quyền 2 năm | Ads / YouTube Ads
  ('79c2e7e6-8d5e-4234-a156-eba628ff45f3'::uuid, 5000, NULL, true),
  -- ÁTCT-25092026-0088 | Ánh Trăng Bật Khóc | Độc Quyền Vĩnh Viễn | TikTok Channel
  ('dc3e11b3-3092-4a4a-a4b2-4aad44b370b1'::uuid, 40, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, true),
  -- T#PP-09102026-0119 | TÌM | Độc Quyền 2 năm | Social
  ('bdcf6a6b-6381-41c3-a458-330266dc22ef'::uuid, 9, NULL, true),
  -- NMHT-15102026-0113 | Nhớ Một Vì Sao  | Độc Quyền 5 năm | TikTok Channel
  ('be388cd9-7547-46a7-b274-7aedf03db735'::uuid, 48, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::MẪU CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK CAPCUT": 45}$j$::jsonb, true),
  -- 4VHT-30092026-0120 | 4 Vạn Tình 3 Lối | Độc Quyền Vĩnh Viễn | TikTok Channel
  ('95ebcf54-b482-46fa-89fa-1cc0dd12cd0e'::uuid, 30, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, true),
  -- 4VHT-30092026-0120 | 4 Vạn Tình 3 Lối | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads
  ('826a99b2-0a39-4dd8-884a-dcd45a396453'::uuid, 30000, NULL, true),
  -- GVTT-15102026-0104 | Giữ Vẹn Chữ Tòng | Độc Quyền Vĩnh Viễn | TikTok Channel
  ('0d3680f6-de41-4c1a-b353-4104950f1f88'::uuid, 30, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 15, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, true),
  -- AMKV-16102026-0121 | Anh Mệt Rồi | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads
  ('b3878ea1-f2c9-4fef-b2a9-ed84d9033c2b'::uuid, 30000, NULL, true),
  -- AMKV-16102026-0121 | Anh Mệt Rồi | Độc Quyền 5 năm | Ads / YouTube Ads
  ('671ededd-4d74-4541-a946-3cf25d1c9362'::uuid, 20000, NULL, true),
  -- AMKV-16102026-0121 | Anh Mệt Rồi | Độc Quyền 5 năm | Community
  ('ed67b3bf-e1aa-4bd7-84c3-62e9461d1949'::uuid, 6, $j${"PAGE BOLERO / MT::Facebook": 3, "PAGE BOLERO / MT::YouTube": 3}$j$::jsonb, true),
  -- 4VHT-30092026-0120 | 4 Vạn Tình 3 Lối | Độc Quyền 2 năm | Ads / YouTube Ads
  ('f0e16462-db56-4c39-ac04-328b6b90375c'::uuid, 5000, NULL, true),
  -- 4VHT-30092026-0120 | 4 Vạn Tình 3 Lối | Độc Quyền Vĩnh Viễn | Community
  ('fae2a4d0-39d6-4c79-aa2b-f877f8cc44b9'::uuid, 8, $j${"PAGE BOLERO / MT::Facebook": 4, "PAGE BOLERO / MT::YouTube": 4}$j$::jsonb, true),
  -- AMKV-16102026-0121 | Anh Mệt Rồi | Độc Quyền 2 năm | TikTok Channel
  ('7482061f-9e2b-4771-9dc1-f78e9aee34e6'::uuid, 15, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, true),
  -- NCNH-01012028-0127 | Ngày Con Còn Mẹ | Độc Quyền Vĩnh Viễn | Social
  ('480e73c6-20b2-4bf9-8b25-c5de3555c33d'::uuid, 20, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb, true),
  -- C#K#-24092026-0293 | closer | Độc Quyền Vĩnh Viễn | TikTok Channel
  ('efd64e3d-8290-4950-9af3-95dac1a9d0fb'::uuid, 15, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, false),
  -- C#K#-24092026-0293 | closer | Độc Quyền Vĩnh Viễn | Community
  ('90a95a56-2f65-4701-bf4f-0ff2a2bfb83b'::uuid, 6, $j${"PAGE BOLERO / MT::Facebook": 3, "PAGE BOLERO / MT::YouTube": 3}$j$::jsonb, false),
  -- VCKT-01082026-0419 | Ván Cờ Trong Tay | Độc Quyền 5 năm | TikTok Channel
  ('e9dc23e8-3de6-4b93-90e4-f7f40df28f03'::uuid, 20, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 7, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, false),
  -- BYLN-20082026-0512 | Bình Yên Là Tự Rời Đi  | Độc Quyền 5 năm | Social
  ('f72b6fe1-8fc5-419e-9b6f-48ce151670cd'::uuid, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2}$j$::jsonb, false),
  -- C#K#-24092026-0293 | closer | Độc Quyền Vĩnh Viễn | Social
  ('93d853ee-04e2-4bb5-8467-1566f3524cba'::uuid, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb, false),
  -- C#K#-24092026-0293 | closer | Độc Quyền 2 năm | Social
  ('ffc6e782-0425-4470-9cfa-c723311c2f34'::uuid, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb, false),
  -- TNTN-27082026-0010 | The Next Artist (Live at Final Stage) | Độc Quyền 5 năm | Social
  ('3c7ced09-d4d4-4119-86d4-171b805771f7'::uuid, 35, $j${"VIEENT::Facebook": 5, "VIEENT::Instagram": 5, "VIEENT::TikTok": 12, "VIEENT::YouTube": 13}$j$::jsonb, false),
  -- TNTN-27082026-0010 | The Next Artist (Live at Final Stage) | Độc Quyền 5 năm | Community
  ('256c846d-2066-4618-beb3-7636258fcc39'::uuid, 24, $j${"PAGE INDIE::Facebook": 2, "PAGE INDIE::Instagram": 2, "PAGE VPOP::Facebook": 10, "PAGE VPOP::TikTok": 10}$j$::jsonb, false),
  -- C#K#-24092026-0293 | closer | Độc Quyền 2 năm | TikTok Channel
  ('020a72d1-ed5c-4be1-b6f9-5f976dd4e3f7'::uuid, 15, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, false),
  -- CĐKM-04102026-0129 | Cứ Để Em Ở Lại | Độc Quyền 5 năm | Social
  ('e68a6f5d-66cc-4bd1-82c3-841152751368'::uuid, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb, false),
  -- KMTT-02102026-0125 | Kẻ Mua Câu Hát (New Version) | Internal Package | TikTok Channel
  ('dfa42503-9dbc-49f4-95d9-0b4def92afea'::uuid, 10, $j${"CAPCUT::TIKTOK CAPCUT": 5, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb, false),
  -- ECĐL-29092026-0109 | Em Có Ước Mình Là Mây Trắng | Độc Quyền 5 năm | Community
  ('51abf5e3-de85-4eda-8380-8195fb0546f6'::uuid, 8, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::TikTok": 2}$j$::jsonb, false),
  -- ECĐL-29092026-0109 | Em Có Ước Mình Là Mây Trắng | Độc Quyền 5 năm | Social
  ('b1618003-cb52-43c4-9187-d11f7ebc7715'::uuid, 11, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb, false),
  -- CTLQ-01102026-0112 | Cạn Tàu Ráo Máng | Độc Quyền 5 năm | Community
  ('b4086bb3-064d-4a94-b377-93caa0553e76'::uuid, 4, $j${"PAGE BOLERO / MT::Facebook": 2, "PAGE BOLERO / MT::YouTube": 2}$j$::jsonb, false),
  -- HHW#-11092026-0507 | Hèn Hạ | Độc Quyền 5 năm | TikTok Channel
  ('bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca'::uuid, 40, $j${"CAPCUT::TIKTOK CAPCUT": 10, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK INDIE::TIKTOK LYRICS": 10}$j$::jsonb, false),
  -- TONO-08102026-0032 | The Other Side Of Regret | Độc Quyền 5 năm | Social
  ('66cf7123-8231-42ac-9906-0cf1a2586fc1'::uuid, 28, $j${"VIEENT::Facebook": 5, "VIEENT::Instagram": 5, "VIEENT::TikTok": 9, "VIEENT::YouTube": 9}$j$::jsonb, false),
  -- TONO-08102026-0032 | The Other Side Of Regret | Độc Quyền 5 năm | Community
  ('a9f1e09e-40d6-4499-b55b-302b1e27f716'::uuid, 22, $j${"PAGE INDIE::Facebook": 8, "PAGE INDIE::Instagram": 8, "PAGE INDIE::TikTok": 6}$j$::jsonb, false),
  -- HTNB-14092026-0066 | Hãy Thật Lòng Đi | Độc Quyền 5 năm | Community
  ('fb3d0145-1431-49e5-9584-66413913b685'::uuid, 9, $j${"PAGE BOLERO / MT::Facebook": 4, "PAGE BOLERO / MT::YouTube": 5}$j$::jsonb, false),
  -- HTNB-14092026-0066 | Hãy Thật Lòng Đi | Độc Quyền 5 năm | Social
  ('7169e178-a7de-4284-a512-68185ac485a5'::uuid, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb, false),
  -- HTNB-14092026-0066 | Hãy Thật Lòng Đi | Độc Quyền 5 năm | TikTok Channel
  ('13378cf7-04b2-4dd5-b02c-3aceea537cbb'::uuid, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, false),
  -- NĐH#-17092026-0081 | Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo) | Độc Quyền 5 năm | Social
  ('720471b5-7d22-4794-9b31-edc2d5daab99'::uuid, 11, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb, false),
  -- ETH#-16092026-0064 | em từng là cả thế giới trong anh | Độc Quyền 5 năm | Community
  ('5528cd29-6f2d-465d-b122-ce28210af68b'::uuid, 20, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::TikTok": 2, "PAGE VPOP::Facebook": 4, "PAGE VPOP::Thread": 4, "PAGE VPOP::TikTok": 4}$j$::jsonb, false),
  -- TVDV-05092026-0003 | tìm và trốn | Độc Quyền 2 năm | TikTok Channel
  ('dd38de32-3cf4-4095-8cf6-087693378815'::uuid, 9, $j${"CAPCUT::TIKTOK CAPCUT": 2, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 2, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb, false),
  -- ETH#-16092026-0064 | em từng là cả thế giới trong anh | Độc Quyền 5 năm | TikTok Channel
  ('3abc7229-97df-4b87-9803-1c3a2fc9b789'::uuid, 25, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 5, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb, false),
  -- HHW#-11092026-0507 | Hèn Hạ | Độc Quyền 5 năm | Social
  ('9db2108c-c1b9-4b97-b296-35ef9b2114a0'::uuid, 13, $j${"VIEENT::Facebook": 3, "VIEENT::Instagram": 3, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb, false),
  -- HHW#-11092026-0507 | Hèn Hạ | Độc Quyền 5 năm | Community
  ('6ad9ac2d-7ebf-436d-a665-2143c5a672ba'::uuid, 10, $j${"PAGE INDIE::Facebook": 4, "PAGE INDIE::Instagram": 4, "PAGE INDIE::TikTok": 2}$j$::jsonb, false),
  -- MNDT-18092026-0069 | Mãi Như Lúc Đầu | Độc Quyền 5 năm | TikTok Channel
  ('c9aeef99-9d5a-41c3-a1da-7bb84d33122d'::uuid, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, false),
  -- ETDH-26092026-0070 | EP TRƯỚC SAU | Độc Quyền 5 năm | Social
  ('54ec75ab-e259-4317-a99d-c507bfd2b059'::uuid, 23, $j${"VIEENT::Facebook": 5, "VIEENT::Instagram": 5, "VIEENT::TikTok": 6, "VIEENT::YouTube": 7}$j$::jsonb, false),
  -- NĐH#-17092026-0081 | Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo) | Độc Quyền 5 năm | Community
  ('723f3bfc-2066-4579-b2ec-f437d638778a'::uuid, 10, $j${"PAGE VPOP::Facebook": 4, "PAGE VPOP::Thread": 2, "PAGE VPOP::TikTok": 4}$j$::jsonb, false),
  -- ÁTCT-25092026-0088 | Ánh Trăng Bật Khóc | Độc Quyền 5 năm | TikTok Channel
  ('099bc560-51de-47f3-8590-4e0d5feff500'::uuid, 30, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, false),
  -- HIW#-24092026-0091 | HIKARI II | Độc Quyền 2 năm | TikTok Channel
  ('dc193d4b-3ab7-4374-840c-4f820ce3e683'::uuid, 10, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 2, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb, false),
  -- NTNL-26092026-0095 |  Người Thương Bỏ Kẻ Tầm Thường | Độc Quyền 5 năm | Community
  ('91075af3-d108-4eed-a054-459366262c5e'::uuid, 9, $j${"PAGE BOLERO / MT::Facebook": 4, "PAGE BOLERO / MT::YouTube": 5}$j$::jsonb, false),
  -- NTNL-26092026-0095 |  Người Thương Bỏ Kẻ Tầm Thường | Độc Quyền 5 năm | Social
  ('f447e862-0a3b-4ed4-8f9e-4aafb079c38b'::uuid, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb, false),
  -- NTNL-26092026-0095 |  Người Thương Bỏ Kẻ Tầm Thường | Độc Quyền 5 năm | TikTok Channel
  ('e87b3bf4-6653-42e6-9412-9e3a784028cb'::uuid, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, false),
  -- ABLN-21092026-0097 | Anh Biết Rồi  | Độc Quyền 2 năm | TikTok Channel
  ('6cce0f48-ce4f-4fd1-aa4c-74ac3c41d794'::uuid, 15, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, false),
  -- C#K#-24092026-0293 | closer | Độc Quyền 5 năm | Community
  ('4aef2f26-60c3-4fa5-9f64-0a6b81e2fcad'::uuid, 4, $j${"PAGE BOLERO / MT::Facebook": 2, "PAGE BOLERO / MT::YouTube": 2}$j$::jsonb, false),
  -- C#K#-24092026-0293 | closer | Độc Quyền 5 năm | Social
  ('e0097ed8-b222-41a9-8829-221fe6616fd3'::uuid, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb, false),
  -- C#K#-24092026-0293 | closer | Độc Quyền 5 năm | TikTok Channel
  ('103c6fb8-9e2a-449f-912c-bdd5e5e67097'::uuid, 20, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, false),
  -- GCNB-03102026-0130 | Giữ Chút Tâm Tình Cho Em | Độc Quyền 5 năm | Community
  ('50b5053b-ba3c-41db-b880-7d19576b7c08'::uuid, 9, $j${"PAGE BOLERO / MT::Facebook": 4, "PAGE BOLERO / MT::YouTube": 5}$j$::jsonb, false),
  -- GCNB-03102026-0130 | Giữ Chút Tâm Tình Cho Em | Độc Quyền 5 năm | Social
  ('e069fee5-e288-4a99-831c-55a1b9117fb6'::uuid, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb, false),
  -- GCNB-03102026-0130 | Giữ Chút Tâm Tình Cho Em | Độc Quyền 5 năm | TikTok Channel
  ('bcc570d6-47a1-4de1-8e57-df6a37150ead'::uuid, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, false),
  -- CĐKM-04102026-0129 | Cứ Để Em Ở Lại | Độc Quyền 5 năm | Community
  ('b0259c43-a7d9-4750-8c8d-1991819a5255'::uuid, 9, $j${"PAGE BOLERO / MT::Facebook": 4, "PAGE BOLERO / MT::YouTube": 5}$j$::jsonb, false),
  -- CĐKM-04102026-0129 | Cứ Để Em Ở Lại | Độc Quyền 5 năm | TikTok Channel
  ('5dca41b6-eec0-490e-9d36-d24a0077d2e5'::uuid, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, false),
  -- T#TN-08102026-0123 | thoiquen | Độc Quyền 2 năm | Social
  ('2d963167-4142-4992-8c39-daccf7abfd31'::uuid, 3, $j${"VIEENT::Facebook": 1, "VIEENT::Instagram": 1, "VIEENT::YouTube": 1}$j$::jsonb, false),
  -- HIW#-24092026-0091 | HIKARI II | Độc Quyền 2 năm | Social
  ('521fe53f-65eb-45c1-ab41-fa5282a33202'::uuid, 3, $j${"VIEENT::Facebook": 1, "VIEENT::Instagram": 1, "VIEENT::YouTube": 1}$j$::jsonb, false),
  -- HIW#-24092026-0091 | HIKARI II | Độc Quyền 2 năm | Community
  ('24f2eb89-4297-44a7-a299-809931ab9ca5'::uuid, 8, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::TikTok": 2}$j$::jsonb, false)
on conflict (line_id) do nothing;

create table if not exists package_grid_fix_r513 (
  entry_id uuid primary key, line_id uuid not null,
  old_cc int, old_posts int, old_tung int, old_out int, old_listen int, old_addin int,
  new_cc int, new_posts int, new_tung int, new_out int, new_listen int, new_addin int);
insert into package_grid_fix_r513 values
  ('8a448b25-9c41-4fc0-b646-81c5666c0fd4'::uuid,'6c755407-3883-41ac-9e2f-bae5bebbac9b'::uuid,1,0,0,1,0,0,1,0,0,0,0,0),
  ('ad46a2aa-913c-4c7b-84da-e764f615efd8'::uuid,'6c755407-3883-41ac-9e2f-bae5bebbac9b'::uuid,1,0,0,1,0,0,1,0,0,7,0,0),
  ('4726dc14-98c0-4726-ba86-21f4ee68b052'::uuid,'873547e9-2d51-4195-bb88-3edc38e90442'::uuid,1,0,0,1,1,0,1,0,0,1,2,0),
  ('0029ca0e-fb04-4e01-aee0-54254117b045'::uuid,'873547e9-2d51-4195-bb88-3edc38e90442'::uuid,1,0,0,1,1,0,1,0,0,1,2,0),
  ('3193fd9b-9d7e-4b64-8b7a-b6e54bbfe004'::uuid,'873547e9-2d51-4195-bb88-3edc38e90442'::uuid,1,0,0,1,1,0,1,0,0,1,2,0),
  ('d87d07ba-c006-484b-aefa-5bf198df7321'::uuid,'6e2ce628-0fd0-46d2-b425-0df8ce4eb7c2'::uuid,6,2,0,0,0,0,6,0,0,0,0,0),
  ('6cb0842e-4b17-4446-9f3e-29f3cb388d0d'::uuid,'6e2ce628-0fd0-46d2-b425-0df8ce4eb7c2'::uuid,5,2,0,0,0,0,5,3,0,0,0,0),
  ('be2019a0-e935-4890-ab6f-b0e02d50383e'::uuid,'6e2ce628-0fd0-46d2-b425-0df8ce4eb7c2'::uuid,7,6,0,0,0,0,7,2,0,0,0,0),
  ('07d542da-4dc0-4489-ac88-22cd2a6a1f3c'::uuid,'61602cc2-5475-4ace-b97e-b17ce9f2381e'::uuid,0,1,0,0,0,0,1,10,0,0,0,0),
  ('fee88448-a07b-4528-8b03-11a9a812f8f8'::uuid,'61602cc2-5475-4ace-b97e-b17ce9f2381e'::uuid,3,1,0,0,0,0,3,0,0,0,0,0),
  ('1f8fc1b8-6573-4c26-ad2a-72f028c95d1e'::uuid,'d8e42045-b157-404c-b990-ef3abbb73906'::uuid,1,0,0,1,1,0,1,0,0,0,0,0),
  ('9734b281-e510-467f-821b-67c46047d406'::uuid,'d8e42045-b157-404c-b990-ef3abbb73906'::uuid,1,0,0,1,1,0,1,0,0,0,0,0),
  ('2a9520d3-de73-42fd-ae8a-277121b19738'::uuid,'d8e42045-b157-404c-b990-ef3abbb73906'::uuid,1,0,0,1,0,0,1,0,0,0,0,0),
  ('9dbb32fa-cd75-4948-8e9d-59a3c347b97f'::uuid,'d8e42045-b157-404c-b990-ef3abbb73906'::uuid,1,0,0,1,0,0,1,0,0,0,0,0),
  ('29a920e1-22ff-45ab-a6ce-ae755ac584a3'::uuid,'d8e42045-b157-404c-b990-ef3abbb73906'::uuid,2,0,0,1,1,0,1,0,0,1,8,0),
  ('86b4ab1a-b576-447f-b21f-54f9abb141d4'::uuid,'d8e42045-b157-404c-b990-ef3abbb73906'::uuid,2,0,0,0,0,2,2,0,0,0,0,0),
  ('7a372638-dd0b-4a2b-bd3d-db3e95ed2bac'::uuid,'67fe4604-cf55-43c7-a138-9e932153486c'::uuid,1,0,0,0,0,0,1,0,0,0,1,0),
  ('e229cfcd-e0a3-4a69-a551-78e1377958fa'::uuid,'70ecba35-7fdf-46ca-941d-1fe557c4f3a3'::uuid,1,20000,0,0,0,0,1,30000,0,0,0,0),
  ('5f285e38-a6d4-4df8-8415-247306cea07a'::uuid,'508e17ea-631f-436e-a765-70d2ae6afd21'::uuid,0,1,0,0,0,0,1,10,0,0,0,0),
  ('e1730893-4107-4ac6-ad40-f04f8fb6b7e4'::uuid,'273195bf-2e82-41d8-9ce9-bf5ce8a52dca'::uuid,4,1,0,0,0,0,1,2,0,0,0,0),
  ('f0d6fd7c-890c-4b35-a30f-90a29d77b1b4'::uuid,'273195bf-2e82-41d8-9ce9-bf5ce8a52dca'::uuid,8,1,0,0,0,0,8,0,0,0,0,0),
  ('34813234-d9c1-4f5f-bc4e-b013b8fd4e9c'::uuid,'7ec01d07-1dda-431c-81ac-b7e101ca55e4'::uuid,1,0,0,0,0,2,1,0,0,0,0,0),
  ('3d55d3e4-5d5e-4f0c-b707-772c7c602e6a'::uuid,'a00c1ab0-b059-442e-8557-d79923f0a655'::uuid,2,1,0,0,0,0,2,0,0,0,0,0),
  ('2c5f06ad-51d8-4f07-a424-7a4524f23134'::uuid,'a00c1ab0-b059-442e-8557-d79923f0a655'::uuid,0,1,0,0,0,0,1,10,0,0,0,0),
  ('a5e1138f-0885-4270-b52b-c63fbf75f5f5'::uuid,'a00c1ab0-b059-442e-8557-d79923f0a655'::uuid,3,1,0,0,0,0,3,0,0,0,0,0),
  ('bb3411e4-fa94-4210-b39d-14f972e716f8'::uuid,'aa1538a0-c08b-4559-9b8b-1bb0c1e18be4'::uuid,1,0,0,1,0,1,1,0,0,0,0,0),
  ('bed176ea-0b67-4585-b8c5-d69d4ee75a13'::uuid,'aa1538a0-c08b-4559-9b8b-1bb0c1e18be4'::uuid,1,0,0,0,0,1,1,0,0,0,0,0),
  ('56ee31fe-ed15-4285-94ec-0ed9a4dc913a'::uuid,'aa1538a0-c08b-4559-9b8b-1bb0c1e18be4'::uuid,1,0,0,1,1,0,1,0,0,1,4,0),
  ('5a8dda1b-f2d1-4da3-ba0b-75ac8bda20a6'::uuid,'52891b25-b764-485d-8245-fa2523ad8a11'::uuid,1,5000,0,0,0,0,1,20000,0,0,0,0),
  ('49eb8fe0-b963-436c-a9b5-6f7c84b83832'::uuid,'31d6a82b-5f7b-4c72-afb2-739d6a7d158c'::uuid,10,1,0,0,0,0,10,0,0,0,0,0),
  ('9f6d1d52-8caf-498c-ae80-9a696f283c3e'::uuid,'88c76b7f-bfc6-42cb-bc1a-517b5ac17cf2'::uuid,1,0,0,1,1,0,1,0,0,1,2,0),
  ('b2419e52-b7a3-4818-83aa-067e60d02a96'::uuid,'88c76b7f-bfc6-42cb-bc1a-517b5ac17cf2'::uuid,1,0,0,1,1,0,1,0,0,1,2,0),
  ('3b2bdb3d-6ff1-4c71-8024-8c502b004582'::uuid,'7d7e4fe8-c739-4828-9c68-7c3c2c2a5ff1'::uuid,3,1,0,0,0,0,1,5,0,0,0,0),
  ('e56f3b91-65c8-4d94-aca2-95b5b8057380'::uuid,'7d7e4fe8-c739-4828-9c68-7c3c2c2a5ff1'::uuid,0,1,0,0,0,0,1,7,0,0,0,0),
  ('6acbf040-aade-4381-bddb-5772144cd8c0'::uuid,'7d7e4fe8-c739-4828-9c68-7c3c2c2a5ff1'::uuid,2,1,0,0,0,0,1,3,0,0,0,0),
  ('2b0a3b77-8331-405d-8f1c-d3b676f18017'::uuid,'93e8d0db-0d00-4e53-b989-1655f0e37bbe'::uuid,5,1,0,0,0,0,5,2,0,0,0,0),
  ('233db3a7-b64d-4a80-8cad-181837708fa3'::uuid,'62986a0b-a98e-4000-95be-6a155697adcb'::uuid,1,0,0,1,3,0,1,0,0,1,1,0),
  ('780837e6-afbe-4612-af03-5428f5507a12'::uuid,'62986a0b-a98e-4000-95be-6a155697adcb'::uuid,1,0,0,1,3,0,1,0,0,1,1,0),
  ('4fe84a3b-86c6-4542-b22e-19dea986a15a'::uuid,'62986a0b-a98e-4000-95be-6a155697adcb'::uuid,1,0,0,0,6,0,1,0,0,0,3,0),
  ('96b778ca-af26-483c-9a57-06f25bec25d8'::uuid,'62986a0b-a98e-4000-95be-6a155697adcb'::uuid,1,0,0,1,6,0,1,0,0,1,3,0),
  ('4088cad2-4e66-4e42-b42b-9b551da5a415'::uuid,'efbd91c0-3977-4812-a62c-d56a750b48e8'::uuid,1,0,0,1,0,0,1,0,0,0,0,0),
  ('002fe6d6-55b2-4338-a541-470ba9211f0d'::uuid,'efbd91c0-3977-4812-a62c-d56a750b48e8'::uuid,1,0,0,1,0,0,1,0,0,3,0,0),
  ('e96e77cf-771c-4998-bc05-068758a22fd7'::uuid,'9dec9a7c-a1d4-47f1-af6d-3b5b3779519f'::uuid,1,0,0,0,1,0,1,0,0,0,2,0),
  ('9ed1a539-d577-48ef-9491-a9b51d37f8b1'::uuid,'9dec9a7c-a1d4-47f1-af6d-3b5b3779519f'::uuid,1,0,0,0,1,0,1,0,0,0,2,0),
  ('33f052e2-5268-47de-9df6-464af709741d'::uuid,'fca67e39-f128-4bb1-ad62-c3fbf3d284b7'::uuid,1,20000,0,0,0,0,1,30000,0,0,0,0),
  ('c2fe5322-7aa6-4017-b751-8500d12a80a8'::uuid,'de4f2353-7d24-454f-846a-7e4f8c374811'::uuid,10,1,0,0,0,0,10,2,0,0,0,0),
  ('b947aac9-6932-46c7-8692-fd93dcde17b2'::uuid,'3f75c4fc-f92e-4d01-a35a-35a39a3fe58c'::uuid,1,0,0,0,1,0,1,0,0,0,0,0),
  ('744f148d-126d-44bd-87fe-4eab7ab287cf'::uuid,'3f75c4fc-f92e-4d01-a35a-35a39a3fe58c'::uuid,1,0,0,1,1,0,1,0,0,1,2,0),
  ('36e3613c-0a06-4f5d-9162-6bb4288d8890'::uuid,'47a1a406-fb54-445c-8c01-cf865b2b21d6'::uuid,1,0,0,0,1,0,1,0,0,0,0,0),
  ('ac42eb19-8f58-4568-a5f1-20b8edd560fe'::uuid,'47a1a406-fb54-445c-8c01-cf865b2b21d6'::uuid,2,0,0,0,1,0,2,0,0,0,2,0),
  ('e71e0278-62d8-424e-8ab2-4e780c181dfd'::uuid,'47a1a406-fb54-445c-8c01-cf865b2b21d6'::uuid,1,0,0,0,1,0,1,0,0,0,3,0),
  ('10be4675-d999-4b43-85ef-21337650a9e7'::uuid,'988c7f4d-ba9e-4651-82bd-2d9dbd7fd6b4'::uuid,1,0,0,0,1,0,1,0,0,0,2,0),
  ('e6de603b-7692-4957-8eff-cace65ab8e8c'::uuid,'988c7f4d-ba9e-4651-82bd-2d9dbd7fd6b4'::uuid,1,0,0,0,1,0,1,0,0,0,2,0),
  ('198fe502-22ea-4107-b1ad-fcfe72ee8f45'::uuid,'988c7f4d-ba9e-4651-82bd-2d9dbd7fd6b4'::uuid,1,0,0,0,3,0,1,0,0,0,4,0),
  ('2aa6b626-a887-4e62-b036-1e4a335fe695'::uuid,'5787c0db-8462-408b-b3a4-1ccb0d1da3f1'::uuid,1,0,0,1,1,0,1,0,0,1,0,0),
  ('dfa2b01b-b11a-436a-9b6d-ac1d823f67aa'::uuid,'5787c0db-8462-408b-b3a4-1ccb0d1da3f1'::uuid,1,0,0,1,1,0,1,0,0,1,0,0),
  ('7a9b235c-35dc-4734-930e-7e52acb1ca20'::uuid,'5787c0db-8462-408b-b3a4-1ccb0d1da3f1'::uuid,1,0,0,0,3,0,1,0,0,0,0,0),
  ('b6a35bab-6e3e-467d-93c5-98525f5ec56d'::uuid,'5787c0db-8462-408b-b3a4-1ccb0d1da3f1'::uuid,1,0,0,1,1,0,1,0,0,1,0,0),
  ('3c798d74-4e79-4834-8d88-850fdf267557'::uuid,'dba12070-6a97-4ed2-ac44-dde5399d9279'::uuid,4,1,0,0,0,0,4,0,0,0,0,0),
  ('d1e87659-3447-44ed-bdb7-cf0e8735bf9e'::uuid,'dba12070-6a97-4ed2-ac44-dde5399d9279'::uuid,6,1,0,0,0,0,1,20,0,0,0,0),
  ('f06a114c-48cf-467b-b5e2-deb119fa4709'::uuid,'9bac6d89-9220-46c4-b5b9-6c858376356d'::uuid,1,5000,0,0,0,0,1,20000,0,0,0,0),
  ('f729379a-6be0-4b69-ae9c-669d71d3e70b'::uuid,'ef9ba6cb-ad79-42a8-bb48-db92833242ca'::uuid,5,1,0,0,0,0,5,2,0,0,0,0),
  ('dbf769eb-9741-4714-89bf-ac904ca5aadb'::uuid,'ef9ba6cb-ad79-42a8-bb48-db92833242ca'::uuid,10,1,0,0,0,0,10,2,0,0,0,0),
  ('f821481a-a421-4bf1-ac88-a928a091f552'::uuid,'47e56512-22c3-4d34-b13b-c1fdd5676b9c'::uuid,0,1,0,0,0,0,1,20,0,0,0,0),
  ('b3348511-ce95-4ce0-b94b-b24d99db106e'::uuid,'1494592d-26d1-4c2e-ae66-f1128a9455f3'::uuid,5,3,0,0,0,0,5,0,0,0,0,0),
  ('de90743f-7d57-4c1c-a2ce-bdc5b5eec6d1'::uuid,'fab1f4c4-ae7c-4ae9-ac9e-794dca71d3c3'::uuid,2,0,0,0,1,0,2,0,0,0,2,0),
  ('f1208505-388c-4371-902e-542bff296c29'::uuid,'fab1f4c4-ae7c-4ae9-ac9e-794dca71d3c3'::uuid,2,0,0,0,1,0,1,0,0,0,5,0),
  ('22b9f631-c6e4-44b3-b299-10858fc00b85'::uuid,'e1e20223-4e2c-4d8d-b973-5e1d8d3fe87a'::uuid,1,0,0,1,2,0,1,0,0,1,3,0),
  ('fe723abc-00d9-42f1-b6fd-c432e101869b'::uuid,'e1e20223-4e2c-4d8d-b973-5e1d8d3fe87a'::uuid,1,0,0,1,2,0,1,0,0,1,3,0),
  ('80c0fb49-c7f5-40c2-a670-be538df606df'::uuid,'e1e20223-4e2c-4d8d-b973-5e1d8d3fe87a'::uuid,1,0,0,0,6,0,1,0,0,0,9,0),
  ('ca348d45-4ecf-4bc5-b7cd-6b7f898657a2'::uuid,'e1e20223-4e2c-4d8d-b973-5e1d8d3fe87a'::uuid,1,0,0,1,6,0,1,0,0,1,9,0),
  ('68b544bf-f90e-4f78-a64d-4be29c21c97e'::uuid,'0f72eff0-3e99-44d5-bc7d-0865ce517726'::uuid,1,50000,0,0,0,0,1,20000,0,0,0,0),
  ('72f8aee9-9436-42ce-ae98-43e02dbc9673'::uuid,'b102542c-1bd5-4e58-8605-d3cf81db4bb9'::uuid,3,1,0,0,0,0,3,0,0,0,0,0),
  ('aaac144d-f58d-47ad-a4d3-f10862cd98f3'::uuid,'b102542c-1bd5-4e58-8605-d3cf81db4bb9'::uuid,20,1,0,0,0,0,1,10,0,0,0,0),
  ('cb565d39-4c15-4976-ade3-7dc77f8d5ee3'::uuid,'b102542c-1bd5-4e58-8605-d3cf81db4bb9'::uuid,2,1,0,0,0,0,2,0,0,0,0,0),
  ('d2e128b9-285a-43c9-9f6a-11b9559cca77'::uuid,'f5f7d56b-8157-4cb6-85f8-c0ff2d274906'::uuid,1,20000,0,0,0,0,1,30000,0,0,0,0),
  ('21517c40-92af-4225-8aa2-ffe8a8fda007'::uuid,'0dad6c1e-9b7f-475e-856d-c233cc757abd'::uuid,1,20000,0,0,0,0,1,30000,0,0,0,0),
  ('76c50857-27cc-41a9-bfc8-862f9d7a345a'::uuid,'8fbb747f-9c4a-470e-8e2f-c6fcc7205337'::uuid,5,1,0,0,0,0,5,0,0,0,0,0),
  ('306751ad-dfd1-4e32-b0a1-c72c5c0e2d68'::uuid,'8fbb747f-9c4a-470e-8e2f-c6fcc7205337'::uuid,15,1,0,0,0,0,1,10,0,0,0,0),
  ('792366a8-7a33-476c-a44d-5688f86f3a67'::uuid,'2e12a5eb-024a-4d71-913e-433e8c753622'::uuid,1,20000,0,0,0,0,1,30000,0,0,0,0),
  ('d791a02a-77e8-45c5-a142-afb06fa3e235'::uuid,'4aa66c9c-8a5d-4006-8330-b48870ce05c6'::uuid,0,1,0,0,0,0,1,10,0,0,0,0),
  ('cd0b170b-0122-41b3-8b52-2c6896a7ec21'::uuid,'c847953b-7f11-4145-ad84-17bcc995d6ff'::uuid,5,1,0,0,0,0,5,0,0,0,0,0),
  ('d1ed65c8-0008-4b0d-8595-6f234d0e400c'::uuid,'c847953b-7f11-4145-ad84-17bcc995d6ff'::uuid,10,1,0,0,0,0,10,0,0,0,0,0),
  ('ee60a131-4106-4dd7-a089-b9160803272b'::uuid,'c847953b-7f11-4145-ad84-17bcc995d6ff'::uuid,0,1,0,0,0,0,1,1,0,0,0,0),
  ('098f3f34-b83a-4c46-8b48-c792e66cc99d'::uuid,'c847953b-7f11-4145-ad84-17bcc995d6ff'::uuid,0,1,0,0,0,0,1,3,0,0,0,0),
  ('96cc44dd-ce60-4490-88d2-fe7893689bb6'::uuid,'c847953b-7f11-4145-ad84-17bcc995d6ff'::uuid,15,1,0,0,0,0,1,10,0,0,0,0),
  ('4dbed026-af01-45d2-a3c9-758df93c7198'::uuid,'54d5120a-cd00-4e7a-a60f-7c475cf0f045'::uuid,3,1,0,0,0,0,3,0,0,0,0,0),
  ('796faa05-bd3f-4dbb-b813-027bdcb4d9e8'::uuid,'54d5120a-cd00-4e7a-a60f-7c475cf0f045'::uuid,6,1,0,0,0,0,6,0,0,0,0,0),
  ('e25f269f-f718-4b4f-b151-a49cba95f077'::uuid,'54d5120a-cd00-4e7a-a60f-7c475cf0f045'::uuid,3,1,0,0,0,0,3,0,0,0,0,0),
  ('315fa113-3363-4a7e-b487-f1f4612c35fd'::uuid,'54d5120a-cd00-4e7a-a60f-7c475cf0f045'::uuid,5,1,0,0,0,0,5,0,0,0,0,0),
  ('fa3e764d-86a7-4d40-b2e5-88e6c9a599e3'::uuid,'bd81df2f-ef9e-450c-b615-1ac2aa2a3521'::uuid,0,1,0,0,0,0,1,10,0,0,0,0),
  ('3041465a-947f-4351-8085-035955cff19e'::uuid,'f1b23ffa-d9cf-4b45-9944-4376355894cd'::uuid,1,20000,0,0,0,0,1,5000,0,0,0,0),
  ('98edbcf3-4470-4114-b5fb-24b96566fda0'::uuid,'3fc23e48-4003-4a27-b41e-1bcd8b9db540'::uuid,1,20000,0,0,0,0,1,5000,0,0,0,0),
  ('f49e8007-7818-42f1-aad1-6dbba57ece31'::uuid,'8faacbb2-f7e1-4a71-9cdf-b70fd3803eb9'::uuid,1,0,0,1,1,0,1,0,0,1,0,0),
  ('139e9178-9f14-4c1c-a8e6-9c46c52b8f7a'::uuid,'8faacbb2-f7e1-4a71-9cdf-b70fd3803eb9'::uuid,1,0,0,1,1,0,1,0,0,1,0,0),
  ('db49b9f6-2b4d-439c-a93d-7aa33304b99c'::uuid,'8faacbb2-f7e1-4a71-9cdf-b70fd3803eb9'::uuid,1,0,0,1,1,0,1,0,0,1,0,0),
  ('c32b92bb-044f-4fa8-899a-1027f5e01d18'::uuid,'19dfc5c5-817d-4040-a3f5-500d10d1594b'::uuid,1,20000,0,0,0,0,1,5000,0,0,0,0),
  ('29f3a05e-ce85-4bfa-866e-62ddaf824184'::uuid,'b79f1d17-0656-4c06-aae2-18a3ad351e5c'::uuid,5,1,0,0,0,0,1,3,0,0,0,0),
  ('ec0cc6cc-0e86-46ae-b40e-654888106607'::uuid,'b79f1d17-0656-4c06-aae2-18a3ad351e5c'::uuid,10,1,0,0,0,0,10,0,0,0,0,0),
  ('6721b664-7c6c-4c9b-aaae-29b8327e6bb2'::uuid,'b79f1d17-0656-4c06-aae2-18a3ad351e5c'::uuid,0,1,0,0,0,0,1,2,0,0,0,0),
  ('5d78131a-c5e1-4272-91e3-94a78d8878e8'::uuid,'3df807c5-c6c0-4571-b76a-b6a9b86fa039'::uuid,0,1,0,0,0,0,1,5,0,0,0,0),
  ('4a9cd820-fd40-4aac-8fd2-1ab095b6e804'::uuid,'3df807c5-c6c0-4571-b76a-b6a9b86fa039'::uuid,0,1,0,0,0,0,1,10,0,0,0,0),
  ('d9b6b20d-0bcb-400d-9a5a-7bc39d8ce33d'::uuid,'4889bffc-af06-40f4-9484-e991bf1e67b0'::uuid,1,20000,0,0,0,0,1,30000,0,0,0,0),
  ('d3f16d8a-2709-496f-ac04-d97d9a232eef'::uuid,'34f3d1c7-ce39-49a9-a3ee-ff5c618cd798'::uuid,5,1,0,0,0,0,5,0,0,0,0,0),
  ('595d6e78-1a34-44c9-862b-16384be7c75b'::uuid,'34f3d1c7-ce39-49a9-a3ee-ff5c618cd798'::uuid,15,1,0,0,0,0,1,10,0,0,0,0),
  ('795470d2-1ce4-4dca-b7aa-1ceaf2d77d96'::uuid,'f7650238-7114-4e14-ace7-35f2bddb12a5'::uuid,1,20000,0,0,0,0,1,5000,0,0,0,0),
  ('a7ad892f-ef69-4aef-be2b-01ad20d3b929'::uuid,'264e3c26-a183-4c1e-ae79-d713382eecf7'::uuid,10,1,0,0,0,0,10,0,0,0,0,0),
  ('24ec7e01-0286-4fae-b99a-14ee360ff597'::uuid,'8667efa5-08fb-4c30-b92a-36d9f2eea075'::uuid,0,1,0,0,0,0,1,3,0,0,0,0),
  ('8c77b552-5999-469c-be74-f66f102427dd'::uuid,'8667efa5-08fb-4c30-b92a-36d9f2eea075'::uuid,0,1,0,0,0,0,1,2,0,0,0,0),
  ('ef71c5e0-d7a3-4852-96fe-3443dbb6ddf5'::uuid,'19e9574a-f212-461e-a73d-c01bb4be4ce9'::uuid,1,0,0,1,1,0,1,0,0,1,0,0),
  ('20505d8a-c7ec-4148-9a52-20762faa9f15'::uuid,'19e9574a-f212-461e-a73d-c01bb4be4ce9'::uuid,1,0,0,1,1,0,1,0,0,1,0,0),
  ('4b6c53f8-5689-45aa-82e9-f357f7fd158a'::uuid,'19e9574a-f212-461e-a73d-c01bb4be4ce9'::uuid,1,0,0,1,1,0,1,0,0,1,0,0),
  ('ddc28add-7f63-43fc-a30e-7468acfd162b'::uuid,'1e3f75ed-a6c4-4669-9f20-3fa6ddc416ef'::uuid,1,20000,0,0,0,0,1,5000,0,0,0,0),
  ('8a7e8734-7016-478e-983d-aa0abb955a26'::uuid,'568288ff-3338-46a0-8b93-82623a45a987'::uuid,10,1,0,0,0,0,10,0,0,0,0,0),
  ('d52fa83d-55b3-4072-b474-7096ac7c004b'::uuid,'8491ef86-d3ca-4ae6-8c7f-bce63903c7ca'::uuid,0,1,0,0,0,0,1,5,0,0,0,0),
  ('a2f74215-0701-40a7-9484-80918ce8333c'::uuid,'8491ef86-d3ca-4ae6-8c7f-bce63903c7ca'::uuid,0,1,0,0,0,0,1,20,0,0,0,0),
  ('29bb45fb-fa41-4591-9412-b00eac6366ed'::uuid,'84281c14-0558-4156-b6c9-47cfa2814e1c'::uuid,3,0,0,0,1,0,1,0,0,0,5,0),
  ('970920cd-4f8a-4d31-a917-e98ee92ad346'::uuid,'84281c14-0558-4156-b6c9-47cfa2814e1c'::uuid,3,0,0,0,1,0,1,0,0,0,5,0),
  ('d7d04d2f-c133-4c52-9229-312a7ea8e259'::uuid,'f6fa7d7a-ca21-41cf-afee-fc94de9c88ed'::uuid,1,5000,0,0,0,0,1,30000,0,0,0,0),
  ('de22c059-fefc-4c4e-a678-c61ce9ee150c'::uuid,'77d0b53e-a0f3-407d-9b3f-f98fff7bd6da'::uuid,20,1,0,0,0,0,1,10,0,0,0,0),
  ('885727c4-4189-42b7-9c81-0809c4f97f59'::uuid,'81aced2f-d882-45e4-84b1-9b1b8deb7d07'::uuid,1,5000,0,0,0,0,1,20000,0,0,0,0),
  ('1888fe09-d821-40c3-b185-326e3597c0ad'::uuid,'1906ca88-0e10-45f1-b569-affe43fd29e4'::uuid,1,0,0,0,3,0,1,0,0,0,6,0),
  ('294cdde8-0e94-44e4-a697-d69e5c3a1852'::uuid,'0fb5028f-58d7-4cfb-99f4-cf8b1281915c'::uuid,1,15000,0,0,0,0,1,30000,0,0,0,0),
  ('aad0443c-6ddb-4a7a-9374-34fb5cca078b'::uuid,'73da2d5d-f5c9-497a-8c52-495fbeb71801'::uuid,0,1,0,0,0,0,1,5,0,0,0,0),
  ('2d4059cc-aa88-433c-82d9-d16ba7b4fd5f'::uuid,'73da2d5d-f5c9-497a-8c52-495fbeb71801'::uuid,0,1,0,0,0,0,1,10,0,0,0,0),
  ('f4abbb0c-b378-4fa4-a74e-3938d5df4228'::uuid,'ffd37e91-e40b-469c-a0fb-60e3ee478ca4'::uuid,10,1,0,0,0,0,10,2,0,0,0,0),
  ('d5c6d4ec-22e6-4a27-ad01-2182dd8e1828'::uuid,'79c2e7e6-8d5e-4234-a156-eba628ff45f3'::uuid,1,30000,0,0,0,0,1,5000,0,0,0,0),
  ('dae5fbef-5b79-4118-bf53-976868347198'::uuid,'dc3e11b3-3092-4a4a-a4b2-4aad44b370b1'::uuid,0,1,0,0,0,0,1,3,0,0,0,0),
  ('1d93b3b3-f65e-4740-ad9f-88a13024a502'::uuid,'dc3e11b3-3092-4a4a-a4b2-4aad44b370b1'::uuid,0,1,0,0,0,0,1,20,0,0,0,0),
  ('c79f3005-1936-42ca-b20c-fb1db2cf3338'::uuid,'dc3e11b3-3092-4a4a-a4b2-4aad44b370b1'::uuid,0,1,0,0,0,0,1,2,0,0,0,0),
  ('346577c5-af44-4474-945f-a76dd6c73769'::uuid,'be388cd9-7547-46a7-b274-7aedf03db735'::uuid,10,3,0,0,0,0,1,45,0,0,0,0),
  ('0c40f693-673b-446a-977e-36549397779b'::uuid,'95ebcf54-b482-46fa-89fa-1cc0dd12cd0e'::uuid,0,1,0,0,0,0,1,3,0,0,0,0),
  ('252c0385-3824-4d37-ae7f-3ec3dc97514b'::uuid,'95ebcf54-b482-46fa-89fa-1cc0dd12cd0e'::uuid,0,1,0,0,0,0,1,10,0,0,0,0),
  ('98dfaab0-8a60-40c4-ae2b-69ff0dab370a'::uuid,'95ebcf54-b482-46fa-89fa-1cc0dd12cd0e'::uuid,0,1,0,0,0,0,1,2,0,0,0,0),
  ('144a43c0-1316-43d1-a077-170d6e558901'::uuid,'826a99b2-0a39-4dd8-884a-dcd45a396453'::uuid,1,20000,0,0,0,0,1,30000,0,0,0,0),
  ('7c9543a4-209b-4bc8-8f25-bcc8f1b89f8c'::uuid,'0d3680f6-de41-4c1a-b353-4104950f1f88'::uuid,10,1,0,0,0,0,1,15,0,0,0,0),
  ('782af541-4dce-451c-b7c6-deba00679b08'::uuid,'0d3680f6-de41-4c1a-b353-4104950f1f88'::uuid,10,1,0,0,0,0,1,15,0,0,0,0),
  ('b8cdf0f8-db88-4b11-b4a4-73558bc522aa'::uuid,'b3878ea1-f2c9-4fef-b2a9-ed84d9033c2b'::uuid,1,5000,0,0,0,0,1,30000,0,0,0,0),
  ('de017ff8-5eee-477d-99fd-96bda6107f87'::uuid,'671ededd-4d74-4541-a946-3cf25d1c9362'::uuid,1,5000,0,0,0,0,1,20000,0,0,0,0),
  ('e5df1088-7a49-4f73-94e8-b8f1e10f03f5'::uuid,'ed67b3bf-e1aa-4bd7-84c3-62e9461d1949'::uuid,5,0,0,0,1,0,1,0,0,0,3,0),
  ('13eafe37-9525-44ee-90da-4658b87c733f'::uuid,'ed67b3bf-e1aa-4bd7-84c3-62e9461d1949'::uuid,5,0,0,0,1,0,1,0,0,0,3,0),
  ('c2b47a45-373c-4f3b-8ebb-e0f1e25ff8c3'::uuid,'f0e16462-db56-4c39-ac04-328b6b90375c'::uuid,1,20000,0,0,0,0,1,5000,0,0,0,0),
  ('afed1b82-a7e2-4a50-85c6-e231b9fc802b'::uuid,'fae2a4d0-39d6-4c79-aa2b-f877f8cc44b9'::uuid,3,0,0,0,1,0,1,0,0,0,4,0),
  ('11113a56-3dde-41f4-80f6-66d4df860513'::uuid,'fae2a4d0-39d6-4c79-aa2b-f877f8cc44b9'::uuid,3,0,0,0,1,0,1,0,0,0,4,0),
  ('6c5034a2-f420-46ac-acc0-0413e45b2e08'::uuid,'7482061f-9e2b-4771-9dc1-f78e9aee34e6'::uuid,5,1,0,0,0,0,5,0,0,0,0,0),
  ('efe6bb2d-1653-4943-8d79-52a67bf08781'::uuid,'7482061f-9e2b-4771-9dc1-f78e9aee34e6'::uuid,10,1,0,0,0,0,10,0,0,0,0,0),
  ('6d8979cf-d6f4-4380-9bd6-7d38fea895f3'::uuid,'480e73c6-20b2-4bf9-8b25-c5de3555c33d'::uuid,1,0,0,0,1,0,1,0,0,0,2,0),
  ('c5a3148c-e9d4-490b-93bf-5acac8fcbf63'::uuid,'480e73c6-20b2-4bf9-8b25-c5de3555c33d'::uuid,1,0,0,0,1,0,1,0,0,0,2,0),
  ('d778690b-bffc-436d-9768-e2e189bcb3b0'::uuid,'480e73c6-20b2-4bf9-8b25-c5de3555c33d'::uuid,1,0,0,0,1,0,1,0,0,0,2,0),
  ('6c2c7e12-a374-4439-98d1-be25425f5130'::uuid,'e9dc23e8-3de6-4b93-90e4-f7f40df28f03'::uuid,1,1,0,0,0,0,1,0,0,0,0,0),
  ('d3f6711c-49b6-4c9a-8bb4-f5ab3ae160f8'::uuid,'f72b6fe1-8fc5-419e-9b6f-48ce151670cd'::uuid,1,0,0,1,0,0,1,0,0,2,0,0),
  ('9c27ae3d-455d-403d-9e51-86b36c9df066'::uuid,'f72b6fe1-8fc5-419e-9b6f-48ce151670cd'::uuid,1,0,0,1,0,0,1,0,0,2,0,0),
  ('17c5c592-7cc2-4764-9b1d-7e7781f08cf3'::uuid,'f72b6fe1-8fc5-419e-9b6f-48ce151670cd'::uuid,1,0,0,1,0,0,1,0,0,2,0,0),
  ('06c4946f-ebd3-4fa6-b0c6-7eb5489ce1e4'::uuid,'3c7ced09-d4d4-4119-86d4-171b805771f7'::uuid,1,0,0,1,2,0,1,0,0,1,4,0),
  ('5a645e65-3091-46c8-867e-3005c230a04a'::uuid,'3c7ced09-d4d4-4119-86d4-171b805771f7'::uuid,1,0,0,1,2,0,1,0,0,1,4,0),
  ('2d3fbad4-3313-4e7c-b4f9-158393558f03'::uuid,'3c7ced09-d4d4-4119-86d4-171b805771f7'::uuid,1,0,0,0,6,0,1,0,0,0,12,0),
  ('a3900cce-6691-46ae-bf33-af19f582ed61'::uuid,'3c7ced09-d4d4-4119-86d4-171b805771f7'::uuid,1,0,0,1,6,0,1,0,0,1,12,0),
  ('ee4bbcbb-63c5-4893-b745-fa187982b396'::uuid,'256c846d-2066-4618-beb3-7636258fcc39'::uuid,2,0,0,1,2,0,2,0,0,1,4,0),
  ('9ec794b5-541b-4412-b45c-639bf2845fad'::uuid,'256c846d-2066-4618-beb3-7636258fcc39'::uuid,2,0,0,1,2,0,2,0,0,1,4,0),
  ('8e123b76-ec00-4e1a-a597-33d464e9809f'::uuid,'dfa42503-9dbc-49f4-95d9-0b4def92afea'::uuid,1,1,0,0,0,0,1,0,0,0,0,0),
  ('4c275e73-77cf-4dce-9782-77c99992930b'::uuid,'51abf5e3-de85-4eda-8380-8195fb0546f6'::uuid,1,0,0,1,1,0,1,0,0,1,2,0),
  ('72e40dcc-a913-411f-a7ca-2ad384bc2d7c'::uuid,'51abf5e3-de85-4eda-8380-8195fb0546f6'::uuid,1,0,0,1,1,0,1,0,0,1,2,0),
  ('439f708a-a8d9-4d19-9503-89082c41c5bb'::uuid,'51abf5e3-de85-4eda-8380-8195fb0546f6'::uuid,1,0,0,1,0,0,1,0,0,2,0,0),
  ('802efc30-6edb-4280-9558-ed93fe55bf37'::uuid,'b4086bb3-064d-4a94-b377-93caa0553e76'::uuid,3,0,0,0,1,0,1,0,0,0,2,0),
  ('f5a00099-441b-43ee-8e8c-3a7e702cc36f'::uuid,'b4086bb3-064d-4a94-b377-93caa0553e76'::uuid,3,0,0,0,1,0,1,0,0,0,2,0),
  ('684b352a-ed84-48d6-9cd3-eac812689fb5'::uuid,'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca'::uuid,1,0,0,0,0,0,1,10,0,0,0,0),
  ('8e954df9-f8b2-4a76-bd38-12329645b749'::uuid,'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca'::uuid,10,1,0,0,0,0,10,2,0,0,0,0),
  ('582078e8-c127-4805-83fa-f758f1536fe5'::uuid,'66cf7123-8231-42ac-9906-0cf1a2586fc1'::uuid,1,0,0,3,1,0,1,0,0,4,1,0),
  ('7be50eee-eb04-473a-892c-b15a735bedab'::uuid,'66cf7123-8231-42ac-9906-0cf1a2586fc1'::uuid,1,0,0,3,1,0,1,0,0,4,1,0),
  ('050e7975-cbe4-473d-acbe-448413d3af31'::uuid,'66cf7123-8231-42ac-9906-0cf1a2586fc1'::uuid,1,0,0,3,3,0,1,0,0,3,6,0),
  ('51f5568a-9881-4b35-96be-d01a1e2486ac'::uuid,'66cf7123-8231-42ac-9906-0cf1a2586fc1'::uuid,1,0,0,3,3,0,1,0,0,3,6,0),
  ('ca2da973-bde0-487c-aea5-d0d695660e89'::uuid,'a9f1e09e-40d6-4499-b55b-302b1e27f716'::uuid,1,0,0,2,0,0,1,0,0,0,0,0),
  ('aaa7427b-6876-47ca-bedb-9da1bd86f343'::uuid,'a9f1e09e-40d6-4499-b55b-302b1e27f716'::uuid,1,0,0,2,0,0,1,0,0,0,0,0),
  ('8452565b-28de-4aca-8eba-99af1da1a9fe'::uuid,'a9f1e09e-40d6-4499-b55b-302b1e27f716'::uuid,1,0,0,2,0,0,1,0,0,0,0,0),
  ('01a02682-d245-4b4d-973b-6b45905e9f6f'::uuid,'a9f1e09e-40d6-4499-b55b-302b1e27f716'::uuid,1,0,0,2,2,0,1,0,0,2,6,0),
  ('867028f5-8eff-4f89-a093-515ca38057ba'::uuid,'a9f1e09e-40d6-4499-b55b-302b1e27f716'::uuid,1,0,0,2,2,0,1,0,0,2,6,0),
  ('e5bd71db-c474-4508-9486-394ae08859f7'::uuid,'a9f1e09e-40d6-4499-b55b-302b1e27f716'::uuid,1,0,0,2,0,0,1,0,0,6,0,0),
  ('dbf53d5f-759a-420b-8148-58d93d621118'::uuid,'fb3d0145-1431-49e5-9584-66413913b685'::uuid,5,0,0,0,1,0,5,0,0,0,0,0),
  ('6dc91f49-7a30-468b-ba6f-3d4cb4b2f57e'::uuid,'fb3d0145-1431-49e5-9584-66413913b685'::uuid,4,0,0,0,1,0,4,0,0,0,0,0),
  ('47efa486-135b-4c9c-84a7-cccde75c4a06'::uuid,'7169e178-a7de-4284-a512-68185ac485a5'::uuid,1,0,0,0,3,0,1,0,0,0,0,0),
  ('6b185278-e1d6-48d9-b2b1-4da0e13b979b'::uuid,'7169e178-a7de-4284-a512-68185ac485a5'::uuid,1,0,0,1,1,0,1,0,0,0,0,0),
  ('6de601ff-a16d-41a9-af2a-829e47dd871e'::uuid,'7169e178-a7de-4284-a512-68185ac485a5'::uuid,1,0,0,1,1,0,1,0,0,0,0,0),
  ('f99f2b87-aba9-4e32-b5a5-18e240b2fc90'::uuid,'7169e178-a7de-4284-a512-68185ac485a5'::uuid,1,0,0,1,1,0,1,0,0,0,0,0),
  ('acf076e8-49cf-4006-aaff-f98e83163151'::uuid,'13378cf7-04b2-4dd5-b02c-3aceea537cbb'::uuid,10,1,0,0,0,0,10,0,0,0,0,0),
  ('cc223b52-6ad8-48f9-a92c-711eee955834'::uuid,'13378cf7-04b2-4dd5-b02c-3aceea537cbb'::uuid,10,1,0,0,0,0,10,0,0,0,0,0),
  ('220d7a48-91ab-46c7-8ab1-30a99a1946bc'::uuid,'720471b5-7d22-4794-9b31-edc2d5daab99'::uuid,1,0,0,1,0,0,1,0,0,4,0,0),
  ('8f817f94-363d-495b-b5e3-aefeb96491b3'::uuid,'5528cd29-6f2d-465d-b122-ce28210af68b'::uuid,1,0,0,1,1,0,1,0,0,1,3,0),
  ('4c62f73c-ea67-455e-ba29-c95b96aebc26'::uuid,'5528cd29-6f2d-465d-b122-ce28210af68b'::uuid,1,0,0,1,0,1,1,0,0,3,0,1),
  ('7cf485a6-a620-47e8-b15c-bba38fece570'::uuid,'5528cd29-6f2d-465d-b122-ce28210af68b'::uuid,1,0,0,1,1,0,1,0,0,1,3,0),
  ('2c67cf3a-ed3d-4de8-8088-7fa3f7cc094b'::uuid,'dd38de32-3cf4-4095-8cf6-087693378815'::uuid,3,1,0,0,0,0,1,2,0,0,0,0),
  ('46f58d39-58bc-4173-86cb-b25cd781a555'::uuid,'3abc7229-97df-4b87-9803-1c3a2fc9b789'::uuid,0,1,0,0,0,0,1,10,0,0,0,0),
  ('105e469c-7eda-4651-a43e-e4d22a7a23e5'::uuid,'9db2108c-c1b9-4b97-b296-35ef9b2114a0'::uuid,1,0,0,1,1,0,1,0,0,1,2,0),
  ('ecf72175-db32-4f5d-afbc-ad87cd4a5f22'::uuid,'9db2108c-c1b9-4b97-b296-35ef9b2114a0'::uuid,1,0,0,1,1,0,1,0,0,1,2,0),
  ('9d5956c9-af18-4eda-affc-f793b7d0db93'::uuid,'6ad9ac2d-7ebf-436d-a665-2143c5a672ba'::uuid,1,0,0,1,0,0,1,0,0,0,0,0),
  ('04d56478-5ef8-4585-8e14-046d8661e222'::uuid,'6ad9ac2d-7ebf-436d-a665-2143c5a672ba'::uuid,1,0,0,1,0,0,1,0,0,0,0,0),
  ('de497f3c-92cb-4ce2-b9d8-cf4df06cff21'::uuid,'6ad9ac2d-7ebf-436d-a665-2143c5a672ba'::uuid,1,0,0,1,1,0,1,0,0,1,3,0),
  ('dc9082fc-bb66-4e07-b2f2-cceb23e4fe94'::uuid,'6ad9ac2d-7ebf-436d-a665-2143c5a672ba'::uuid,1,0,0,1,1,0,1,0,0,1,3,0),
  ('ddf73a9d-b711-42ae-842c-59f3a8c52301'::uuid,'6ad9ac2d-7ebf-436d-a665-2143c5a672ba'::uuid,1,0,0,1,0,0,1,0,0,2,0,0),
  ('a85a5b04-ee7b-4666-9da2-8a2031c5c98d'::uuid,'c9aeef99-9d5a-41c3-a1da-7bb84d33122d'::uuid,5,1,0,0,0,0,5,0,0,0,0,0),
  ('b9768068-e6a2-4aa4-ae4c-99454e5e0a58'::uuid,'c9aeef99-9d5a-41c3-a1da-7bb84d33122d'::uuid,15,1,0,0,0,0,1,10,0,0,0,0),
  ('d2d79edf-66b7-49dc-a125-4f1d29fb25fb'::uuid,'54ec75ab-e259-4317-a99d-c507bfd2b059'::uuid,1,0,0,1,2,0,1,0,0,1,4,0),
  ('afc92056-4945-44a4-bbd0-258fc9e31df2'::uuid,'54ec75ab-e259-4317-a99d-c507bfd2b059'::uuid,1,0,0,1,2,0,1,0,0,1,4,0),
  ('ea0c6e9c-8678-4d62-b48a-1e93e48f2dcb'::uuid,'54ec75ab-e259-4317-a99d-c507bfd2b059'::uuid,1,0,0,0,3,0,1,0,0,0,6,0),
  ('7232cf1e-b929-464a-b834-1f3e4cad48a7'::uuid,'54ec75ab-e259-4317-a99d-c507bfd2b059'::uuid,1,0,0,1,3,0,1,0,0,1,6,0),
  ('063803ad-d6af-4c50-9de3-0471ce993d91'::uuid,'099bc560-51de-47f3-8590-4e0d5feff500'::uuid,0,1,0,0,0,0,1,5,0,0,0,0),
  ('e315acf2-7421-4498-b31e-fb7e7a07ab55'::uuid,'099bc560-51de-47f3-8590-4e0d5feff500'::uuid,0,1,0,0,0,0,1,10,0,0,0,0),
  ('5efccede-4839-4bc9-969b-0738a3fbc57e'::uuid,'dc193d4b-3ab7-4374-840c-4f820ce3e683'::uuid,5,1,0,0,0,0,1,3,0,0,0,0),
  ('0bbbcdc4-97e4-476a-a7d6-1f00ffaa7312'::uuid,'dc193d4b-3ab7-4374-840c-4f820ce3e683'::uuid,10,1,0,0,0,0,1,2,0,0,0,0),
  ('6e33821f-dcff-4f06-bdf1-c29cdb85c964'::uuid,'91075af3-d108-4eed-a054-459366262c5e'::uuid,5,0,0,0,1,0,5,0,0,0,0,0),
  ('981ea91e-c111-45b8-a503-694455beb035'::uuid,'91075af3-d108-4eed-a054-459366262c5e'::uuid,4,0,0,0,1,0,4,0,0,0,0,0),
  ('2f574d16-56bc-4d41-a35c-8f938dc628bf'::uuid,'f447e862-0a3b-4ed4-8f9e-4aafb079c38b'::uuid,1,0,0,0,3,0,1,0,0,0,0,0),
  ('312f9778-8a15-481a-ab93-c15967532e92'::uuid,'f447e862-0a3b-4ed4-8f9e-4aafb079c38b'::uuid,1,0,0,1,1,0,1,0,0,0,0,0),
  ('0868ab57-9721-41f7-91da-15ff42ddcc12'::uuid,'f447e862-0a3b-4ed4-8f9e-4aafb079c38b'::uuid,1,0,0,1,1,0,1,0,0,0,0,0),
  ('29572603-5589-49f5-838b-e6f2bb749865'::uuid,'f447e862-0a3b-4ed4-8f9e-4aafb079c38b'::uuid,1,0,0,1,1,0,1,0,0,0,0,0),
  ('f4afa5ab-ce33-416e-8d2a-187c13054be4'::uuid,'e87b3bf4-6653-42e6-9412-9e3a784028cb'::uuid,10,1,0,0,0,0,10,0,0,0,0,0),
  ('a7ac471f-b9c1-406b-8c17-1ab5d5d656e4'::uuid,'e87b3bf4-6653-42e6-9412-9e3a784028cb'::uuid,10,1,0,0,0,0,10,0,0,0,0,0),
  ('17c2babc-0049-4afe-a6fc-ebe56352171d'::uuid,'6cce0f48-ce4f-4fd1-aa4c-74ac3c41d794'::uuid,10,1,0,0,0,0,10,0,0,0,0,0),
  ('1220ccc1-e141-432a-bcf3-4cc2413393cd'::uuid,'2d963167-4142-4992-8c39-daccf7abfd31'::uuid,1,0,0,1,1,0,1,0,0,1,0,0),
  ('985976da-48d4-4f79-b996-188071a1170c'::uuid,'2d963167-4142-4992-8c39-daccf7abfd31'::uuid,1,0,0,1,1,0,1,0,0,1,0,0),
  ('1126f94d-b937-49a4-ad76-989c0774b6de'::uuid,'2d963167-4142-4992-8c39-daccf7abfd31'::uuid,1,0,0,0,3,0,1,0,0,0,0,0),
  ('286d26e2-2528-47fb-8264-2935a44fd15b'::uuid,'2d963167-4142-4992-8c39-daccf7abfd31'::uuid,1,0,0,1,3,0,1,0,0,1,0,0),
  ('6991ce07-8631-444b-ad3a-a156d6e9d209'::uuid,'521fe53f-65eb-45c1-ab41-fa5282a33202'::uuid,1,0,0,1,1,0,1,0,0,1,0,0),
  ('7426031e-b1b8-48d1-bea2-97d906e39588'::uuid,'521fe53f-65eb-45c1-ab41-fa5282a33202'::uuid,1,0,0,1,1,0,1,0,0,1,0,0),
  ('50ad4dae-7476-4e41-a0e5-bd2b352a385e'::uuid,'521fe53f-65eb-45c1-ab41-fa5282a33202'::uuid,1,0,0,0,3,0,1,0,0,0,0,0),
  ('f3071200-eb19-48aa-9f9b-20f9c71f966e'::uuid,'521fe53f-65eb-45c1-ab41-fa5282a33202'::uuid,1,0,0,1,3,0,1,0,0,1,0,0),
  ('03ba1f9d-3036-49f5-a55a-52bd9c18d575'::uuid,'24f2eb89-4297-44a7-a299-809931ab9ca5'::uuid,2,0,0,0,0,1,2,0,0,0,0,0)
on conflict (entry_id) do nothing;

create table if not exists package_grid_insert_r513 (
  line_id uuid not null, release_id uuid not null, package_id uuid not null, category_id uuid not null,
  brand text not null, platform text not null, channel_count int, count_posts int, count_listen_now int, sort_order int,
  primary key (package_id, category_id, brand, platform));
insert into package_grid_insert_r513 values
  ('0ac30a10-5705-443a-929c-737bcb0f5573'::uuid,'45dfe9c3-cc02-4688-9b18-f0d07b81e9f5'::uuid,'d5088c79-6461-4008-8a6a-ed185a256ef4'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$YouTube$t$,1,0,2,3),
  ('0ac30a10-5705-443a-929c-737bcb0f5573'::uuid,'45dfe9c3-cc02-4688-9b18-f0d07b81e9f5'::uuid,'d5088c79-6461-4008-8a6a-ed185a256ef4'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$VIEENT$t$,$t$YouTube$t$,1,0,3,4),
  ('67fe4604-cf55-43c7-a138-9e932153486c'::uuid,'45dfe9c3-cc02-4688-9b18-f0d07b81e9f5'::uuid,'d5088c79-6461-4008-8a6a-ed185a256ef4'::uuid,'01a26838-d9fb-434d-9972-b539024cd987'::uuid,$t$PAGE BOLERO / MT$t$,$t$YouTube$t$,1,0,3,2),
  ('a00c1ab0-b059-442e-8557-d79923f0a655'::uuid,'32ae1ea7-4c6d-4d1a-bac3-2a7bda08a386'::uuid,'80f04ecc-274c-4cd0-a972-c8698ca8e4a8'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$TIKTOK INDIE$t$,$t$TIKTOK CAPCUT$t$,1,5,0,1),
  ('42222e57-9d6f-4cc2-9c11-c11612e00b96'::uuid,'d743ef5b-31e0-4ea9-a14c-d37bb55552e0'::uuid,'6d68d83a-9b80-4618-a53d-e286cdc27fd7'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$TikTok$t$,1,0,3,4),
  ('efd64e3d-8290-4950-9af3-95dac1a9d0fb'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'462f1267-b3eb-4e7e-b0fb-9c4b05979211'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$TIKTOK BOLERO / MT$t$,$t$TIKTOK LYRICS$t$,1,15,0,1),
  ('90a95a56-2f65-4701-bf4f-0ff2a2bfb83b'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'462f1267-b3eb-4e7e-b0fb-9c4b05979211'::uuid,'01a26838-d9fb-434d-9972-b539024cd987'::uuid,$t$PAGE BOLERO / MT$t$,$t$Facebook$t$,1,0,3,1),
  ('90a95a56-2f65-4701-bf4f-0ff2a2bfb83b'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'462f1267-b3eb-4e7e-b0fb-9c4b05979211'::uuid,'01a26838-d9fb-434d-9972-b539024cd987'::uuid,$t$PAGE BOLERO / MT$t$,$t$YouTube$t$,1,0,3,2),
  ('f72b6fe1-8fc5-419e-9b6f-48ce151670cd'::uuid,'547da779-a5da-4579-91c6-441946a7ee85'::uuid,'a0e9e196-55c2-42fd-bd41-6876343b35aa'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$TikTok$t$,1,0,3,4),
  ('93d853ee-04e2-4bb5-8467-1566f3524cba'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'462f1267-b3eb-4e7e-b0fb-9c4b05979211'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$Facebook$t$,1,0,2,1),
  ('93d853ee-04e2-4bb5-8467-1566f3524cba'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'462f1267-b3eb-4e7e-b0fb-9c4b05979211'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$Instagram$t$,1,0,2,2),
  ('93d853ee-04e2-4bb5-8467-1566f3524cba'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'462f1267-b3eb-4e7e-b0fb-9c4b05979211'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$TikTok$t$,1,0,3,3),
  ('93d853ee-04e2-4bb5-8467-1566f3524cba'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'462f1267-b3eb-4e7e-b0fb-9c4b05979211'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$YouTube$t$,1,0,2,4),
  ('ffc6e782-0425-4470-9cfa-c723311c2f34'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'d69e6988-2001-4127-9fd6-df3592a6fdc7'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$Facebook$t$,1,0,2,1),
  ('ffc6e782-0425-4470-9cfa-c723311c2f34'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'d69e6988-2001-4127-9fd6-df3592a6fdc7'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$Instagram$t$,1,0,2,2),
  ('ffc6e782-0425-4470-9cfa-c723311c2f34'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'d69e6988-2001-4127-9fd6-df3592a6fdc7'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$TikTok$t$,1,0,3,3),
  ('ffc6e782-0425-4470-9cfa-c723311c2f34'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'d69e6988-2001-4127-9fd6-df3592a6fdc7'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$YouTube$t$,1,0,2,4),
  ('020a72d1-ed5c-4be1-b6f9-5f976dd4e3f7'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'d69e6988-2001-4127-9fd6-df3592a6fdc7'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$TIKTOK BOLERO / MT$t$,$t$TIKTOK LYRICS$t$,1,15,0,1),
  ('e68a6f5d-66cc-4bd1-82c3-841152751368'::uuid,'71e6193b-528f-4569-ad6d-45ed2459c0dc'::uuid,'ab8d4fc7-4c27-40aa-abff-f56a8f89c643'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$Facebook$t$,1,0,2,1),
  ('e68a6f5d-66cc-4bd1-82c3-841152751368'::uuid,'71e6193b-528f-4569-ad6d-45ed2459c0dc'::uuid,'ab8d4fc7-4c27-40aa-abff-f56a8f89c643'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$Instagram$t$,1,0,2,2),
  ('e68a6f5d-66cc-4bd1-82c3-841152751368'::uuid,'71e6193b-528f-4569-ad6d-45ed2459c0dc'::uuid,'ab8d4fc7-4c27-40aa-abff-f56a8f89c643'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$TikTok$t$,1,0,3,3),
  ('e68a6f5d-66cc-4bd1-82c3-841152751368'::uuid,'71e6193b-528f-4569-ad6d-45ed2459c0dc'::uuid,'ab8d4fc7-4c27-40aa-abff-f56a8f89c643'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$YouTube$t$,1,0,2,4),
  ('b1618003-cb52-43c4-9187-d11f7ebc7715'::uuid,'73e8d3e0-4835-4289-ac34-91f226bf4a05'::uuid,'6a565a68-08de-4bcb-93e9-a8b3e4cd88e8'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$VIEENT$t$,$t$YouTube$t$,1,0,4,3),
  ('720471b5-7d22-4794-9b31-edc2d5daab99'::uuid,'f167ae92-344b-49fc-8f13-621551fb9757'::uuid,'adfd9c9c-4b32-44bc-a6f9-d4c5a037ec7c'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$VIEENT$t$,$t$TikTok$t$,1,0,3,4),
  ('723f3bfc-2066-4579-b2ec-f437d638778a'::uuid,'f167ae92-344b-49fc-8f13-621551fb9757'::uuid,'adfd9c9c-4b32-44bc-a6f9-d4c5a037ec7c'::uuid,'01a26838-d9fb-434d-9972-b539024cd987'::uuid,$t$PAGE VPOP$t$,$t$Thread$t$,1,0,2,2),
  ('4aef2f26-60c3-4fa5-9f64-0a6b81e2fcad'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'82b86032-68f4-4a60-bb79-e999e4379952'::uuid,'01a26838-d9fb-434d-9972-b539024cd987'::uuid,$t$PAGE BOLERO / MT$t$,$t$Facebook$t$,1,0,2,1),
  ('4aef2f26-60c3-4fa5-9f64-0a6b81e2fcad'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'82b86032-68f4-4a60-bb79-e999e4379952'::uuid,'01a26838-d9fb-434d-9972-b539024cd987'::uuid,$t$PAGE BOLERO / MT$t$,$t$YouTube$t$,1,0,2,2),
  ('e0097ed8-b222-41a9-8829-221fe6616fd3'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'82b86032-68f4-4a60-bb79-e999e4379952'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$Facebook$t$,1,0,2,1),
  ('e0097ed8-b222-41a9-8829-221fe6616fd3'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'82b86032-68f4-4a60-bb79-e999e4379952'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$Instagram$t$,1,0,2,2),
  ('e0097ed8-b222-41a9-8829-221fe6616fd3'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'82b86032-68f4-4a60-bb79-e999e4379952'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$TikTok$t$,1,0,3,3),
  ('e0097ed8-b222-41a9-8829-221fe6616fd3'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'82b86032-68f4-4a60-bb79-e999e4379952'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$YouTube$t$,1,0,2,4),
  ('103c6fb8-9e2a-449f-912c-bdd5e5e67097'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'82b86032-68f4-4a60-bb79-e999e4379952'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$CAPCUT$t$,$t$TIKTOK CAPCUT$t$,1,3,0,1),
  ('103c6fb8-9e2a-449f-912c-bdd5e5e67097'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'82b86032-68f4-4a60-bb79-e999e4379952'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$EXT TIKTOK - CTV MẪU$t$,$t$TIKTOK CAPCUT$t$,1,2,0,2),
  ('103c6fb8-9e2a-449f-912c-bdd5e5e67097'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'82b86032-68f4-4a60-bb79-e999e4379952'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$TIKTOK BOLERO / MT$t$,$t$TIKTOK LYRICS$t$,1,15,0,3),
  ('50b5053b-ba3c-41db-b880-7d19576b7c08'::uuid,'787b5d4b-5e96-43a4-8abf-14658b62c693'::uuid,'f066a353-058f-44bb-92ea-ecba803dc0d7'::uuid,'01a26838-d9fb-434d-9972-b539024cd987'::uuid,$t$PAGE BOLERO / MT$t$,$t$Facebook$t$,1,0,4,1),
  ('50b5053b-ba3c-41db-b880-7d19576b7c08'::uuid,'787b5d4b-5e96-43a4-8abf-14658b62c693'::uuid,'f066a353-058f-44bb-92ea-ecba803dc0d7'::uuid,'01a26838-d9fb-434d-9972-b539024cd987'::uuid,$t$PAGE BOLERO / MT$t$,$t$YouTube$t$,1,0,5,2),
  ('e069fee5-e288-4a99-831c-55a1b9117fb6'::uuid,'787b5d4b-5e96-43a4-8abf-14658b62c693'::uuid,'f066a353-058f-44bb-92ea-ecba803dc0d7'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$Facebook$t$,1,0,2,1),
  ('e069fee5-e288-4a99-831c-55a1b9117fb6'::uuid,'787b5d4b-5e96-43a4-8abf-14658b62c693'::uuid,'f066a353-058f-44bb-92ea-ecba803dc0d7'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$Instagram$t$,1,0,2,2),
  ('e069fee5-e288-4a99-831c-55a1b9117fb6'::uuid,'787b5d4b-5e96-43a4-8abf-14658b62c693'::uuid,'f066a353-058f-44bb-92ea-ecba803dc0d7'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$TikTok$t$,1,0,3,3),
  ('e069fee5-e288-4a99-831c-55a1b9117fb6'::uuid,'787b5d4b-5e96-43a4-8abf-14658b62c693'::uuid,'f066a353-058f-44bb-92ea-ecba803dc0d7'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,$t$YouTube$t$,1,0,2,4),
  ('bcc570d6-47a1-4de1-8e57-df6a37150ead'::uuid,'787b5d4b-5e96-43a4-8abf-14658b62c693'::uuid,'f066a353-058f-44bb-92ea-ecba803dc0d7'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$EXT TIKTOK - BK MUSIC$t$,$t$TIKTOK CAPCUT$t$,1,10,0,1),
  ('bcc570d6-47a1-4de1-8e57-df6a37150ead'::uuid,'787b5d4b-5e96-43a4-8abf-14658b62c693'::uuid,'f066a353-058f-44bb-92ea-ecba803dc0d7'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$TIKTOK BOLERO / MT$t$,$t$TIKTOK LYRICS$t$,1,10,0,2),
  ('b0259c43-a7d9-4750-8c8d-1991819a5255'::uuid,'71e6193b-528f-4569-ad6d-45ed2459c0dc'::uuid,'ab8d4fc7-4c27-40aa-abff-f56a8f89c643'::uuid,'01a26838-d9fb-434d-9972-b539024cd987'::uuid,$t$PAGE BOLERO / MT$t$,$t$Facebook$t$,1,0,4,1),
  ('b0259c43-a7d9-4750-8c8d-1991819a5255'::uuid,'71e6193b-528f-4569-ad6d-45ed2459c0dc'::uuid,'ab8d4fc7-4c27-40aa-abff-f56a8f89c643'::uuid,'01a26838-d9fb-434d-9972-b539024cd987'::uuid,$t$PAGE BOLERO / MT$t$,$t$YouTube$t$,1,0,5,2),
  ('5dca41b6-eec0-490e-9d36-d24a0077d2e5'::uuid,'71e6193b-528f-4569-ad6d-45ed2459c0dc'::uuid,'ab8d4fc7-4c27-40aa-abff-f56a8f89c643'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$EXT TIKTOK - BK MUSIC$t$,$t$TIKTOK CAPCUT$t$,1,10,0,1),
  ('5dca41b6-eec0-490e-9d36-d24a0077d2e5'::uuid,'71e6193b-528f-4569-ad6d-45ed2459c0dc'::uuid,'ab8d4fc7-4c27-40aa-abff-f56a8f89c643'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$TIKTOK BOLERO / MT$t$,$t$TIKTOK LYRICS$t$,1,10,0,2)
on conflict do nothing;

create table if not exists package_rollup_fix_r513 (
  rollup_id uuid primary key, line_id uuid not null, old_total_posts int, new_total_posts int,
  new_platform_quantities jsonb, set_money boolean, new_total_money numeric, new_detail_text text, new_metric_quantities jsonb);
insert into package_rollup_fix_r513 values
  ('99e44fdd-2a40-4b4e-9735-698ae5c2311a'::uuid,'6c755407-3883-41ac-9e2f-bae5bebbac9b'::uuid,16,21,$j${"Facebook": 7, "Instagram": 7, "TikTok": 7}$j$::jsonb,false,NULL,NULL,NULL),
  ('a777f1b2-b138-4fa0-adca-09756094449a'::uuid,'873547e9-2d51-4195-bb88-3edc38e90442'::uuid,9,12,$j${"Facebook": 3, "Instagram": 3, "TikTok": 3, "YouTube": 3}$j$::jsonb,false,NULL,NULL,NULL),
  ('ae1d9281-cd6d-4bb2-8933-73300c748870'::uuid,'6e2ce628-0fd0-46d2-b425-0df8ce4eb7c2'::uuid,54,14,$j${"TIKTOK LYRICS": 14}$j$::jsonb,false,NULL,NULL,NULL),
  ('c137553e-2582-43ad-bffe-bd325e3371f0'::uuid,'6e2ce628-0fd0-46d2-b425-0df8ce4eb7c2'::uuid,10,15,$j${"TIKTOK CAPCUT": 15}$j$::jsonb,false,NULL,NULL,NULL),
  ('44c793f2-5a50-4a78-924d-2177c62f6d13'::uuid,'61602cc2-5475-4ace-b97e-b17ce9f2381e'::uuid,3,0,NULL,false,NULL,NULL,NULL),
  ('5f426d72-80e8-4dab-843a-0bc24ccc9b9a'::uuid,'61602cc2-5475-4ace-b97e-b17ce9f2381e'::uuid,0,10,$j${"TIKTOK CAPCUT": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('a6b02694-f18c-4aa0-a16f-07dc099a5cfc'::uuid,'d8e42045-b157-404c-b990-ef3abbb73906'::uuid,6,0,NULL,false,NULL,NULL,NULL),
  ('943bf2de-169d-4e2d-a4d9-339d5ade0853'::uuid,'d8e42045-b157-404c-b990-ef3abbb73906'::uuid,8,9,$j${"Facebook": 9}$j$::jsonb,false,NULL,NULL,NULL),
  ('e87b2da7-d308-4a2e-b152-2e5626e95777'::uuid,'0ac30a10-5705-443a-929c-737bcb0f5573'::uuid,7,10,$j${"Facebook": 2, "Instagram": 2, "TikTok": 3, "YouTube": 3}$j$::jsonb,false,NULL,NULL,NULL),
  ('b6ad59de-89dc-4034-b16a-adfdd79812f7'::uuid,'0ac30a10-5705-443a-929c-737bcb0f5573'::uuid,7,9,$j${"Facebook": 2, "Instagram": 2, "TikTok": 3, "YouTube": 2}$j$::jsonb,false,NULL,NULL,NULL),
  ('16f94f19-bdb5-4167-9ab0-b7c1c5830d9c'::uuid,'67fe4604-cf55-43c7-a138-9e932153486c'::uuid,0,4,$j${"Facebook": 1, "YouTube": 3}$j$::jsonb,false,NULL,NULL,NULL),
  ('d7853550-e90c-4962-a16e-de1919151c78'::uuid,'70ecba35-7fdf-46ca-941d-1fe557c4f3a3'::uuid,20000,30000,NULL,true,1650000,$t$SL 30000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 30000}$j$::jsonb),
  ('0a8e1e4e-7f34-4fce-b870-2f904fb2fe17'::uuid,'508e17ea-631f-436e-a765-70d2ae6afd21'::uuid,0,10,$j${"TIKTOK CAPCUT": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('d41ff904-f9af-4f83-856f-8265bb833791'::uuid,'273195bf-2e82-41d8-9ce9-bf5ce8a52dca'::uuid,8,0,NULL,false,NULL,NULL,NULL),
  ('93b02ddb-4dc0-470f-bc44-57d112faf24b'::uuid,'273195bf-2e82-41d8-9ce9-bf5ce8a52dca'::uuid,4,2,$j${"TIKTOK CAPCUT": 2}$j$::jsonb,false,NULL,NULL,NULL),
  ('8058ab9d-ce23-456e-9da4-e460eb6412fd'::uuid,'7ec01d07-1dda-431c-81ac-b7e101ca55e4'::uuid,11,9,$j${"Facebook": 3, "Instagram": 3, "TikTok": 3}$j$::jsonb,false,NULL,NULL,NULL),
  ('f3f87d94-4fd7-4451-b2a4-39550356a199'::uuid,'a00c1ab0-b059-442e-8557-d79923f0a655'::uuid,0,10,$j${"TIKTOK CAPCUT": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('3250bd90-5226-4499-8990-cfd2c8c8054b'::uuid,'a00c1ab0-b059-442e-8557-d79923f0a655'::uuid,5,10,$j${"TIKTOK CAPCUT": 5, "TIKTOK LYRICS": 5}$j$::jsonb,false,NULL,NULL,NULL),
  ('01d908a8-0661-4768-a683-a5aa0cca59cc'::uuid,'a00c1ab0-b059-442e-8557-d79923f0a655'::uuid,3,0,NULL,false,NULL,NULL,NULL),
  ('a9930720-2d8d-4b48-b1ae-39960b22f3ea'::uuid,'a00c1ab0-b059-442e-8557-d79923f0a655'::uuid,2,0,NULL,false,NULL,NULL,NULL),
  ('61df555b-e4f0-4d7e-a149-881b3ee22fe4'::uuid,'ea037666-54e5-40f9-93ac-79ffa6519a00'::uuid,0,0,NULL,false,NULL,NULL,NULL),
  ('3936d335-db6c-4d0f-9579-0a3ecfe44e58'::uuid,'aa1538a0-c08b-4559-9b8b-1bb0c1e18be4'::uuid,15,15,$j${"Facebook": 5, "Instagram": 5, "TikTok": 5}$j$::jsonb,false,NULL,NULL,NULL),
  ('a862cf9d-0d0d-4189-9978-496c49a62b99'::uuid,'52891b25-b764-485d-8245-fa2523ad8a11'::uuid,5000,20000,NULL,true,1100000,$t$SL 20000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 20000}$j$::jsonb),
  ('21977176-ef94-40d7-9615-7bea3c5024f7'::uuid,'31d6a82b-5f7b-4c72-afb2-739d6a7d158c'::uuid,10,0,$j${"TIKTOK CAPCUT": 0}$j$::jsonb,false,NULL,NULL,NULL),
  ('d79e6cf5-47cc-482c-88da-07af59109283'::uuid,'88c76b7f-bfc6-42cb-bc1a-517b5ac17cf2'::uuid,11,13,$j${"Facebook": 3, "Instagram": 3, "TikTok": 3, "YouTube": 4}$j$::jsonb,false,NULL,NULL,NULL),
  ('5053ffae-0878-40c6-8184-837aad1bc42b'::uuid,'7d7e4fe8-c739-4828-9c68-7c3c2c2a5ff1'::uuid,0,7,$j${"TIKTOK CAPCUT": 7}$j$::jsonb,false,NULL,NULL,NULL),
  ('c04bad2e-83f6-42d3-8aec-c74d2d27ae8b'::uuid,'7d7e4fe8-c739-4828-9c68-7c3c2c2a5ff1'::uuid,2,3,$j${"TIKTOK CAPCUT": 3}$j$::jsonb,false,NULL,NULL,NULL),
  ('2af12499-a6e1-4707-a627-a26fc0cf669c'::uuid,'7d7e4fe8-c739-4828-9c68-7c3c2c2a5ff1'::uuid,0,0,NULL,false,NULL,NULL,NULL),
  ('9fc43304-a04e-46b2-92b0-a5643a464669'::uuid,'7d7e4fe8-c739-4828-9c68-7c3c2c2a5ff1'::uuid,3,5,$j${"TIKTOK CAPCUT": 5}$j$::jsonb,false,NULL,NULL,NULL),
  ('6b32a99d-621d-4a6c-83ae-3c3327233cc6'::uuid,'93e8d0db-0d00-4e53-b989-1655f0e37bbe'::uuid,5,10,$j${"TIKTOK LYRICS": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('05bac75d-4a1b-4006-8232-612039225281'::uuid,'62986a0b-a98e-4000-95be-6a155697adcb'::uuid,21,11,$j${"Facebook": 2, "Instagram": 2, "TikTok": 3, "YouTube": 4}$j$::jsonb,false,NULL,NULL,NULL),
  ('93fa5705-bbd7-4b16-b554-63ca8160e60b'::uuid,'efbd91c0-3977-4812-a62c-d56a750b48e8'::uuid,8,9,$j${"Facebook": 3, "Instagram": 3, "TikTok": 3}$j$::jsonb,false,NULL,NULL,NULL),
  ('258ff441-0014-4776-8edb-2c8c821ba8ce'::uuid,'9dec9a7c-a1d4-47f1-af6d-3b5b3779519f'::uuid,5,7,$j${"Facebook": 2, "Instagram": 2, "TikTok": 3}$j$::jsonb,false,NULL,NULL,NULL),
  ('1e1fc08c-b806-48c7-988a-6f7bd2c1d883'::uuid,'fca67e39-f128-4bb1-ad62-c3fbf3d284b7'::uuid,20000,30000,NULL,true,1650000,$t$SL 30000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 30000}$j$::jsonb),
  ('f34a0396-c913-4d29-88c4-d23ad2d5e954'::uuid,'de4f2353-7d24-454f-846a-7e4f8c374811'::uuid,10,20,$j${"TIKTOK CAPCUT": 20}$j$::jsonb,false,NULL,NULL,NULL),
  ('6b6793f7-297d-4522-848a-c6004f4da820'::uuid,'3f75c4fc-f92e-4d01-a35a-35a39a3fe58c'::uuid,9,9,$j${"Facebook": 3, "Instagram": 3, "TikTok": 3}$j$::jsonb,false,NULL,NULL,NULL),
  ('dbdd2f7a-2684-4ef8-b049-7e376a7ac55b'::uuid,'47a1a406-fb54-445c-8c01-cf865b2b21d6'::uuid,4,7,$j${"Facebook": 4, "TikTok": 3}$j$::jsonb,false,NULL,NULL,NULL),
  ('1f70a0e7-6955-44e6-8c31-34df0eb951fa'::uuid,'988c7f4d-ba9e-4651-82bd-2d9dbd7fd6b4'::uuid,8,11,$j${"Facebook": 2, "Instagram": 2, "TikTok": 3, "YouTube": 4}$j$::jsonb,false,NULL,NULL,NULL),
  ('2bd75658-7397-4b0f-8b2b-174c51e55dbe'::uuid,'5787c0db-8462-408b-b3a4-1ccb0d1da3f1'::uuid,9,3,$j${"Facebook": 1, "Instagram": 1, "TikTok": 0, "YouTube": 1}$j$::jsonb,false,NULL,NULL,NULL),
  ('93897d2d-ebf9-4a8e-bf4d-f62d52bef802'::uuid,'dba12070-6a97-4ed2-ac44-dde5399d9279'::uuid,6,20,$j${"TIKTOK CAPCUT": 20}$j$::jsonb,false,NULL,NULL,NULL),
  ('c698e971-7a53-4a80-ae6a-27050c3404c6'::uuid,'dba12070-6a97-4ed2-ac44-dde5399d9279'::uuid,4,0,NULL,false,NULL,NULL,NULL),
  ('98087762-b999-4ae4-b9cc-fc4e6fd3c02c'::uuid,'d694d6e2-2167-4bd2-a48a-ee0ea563d802'::uuid,0,0,NULL,false,NULL,NULL,NULL),
  ('9939c781-7925-4f21-a039-ccc3d4edd80c'::uuid,'9bac6d89-9220-46c4-b5b9-6c858376356d'::uuid,5000,20000,NULL,true,1100000,$t$SL 20000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 20000}$j$::jsonb),
  ('4fb32d79-cde7-425e-bec2-ee6e00e21ec3'::uuid,'ef9ba6cb-ad79-42a8-bb48-db92833242ca'::uuid,5,10,$j${"TIKTOK CAPCUT": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('a520af96-6078-47af-8d9d-47014b16c109'::uuid,'ef9ba6cb-ad79-42a8-bb48-db92833242ca'::uuid,10,20,$j${"TIKTOK LYRICS": 20}$j$::jsonb,false,NULL,NULL,NULL),
  ('80d31b53-9b0b-4b51-858d-037cbe140386'::uuid,'47e56512-22c3-4d34-b13b-c1fdd5676b9c'::uuid,0,20,$j${"TIKTOK CAPCUT": 20}$j$::jsonb,false,NULL,NULL,NULL),
  ('2552d861-ca6d-4491-a027-52f30615333c'::uuid,'1494592d-26d1-4c2e-ae66-f1128a9455f3'::uuid,20,5,$j${"TIKTOK CAPCUT": 5}$j$::jsonb,false,NULL,NULL,NULL),
  ('ae8a0be4-cc77-4969-b555-54527ee0b6ab'::uuid,'42222e57-9d6f-4cc2-9c11-c11612e00b96'::uuid,6,9,$j${"Facebook": 2, "Instagram": 2, "TikTok": 3, "YouTube": 2}$j$::jsonb,false,NULL,NULL,NULL),
  ('80858b35-0ffa-44bc-be79-efe5188a91cd'::uuid,'fab1f4c4-ae7c-4ae9-ac9e-794dca71d3c3'::uuid,4,9,$j${"Facebook": 4, "YouTube": 5}$j$::jsonb,false,NULL,NULL,NULL),
  ('8202f7f4-89a6-4e21-af1f-7c025e7dab18'::uuid,'e1e20223-4e2c-4d8d-b973-5e1d8d3fe87a'::uuid,19,27,$j${"Facebook": 4, "Instagram": 4, "TikTok": 9, "YouTube": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('179a3a7b-2398-4383-85d0-c0f013dc855b'::uuid,'0f72eff0-3e99-44d5-bc7d-0865ce517726'::uuid,50000,20000,NULL,true,1100000,$t$SL 20000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 20000}$j$::jsonb),
  ('b7f314b5-70e0-4846-a217-26cdd4cccdef'::uuid,'b102542c-1bd5-4e58-8605-d3cf81db4bb9'::uuid,20,10,$j${"TIKTOK CAPCUT": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('f7e6cead-74a1-46a3-b365-b3dd06848a63'::uuid,'b102542c-1bd5-4e58-8605-d3cf81db4bb9'::uuid,2,0,$j${"TIKTOK CAPCUT": 0}$j$::jsonb,false,NULL,NULL,NULL),
  ('8d27041c-d126-4822-9160-938adcfc4f81'::uuid,'b102542c-1bd5-4e58-8605-d3cf81db4bb9'::uuid,8,5,$j${"TIKTOK CAPCUT": 5}$j$::jsonb,false,NULL,NULL,NULL),
  ('3031b331-5198-4ab4-9b00-9c2c3c81a7cc'::uuid,'f5f7d56b-8157-4cb6-85f8-c0ff2d274906'::uuid,20000,30000,NULL,true,1650000,$t$SL 30000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 30000}$j$::jsonb),
  ('ddf1d4f5-b100-47fe-bb4a-ed20789a8070'::uuid,'0dad6c1e-9b7f-475e-856d-c233cc757abd'::uuid,20000,30000,NULL,true,1650000,$t$SL 30000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 30000}$j$::jsonb),
  ('6badce92-0ce0-4a4b-a31e-717f9a79fef4'::uuid,'8fbb747f-9c4a-470e-8e2f-c6fcc7205337'::uuid,15,10,$j${"TIKTOK LYRICS": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('55fad17a-88b9-4ca5-99d1-f72870046285'::uuid,'8fbb747f-9c4a-470e-8e2f-c6fcc7205337'::uuid,5,0,NULL,false,NULL,NULL,NULL),
  ('c42b87d4-e51d-4559-ae1d-56d0a26d0008'::uuid,'2e12a5eb-024a-4d71-913e-433e8c753622'::uuid,20000,30000,NULL,true,1650000,$t$SL 30000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 30000}$j$::jsonb),
  ('1af64d4a-93cb-461b-85c0-a5f101b51829'::uuid,'4aa66c9c-8a5d-4006-8330-b48870ce05c6'::uuid,0,10,$j${"TIKTOK CAPCUT": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('4ba1d4f1-f4a9-4e61-b84b-e14c55d5203a'::uuid,'c847953b-7f11-4145-ad84-17bcc995d6ff'::uuid,0,4,$j${"MẪU CAPCUT": 1, "TIKTOK CAPCUT": 3}$j$::jsonb,false,NULL,NULL,NULL),
  ('44f3e86b-83f9-4534-9663-a744fd572d70'::uuid,'c847953b-7f11-4145-ad84-17bcc995d6ff'::uuid,15,10,$j${"TIKTOK LYRICS": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('711f5ba6-e1e7-4836-b704-0643b9b4df8b'::uuid,'c847953b-7f11-4145-ad84-17bcc995d6ff'::uuid,10,0,NULL,false,NULL,NULL,NULL),
  ('9ce75fcd-47b4-40b1-b9b8-a1b7be1bd3fa'::uuid,'c847953b-7f11-4145-ad84-17bcc995d6ff'::uuid,5,0,NULL,false,NULL,NULL,NULL),
  ('0da2b410-ecb8-4353-a10e-9ff94d88eb71'::uuid,'54d5120a-cd00-4e7a-a60f-7c475cf0f045'::uuid,6,0,$j${"TIKTOK CAPCUT": 0}$j$::jsonb,false,NULL,NULL,NULL),
  ('4800d33e-b995-425b-aef0-0c4a4f322389'::uuid,'54d5120a-cd00-4e7a-a60f-7c475cf0f045'::uuid,5,0,NULL,false,NULL,NULL,NULL),
  ('10019dd5-9d07-4d1a-bf51-5f49dcae082e'::uuid,'54d5120a-cd00-4e7a-a60f-7c475cf0f045'::uuid,3,0,NULL,false,NULL,NULL,NULL),
  ('ce57776e-87e6-45af-b400-d34aba640543'::uuid,'54d5120a-cd00-4e7a-a60f-7c475cf0f045'::uuid,8,5,$j${"TIKTOK CAPCUT": 5}$j$::jsonb,false,NULL,NULL,NULL),
  ('bf001ebe-becf-4817-8944-eb7d63c954e5'::uuid,'32dc8ebe-e683-40b4-8f20-a71e00d4c1d8'::uuid,9,9,$j${"Facebook": 3, "Instagram": 3, "TikTok": 3, "YouTube": 0}$j$::jsonb,false,NULL,NULL,NULL),
  ('bc5dd6dd-ebf8-4bb7-9170-a1e3d16127d3'::uuid,'bd81df2f-ef9e-450c-b615-1ac2aa2a3521'::uuid,0,10,$j${"TIKTOK CAPCUT": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('ab1a6e6d-7e7e-4b8a-8710-1d5b2a119096'::uuid,'f1b23ffa-d9cf-4b45-9944-4376355894cd'::uuid,20000,5000,NULL,true,275000,$t$SL 5000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 5000}$j$::jsonb),
  ('fff7e827-99fb-478b-800d-e14315966b49'::uuid,'3fc23e48-4003-4a27-b41e-1bcd8b9db540'::uuid,20000,5000,NULL,true,275000,$t$SL 5000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 5000}$j$::jsonb),
  ('75886eff-de91-43db-98c1-fca813929186'::uuid,'8faacbb2-f7e1-4a71-9cdf-b70fd3803eb9'::uuid,6,3,$j${"Facebook": 1, "Instagram": 1, "YouTube": 1}$j$::jsonb,false,NULL,NULL,NULL),
  ('ddb5c296-c782-4448-a403-7abd9603706f'::uuid,'19dfc5c5-817d-4040-a3f5-500d10d1594b'::uuid,20000,5000,NULL,true,275000,$t$SL 5000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 5000}$j$::jsonb),
  ('43130b39-d129-48d6-804f-a8001d4ea5b1'::uuid,'b79f1d17-0656-4c06-aae2-18a3ad351e5c'::uuid,10,0,$j${"TIKTOK CAPCUT": 0}$j$::jsonb,false,NULL,NULL,NULL),
  ('a504062c-39d4-407b-a444-afe507e0e41f'::uuid,'b79f1d17-0656-4c06-aae2-18a3ad351e5c'::uuid,0,2,$j${"TIKTOK CAPCUT": 2}$j$::jsonb,false,NULL,NULL,NULL),
  ('ec73858e-7c59-47bb-95a4-8b5120217531'::uuid,'b79f1d17-0656-4c06-aae2-18a3ad351e5c'::uuid,5,3,$j${"TIKTOK CAPCUT": 3}$j$::jsonb,false,NULL,NULL,NULL),
  ('5cdad193-535f-4179-90d2-cefcbd0ee744'::uuid,'3df807c5-c6c0-4571-b76a-b6a9b86fa039'::uuid,0,10,$j${"TIKTOK CAPCUT": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('4fe5e312-502a-491d-9dff-4f336fd8614c'::uuid,'3df807c5-c6c0-4571-b76a-b6a9b86fa039'::uuid,0,5,$j${"TIKTOK CAPCUT": 5}$j$::jsonb,false,NULL,NULL,NULL),
  ('31ff994a-2172-45ea-89f8-daa588bc6e01'::uuid,'4889bffc-af06-40f4-9484-e991bf1e67b0'::uuid,20000,30000,NULL,true,1650000,$t$SL 30000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 30000}$j$::jsonb),
  ('8134a436-4fae-469c-bc49-c29a4291a81c'::uuid,'34f3d1c7-ce39-49a9-a3ee-ff5c618cd798'::uuid,15,10,$j${"TIKTOK LYRICS": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('7fb7fee8-290c-46df-8a8c-4fe262ee1b78'::uuid,'34f3d1c7-ce39-49a9-a3ee-ff5c618cd798'::uuid,5,0,$j${"TIKTOK CAPCUT": 0}$j$::jsonb,false,NULL,NULL,NULL),
  ('d31aa8ae-0201-4a55-bdcd-9362fa61a3c9'::uuid,'f7650238-7114-4e14-ace7-35f2bddb12a5'::uuid,20000,5000,NULL,true,275000,$t$SL 5000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 5000}$j$::jsonb),
  ('107e08dc-0088-4021-afd2-a2f517f235d2'::uuid,'264e3c26-a183-4c1e-ae79-d713382eecf7'::uuid,10,0,$j${"TIKTOK CAPCUT": 0}$j$::jsonb,false,NULL,NULL,NULL),
  ('19cde963-0bb9-431b-abdc-a332e2b8b8f8'::uuid,'8667efa5-08fb-4c30-b92a-36d9f2eea075'::uuid,0,2,$j${"TIKTOK CAPCUT": 2}$j$::jsonb,false,NULL,NULL,NULL),
  ('27bfa9c1-6156-4abd-a1b9-8f6fe0b0f007'::uuid,'8667efa5-08fb-4c30-b92a-36d9f2eea075'::uuid,0,3,$j${"TIKTOK CAPCUT": 3}$j$::jsonb,false,NULL,NULL,NULL),
  ('7b25922b-ba17-43c5-8679-3dfcdd7b9e0b'::uuid,'19e9574a-f212-461e-a73d-c01bb4be4ce9'::uuid,6,3,$j${"Facebook": 1, "Instagram": 1, "YouTube": 1}$j$::jsonb,false,NULL,NULL,NULL),
  ('4fae13cc-acd5-4e6b-b344-ff03da83e6f7'::uuid,'1e3f75ed-a6c4-4669-9f20-3fa6ddc416ef'::uuid,20000,5000,NULL,true,275000,$t$SL 5000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 5000}$j$::jsonb),
  ('763055d1-5ab6-42cc-a4b4-49a499eb6793'::uuid,'568288ff-3338-46a0-8b93-82623a45a987'::uuid,10,0,$j${"TIKTOK CAPCUT": 0}$j$::jsonb,false,NULL,NULL,NULL),
  ('744ba278-a9ef-4ede-bc66-93876578cf28'::uuid,'8491ef86-d3ca-4ae6-8c7f-bce63903c7ca'::uuid,0,20,$j${"TIKTOK CAPCUT": 20}$j$::jsonb,false,NULL,NULL,NULL),
  ('a5deb3e8-9b9c-49ff-ae31-fee64b4eab4f'::uuid,'8491ef86-d3ca-4ae6-8c7f-bce63903c7ca'::uuid,0,5,$j${"TIKTOK CAPCUT": 5}$j$::jsonb,false,NULL,NULL,NULL),
  ('d4f9ee60-7ae1-4339-bce9-d864479256aa'::uuid,'84281c14-0558-4156-b6c9-47cfa2814e1c'::uuid,6,10,$j${"Facebook": 5, "YouTube": 5}$j$::jsonb,false,NULL,NULL,NULL),
  ('61c503da-443c-4b71-81c9-a76a3567fa98'::uuid,'f6fa7d7a-ca21-41cf-afee-fc94de9c88ed'::uuid,5000,30000,NULL,true,1650000,$t$SL 30000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 30000}$j$::jsonb),
  ('7982dfda-d168-4224-b3c7-c107aab77b03'::uuid,'77d0b53e-a0f3-407d-9b3f-f98fff7bd6da'::uuid,20,10,$j${"TIKTOK CAPCUT": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('5e1a4221-f4ba-4f2b-8588-87cdd6c3587b'::uuid,'81aced2f-d882-45e4-84b1-9b1b8deb7d07'::uuid,5000,20000,NULL,true,1100000,$t$SL 20000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 20000}$j$::jsonb),
  ('23a90b0b-ea09-43b9-bc41-f3a3e52d0fc1'::uuid,'1906ca88-0e10-45f1-b569-affe43fd29e4'::uuid,15,18,$j${"Facebook": 4, "Instagram": 4, "TikTok": 6, "YouTube": 4}$j$::jsonb,false,NULL,NULL,NULL),
  ('195406d5-b4eb-4b48-9a78-bf1c41c7583e'::uuid,'0fb5028f-58d7-4cfb-99f4-cf8b1281915c'::uuid,15000,30000,NULL,true,1650000,$t$SL 30000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 30000}$j$::jsonb),
  ('6f2fe27f-267c-43fe-9252-c0ad383e946c'::uuid,'73da2d5d-f5c9-497a-8c52-495fbeb71801'::uuid,0,10,$j${"TIKTOK CAPCUT": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('47d6aa27-a44a-485c-835b-022f667978b7'::uuid,'73da2d5d-f5c9-497a-8c52-495fbeb71801'::uuid,0,5,$j${"TIKTOK CAPCUT": 5}$j$::jsonb,false,NULL,NULL,NULL),
  ('13b97507-9c98-4dab-afcd-832cc475b759'::uuid,'ffd37e91-e40b-469c-a0fb-60e3ee478ca4'::uuid,10,20,$j${"TIKTOK CAPCUT": 20}$j$::jsonb,false,NULL,NULL,NULL),
  ('c06cfe4d-dfbd-4208-b10c-859855ce3420'::uuid,'79c2e7e6-8d5e-4234-a156-eba628ff45f3'::uuid,30000,5000,NULL,true,275000,$t$SL 5000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 5000}$j$::jsonb),
  ('bb46e858-a050-4b17-984a-b1194db07f4e'::uuid,'dc3e11b3-3092-4a4a-a4b2-4aad44b370b1'::uuid,0,20,$j${"TIKTOK CAPCUT": 20}$j$::jsonb,false,NULL,NULL,NULL),
  ('4ffdc74e-092e-4461-8090-87f01bcad6d8'::uuid,'dc3e11b3-3092-4a4a-a4b2-4aad44b370b1'::uuid,0,2,$j${"TIKTOK CAPCUT": 2}$j$::jsonb,false,NULL,NULL,NULL),
  ('574ae3ba-7e33-4ec3-8b5e-374166dcff4e'::uuid,'dc3e11b3-3092-4a4a-a4b2-4aad44b370b1'::uuid,0,3,$j${"TIKTOK CAPCUT": 3}$j$::jsonb,false,NULL,NULL,NULL),
  ('b00cd947-11f6-4437-a5f0-a1be09ddff16'::uuid,'be388cd9-7547-46a7-b274-7aedf03db735'::uuid,30,45,$j${"TIKTOK CAPCUT": 45}$j$::jsonb,false,NULL,NULL,NULL),
  ('6a322390-78df-4b0b-b1ef-7c6b29f7195c'::uuid,'95ebcf54-b482-46fa-89fa-1cc0dd12cd0e'::uuid,0,10,$j${"TIKTOK CAPCUT": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('4a0e7b83-7fc6-4e8f-9278-87f7d1daa892'::uuid,'95ebcf54-b482-46fa-89fa-1cc0dd12cd0e'::uuid,0,2,$j${"TIKTOK CAPCUT": 2}$j$::jsonb,false,NULL,NULL,NULL),
  ('1dd05ca1-6190-466f-aca9-d6918e4923bc'::uuid,'95ebcf54-b482-46fa-89fa-1cc0dd12cd0e'::uuid,0,3,$j${"TIKTOK CAPCUT": 3}$j$::jsonb,false,NULL,NULL,NULL),
  ('6a4ad0e3-87e0-4c37-9d15-285d9a3ef60d'::uuid,'826a99b2-0a39-4dd8-884a-dcd45a396453'::uuid,20000,30000,NULL,true,1650000,$t$SL 30000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 30000}$j$::jsonb),
  ('6398707f-3f2c-4ac9-bbfb-5a0139a6177e'::uuid,'0d3680f6-de41-4c1a-b353-4104950f1f88'::uuid,10,15,$j${"TIKTOK LYRICS": 15}$j$::jsonb,false,NULL,NULL,NULL),
  ('67ebe1d7-09d9-441f-899c-da087816f82e'::uuid,'0d3680f6-de41-4c1a-b353-4104950f1f88'::uuid,10,15,$j${"TIKTOK CAPCUT": 15}$j$::jsonb,false,NULL,NULL,NULL),
  ('919b4d5c-4c41-4159-914b-109cfff2b683'::uuid,'b3878ea1-f2c9-4fef-b2a9-ed84d9033c2b'::uuid,5000,30000,NULL,true,1650000,$t$SL 30000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 30000}$j$::jsonb),
  ('1ca27bf8-b2d1-40a4-a865-3c2aea6ce520'::uuid,'671ededd-4d74-4541-a946-3cf25d1c9362'::uuid,5000,20000,NULL,true,1100000,$t$SL 20000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 20000}$j$::jsonb),
  ('16dcbc16-15a3-4188-9465-f2c0c6cec5c9'::uuid,'ed67b3bf-e1aa-4bd7-84c3-62e9461d1949'::uuid,10,6,$j${"Facebook": 3, "YouTube": 3}$j$::jsonb,false,NULL,NULL,NULL),
  ('51a0456b-7f12-4267-8f9b-26253f725236'::uuid,'f0e16462-db56-4c39-ac04-328b6b90375c'::uuid,20000,5000,NULL,true,275000,$t$SL 5000 Thruplay (Views)$t$,$j${"Thruplay (Views)": 5000}$j$::jsonb),
  ('128984af-8bd0-4dd0-85f7-306d2bda9e59'::uuid,'fae2a4d0-39d6-4c79-aa2b-f877f8cc44b9'::uuid,6,8,$j${"Facebook": 4, "YouTube": 4}$j$::jsonb,false,NULL,NULL,NULL),
  ('b2752b5b-79dc-4dea-afe4-4217a66c8d73'::uuid,'7482061f-9e2b-4771-9dc1-f78e9aee34e6'::uuid,10,0,$j${"TIKTOK CAPCUT": 0}$j$::jsonb,false,NULL,NULL,NULL),
  ('26158884-0b64-4f84-8a2b-fdc185e709d9'::uuid,'7482061f-9e2b-4771-9dc1-f78e9aee34e6'::uuid,5,0,$j${"TIKTOK CAPCUT": 0}$j$::jsonb,false,NULL,NULL,NULL),
  ('cae9bf14-6c70-4414-8ed5-509c19b4c0cd'::uuid,'480e73c6-20b2-4bf9-8b25-c5de3555c33d'::uuid,6,9,$j${"Facebook": 2, "Instagram": 2, "TikTok": 3, "YouTube": 2}$j$::jsonb,false,NULL,NULL,NULL),
  ('3b61ab3c-7737-4993-b803-8a9a7acf3a64'::uuid,'f72b6fe1-8fc5-419e-9b6f-48ce151670cd'::uuid,3,9,$j${"Facebook": 2, "Instagram": 2, "TikTok": 3, "YouTube": 2}$j$::jsonb,false,NULL,NULL,NULL),
  ('e74e62b7-0304-4987-a5a1-edde563c5295'::uuid,'3c7ced09-d4d4-4119-86d4-171b805771f7'::uuid,19,35,$j${"Facebook": 5, "Instagram": 5, "TikTok": 12, "YouTube": 13}$j$::jsonb,false,NULL,NULL,NULL),
  ('acfec02d-e679-4e04-8e2d-7a8fb155ab66'::uuid,'256c846d-2066-4618-beb3-7636258fcc39'::uuid,12,20,$j${"Facebook": 10, "TikTok": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('3084b79f-42a1-47c3-87e5-4aa3dabf821e'::uuid,'51abf5e3-de85-4eda-8380-8195fb0546f6'::uuid,5,8,$j${"Facebook": 3, "Instagram": 3, "TikTok": 2}$j$::jsonb,false,NULL,NULL,NULL),
  ('0c7200b1-ca9d-4e3b-8e99-965e6b3b292f'::uuid,'b1618003-cb52-43c4-9187-d11f7ebc7715'::uuid,7,11,$j${"Facebook": 2, "Instagram": 2, "TikTok": 3, "YouTube": 4}$j$::jsonb,false,NULL,NULL,NULL),
  ('4719c2c5-a1f5-46a3-b04c-a65862c46dbb'::uuid,'b4086bb3-064d-4a94-b377-93caa0553e76'::uuid,6,4,$j${"Facebook": 2, "YouTube": 2}$j$::jsonb,false,NULL,NULL,NULL),
  ('b3549cfb-b360-4bc6-a32a-bfb3f1d1672d'::uuid,'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca'::uuid,10,20,$j${"TIKTOK CAPCUT": 20}$j$::jsonb,false,NULL,NULL,NULL),
  ('2720eed4-c89b-41e0-92dd-ea9318678018'::uuid,'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca'::uuid,0,0,NULL,false,NULL,NULL,NULL),
  ('b249f007-ac42-47f5-88cd-f77b23b49cef'::uuid,'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca'::uuid,0,10,$j${"TIKTOK CAPCUT": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('84d82aa7-23ca-4176-955e-6c4485dfeafb'::uuid,'66cf7123-8231-42ac-9906-0cf1a2586fc1'::uuid,20,28,$j${"Facebook": 5, "Instagram": 5, "TikTok": 9, "YouTube": 9}$j$::jsonb,false,NULL,NULL,NULL),
  ('c945926e-30d6-466f-b5dc-999c20ea98b8'::uuid,'a9f1e09e-40d6-4499-b55b-302b1e27f716'::uuid,16,22,$j${"Facebook": 8, "Instagram": 8, "TikTok": 6}$j$::jsonb,false,NULL,NULL,NULL),
  ('362928cb-21c5-4272-853c-ee396b40d02f'::uuid,'720471b5-7d22-4794-9b31-edc2d5daab99'::uuid,5,11,$j${"Facebook": 2, "Instagram": 2, "TikTok": 3, "YouTube": 4}$j$::jsonb,false,NULL,NULL,NULL),
  ('dda48c26-6799-47bb-bf16-b9928a200e6b'::uuid,'5528cd29-6f2d-465d-b122-ce28210af68b'::uuid,6,12,$j${"Facebook": 4, "Thread": 4, "TikTok": 4}$j$::jsonb,false,NULL,NULL,NULL),
  ('d89f2e55-1bdb-4bf6-8c27-f8363e44b122'::uuid,'dd38de32-3cf4-4095-8cf6-087693378815'::uuid,0,0,NULL,false,NULL,NULL,NULL),
  ('8c8f05e4-382b-404f-98d0-b153d9b6677b'::uuid,'dd38de32-3cf4-4095-8cf6-087693378815'::uuid,3,2,$j${"TIKTOK CAPCUT": 2}$j$::jsonb,false,NULL,NULL,NULL),
  ('32ba4243-f09b-4317-8183-7d897d4a4b35'::uuid,'3abc7229-97df-4b87-9803-1c3a2fc9b789'::uuid,0,10,$j${"TIKTOK CAPCUT": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('280acae9-9cf9-4aa4-a07b-76133b7e0f03'::uuid,'9db2108c-c1b9-4b97-b296-35ef9b2114a0'::uuid,11,13,$j${"Facebook": 3, "Instagram": 3, "TikTok": 3, "YouTube": 4}$j$::jsonb,false,NULL,NULL,NULL),
  ('73dbf8e5-76ae-4bd0-afd2-7f6135e9511a'::uuid,'6ad9ac2d-7ebf-436d-a665-2143c5a672ba'::uuid,7,10,$j${"Facebook": 4, "Instagram": 4, "TikTok": 2}$j$::jsonb,false,NULL,NULL,NULL),
  ('585aa0ed-fac4-4f7f-8628-fc9eb1f25c84'::uuid,'c9aeef99-9d5a-41c3-a1da-7bb84d33122d'::uuid,15,10,$j${"TIKTOK LYRICS": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('7e915d7e-6cee-453c-a212-d0a27cdf79ea'::uuid,'c9aeef99-9d5a-41c3-a1da-7bb84d33122d'::uuid,5,0,NULL,false,NULL,NULL,NULL),
  ('98ddc8fe-3119-4394-bf99-7a9894de4a03'::uuid,'54ec75ab-e259-4317-a99d-c507bfd2b059'::uuid,13,23,$j${"Facebook": 5, "Instagram": 5, "TikTok": 6, "YouTube": 7}$j$::jsonb,false,NULL,NULL,NULL),
  ('190657ec-2392-4d07-8cbd-b36d5459a591'::uuid,'723f3bfc-2066-4579-b2ec-f437d638778a'::uuid,8,10,$j${"Facebook": 4, "Thread": 2, "TikTok": 4}$j$::jsonb,false,NULL,NULL,NULL),
  ('a25375db-ba2d-4131-a87b-9755888a6abf'::uuid,'099bc560-51de-47f3-8590-4e0d5feff500'::uuid,0,10,$j${"TIKTOK CAPCUT": 10}$j$::jsonb,false,NULL,NULL,NULL),
  ('35c2ae07-e287-4854-aede-2ea1c6b4ae34'::uuid,'099bc560-51de-47f3-8590-4e0d5feff500'::uuid,0,5,$j${"TIKTOK CAPCUT": 5}$j$::jsonb,false,NULL,NULL,NULL),
  ('faa20f3d-62be-4b83-82dc-882c2424c5aa'::uuid,'dc193d4b-3ab7-4374-840c-4f820ce3e683'::uuid,10,2,$j${"TIKTOK CAPCUT": 2}$j$::jsonb,false,NULL,NULL,NULL),
  ('0c4325fd-a6f0-4d87-a7fe-7f4fe99dd480'::uuid,'dc193d4b-3ab7-4374-840c-4f820ce3e683'::uuid,5,3,$j${"TIKTOK CAPCUT": 3}$j$::jsonb,false,NULL,NULL,NULL),
  ('5616e81b-8a4e-46ca-b195-1b19026598a0'::uuid,'6cce0f48-ce4f-4fd1-aa4c-74ac3c41d794'::uuid,10,0,$j${"TIKTOK CAPCUT": 0}$j$::jsonb,false,NULL,NULL,NULL),
  ('ffa8f8dc-6b7b-4b41-a214-f524e640ea54'::uuid,'2d963167-4142-4992-8c39-daccf7abfd31'::uuid,11,3,$j${"Facebook": 1, "Instagram": 1, "YouTube": 1}$j$::jsonb,false,NULL,NULL,NULL),
  ('a52c78bc-dfaa-435b-9af7-688da3483d5d'::uuid,'521fe53f-65eb-45c1-ab41-fa5282a33202'::uuid,11,3,$j${"Facebook": 1, "Instagram": 1, "YouTube": 1}$j$::jsonb,false,NULL,NULL,NULL),
  ('79824d2f-06b6-42b1-a520-aefd5f4368e3'::uuid,'24f2eb89-4297-44a7-a299-809931ab9ca5'::uuid,10,8,$j${"Facebook": 3, "Instagram": 3, "TikTok": 2}$j$::jsonb,false,NULL,NULL,NULL)
on conflict (rollup_id) do nothing;

create table if not exists package_rollup_insert_r513 (
  line_id uuid not null, release_id uuid not null, package_id uuid not null, category_id uuid not null,
  brand text not null, total_posts int, platform_quantities jsonb, primary key (package_id, category_id, brand));
insert into package_rollup_insert_r513 values
  ('efd64e3d-8290-4950-9af3-95dac1a9d0fb'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'462f1267-b3eb-4e7e-b0fb-9c4b05979211'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$TIKTOK BOLERO / MT$t$,15,$j${"TIKTOK LYRICS": 15}$j$::jsonb),
  ('90a95a56-2f65-4701-bf4f-0ff2a2bfb83b'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'462f1267-b3eb-4e7e-b0fb-9c4b05979211'::uuid,'01a26838-d9fb-434d-9972-b539024cd987'::uuid,$t$PAGE BOLERO / MT$t$,6,$j${"Facebook": 3, "YouTube": 3}$j$::jsonb),
  ('93d853ee-04e2-4bb5-8467-1566f3524cba'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'462f1267-b3eb-4e7e-b0fb-9c4b05979211'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,9,$j${"Facebook": 2, "Instagram": 2, "TikTok": 3, "YouTube": 2}$j$::jsonb),
  ('ffc6e782-0425-4470-9cfa-c723311c2f34'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'d69e6988-2001-4127-9fd6-df3592a6fdc7'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,9,$j${"Facebook": 2, "Instagram": 2, "TikTok": 3, "YouTube": 2}$j$::jsonb),
  ('020a72d1-ed5c-4be1-b6f9-5f976dd4e3f7'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'d69e6988-2001-4127-9fd6-df3592a6fdc7'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$TIKTOK BOLERO / MT$t$,15,$j${"TIKTOK LYRICS": 15}$j$::jsonb),
  ('e68a6f5d-66cc-4bd1-82c3-841152751368'::uuid,'71e6193b-528f-4569-ad6d-45ed2459c0dc'::uuid,'ab8d4fc7-4c27-40aa-abff-f56a8f89c643'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,9,$j${"Facebook": 2, "Instagram": 2, "TikTok": 3, "YouTube": 2}$j$::jsonb),
  ('4aef2f26-60c3-4fa5-9f64-0a6b81e2fcad'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'82b86032-68f4-4a60-bb79-e999e4379952'::uuid,'01a26838-d9fb-434d-9972-b539024cd987'::uuid,$t$PAGE BOLERO / MT$t$,4,$j${"Facebook": 2, "YouTube": 2}$j$::jsonb),
  ('e0097ed8-b222-41a9-8829-221fe6616fd3'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'82b86032-68f4-4a60-bb79-e999e4379952'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,9,$j${"Facebook": 2, "Instagram": 2, "TikTok": 3, "YouTube": 2}$j$::jsonb),
  ('103c6fb8-9e2a-449f-912c-bdd5e5e67097'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'82b86032-68f4-4a60-bb79-e999e4379952'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$CAPCUT$t$,3,$j${"TIKTOK CAPCUT": 3}$j$::jsonb),
  ('103c6fb8-9e2a-449f-912c-bdd5e5e67097'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'82b86032-68f4-4a60-bb79-e999e4379952'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$TIKTOK BOLERO / MT$t$,15,$j${"TIKTOK LYRICS": 15}$j$::jsonb),
  ('103c6fb8-9e2a-449f-912c-bdd5e5e67097'::uuid,'46883b41-4272-4ba2-9d4b-48469977cb54'::uuid,'82b86032-68f4-4a60-bb79-e999e4379952'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$EXT TIKTOK - CTV MẪU$t$,2,$j${"TIKTOK CAPCUT": 2}$j$::jsonb),
  ('50b5053b-ba3c-41db-b880-7d19576b7c08'::uuid,'787b5d4b-5e96-43a4-8abf-14658b62c693'::uuid,'f066a353-058f-44bb-92ea-ecba803dc0d7'::uuid,'01a26838-d9fb-434d-9972-b539024cd987'::uuid,$t$PAGE BOLERO / MT$t$,9,$j${"Facebook": 4, "YouTube": 5}$j$::jsonb),
  ('e069fee5-e288-4a99-831c-55a1b9117fb6'::uuid,'787b5d4b-5e96-43a4-8abf-14658b62c693'::uuid,'f066a353-058f-44bb-92ea-ecba803dc0d7'::uuid,'2c8cbf9b-e828-48c2-85dc-42f01452bf08'::uuid,$t$ENVI$t$,9,$j${"Facebook": 2, "Instagram": 2, "TikTok": 3, "YouTube": 2}$j$::jsonb),
  ('bcc570d6-47a1-4de1-8e57-df6a37150ead'::uuid,'787b5d4b-5e96-43a4-8abf-14658b62c693'::uuid,'f066a353-058f-44bb-92ea-ecba803dc0d7'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$TIKTOK BOLERO / MT$t$,10,$j${"TIKTOK LYRICS": 10}$j$::jsonb),
  ('bcc570d6-47a1-4de1-8e57-df6a37150ead'::uuid,'787b5d4b-5e96-43a4-8abf-14658b62c693'::uuid,'f066a353-058f-44bb-92ea-ecba803dc0d7'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$EXT TIKTOK - BK MUSIC$t$,10,$j${"TIKTOK CAPCUT": 10}$j$::jsonb),
  ('b0259c43-a7d9-4750-8c8d-1991819a5255'::uuid,'71e6193b-528f-4569-ad6d-45ed2459c0dc'::uuid,'ab8d4fc7-4c27-40aa-abff-f56a8f89c643'::uuid,'01a26838-d9fb-434d-9972-b539024cd987'::uuid,$t$PAGE BOLERO / MT$t$,9,$j${"Facebook": 4, "YouTube": 5}$j$::jsonb),
  ('5dca41b6-eec0-490e-9d36-d24a0077d2e5'::uuid,'71e6193b-528f-4569-ad6d-45ed2459c0dc'::uuid,'ab8d4fc7-4c27-40aa-abff-f56a8f89c643'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$TIKTOK BOLERO / MT$t$,10,$j${"TIKTOK LYRICS": 10}$j$::jsonb),
  ('5dca41b6-eec0-490e-9d36-d24a0077d2e5'::uuid,'71e6193b-528f-4569-ad6d-45ed2459c0dc'::uuid,'ab8d4fc7-4c27-40aa-abff-f56a8f89c643'::uuid,'0a6a8a99-6f07-495d-9d08-f4462e05b091'::uuid,$t$EXT TIKTOK - BK MUSIC$t$,10,$j${"TIKTOK CAPCUT": 10}$j$::jsonb)
on conflict do nothing;

-- backup copies of every row that may change
create table if not exists package_entries_backup_r513 as select * from media_booking_content_entries where false;
insert into package_entries_backup_r513 select e.* from media_booking_content_entries e
  where e.id in (select entry_id from package_grid_fix_r513) and not exists (select 1 from package_entries_backup_r513 b where b.id = e.id);
create table if not exists package_rollups_backup_r513 as select * from media_booking_package_categories where false;
insert into package_rollups_backup_r513 select r.* from media_booking_package_categories r
  where r.id in (select rollup_id from package_rollup_fix_r513) and not exists (select 1 from package_rollups_backup_r513 b where b.id = r.id);

-- PREVIEW: one row per line — the line total vs what the tier's grid adds up to NOW and AFTER this fix
with ent as (
  select e.id, e.package_id, e.category_id, c.name as cat,
         case when c.name = 'TikTok Channel' then e.channel_count * e.count_posts
              when c.name = 'Ads' then e.count_posts
              else e.channel_count * (e.count_tung_hint + e.count_out_now + e.count_listen_now + e.count_addin_post) end as now_total,
         case when c.name = 'TikTok Channel' then coalesce(f.new_cc, e.channel_count) * coalesce(f.new_posts, e.count_posts)
              when c.name = 'Ads' then coalesce(f.new_posts, e.count_posts)
              else coalesce(f.new_cc, e.channel_count) * (coalesce(f.new_tung, e.count_tung_hint) + coalesce(f.new_out, e.count_out_now) + coalesce(f.new_listen, e.count_listen_now) + coalesce(f.new_addin, e.count_addin_post)) end as after_total
  from media_booking_content_entries e
  join package_categories c on c.id = e.category_id
  left join package_grid_fix_r513 f on f.entry_id = e.id
)
select r.did, r.title, p.name as tier, c.name as hang_muc, l.brand, l.quantity as line_total,
       coalesce((select sum(now_total) from ent where ent.package_id = l.package_id and ent.category_id = l.category_id), 0) as grid_now,
       coalesce((select sum(after_total) from ent where ent.package_id = l.package_id and ent.category_id = l.category_id), 0)
         + coalesce((select sum(case when c.name = 'TikTok Channel' then g.channel_count * g.count_posts when c.name = 'Ads' then g.count_posts else g.channel_count * g.count_listen_now end)
                     from package_grid_insert_r513 g where g.package_id = l.package_id and g.category_id = l.category_id), 0) as grid_after,
       (select count(*) from package_grid_fix_r513 f where f.line_id = l.id) as rows_to_change,
       (select count(*) from package_grid_insert_r513 g where g.line_id = l.id) as rows_to_add
from package_grid_lines_r513 t
join media_booking_package_lines l on l.id = t.line_id
join media_booking_packages p on p.id = l.package_id
join releases r on r.id = p.release_id
left join package_categories c on c.id = l.category_id
order by r.did, p.name, c.name;
-- (a line whose grid_after still differs from line_total is a restored line whose own total never matched its Cells — Summarize will fix it)

-- ===== STEP 2 =====
update media_booking_content_entries e
set channel_count = f.new_cc, count_posts = f.new_posts, count_tung_hint = f.new_tung, count_out_now = f.new_out,
    count_listen_now = f.new_listen, count_addin_post = f.new_addin
from package_grid_fix_r513 f
join package_grid_lines_r513 t on t.line_id = f.line_id
join media_booking_package_lines l on l.id = f.line_id and (l.manual_lock or not t.restored) and l.quantity is not distinct from t.line_qty
 and l.brand_column_quantities is not distinct from t.line_cells
where e.id = f.entry_id
  and e.channel_count = f.old_cc and e.count_posts = f.old_posts and e.count_tung_hint = f.old_tung
  and e.count_out_now = f.old_out and e.count_listen_now = f.old_listen and e.count_addin_post = f.old_addin;

insert into media_booking_content_entries (release_id, package_id, category_id, brand, platform, channel_count, count_posts, count_listen_now, sort_order)
select g.release_id, g.package_id, g.category_id, g.brand, g.platform, g.channel_count, g.count_posts, g.count_listen_now, g.sort_order
from package_grid_insert_r513 g
join package_grid_lines_r513 t on t.line_id = g.line_id
join media_booking_package_lines l on l.id = g.line_id and (l.manual_lock or not t.restored) and l.quantity is not distinct from t.line_qty
 and l.brand_column_quantities is not distinct from t.line_cells
where not exists (select 1 from media_booking_content_entries e
                  where e.package_id = g.package_id and e.category_id = g.category_id and e.brand = g.brand and e.platform = g.platform);

update media_booking_package_categories r
set total_posts = f.new_total_posts, platform_quantities = f.new_platform_quantities, updated_at = now(),
    total_money = case when f.set_money then f.new_total_money else r.total_money end,
    detail_text = case when f.set_money then f.new_detail_text else r.detail_text end,
    metric_quantities = case when f.set_money then f.new_metric_quantities else r.metric_quantities end
from package_rollup_fix_r513 f
join package_grid_lines_r513 t on t.line_id = f.line_id
join media_booking_package_lines l on l.id = f.line_id and (l.manual_lock or not t.restored) and l.quantity is not distinct from t.line_qty
 and l.brand_column_quantities is not distinct from t.line_cells
where r.id = f.rollup_id and r.total_posts = f.old_total_posts;

insert into media_booking_package_categories (release_id, package_id, category_id, brand, total_posts, platform_quantities, skipped, updated_at)
select g.release_id, g.package_id, g.category_id, g.brand, g.total_posts, g.platform_quantities, false, now()
from package_rollup_insert_r513 g
join package_grid_lines_r513 t on t.line_id = g.line_id
join media_booking_package_lines l on l.id = g.line_id and (l.manual_lock or not t.restored) and l.quantity is not distinct from t.line_qty
 and l.brand_column_quantities is not distinct from t.line_cells
where not exists (select 1 from media_booking_package_categories r where r.package_id = g.package_id and r.category_id = g.category_id and r.brand is not distinct from g.brand);

-- CHECK: re-run the STEP 1 preview query — grid_now should now equal line_total on every row (except lines noted above), rows_to_change counts stay as listed.
-- quick count of rows still different:
select count(*) as grid_changed_rows from media_booking_content_entries e join package_grid_fix_r513 f on f.entry_id = e.id
 where e.channel_count = f.new_cc and e.count_posts = f.new_posts and e.count_tung_hint = f.new_tung and e.count_out_now = f.new_out
   and e.count_listen_now = f.new_listen and e.count_addin_post = f.new_addin;

-- ===== UNDO (only if needed) =====
-- update media_booking_content_entries e set channel_count=b.channel_count, count_posts=b.count_posts, count_tung_hint=b.count_tung_hint,
--   count_out_now=b.count_out_now, count_listen_now=b.count_listen_now, count_addin_post=b.count_addin_post from package_entries_backup_r513 b where b.id = e.id;
-- update media_booking_package_categories r set total_posts=b.total_posts, platform_quantities=b.platform_quantities, total_money=b.total_money,
--   detail_text=b.detail_text, metric_quantities=b.metric_quantities, updated_at=now() from package_rollups_backup_r513 b where b.id = r.id;
-- (rollup rows ADDED: delete from media_booking_package_categories r using package_rollup_insert_r513 g where r.package_id=g.package_id and r.category_id=g.category_id and r.brand=g.brand and r.updated_at > now() - interval '1 day' and r.id not in (select id from package_rollups_backup_r513);)
-- (rows ADDED by this fix: delete from media_booking_content_entries e using package_grid_insert_r513 g where e.package_id=g.package_id and e.category_id=g.category_id and e.brand=g.brand and e.platform=g.platform and e.created_at > now() - interval '1 day';)
