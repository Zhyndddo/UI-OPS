-- Round 510 — RESTORE package lines to their values BEFORE they were changed to match another tier.
-- Source: git backup history (20 Sep – 13 Oct). 173 lines in 47 releases that STILL equal the merged value.
-- Most merges happened on 23 Sep and 30 Sep — BEFORE the Round 442 fix — not recently.
-- Restored lines are LOCKED (manual_lock) so Resync / Summarize can't merge them again without asking.
-- Safe: the update only touches a line that STILL has the merged value, and a backup copy is kept.
--
-- STEP 1  Run the STEP 1 block. It creates the worklist table, backs up the lines, and shows a preview.
-- (optional) Remove lines you do NOT want restored:  delete from package_lines_restore_r510 where line_id = '<id>';
--            (e.g. someone made two tiers equal on purpose). The preview shows DID / tier / Hạng Mục.
-- STEP 2  Run the STEP 2 block.
-- UNDO    run the UNDO block at the bottom.

-- ===== STEP 1 =====
alter table media_booking_package_lines add column if not exists manual_lock boolean not null default false;

create table if not exists package_lines_restore_r510 (
  line_id uuid primary key,
  restore_qty int, restore_cells jsonb, restore_amount numeric,
  merged_qty int, merged_cells jsonb
);
insert into package_lines_restore_r510 (line_id, restore_qty, restore_cells, restore_amount, merged_qty, merged_cells) values
  -- 4VHT-30092026-0120 | 4 Vạn Tình 3 Lối | Độc Quyền 2 năm | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền Vĩnh Viễn, Độc Quyền 5 năm
  ('f0e16462-db56-4c39-ac04-328b6b90375c'::uuid, 5000, NULL, 275000, 20000, NULL),
  -- 4VHT-30092026-0120 | 4 Vạn Tình 3 Lối | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền Vĩnh Viễn, Độc Quyền 2 năm
  ('8667efa5-08fb-4c30-b92a-36d9f2eea075'::uuid, 20, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, 14000000, 15, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb),
  -- 4VHT-30092026-0120 | 4 Vạn Tình 3 Lối | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền 5 năm, Độc Quyền 2 năm
  ('826a99b2-0a39-4dd8-884a-dcd45a396453'::uuid, 30000, NULL, 1650000, 20000, NULL),
  -- 4VHT-30092026-0120 | 4 Vạn Tình 3 Lối | Độc Quyền Vĩnh Viễn | Community | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('fae2a4d0-39d6-4c79-aa2b-f877f8cc44b9'::uuid, 8, $j${"PAGE BOLERO / MT::Facebook": 4, "PAGE BOLERO / MT::YouTube": 4}$j$::jsonb, 1600000, 6, $j${"PAGE BOLERO / MT::Facebook": 3, "PAGE BOLERO / MT::YouTube": 3}$j$::jsonb),
  -- 4VHT-30092026-0120 | 4 Vạn Tình 3 Lối | Độc Quyền Vĩnh Viễn | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 5 năm, Độc Quyền 2 năm
  ('95ebcf54-b482-46fa-89fa-1cc0dd12cd0e'::uuid, 30, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, 21000000, 15, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb),
  -- ABLN-21092026-0097 | Anh Biết Rồi  | Độc Quyền 2 năm | Social | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('a6d5b856-4788-4dd0-b3a0-2956a9b77619'::uuid, 9, NULL, 1800000, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb),
  -- ABLN-21092026-0097 | Anh Biết Rồi  | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('74ddcae8-25f9-4c0f-9aa1-117d006c09c0'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- ABLN-21092026-0097 | Anh Biết Rồi  | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-24_14h to match Độc Quyền 2 năm
  ('1a324135-8640-4bd3-91e9-8472da1c696f'::uuid, 25, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, 17500000, 15, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb),
  -- AHCS-08092026-0488 | Anh Hứa  | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('61602cc2-5475-4ace-b97e-b17ce9f2381e'::uuid, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, 14000000, 13, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb),
  -- AMKV-16102026-0121 | Anh Mệt Rồi | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền Vĩnh Viễn, Độc Quyền 5 năm
  ('7482061f-9e2b-4771-9dc1-f78e9aee34e6'::uuid, 15, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, 10500000, 30, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb),
  -- AMKV-16102026-0121 | Anh Mệt Rồi | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền 2 năm, Độc Quyền Vĩnh Viễn
  ('671ededd-4d74-4541-a946-3cf25d1c9362'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- AMKV-16102026-0121 | Anh Mệt Rồi | Độc Quyền 5 năm | Community | changed 2026-09-30_17h to match Độc Quyền Vĩnh Viễn
  ('ed67b3bf-e1aa-4bd7-84c3-62e9461d1949'::uuid, 6, $j${"PAGE BOLERO / MT::Facebook": 3, "PAGE BOLERO / MT::YouTube": 3}$j$::jsonb, 1200000, 10, $j${"PAGE BOLERO / MT::Facebook": 5, "PAGE BOLERO / MT::YouTube": 5}$j$::jsonb),
  -- AMKV-16102026-0121 | Anh Mệt Rồi | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền 2 năm, Độc Quyền 5 năm
  ('b3878ea1-f2c9-4fef-b2a9-ed84d9033c2b'::uuid, 30000, NULL, 1650000, 5000, NULL),
  -- AMKV-16102026-0121 | Anh Mệt Rồi | Độc Quyền Vĩnh Viễn | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 5 năm, Độc Quyền 2 năm
  ('ffd37e91-e40b-469c-a0fb-60e3ee478ca4'::uuid, 40, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, 28000000, 30, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb),
  -- AĐ#T-07092026-0033 | Anh Được Gì | Độc Quyền 2 năm | Social | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('5787c0db-8462-408b-b3a4-1ccb0d1da3f1'::uuid, 3, $j${"ENVI::Facebook": 1, "ENVI::Instagram": 1, "ENVI::TikTok": 0, "ENVI::YouTube": 1}$j$::jsonb, 600000, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2}$j$::jsonb),
  -- AĐ#T-07092026-0033 | Anh Được Gì | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('fbbbb0f1-a74f-4d77-9849-fe4952666b95'::uuid, 10, $j${"EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0}$j$::jsonb, 7000000, 20, $j${"EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb),
  -- AĐ#T-07092026-0033 | Anh Được Gì | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('776ae362-f307-4c38-b39f-6c9cb82499eb'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- BNTM-24092026-0102 | Bến Nước Sân Đình | Độc Quyền 2 năm | Social | changed 2026-09-23_13h to match Độc Quyền Vĩnh Viễn, Độc Quyền 5 năm
  ('e0875db0-c9b9-47a7-88e6-01bb9a22e71e'::uuid, 9, NULL, 1800000, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb),
  -- BNTM-24092026-0102 | Bến Nước Sân Đình | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền Vĩnh Viễn, Độc Quyền 2 năm
  ('1d441501-9656-40f2-9978-21fa31b6c7d8'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- BNTM-24092026-0102 | Bến Nước Sân Đình | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm, Độc Quyền Vĩnh Viễn
  ('4d3a593a-68a2-480e-a1a0-245af8b5454b'::uuid, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, 14000000, 10, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb),
  -- BNTM-24092026-0102 | Bến Nước Sân Đình | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('f5f7d56b-8157-4cb6-85f8-c0ff2d274906'::uuid, 30000, NULL, 1650000, 20000, NULL),
  -- BNTM-24092026-0102 | Bến Nước Sân Đình | Độc Quyền Vĩnh Viễn | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('bd81df2f-ef9e-450c-b615-1ac2aa2a3521'::uuid, 30, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, 21000000, 20, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb),
  -- BYLN-20082026-0512 | Bình Yên Là Tự Rời Đi  | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('273195bf-2e82-41d8-9ce9-bf5ce8a52dca'::uuid, 15, $j${"CAPCUT::TIKTOK CAPCUT": 2, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, 10500000, 25, $j${"CAPCUT::TIKTOK CAPCUT": 4, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 8, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb),
  -- BYLN-20082026-0512 | Bình Yên Là Tự Rời Đi  | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('780de0a4-052f-4a59-93b1-707502e1d62e'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- BYLN-20082026-0512 | Bình Yên Là Tự Rời Đi  | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('f72b6fe1-8fc5-419e-9b6f-48ce151670cd'::uuid, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2}$j$::jsonb, 1800000, 3, $j${"ENVI::Facebook": 1, "ENVI::Instagram": 1, "ENVI::YouTube": 1}$j$::jsonb),
  -- CKLN-06102026-0068 | Chiều Không Gian Khác | Độc Quyền 2 năm | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('3fc23e48-4003-4a27-b41e-1bcd8b9db540'::uuid, 5000, NULL, 275000, 20000, NULL),
  -- CKLN-06102026-0068 | Chiều Không Gian Khác | Độc Quyền 2 năm | Social | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('8faacbb2-f7e1-4a71-9cdf-b70fd3803eb9'::uuid, 3, $j${"ENVI::Facebook": 1, "ENVI::Instagram": 1, "ENVI::YouTube": 1}$j$::jsonb, 600000, 6, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::YouTube": 2}$j$::jsonb),
  -- CKLN-06102026-0068 | Chiều Không Gian Khác | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 2 năm
  ('714b50b1-a9ba-47db-bf33-1d1cb770d354'::uuid, 25, $j${"CAPCUT::TIKTOK CAPCUT": 4, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 8, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, 17500000, 16, $j${"CAPCUT::M\u1eaaU CAPCUT": 1, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb),
  -- CTLQ-01102026-0112 | Cạn Tàu Ráo Máng | Độc Quyền 2 năm | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền Vĩnh Viễn, Độc Quyền 5 năm
  ('f7650238-7114-4e14-ace7-35f2bddb12a5'::uuid, 5000, NULL, 275000, 20000, NULL),
  -- CTLQ-01102026-0112 | Cạn Tàu Ráo Máng | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền 5 năm, Độc Quyền 2 năm
  ('4889bffc-af06-40f4-9484-e991bf1e67b0'::uuid, 30000, NULL, 1650000, 20000, NULL),
  -- CTLQ-01102026-0112 | Cạn Tàu Ráo Máng | Độc Quyền Vĩnh Viễn | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 2 năm
  ('3df807c5-c6c0-4571-b76a-b6a9b86fa039'::uuid, 30, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, 21000000, 15, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb),
  -- CTTM-17092026-0042 | Cáo Từ | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('cc5cfa3b-674e-431a-8785-681f0acffb3a'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- CTTM-17092026-0042 | Cáo Từ | Độc Quyền 5 năm | Community | changed 2026-09-30_17h to match Độc Quyền 2 năm
  ('3f75c4fc-f92e-4d01-a35a-35a39a3fe58c'::uuid, 9, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::TikTok": 3}$j$::jsonb, 1800000, 9, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::Thread": 1, "PAGE INDIE::TikTok": 2}$j$::jsonb),
  -- CTTM-17092026-0042 | Cáo Từ | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('006d1b93-399f-4cc7-9373-23ad9495372e'::uuid, 12, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 2}$j$::jsonb, 2400000, 9, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 2}$j$::jsonb),
  -- CTTM-17092026-0042 | Cáo Từ | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('7645eac1-778a-4a59-a93f-8fb90b3580a8'::uuid, 20, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0}$j$::jsonb, 14000000, 10, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb),
  -- CVTM-24092026-0100 | Chầu Văn Huế  | Độc Quyền 2 năm | Social | changed 2026-09-23_13h to match Độc Quyền Vĩnh Viễn, Độc Quyền 5 năm
  ('dbf06173-9bd9-404e-8e57-0d00d0c0916b'::uuid, 9, NULL, 1800000, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb),
  -- CVTM-24092026-0100 | Chầu Văn Huế  | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm, Độc Quyền Vĩnh Viễn
  ('79e761ea-f127-47db-8d18-5ee38fb74de7'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- CVTM-24092026-0100 | Chầu Văn Huế  | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền Vĩnh Viễn
  ('8fbb747f-9c4a-470e-8e2f-c6fcc7205337'::uuid, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, 14000000, 30, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb),
  -- CVTM-24092026-0100 | Chầu Văn Huế  | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('0dad6c1e-9b7f-475e-856d-c233cc757abd'::uuid, 30000, NULL, 1650000, 20000, NULL),
  -- CVTM-24092026-0100 | Chầu Văn Huế  | Độc Quyền Vĩnh Viễn | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm, Độc Quyền 5 năm
  ('4bf03019-af95-4795-be5e-7b93e2a5dc99'::uuid, 30, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, 21000000, 10, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb),
  -- CYĐB-01102026-0116 | Còn Yêu Sao Phải Buông | Độc Quyền 2 năm | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('f1b23ffa-d9cf-4b45-9944-4376355894cd'::uuid, 5000, NULL, 275000, 20000, NULL),
  -- CYĐB-01102026-0116 | Còn Yêu Sao Phải Buông | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('34f3d1c7-ce39-49a9-a3ee-ff5c618cd798'::uuid, 10, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, 7000000, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 5, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb),
  -- DUVT-30092026-0053 | danger unfinished | Độc Quyền 2 năm | Social | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('32dc8ebe-e683-40b4-8f20-a71e00d4c1d8'::uuid, 9, $j${"VIEENT::Facebook": 3, "VIEENT::Instagram": 3, "VIEENT::TikTok": 3, "VIEENT::YouTube": 0}$j$::jsonb, 1800000, 9, $j${"VIEENT::Facebook": 3, "VIEENT::Instagram": 3, "VIEENT::TikTok": 3}$j$::jsonb),
  -- DUVT-30092026-0053 | danger unfinished | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('5ce7829d-0886-4fa2-8cd1-bc24bab25e26'::uuid, 11, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::M\u1eaaU CAPCUT": 1, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 0, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb, 7700000, 11, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::M\u1eaaU CAPCUT": 1, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 0, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb),
  -- DUVT-30092026-0053 | danger unfinished | Độc Quyền 5 năm | Community | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('f7853bbf-4974-4e05-971e-4abb79b2d840'::uuid, 8, $j${"PAGE VPOP::Facebook": 4, "PAGE VPOP::TikTok": 4}$j$::jsonb, 1600000, 4, $j${"PAGE VPOP::Facebook": 2, "PAGE VPOP::TikTok": 2}$j$::jsonb),
  -- DUVT-30092026-0053 | danger unfinished | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('9e707796-2226-4939-804f-589517439f4f'::uuid, 12, $j${"VIEENT::Facebook": 3, "VIEENT::Instagram": 3, "VIEENT::TikTok": 3, "VIEENT::YouTube": 3}$j$::jsonb, 2400000, 9, $j${"VIEENT::Facebook": 3, "VIEENT::Instagram": 3, "VIEENT::TikTok": 3}$j$::jsonb),
  -- DUVT-30092026-0053 | danger unfinished | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('7f91978e-34ea-4f43-bb12-cc2471118963'::uuid, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 0, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb, 14000000, 11, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::M\u1eaaU CAPCUT": 1, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 0, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb),
  -- ECĐL-29092026-0109 | Em Có Ước Mình Là Mây Trắng | Độc Quyền 2 năm | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('19dfc5c5-817d-4040-a3f5-500d10d1594b'::uuid, 5000, NULL, 275000, 20000, NULL),
  -- ECĐL-29092026-0109 | Em Có Ước Mình Là Mây Trắng | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('b79f1d17-0656-4c06-aae2-18a3ad351e5c'::uuid, 10, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb, 7000000, 20, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb),
  -- ENKT-19092026-0079 | Em Nhận Anh Làm Chồng  | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match INT MEDIA
  ('42222e57-9d6f-4cc2-9c11-c11612e00b96'::uuid, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb, 1800000, 6, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb),
  -- ENKT-19092026-0079 | Em Nhận Anh Làm Chồng  | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match INT MEDIA
  ('47e56512-22c3-4d34-b13b-c1fdd5676b9c'::uuid, 40, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 20}$j$::jsonb, 28000000, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 20}$j$::jsonb),
  -- ETDH-26092026-0070 | EP TRƯỚC SAU | Độc Quyền 2 năm | Community | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('1ecb3a58-d92d-44a1-9ecb-b4f2e0c6b3b6'::uuid, 14, NULL, 2800000, 14, $j${"PAGE INDIE::Facebook": 6, "PAGE INDIE::Instagram": 6, "PAGE INDIE::TikTok": 2}$j$::jsonb),
  -- ETDH-26092026-0070 | EP TRƯỚC SAU | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('1494592d-26d1-4c2e-ae66-f1128a9455f3'::uuid, 35, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 20}$j$::jsonb, 24500000, 50, $j${"CAPCUT::TIKTOK CAPCUT": 20, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 20}$j$::jsonb),
  -- ETDH-26092026-0070 | EP TRƯỚC SAU | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('54ec75ab-e259-4317-a99d-c507bfd2b059'::uuid, 23, $j${"VIEENT::Facebook": 5, "VIEENT::Instagram": 5, "VIEENT::TikTok": 6, "VIEENT::YouTube": 7}$j$::jsonb, 4600000, 13, $j${"VIEENT::Facebook": 3, "VIEENT::Instagram": 3, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb),
  -- ETDH-26092026-0070 | EP TRƯỚC SAU | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('db0a5548-5324-4658-8ecf-3413063461c4'::uuid, 50, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 25, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK INDIE::TIKTOK LYRICS": 20}$j$::jsonb, 35000000, 35, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 20}$j$::jsonb),
  -- ETH#-16092026-0064 | em từng là cả thế giới trong anh | Độc Quyền 2 năm | Social | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('c6861f03-8d55-4fd6-bac8-bc3e65e984c2'::uuid, 11, NULL, 2200000, 11, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb),
  -- ETH#-16092026-0064 | em từng là cả thế giới trong anh | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('e0bb8f5b-9aa0-42e4-a8bd-a7712c97b246'::uuid, 15, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 5, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb, 10500000, 25, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 5, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb),
  -- ETH#-16092026-0064 | em từng là cả thế giới trong anh | Độc Quyền 5 năm | Community | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('5528cd29-6f2d-465d-b122-ce28210af68b'::uuid, 20, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::TikTok": 2, "PAGE VPOP::Facebook": 4, "PAGE VPOP::Thread": 4, "PAGE VPOP::TikTok": 4}$j$::jsonb, 4000000, 14, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::TikTok": 2, "PAGE VPOP::Facebook": 2, "PAGE VPOP::Thread": 2, "PAGE VPOP::TikTok": 2}$j$::jsonb),
  -- GVTT-30102026-0104 | Giữ Vẹn Chữ Tòng | Độc Quyền Vĩnh Viễn | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('0d3680f6-de41-4c1a-b353-4104950f1f88'::uuid, 30, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 15, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, 21000000, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb),
  -- HCVT-14092026-0058 | Hai Chữ Vợ Chồng | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('9bac6d89-9220-46c4-b5b9-6c858376356d'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- HCVT-14092026-0058 | Hai Chữ Vợ Chồng | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('ef9ba6cb-ad79-42a8-bb48-db92833242ca'::uuid, 30, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 20}$j$::jsonb, 21000000, 15, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 5, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb),
  -- HHW#-11092026-0507 | Hèn Hạ | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('d694d6e2-2167-4bd2-a48a-ee0ea563d802'::uuid, 20, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK INDIE::TIKTOK LYRICS": 10}$j$::jsonb, 14000000, 20, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 10}$j$::jsonb),
  -- HHW#-11092026-0507 | Hèn Hạ | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('a6eced61-995e-45e6-b2a8-707311b1e009'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- HHW#-11092026-0507 | Hèn Hạ | Độc Quyền 5 năm | Community | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('6ad9ac2d-7ebf-436d-a665-2143c5a672ba'::uuid, 10, $j${"PAGE INDIE::Facebook": 4, "PAGE INDIE::Instagram": 4, "PAGE INDIE::TikTok": 2}$j$::jsonb, 2000000, 7, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::TikTok": 1}$j$::jsonb),
  -- HHW#-11092026-0507 | Hèn Hạ | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('9db2108c-c1b9-4b97-b296-35ef9b2114a0'::uuid, 13, $j${"VIEENT::Facebook": 3, "VIEENT::Instagram": 3, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb, 2600000, 11, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb),
  -- HHW#-11092026-0507 | Hèn Hạ | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca'::uuid, 40, $j${"CAPCUT::TIKTOK CAPCUT": 10, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK INDIE::TIKTOK LYRICS": 10}$j$::jsonb, 28000000, 20, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 10}$j$::jsonb),
  -- HIW#-24092026-0091 | HIRAKI II | Độc Quyền 2 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 4 năm
  ('40f2ba8c-160e-4190-a7f0-55c9a5690049'::uuid, 5000, NULL, 275000, 20000, NULL),
  -- HIW#-24092026-0091 | HIRAKI II | Độc Quyền 2 năm | Community | changed 2026-09-23_13h to match Độc Quyền 4 năm
  ('24f2eb89-4297-44a7-a299-809931ab9ca5'::uuid, 8, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::TikTok": 2}$j$::jsonb, 1600000, 10, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::Thread": 2, "PAGE INDIE::TikTok": 2}$j$::jsonb),
  -- HIW#-24092026-0091 | HIRAKI II | Độc Quyền 2 năm | Social | changed 2026-09-23_13h to match Độc Quyền 4 năm
  ('521fe53f-65eb-45c1-ab41-fa5282a33202'::uuid, 3, $j${"VIEENT::Facebook": 1, "VIEENT::Instagram": 1, "VIEENT::YouTube": 1}$j$::jsonb, 600000, 11, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb),
  -- HIW#-24092026-0091 | HIKARI II | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 4 năm
  ('dc193d4b-3ab7-4374-840c-4f820ce3e683'::uuid, 20, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 2, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb, 14000000, 20, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb),
  -- HKH#-26082026-0484 | Hộp Kí Ức | Độc Quyền 2 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('d7417460-95e9-4006-a2c8-3b7c965da253'::uuid, 10000, NULL, 550000, 20000, NULL),
  -- HKH#-26082026-0484 | Hộp Kí Ức | Độc Quyền 2 năm | Community | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('525b651c-e222-4326-86be-7c0faa17e23f'::uuid, 18, $j${"PAGE INDIE::Facebook": 7, "PAGE INDIE::Instagram": 7, "PAGE INDIE::TikTok": 7}$j$::jsonb, 3600000, 21, $j${"PAGE INDIE::Facebook": 7, "PAGE INDIE::Instagram": 7, "PAGE INDIE::TikTok": 7}$j$::jsonb),
  -- HKH#-26082026-0484 | Hộp Kí Ức | Độc Quyền 2 năm | Social | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('b73b8037-b983-47f3-b9db-08af2b1900ee'::uuid, 29, $j${"VIEENT::Facebook": 6, "VIEENT::Instagram": 6, "VIEENT::TikTok": 12, "VIEENT::YouTube": 13}$j$::jsonb, 5800000, 37, $j${"VIEENT::Facebook": 6, "VIEENT::Instagram": 6, "VIEENT::TikTok": 12, "VIEENT::YouTube": 13}$j$::jsonb),
  -- HKH#-26082026-0484 | Hộp Kí Ức | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('076591ad-c8b2-4f8c-a00f-a18fe5deb6bc'::uuid, 60, $j${"CAPCUT::TIKTOK CAPCUT": 25, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 31, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 4, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 25}$j$::jsonb, 42000000, 85, $j${"CAPCUT::TIKTOK CAPCUT": 25, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 31, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 4, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 25}$j$::jsonb),
  -- HPNN-21082026-0503 | Hạnh Phúc Được Nhìn Mẹ Cười | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('70ecba35-7fdf-46ca-941d-1fe557c4f3a3'::uuid, 30000, NULL, 1650000, 20000, NULL),
  -- HPNN-21082026-0503 | Hạnh Phúc Được Nhìn Mẹ Cười | Độc Quyền Vĩnh Viễn | Community | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('67fe4604-cf55-43c7-a138-9e932153486c'::uuid, 12, $j${"PAGE BOLERO / MT::Facebook": 1, "PAGE BOLERO / MT::YouTube": 3, "PAGE VPOP::Facebook": 4, "PAGE VPOP::TikTok": 4}$j$::jsonb, 2400000, 8, $j${"PAGE BOLERO / MT::Facebook": 0, "PAGE VPOP::Facebook": 4, "PAGE VPOP::TikTok": 4}$j$::jsonb),
  -- HPNN-21082026-0503 | Hạnh Phúc Được Nhìn Mẹ Cười | Độc Quyền Vĩnh Viễn | Social | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('0ac30a10-5705-443a-929c-737bcb0f5573'::uuid, 19, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 3}$j$::jsonb, 3800000, 14, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3}$j$::jsonb),
  -- HPNN-21082026-0503 | Hạnh Phúc Được Nhìn Mẹ Cười | Độc Quyền Vĩnh Viễn | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('508e17ea-631f-436e-a765-70d2ae6afd21'::uuid, 30, $j${"CAPCUT::TIKTOK CAPCUT": 2, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb, 21000000, 20, $j${"CAPCUT::TIKTOK CAPCUT": 2, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb),
  -- LHNB-06092026-0037 | Lỡ Hẹn Câu Hò | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('fca67e39-f128-4bb1-ad62-c3fbf3d284b7'::uuid, 30000, NULL, 1650000, 20000, NULL),
  -- LHNB-06092026-0037 | Lỡ Hẹn Câu Hò | Độc Quyền Vĩnh Viễn | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('de4f2353-7d24-454f-846a-7e4f8c374811'::uuid, 30, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, 21000000, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb),
  -- LNNH-20082026-0480 | Lặng Nhìn Yêu Thương | Độc Quyền 2 năm | Community | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('7ec01d07-1dda-431c-81ac-b7e101ca55e4'::uuid, 9, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::TikTok": 3}$j$::jsonb, 1800000, 11, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::Thread": 2, "PAGE INDIE::TikTok": 3}$j$::jsonb),
  -- LNNH-20082026-0480 | Lặng Nhìn Yêu Thương | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('31d6a82b-5f7b-4c72-afb2-739d6a7d158c'::uuid, 10, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb, 7000000, 20, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb),
  -- LNNH-20082026-0480 | Lặng Nhìn Yêu Thương | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('11b2f48d-b396-4152-ab1d-c75a157ec2b6'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- LNNH-20082026-0480 | Lặng Nhìn Yêu Thương | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678'::uuid, 12, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 2}$j$::jsonb, 2400000, 9, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 2}$j$::jsonb),
  -- LRTM-24092026-0101 | Lời Ru Của Mẹ | Độc Quyền 2 năm | Social | changed 2026-09-23_13h to match Độc Quyền 5 năm, Độc Quyền Vĩnh Viễn
  ('98f3cc5c-1b74-410c-b271-b77d37189eeb'::uuid, 9, NULL, 1800000, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb),
  -- LRTM-24092026-0101 | Lời Ru Của Mẹ | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm, Độc Quyền Vĩnh Viễn
  ('aa08474c-b29b-4228-a4c6-cfa51473d505'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- LRTM-24092026-0101 | Lời Ru Của Mẹ | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm, Độc Quyền Vĩnh Viễn
  ('801d2882-1ba0-4f83-8b75-fb280452b03d'::uuid, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, 14000000, 10, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb),
  -- LRTM-24092026-0101 | Lời Ru Của Mẹ | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('2e12a5eb-024a-4d71-913e-433e8c753622'::uuid, 30000, NULL, 1650000, 20000, NULL),
  -- LRTM-24092026-0101 | Lời Ru Của Mẹ | Độc Quyền Vĩnh Viễn | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('4aa66c9c-8a5d-4006-8330-b48870ce05c6'::uuid, 30, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, 21000000, 20, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb),
  -- MHLX-27082026-0016 | Mang Hồn Việt Đi Muôn Nơi | Độc Quyền 2 năm | Social | changed 2026-09-23_13h to match Internal Package
  ('9dec9a7c-a1d4-47f1-af6d-3b5b3779519f'::uuid, 9, $j${"ENVI::Facebook": 1, "ENVI::YouTube": 1, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3}$j$::jsonb, 1800000, 7, $j${"ENVI::Facebook": 1, "ENVI::YouTube": 1, "VIEENT::Facebook": 1, "VIEENT::Instagram": 1, "VIEENT::TikTok": 3}$j$::jsonb),
  -- MHLX-27082026-0016 | Mang Hồn Việt Đi Muôn Nơi | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-23_13h to match Internal Package
  ('93e8d0db-0d00-4e53-b989-1655f0e37bbe'::uuid, 15, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb, 10500000, 10, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 5, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb),
  -- MKSB-14082026-0481 | Mình Không Chia Tay	 | Độc Quyền 2 năm | Community | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('ea037666-54e5-40f9-93ac-79ffa6519a00'::uuid, 15, $j${"PAGE INDIE::Facebook": 5, "PAGE INDIE::Instagram": 5, "PAGE INDIE::Thread": 1, "PAGE INDIE::TikTok": 4}$j$::jsonb, 3000000, 15, $j${"PAGE BOLERO / MT::Facebook": 0, "PAGE INDIE::Facebook": 5, "PAGE INDIE::Instagram": 5, "PAGE INDIE::Thread": 1, "PAGE INDIE::TikTok": 4}$j$::jsonb),
  -- MKSB-14082026-0481 | Mình Không Chia Tay	 | Độc Quyền 2 năm | Social | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('fc9bfe9e-8304-4ad1-9e2a-19beea0590fa'::uuid, 10, $j${"VIEENT::Facebook": 4, "VIEENT::Instagram": 4, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb, 2000000, 15, $j${"VIEENT::Facebook": 4, "VIEENT::Instagram": 4, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb),
  -- MKSB-14082026-0481 | Mình Không Chia Tay	 | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('5948d336-c5d1-4da2-b775-fb0a34d2a8dd'::uuid, 10, $j${"CAPCUT::TIKTOK CAPCUT": 2, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 3, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb, 7000000, 10, $j${"CAPCUT::TIKTOK CAPCUT": 2, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 3, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb),
  -- MKSB-14082026-0481 | Mình Không Chia Tay	 | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('52891b25-b764-485d-8245-fa2523ad8a11'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- MKSB-14082026-0481 | Mình Không Chia Tay	 | Độc Quyền 5 năm | Community | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('aa1538a0-c08b-4559-9b8b-1bb0c1e18be4'::uuid, 9, $j${"PAGE BOLERO / MT::Facebook": 0, "PAGE INDIE::Facebook": 5, "PAGE INDIE::Instagram": 5, "PAGE INDIE::TikTok": 5}$j$::jsonb, 1800000, 15, $j${"PAGE BOLERO / MT::Facebook": 0, "PAGE INDIE::Facebook": 5, "PAGE INDIE::Instagram": 5, "PAGE INDIE::Thread": 1, "PAGE INDIE::TikTok": 4}$j$::jsonb),
  -- MKSB-14082026-0481 | Mình Không Chia Tay	 | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('a00c1ab0-b059-442e-8557-d79923f0a655'::uuid, 20, $j${"EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "TIKTOK INDIE::TIKTOK CAPCUT": 5, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb, 14000000, 10, $j${"CAPCUT::TIKTOK CAPCUT": 2, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 3, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb),
  -- MLHK-11092026-0061 | Muốn Lấy Anh Làm Chồng | Độc Quyền 2 năm | Social | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('bc4a7e77-18f4-4b91-b4a8-664cf0e37490'::uuid, 9, NULL, 1800000, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb),
  -- MLHK-11092026-0061 | Muốn Lấy Anh Làm Chồng | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('264e3c26-a183-4c1e-ae79-d713382eecf7'::uuid, 10, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, 7000000, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb),
  -- MLHK-11092026-0061 | Muốn Lấy Anh Làm Chồng | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- MLHK-11092026-0061 | Muốn Lấy Anh Làm Chồng | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('a42e8c7a-8642-4795-ad3e-259e8b95e52d'::uuid, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, 14000000, 10, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb),
  -- MNDT-18092026-0069 | Mãi Như Lúc Đầu | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('70bb09e3-2c06-4553-9243-0770fdaea383'::uuid, 30000, NULL, 1650000, 20000, NULL),
  -- MNDT-18092026-0069 | Mãi Như Lúc Đầu | Độc Quyền Vĩnh Viễn | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('cbbb8054-b6ee-4f40-bb31-6a34fc50b913'::uuid, 30, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, 21000000, 20, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb),
  -- MVH#-04092026-0007 | Một Vài Năm Nữa | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('5760ef3f-4a87-44b3-a668-4e44bc25f33e'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- MVH#-04092026-0007 | Một Vài Năm Nữa | Độc Quyền 5 năm | Community | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('efbd91c0-3977-4812-a62c-d56a750b48e8'::uuid, 15, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::TikTok": 3}$j$::jsonb, 3000000, 8, $j${"PAGE INDIE::Facebook": 3, "PAGE INDIE::Instagram": 3, "PAGE INDIE::TikTok": 2}$j$::jsonb),
  -- MVH#-04092026-0007 | Một Vài Năm Nữa | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('cd353c39-252f-4e8e-bc27-5354f40a4c50'::uuid, 12, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 2}$j$::jsonb, 2400000, 9, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 2}$j$::jsonb),
  -- MVH#-04092026-0007 | Một Vài Năm Nữa | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('61292d98-ba16-47b4-ae8e-558b61a98c9d'::uuid, 20, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0}$j$::jsonb, 14000000, 10, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb),
  -- N#D#-31102026-0084 | NOTAPRINCESS | Độc Quyền 2 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('0f72eff0-3e99-44d5-bc7d-0865ce517726'::uuid, 20000, NULL, 1100000, 50000, NULL),
  -- N#D#-31102026-0084 | NOTAPRINCESS | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('b102542c-1bd5-4e58-8605-d3cf81db4bb9'::uuid, 35, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 20}$j$::jsonb, 24500000, 50, $j${"CAPCUT::TIKTOK CAPCUT": 8, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 20}$j$::jsonb),
  -- N#D#-31102026-0084 | NOTAPRINCESS | Độc Quyền 5 năm | Community | changed 2026-09-21_04h to match Độc Quyền 2 năm
  ('6c755407-3883-41ac-9e2f-bae5bebbac9b'::uuid, 21, $j${"PAGE INDIE::Facebook": 7, "PAGE INDIE::Instagram": 7, "PAGE INDIE::TikTok": 7}$j$::jsonb, 4200000, 16, $j${"PAGE INDIE::Facebook": 7, "PAGE INDIE::Instagram": 7, "PAGE INDIE::TikTok": 2}$j$::jsonb),
  -- N#D#-31102026-0084 | NOTAPRINCESS | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('e1e20223-4e2c-4d8d-b973-5e1d8d3fe87a'::uuid, 27, $j${"VIEENT::Facebook": 4, "VIEENT::Instagram": 4, "VIEENT::TikTok": 9, "VIEENT::YouTube": 10}$j$::jsonb, 5400000, 19, $j${"VIEENT::Facebook": 3, "VIEENT::Instagram": 3, "VIEENT::TikTok": 6, "VIEENT::YouTube": 7}$j$::jsonb),
  -- N#D#-31102026-0084 | NOTAPRINCESS | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('11dc127c-b213-43f8-81f1-242a73f17974'::uuid, 50, $j${"CAPCUT::TIKTOK CAPCUT": 14, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 6, "TIKTOK INDIE::TIKTOK LYRICS": 20}$j$::jsonb, 35000000, 35, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 20}$j$::jsonb),
  -- NCNH-01012028-0127 | Ngày Con Còn Mẹ | Độc Quyền Vĩnh Viễn | Social | changed 2026-10-01_17h to match Độc Quyền 5 năm, Độc Quyền 2 năm
  ('480e73c6-20b2-4bf9-8b25-c5de3555c33d'::uuid, 20, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb, 4000000, 17, $j${"ENVI::Facebook": 1, "ENVI::Instagram": 1, "ENVI::TikTok": 3, "ENVI::YouTube": 1, "VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb),
  -- NETN-14082026-0476 | Ngày Em Vu Quy | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('c847953b-7f11-4145-ad84-17bcc995d6ff'::uuid, 14, $j${"EXT TIKTOK - CTV M\u1eaaU::M\u1eaaU CAPCUT": 1, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, 9800000, 14, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::M\u1eaaU CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK LYRICS": 0, "EXT TIKTOK - CTV M\u1eaaU::M\u1eaaU CAPCUT": 1, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb),
  -- NETN-14082026-0476 | Ngày Em Vu Quy | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('2f57ef67-2d60-4022-8d11-a81a004ce2bf'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- NETN-14082026-0476 | Ngày Em Vu Quy | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('873547e9-2d51-4195-bb88-3edc38e90442'::uuid, 12, $j${"ENVI::Facebook": 3, "ENVI::Instagram": 3, "ENVI::TikTok": 3, "ENVI::YouTube": 3}$j$::jsonb, 2400000, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2}$j$::jsonb),
  -- NETN-14082026-0476 | Ngày Em Vu Quy | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('8bd054f6-c845-4567-ad61-cf0179238de8'::uuid, 14, $j${"EXT TIKTOK - CTV M\u1eaaU::M\u1eaaU CAPCUT": 1, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 3}$j$::jsonb, 9800000, 14, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::M\u1eaaU CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK LYRICS": 0, "EXT TIKTOK - CTV M\u1eaaU::M\u1eaaU CAPCUT": 1, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb),
  -- NMHT-15102026-0113 | Nhớ Một Vì Sao  | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền 2 năm
  ('0fb5028f-58d7-4cfb-99f4-cf8b1281915c'::uuid, 30000, NULL, 1650000, 15000, NULL),
  -- NMHT-15102026-0113 | Nhớ Một Vì Sao  | Độc Quyền 5 năm | Community | changed 2026-09-30_17h to match Độc Quyền 2 năm
  ('a3ce1665-c059-4222-b2ca-a6f6d36a32bf'::uuid, 18, NULL, 3600000, 12, $j${"PAGE BOLERO / MT::Facebook": 6, "PAGE BOLERO / MT::YouTube": 6}$j$::jsonb),
  -- NMHT-15102026-0113 | Nhớ Một Vì Sao  | Độc Quyền 5 năm | Social | changed 2026-09-30_17h to match Độc Quyền 2 năm
  ('1906ca88-0e10-45f1-b569-affe43fd29e4'::uuid, 18, $j${"ENVI::Facebook": 4, "ENVI::Instagram": 4, "ENVI::TikTok": 6, "ENVI::YouTube": 4}$j$::jsonb, 3600000, 15, $j${"ENVI::Facebook": 4, "ENVI::Instagram": 4, "ENVI::TikTok": 3, "ENVI::YouTube": 4}$j$::jsonb),
  -- NMHT-15102026-0113 | Nhớ Một Vì Sao  | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 2 năm
  ('be388cd9-7547-46a7-b274-7aedf03db735'::uuid, 48, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::M\u1eaaU CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK CAPCUT": 45}$j$::jsonb, 33600000, 33, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::M\u1eaaU CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK CAPCUT": 30}$j$::jsonb),
  -- NĐH#-17092026-0081 | Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo) | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('44e7a73c-a039-4214-bade-6671ac9fc5fe'::uuid, 10, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb, 7000000, 20, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb),
  -- NĐH#-17092026-0081 | Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo) | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('5f6208bd-401a-43b3-a214-7def11654c9d'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- NĐH#-17092026-0081 | Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo) | Độc Quyền 5 năm | Community | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('723f3bfc-2066-4579-b2ec-f437d638778a'::uuid, 10, $j${"PAGE VPOP::Facebook": 4, "PAGE VPOP::Thread": 2, "PAGE VPOP::TikTok": 4}$j$::jsonb, 2000000, 8, $j${"PAGE VPOP::Facebook": 4, "PAGE VPOP::TikTok": 4}$j$::jsonb),
  -- NĐH#-17092026-0081 | Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo) | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('720471b5-7d22-4794-9b31-edc2d5daab99'::uuid, 11, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb, 2200000, 5, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::YouTube": 1}$j$::jsonb),
  -- NĐH#-17092026-0081 | Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo) | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('a5150180-7afd-4394-bd71-56d1bb8d833f'::uuid, 20, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0}$j$::jsonb, 14000000, 10, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb),
  -- OD20010126-0702 | One Day | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền Vĩnh Viễn
  ('1f0e7f03-9e08-46c7-bfab-a332f826a1a4'::uuid, 0, $j${"TIKTOK BOLERO / MT::TIKTOK LYRICS": 3, "TIKTOK VPOP::TIKTOK CAPCUT": 1, "TIKTOK VPOP::TIKTOK NEWS": 1}$j$::jsonb, NULL, 5, $j${"TIKTOK BOLERO / MT::TIKTOK LYRICS": 3, "TIKTOK VPOP::TIKTOK CAPCUT": 1, "TIKTOK VPOP::TIKTOK NEWS": 1}$j$::jsonb),
  -- SCTT-20082026-0485 | SODA CREAM | Độc Quyền 2 năm | Community | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('d8e42045-b157-404c-b990-ef3abbb73906'::uuid, 9, $j${"PAGE VPOP::Facebook": 9}$j$::jsonb, 1800000, 14, $j${"PAGE INDIE::Facebook": 2, "PAGE INDIE::Instagram": 2, "PAGE INDIE::Thread": 1, "PAGE INDIE::TikTok": 1, "PAGE VPOP::Facebook": 4, "PAGE VPOP::TikTok": 4}$j$::jsonb),
  -- SCTT-20082026-0485 | SODA CREAM | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('54d5120a-cd00-4e7a-a60f-7c475cf0f045'::uuid, 10, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb, 7000000, 27, $j${"CAPCUT::TIKTOK CAPCUT": 8, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 6, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 3, "TIKTOK INDIE::TIKTOK LYRICS": 5, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb),
  -- SCTT-20082026-0485 | SODA CREAM | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('d5a7127d-e174-4ecc-9429-549f42bffb56'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- T#PP-09102026-0119 | TÌM | Độc Quyền 2 năm | Social | changed 2026-09-30_17h to match Độc Quyền Vĩnh Viễn, Độc Quyền 5 năm
  ('bdcf6a6b-6381-41c3-a458-330266dc22ef'::uuid, 9, NULL, 1800000, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb),
  -- T#PP-09102026-0119 | TÌM | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền Vĩnh Viễn, Độc Quyền 2 năm
  ('81aced2f-d882-45e4-84b1-9b1b8deb7d07'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- T#PP-09102026-0119 | TÌM | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền Vĩnh Viễn, Độc Quyền 2 năm
  ('73da2d5d-f5c9-497a-8c52-495fbeb71801'::uuid, 30, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15, "TIKTOK INDIE::TIKTOK LYRICS": 0}$j$::jsonb, 21000000, 15, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15, "TIKTOK INDIE::TIKTOK LYRICS": 0}$j$::jsonb),
  -- T#PP-09102026-0119 | TÌM | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền 5 năm, Độc Quyền 2 năm
  ('f6fa7d7a-ca21-41cf-afee-fc94de9c88ed'::uuid, 30000, NULL, 1650000, 5000, NULL),
  -- T#PP-09102026-0119 | TÌM | Độc Quyền Vĩnh Viễn | Community | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('84281c14-0558-4156-b6c9-47cfa2814e1c'::uuid, 10, $j${"PAGE BOLERO / MT::Facebook": 5, "PAGE BOLERO / MT::YouTube": 5}$j$::jsonb, 2000000, 6, $j${"PAGE BOLERO / MT::Facebook": 3, "PAGE BOLERO / MT::YouTube": 3}$j$::jsonb),
  -- T#PP-09102026-0119 | TÌM | Độc Quyền Vĩnh Viễn | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 5 năm, Độc Quyền 2 năm
  ('8491ef86-d3ca-4ae6-8c7f-bce63903c7ca'::uuid, 40, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15, "TIKTOK INDIE::TIKTOK LYRICS": 0}$j$::jsonb, 28000000, 15, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15, "TIKTOK INDIE::TIKTOK LYRICS": 0}$j$::jsonb),
  -- THLN-29092026-0065 | Tự Hứa Với Bản Thân | Độc Quyền 2 năm | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('1e3f75ed-a6c4-4669-9f20-3fa6ddc416ef'::uuid, 5000, NULL, 275000, 20000, NULL),
  -- THLN-29092026-0065 | Tự Hứa Với Bản Thân | Độc Quyền 2 năm | Social | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('19e9574a-f212-461e-a73d-c01bb4be4ce9'::uuid, 3, $j${"ENVI::Facebook": 1, "ENVI::Instagram": 1, "ENVI::YouTube": 1}$j$::jsonb, 600000, 6, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::YouTube": 2}$j$::jsonb),
  -- THLN-29092026-0065 | Tự Hứa Với Bản Thân | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 5 năm
  ('568288ff-3338-46a0-8b93-82623a45a987'::uuid, 15, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, 10500000, 25, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb),
  -- THLN-29092026-0065 | Tự Hứa Với Bản Thân | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('293f3154-68e8-4a55-a70f-79ff4d6d0f1a'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- THLN-29092026-0065 | Tự Hứa Với Bản Thân | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('c65985c9-97ad-484e-ba09-c5e5b91c2fa5'::uuid, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2}$j$::jsonb, 1800000, 3, $j${"ENVI::Facebook": 1, "ENVI::Instagram": 1, "ENVI::YouTube": 1}$j$::jsonb),
  -- THLN-29092026-0065 | Tự Hứa Với Bản Thân | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('214c74bc-b5fa-414a-bde3-4c6d77bcc9d4'::uuid, 25, $j${"CAPCUT::TIKTOK CAPCUT": 4, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 8, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 3, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb, 17500000, 15, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10}$j$::jsonb),
  -- TIS#-18082026-0504 | Then I Met You | Độc Quyền 2 năm | Social | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('62986a0b-a98e-4000-95be-6a155697adcb'::uuid, 11, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb, 2200000, 21, $j${"VIEENT::Facebook": 4, "VIEENT::Instagram": 4, "VIEENT::TikTok": 6, "VIEENT::YouTube": 7}$j$::jsonb),
  -- TIS#-18082026-0504 | Then I Met You | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('6e2ce628-0fd0-46d2-b425-0df8ce4eb7c2'::uuid, 35, $j${"CAPCUT::TIKTOK CAPCUT": 15, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 6, "TIKTOK INDIE::TIKTOK LYRICS": 14}$j$::jsonb, 24500000, 70, $j${"CAPCUT::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 6, "TIKTOK INDIE::TIKTOK LYRICS": 54}$j$::jsonb),
  -- TIS#-18082026-0504 | Then I Met You | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('99164d31-36e8-4e3a-b36d-d84a55c115a2'::uuid, 30000, NULL, 1650000, 10000, NULL),
  -- TNTN-27082026-0010 | The Next Artist (Live at Final Stage) | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('a17718a6-e7a5-48e9-a2d0-ee1b905205e4'::uuid, 150000, NULL, 8250000, 60000, NULL),
  -- TNTN-27082026-0010 | The Next Artist (Live at Final Stage) | Độc Quyền 5 năm | Community | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('256c846d-2066-4618-beb3-7636258fcc39'::uuid, 24, $j${"PAGE INDIE::Facebook": 2, "PAGE INDIE::Instagram": 2, "PAGE VPOP::Facebook": 10, "PAGE VPOP::TikTok": 10}$j$::jsonb, 4800000, 16, $j${"PAGE INDIE::Facebook": 2, "PAGE INDIE::Instagram": 2, "PAGE VPOP::Facebook": 6, "PAGE VPOP::TikTok": 6}$j$::jsonb),
  -- TNTN-27082026-0010 | The Next Artist (Live at Final Stage) | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('3c7ced09-d4d4-4119-86d4-171b805771f7'::uuid, 35, $j${"VIEENT::Facebook": 5, "VIEENT::Instagram": 5, "VIEENT::TikTok": 12, "VIEENT::YouTube": 13}$j$::jsonb, 7000000, 19, $j${"VIEENT::Facebook": 3, "VIEENT::Instagram": 3, "VIEENT::TikTok": 6, "VIEENT::YouTube": 7}$j$::jsonb),
  -- TNTN-27082026-0010 | The Next Artist (Live at Final Stage) | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('6db25ccf-a99b-45c5-bbde-136f6e725012'::uuid, 96, $j${"CAPCUT::TIKTOK CAPCUT": 4, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 30, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 6, "TIKTOK INDIE::TIKTOK LYRICS": 31, "TIKTOK VPOP::TIKTOK LYRICS": 25}$j$::jsonb, 67200000, 30, $j${"CAPCUT::TIKTOK CAPCUT": 4, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 6, "TIKTOK INDIE::TIKTOK LYRICS": 10, "TIKTOK VPOP::TIKTOK LYRICS": 10}$j$::jsonb),
  -- TONO-08102026-0032 | The Other Side Of Regret | Độc Quyền 2 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('ea00e057-0a51-462f-9495-0c63796865b5'::uuid, 10000, NULL, 550000, 20000, NULL),
  -- TONO-08102026-0032 | The Other Side Of Regret | Độc Quyền 2 năm | Community | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('c109f4ca-39f2-499f-817b-b7580faedaea'::uuid, 24, NULL, 4800000, 22, $j${"PAGE INDIE::Facebook": 8, "PAGE INDIE::Instagram": 8, "PAGE INDIE::TikTok": 6}$j$::jsonb),
  -- TONO-08102026-0032 | The Other Side Of Regret | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('5e920382-d64c-43f3-ae63-4bc825a7c22d'::uuid, 30, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "TIKTOK INDIE::TIKTOK LYRICS": 10}$j$::jsonb, 21000000, 60, $j${"CAPCUT::TIKTOK CAPCUT": 15, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 30, "TIKTOK INDIE::TIKTOK LYRICS": 15}$j$::jsonb),
  -- TONO-08102026-0032 | The Other Side Of Regret | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('66cf7123-8231-42ac-9906-0cf1a2586fc1'::uuid, 28, $j${"VIEENT::Facebook": 5, "VIEENT::Instagram": 5, "VIEENT::TikTok": 9, "VIEENT::YouTube": 9}$j$::jsonb, 5600000, 20, $j${"VIEENT::Facebook": 4, "VIEENT::Instagram": 4, "VIEENT::TikTok": 6, "VIEENT::YouTube": 6}$j$::jsonb),
  -- TONO-08102026-0032 | The Other Side Of Regret | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('322ad595-1eb2-498a-9079-7c85c7d2a212'::uuid, 45, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 30, "TIKTOK INDIE::TIKTOK LYRICS": 15}$j$::jsonb, 31500000, 60, $j${"CAPCUT::TIKTOK CAPCUT": 15, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 30, "TIKTOK INDIE::TIKTOK LYRICS": 15}$j$::jsonb),
  -- TVDV-05092026-0003 | tìm và trốn | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('dd38de32-3cf4-4095-8cf6-087693378815'::uuid, 9, $j${"CAPCUT::TIKTOK CAPCUT": 2, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 2, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb, 6300000, 10, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb),
  -- TVDV-05092026-0003 | tìm và trốn | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('88c76b7f-bfc6-42cb-bc1a-517b5ac17cf2'::uuid, 13, $j${"VIEENT::Facebook": 3, "VIEENT::Instagram": 3, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb, 2600000, 11, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb),
  -- TVDV-05092026-0003 | tìm và trốn | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('7d7e4fe8-c739-4828-9c68-7c3c2c2a5ff1'::uuid, 20, $j${"CAPCUT::TIKTOK CAPCUT": 5, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 7, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 3, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb, 14000000, 10, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK GROUP::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 5}$j$::jsonb),
  -- YNĐM-30092026-0041 | Yêu Những Ngày Xa | Độc Quyền 5 năm | Community | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('47a1a406-fb54-445c-8c01-cf865b2b21d6'::uuid, 7, $j${"PAGE VPOP::Facebook": 4, "PAGE VPOP::TikTok": 3}$j$::jsonb, 1400000, 4, $j${"PAGE VPOP::Facebook": 2, "PAGE VPOP::TikTok": 2}$j$::jsonb),
  -- YNĐM-30092026-0041 | Yêu Những Ngày Xa | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('988c7f4d-ba9e-4651-82bd-2d9dbd7fd6b4'::uuid, 11, $j${"VIEENT::Facebook": 2, "VIEENT::Instagram": 2, "VIEENT::TikTok": 3, "VIEENT::YouTube": 4}$j$::jsonb, 2200000, 8, $j${"VIEENT::Facebook": 1, "VIEENT::Instagram": 1, "VIEENT::TikTok": 3, "VIEENT::YouTube": 3}$j$::jsonb),
  -- YNĐM-30092026-0041 | Yêu Những Ngày Xa | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 2 năm
  ('dba12070-6a97-4ed2-ac44-dde5399d9279'::uuid, 30, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 0, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb, 21000000, 15, $j${"CAPCUT::TIKTOK CAPCUT": 4, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 6, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 0, "TIKTOK INDIE::TIKTOK LYRICS": 0, "TIKTOK VPOP::TIKTOK LYRICS": 5}$j$::jsonb),
  -- ÁTCT-25092026-0088 | Ánh Trăng Bật Khóc | Độc Quyền 2 năm | Ads / YouTube Ads | changed 2026-09-30_17h to match Độc Quyền Vĩnh Viễn
  ('79c2e7e6-8d5e-4234-a156-eba628ff45f3'::uuid, 5000, NULL, 275000, 30000, NULL),
  -- ÁTCT-25092026-0088 | Ánh Trăng Bật Khóc | Độc Quyền 2 năm | Social | changed 2026-09-23_13h to match Độc Quyền Vĩnh Viễn, Độc Quyền 5 năm
  ('0d882b3b-c67d-4fe7-8bcd-e4cc56e2424a'::uuid, 9, NULL, 1800000, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb),
  -- ÁTCT-25092026-0088 | Ánh Trăng Bật Khóc | Độc Quyền 2 năm | TikTok Channel | changed 2026-09-24_14h to match Độc Quyền 5 năm, Độc Quyền Vĩnh Viễn
  ('15d265cc-69db-4283-a0d4-0fed2bb12a26'::uuid, 15, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, 10500000, 40, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb),
  -- ÁTCT-25092026-0088 | Ánh Trăng Bật Khóc | Độc Quyền 5 năm | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền Vĩnh Viễn, Độc Quyền 2 năm
  ('c81da73a-1a7d-4623-9d34-0f6b24a0b2e4'::uuid, 20000, NULL, 1100000, 5000, NULL),
  -- ÁTCT-25092026-0088 | Ánh Trăng Bật Khóc | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-24_14h to match Độc Quyền Vĩnh Viễn, Độc Quyền 2 năm
  ('099bc560-51de-47f3-8590-4e0d5feff500'::uuid, 30, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, 21000000, 40, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb),
  -- ÁTCT-25092026-0088 | Ánh Trăng Bật Khóc | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 5 năm, Độc Quyền 2 năm
  ('3aeddcc7-3e2e-4062-b07b-1e91b54ef3e0'::uuid, 30000, NULL, 1650000, 5000, NULL),
  -- ÁTCT-25092026-0088 | Ánh Trăng Bật Khóc | Độc Quyền Vĩnh Viễn | Community | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('fab1f4c4-ae7c-4ae9-ac9e-794dca71d3c3'::uuid, 9, $j${"PAGE BOLERO / MT::Facebook": 4, "PAGE BOLERO / MT::YouTube": 5}$j$::jsonb, 1800000, 4, $j${"PAGE BOLERO / MT::Facebook": 2, "PAGE BOLERO / MT::YouTube": 2}$j$::jsonb),
  -- ÁTCT-25092026-0088 | Ánh Trăng Bật Khóc | Độc Quyền Vĩnh Viễn | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền 2 năm
  ('dc3e11b3-3092-4a4a-a4b2-4aad44b370b1'::uuid, 40, $j${"CAPCUT::TIKTOK CAPCUT": 3, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb, 28000000, 15, $j${"CAPCUT::TIKTOK CAPCUT": 0, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 0, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15}$j$::jsonb),
  -- ĐHKL-19092026-0080 | Đồng Hương Đồng Nai | Độc Quyền 5 năm | Community | changed 2026-09-23_13h to match Độc Quyền Vĩnh Viễn
  ('a07da9b9-59c2-445a-8fb4-1511b66e53e5'::uuid, 10, NULL, 2000000, 10, $j${"PAGE BOLERO / MT::Facebook": 5, "PAGE BOLERO / MT::YouTube": 5}$j$::jsonb),
  -- ĐHKL-19092026-0080 | Đồng Hương Đồng Nai | Độc Quyền 5 năm | Social | changed 2026-09-23_13h to match Độc Quyền Vĩnh Viễn
  ('23977234-cffe-4a8a-b607-542e5e11df92'::uuid, 9, NULL, 1800000, 9, $j${"ENVI::Facebook": 2, "ENVI::Instagram": 2, "ENVI::TikTok": 3, "ENVI::YouTube": 2, "VIEENT::Facebook": 0}$j$::jsonb),
  -- ĐHKL-19092026-0080 | Đồng Hương Đồng Nai | Độc Quyền 5 năm | TikTok Channel | changed 2026-09-30_17h to match Độc Quyền Vĩnh Viễn
  ('77d0b53e-a0f3-407d-9b3f-f98fff7bd6da'::uuid, 22, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10, "TIKTOK INDIE::TIKTOK LYRICS": 2}$j$::jsonb, 15400000, 32, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10, "TIKTOK INDIE::TIKTOK LYRICS": 2}$j$::jsonb),
  -- ĐHKL-19092026-0080 | Đồng Hương Đồng Nai | Độc Quyền Vĩnh Viễn | Ads / YouTube Ads | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('30d373c7-f731-4a76-8455-aa2abf672e94'::uuid, 30000, NULL, 1650000, 20000, NULL),
  -- ĐHKL-19092026-0080 | Đồng Hương Đồng Nai | Độc Quyền Vĩnh Viễn | TikTok Channel | changed 2026-09-23_13h to match Độc Quyền 5 năm
  ('e2dd4174-420c-471a-8e79-71afd93ce048'::uuid, 37, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15, "TIKTOK INDIE::TIKTOK LYRICS": 2}$j$::jsonb, 25900000, 22, $j${"EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 10, "EXT TIKTOK - CTV M\u1eaaU::TIKTOK CAPCUT": 0, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 10, "TIKTOK INDIE::TIKTOK LYRICS": 2}$j$::jsonb)
on conflict (line_id) do nothing;

create table if not exists package_lines_backup_r510 as select * from media_booking_package_lines where false;
insert into package_lines_backup_r510
  select l.* from media_booking_package_lines l
  where l.id in (select line_id from package_lines_restore_r510)
    and not exists (select 1 from package_lines_backup_r510 b where b.id = l.id);

-- PREVIEW (one row per line that would change)
select r.did, r.title, p.name as tier, c.name as hang_muc, l.brand,
       l.quantity as now_total, f.restore_qty as restore_total,
       (l.quantity is not distinct from f.merged_qty and l.brand_column_quantities is not distinct from f.merged_cells) as still_merged
from package_lines_restore_r510 f
join media_booking_package_lines l on l.id = f.line_id
join media_booking_packages p on p.id = l.package_id
join releases r on r.id = p.release_id
left join package_categories c on c.id = l.category_id
order by r.did, p.name, c.name;

-- ===== STEP 2 =====
update media_booking_package_lines l
set quantity = f.restore_qty,
    brand_column_quantities = f.restore_cells,
    amount = f.restore_amount,
    manual_lock = true
from package_lines_restore_r510 f
where l.id = f.line_id
  and l.quantity is not distinct from f.merged_qty
  and l.brand_column_quantities is not distinct from f.merged_cells;

-- CHECK: expect up to 173
select count(*) as restored_and_locked from media_booking_package_lines where manual_lock;

-- ===== UNDO (only if needed) =====
-- update media_booking_package_lines l set quantity=b.quantity, brand_column_quantities=b.brand_column_quantities,
--        amount=b.amount, manual_lock=b.manual_lock from package_lines_backup_r510 b where b.id = l.id;
