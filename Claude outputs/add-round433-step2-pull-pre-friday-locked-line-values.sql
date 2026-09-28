-- Round 433 Step 2 — DIAGNOSTIC ONLY. No writes, safe to run directly.
--
-- Run this against the Friday PITR/backup snapshot (whatever read access you
-- have to it — a restored branch, a temporary Supabase PITR restore, etc.),
-- NOT against live production. It pulls the pre-Friday-resync values for
-- the exact 113 locked-package lines Step 1 flagged as suspects (across
-- 33 releases) — every column the old resyncReleasePackages()
-- could have overwritten: quantity, brand_column_quantities (Social/
-- Community/TikTok Channel), metric_quantities + detail (Ads/YouTube Ads),
-- and amount.
--
-- Paste the result back (as JSON, same as Step 1) and I'll build Step 3: an
-- explicit per-row UPDATE script that restores ONLY these 113 locked-
-- package lines on live production back to these pre-Friday values — never
-- a full-table rollback, so anything legitimately edited since Friday
-- (on these or any other lines) is left untouched.
--
-- If a line's pre-Friday value turns out to be IDENTICAL to its current
-- value, that's a real signal too — it means that particular match wasn't
-- actually caused by the Friday run (two packages coincided on their own),
-- and Step 3 will skip restoring it.

select
  id as line_id,
  package_id,
  category_id,
  brand,
  quantity,
  brand_column_quantities,
  metric_quantities,
  detail,
  amount
from media_booking_package_lines
where id in (
  '39648abb-18d9-43ea-a625-266702cff6f5', 'a6d5b856-4788-4dd0-b3a0-2956a9b77619', '6cce0f48-ce4f-4fd1-aa4c-74ac3c41d794', '776ae362-f307-4c38-b39f-6c9cb82499eb', 'cf926236-eee5-451f-a3ff-7951dec28951', 'd820dc2c-6fff-4259-bd41-606c11877bbe',
  '6a2e8d7a-3323-4088-9b03-cde5f4db5496', '4aff0632-f482-4f26-9e96-847ff0bcafe3', '6dbb9aa0-8759-46be-be0a-e43e8aabdd02', 'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4', '8c78a049-a83c-4264-baea-575b5d284d81', '53773b04-530d-4543-8aa0-ed17dc53dec8',
  '39e58ec4-7f4d-4cbf-897b-db11fabed85b', 'e0875db0-c9b9-47a7-88e6-01bb9a22e71e', 'c0e5a2a2-ed1d-42c7-a3c2-7c30342a2bfa', '780de0a4-052f-4a59-93b1-707502e1d62e', 'f72b6fe1-8fc5-419e-9b6f-48ce151670cd', 'd902aa70-8411-452f-86d7-adc592f11054',
  '24ef56f9-0a2e-49ac-a354-fc050a77cc6f', '55e8d6d9-f46c-41fa-b423-8aa68716dab9', '4530dc57-9bc7-4f88-a465-6f3333c0786e', 'ab7756d3-1767-4bfe-8983-ad062058f44e', '16a30b03-f2f1-40f1-b4aa-d667d449922b', 'dbf06173-9bd9-404e-8e57-0d00d0c0916b',
  'bfb3c328-f78d-4ea5-a2b3-e50386084d91', '30d373c7-f731-4a76-8455-aa2abf672e94', '282f55aa-ee98-4d8b-9cdb-64e8dbb99f59', '842a615e-7669-4c92-8f4a-5dd129226e1d', '324d017c-88c4-4fc3-8343-59562e282e95', 'db720d04-7bd1-417b-b28e-accc0a2da881',
  'a7a1ef34-7451-4246-9dcc-be530e0781b8', '5528cd29-6f2d-465d-b122-ce28210af68b', '837ab831-7157-4a30-b9ac-27af41dd651a', '3abc7229-97df-4b87-9803-1c3a2fc9b789', '1d792bf2-52e5-478e-ac29-36594fe805b4', 'd3d45745-b6db-48af-9211-09ffd0fd9d9a',
  '54ec75ab-e259-4317-a99d-c507bfd2b059', 'db0a5548-5324-4658-8ecf-3413063461c4', '00a42366-0b38-4ee3-a0f0-c2423e55c4c1', 'd5c5fb4b-5327-48fb-8684-032ceaafa0b6', 'f05dc0c5-d399-4f85-9bde-23661c68a646', '1b10cd29-fa1f-4638-a7fe-2b63e00b715a',
  '8532d2a0-5e55-4971-a168-11e69d5538f1', '4e742bfc-b6b5-434c-8900-8a3e10b8851a', '2e057af3-b1ae-432f-8cce-a1ebd576c80f', '071aaf2c-2dc5-49e7-8008-67fbcad062f5', '3312efc4-66c9-441c-8091-dc173fdca3ce', '25d09e33-f1f6-4673-a179-01a53e731d77',
  'a6eced61-995e-45e6-b2a8-707311b1e009', '6ad9ac2d-7ebf-436d-a665-2143c5a672ba', '9db2108c-c1b9-4b97-b296-35ef9b2114a0', 'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca', 'da7a3746-61aa-4b73-8266-e84c225b3099', '23efcb2f-1f4f-49ed-8214-e203e964b92b',
  '573294db-641f-40cf-96ed-955b448efacf', '83d7a218-c980-4f30-8bf7-6c4499d8200a', 'f94325e6-f245-407e-80ae-0588d69ecc37', '0933ad72-8a5c-4c8f-8b2d-7e98ab9e68e8', '172bd813-491e-4058-8c9d-2320b18c2e1e', '47ba6a68-a15f-4556-be9d-58be21deaba1',
  '11b2f48d-b396-4152-ab1d-c75a157ec2b6', '954f4106-43a1-4dee-a341-9c2a1a032b1f', 'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678', 'de03089d-102f-4d0f-a4bf-39fc934a20eb', '6c65255e-37fd-4bb0-b7fc-24d5f2e05642', 'eb11b51d-c0d1-4974-8151-6044fcd46ce5',
  '0f1d2c19-fb5b-41b8-9bfe-4bfb87a4a9f8', '0afe49cf-b3a6-4c02-b6a5-8a1f7f0711c6', 'e5259109-f43c-4bdd-a397-c7a9187b3fa2', '98f3cc5c-1b74-410c-b271-b77d37189eeb', '6baf6183-a0d5-4477-85ff-08e86f5a5b34', 'e3fb4036-06c7-4701-854e-2a434fd00b24',
  '31a753cb-d8c6-4980-a44b-4a093ded87b6', '3bb44a9d-72fc-480b-91d9-e83712477f0e', 'c9aeef99-9d5a-41c3-a1da-7bb84d33122d', 'fab95869-d748-462d-a549-74014f1775f8', '24a610ac-962b-416f-a317-b7735efcbf17', '42ae301e-b8d2-434b-a3e0-045b4a3ba7cd',
  'ea037666-54e5-40f9-93ac-79ffa6519a00', 'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa', '5948d336-c5d1-4da2-b775-fb0a34d2a8dd', '3f18ef09-711e-4397-81de-9ef17a4da81e', '4f062aea-6d61-451b-9d1e-b2b195cfc720', '314d6d45-5513-484c-80d9-dee490f5a13c',
  'ba5b7cbd-c006-4b1a-be42-8c0cdc902f1e', '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf', '75f9196f-dacc-4403-802a-6cac24232d97', '5f6208bd-401a-43b3-a214-7def11654c9d', '723f3bfc-2066-4579-b2ec-f437d638778a', '720471b5-7d22-4794-9b31-edc2d5daab99',
  'af9f9732-a741-4141-9a6d-f54862522664', '8ddb9320-557d-413c-9966-5c8dfb46bc18', 'c847953b-7f11-4145-ad84-17bcc995d6ff', 'd5a7127d-e174-4ecc-9429-549f42bffb56', '761d4c6e-6570-4058-9cd4-7a147628cf31', '73a87bb2-2a50-43ab-be63-258d783d3912',
  'd21d1045-ec5e-4478-8d5d-6448269e605d', 'a17718a6-e7a5-48e9-a2d0-ee1b905205e4', '256c846d-2066-4618-beb3-7636258fcc39', '3c7ced09-d4d4-4119-86d4-171b805771f7', '6db25ccf-a99b-45c5-bbde-136f6e725012', 'b1a28fe9-e152-4454-b603-16409d749484',
  'a9f1e09e-40d6-4499-b55b-302b1e27f716', '66cf7123-8231-42ac-9906-0cf1a2586fc1', '322ad595-1eb2-498a-9079-7c85c7d2a212', '99164d31-36e8-4e3a-b36d-d84a55c115a2', '47e846a8-a0f1-4a41-a2fc-4dd00403dcac', '7d44c7f4-355f-47ca-b44b-d260bda71888',
  'e64b0fe5-f9fb-4cd4-9efd-dd9f9636cc7f', '22293107-1935-4beb-bf67-3765f2cfaf2d', 'bd68e943-7bdb-49fe-b529-89f75114906f', 'a0243508-fe05-4182-ad19-fabfe2514ffc', 'dd38de32-3cf4-4095-8cf6-087693378815'
);
