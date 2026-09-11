-- Round 304 — import the "TEMPLATE RELEASE ... TEMP LIST KÊNH" reference
-- sheet the team sent (VPOP-MANSTREAM / INDIE / MIỀN TÂY-BOLERO blocks,
-- each split into Social / Community / TikTok sub-sections) into
-- booking_channels, plus the CapCut booking-compilation link from the
-- sheet's trailing note.
--
-- IDEMPOTENT AND ADDITIVE ONLY: uses ON CONFLICT (name, platform,
-- channel_type) DO NOTHING against the table's existing unique constraint
-- (booking_channels_name_platform_channel_type_key) — exactly "if it's
-- missing, add it" per the request. An existing row with the same
-- name+platform+channel_type is left completely untouched (no brand/url/
-- follower_count/note overwrite), so this is safe to run more than once
-- and safe to run even if some of these channels are already in the
-- table. channel_type is 'Direct' for every row here — nothing in the
-- source sheet indicated a Partner-tier channel (that's a distinct
-- concept from Booking Board's own TikTok Channel In-house/Partner brand
-- grouping).
--
-- BRAND TAGGING — per explicit instruction ("by platform-block section"):
--   VIEENT's own Social-section rows (TikTok/YouTube/Facebook/Instagram/
--   Thread) → brand 'VIEENT', regardless of whether they appeared under
--   the sheet's VPOP or INDIE header (the sheet listed them identically
--   under both — same account, not two channels).
--   ENVI's own Social-section rows → brand 'ENVI - MIỀN TÂY/BOLERO'.
--   Every other VPOP Community/TikTok row → brand 'VPOP'.
--   Every other INDIE Community/TikTok row → brand 'INDIE'.
--   Every other MIỀN TÂY/BOLERO Community/TikTok row →
--   brand 'ENVI - MIỀN TÂY/BOLERO'.
--   The CapCut link → brand 'capcut' (an existing valid value per the
--   booking_channels.brand column comment).
--
-- KNOWN DATA COLLISION — flagging, not silently dropping: the sheet lists
-- "NHẠC NÀY MỚI" (Facebook, facebook.com/nhacnaymoi) under BOTH VPOP-
-- Community and MIỀN TÂY/BOLERO-Community with the exact same URL. The
-- table's unique constraint is (name, platform, channel_type) — it does
-- NOT include brand — so this one channel can only be stored under ONE
-- brand tag, not both. Kept as brand 'VPOP' (its first/primary listing in
-- the sheet). If the team actually wants it double-counted under both
-- brands, that needs a second row with a disambiguated name (the
-- constraint would otherwise reject it) — ask before doing that, this
-- migration does not.
--
-- Everything else that looked like an exact duplicate (VIEENT's 5 Social
-- rows, listed identically under both the VPOP and INDIE columns in the
-- source sheet) collapses naturally under ON CONFLICT — no action needed,
-- not a data-loss case like the one above.
insert into booking_channels (name, platform, channel_type, brand, url, follower_count, note)
values
  ('VIEENT', 'TikTok', 'Direct', 'VIEENT', 'https://www.tiktok.com/@vieentmusic', 639400, NULL),
  ('ENVI', 'Facebook', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.facebook.com/envi.musicnews', 32348, 'Key news/tổng hợp'),
  ('VIEENT', 'YouTube', 'Direct', 'VIEENT', 'https://www.youtube.com/@Vieentmusic', 48100, NULL),
  ('ENVI', 'Instagram', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.instagram.com/envi.musicnews/', 677, 'Key news/tổng hợp'),
  ('VIEENT', 'Facebook', 'Direct', 'VIEENT', 'https://www.facebook.com/vieentmusic', 26103, NULL),
  ('Envi Music', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@envi.musics', 6326, 'Key news/tổng hợp'),
  ('VIEENT', 'Instagram', 'Direct', 'VIEENT', 'https://www.instagram.com/vieentmusic/', 2467, NULL),
  ('ENVI', 'YouTube', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.youtube.com/@EnviMusicNews', 2770, 'Key news/tổng hợp'),
  ('VIEENT', 'Thread', 'Direct', 'VIEENT', 'https://www.threads.com/@vieentmusic', 135, NULL),
  ('3 đời nghe ngóng', 'Facebook', 'Direct', 'VPOP', 'https://www.facebook.com/3doinghengong/', 83394, 'Key news/tổng hợp'),
  ('Đài Indie', 'Facebook', 'Direct', 'INDIE', 'https://www.facebook.com/daiindie', 15761, 'Key news/tổng hợp'),
  ('ĐĨA NHẠC QUÊ HƯƠNG', 'Facebook', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.facebook.com/dianhacquehuong', 16420, 'Key news/tổng hợp'),
  ('VPOP CORN', 'Facebook', 'Direct', 'VPOP', 'https://www.facebook.com/vpopcorn.vn/', 12273, 'Key news/tổng hợp'),
  ('Đài Indie', 'Instagram', 'Direct', 'INDIE', 'https://www.instagram.com/dai.indie/', 162, 'Key news/tổng hợp'),
  ('MIỀN ÂM NHẠC', 'Facebook', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.facebook.com/mienamnhac/', 25248, 'Key news/tổng hợp'),
  ('Ai biết gì đâu', 'Facebook', 'Direct', 'VPOP', 'https://www.facebook.com/aibietgidaunews/', 4419, 'Key news/tổng hợp'),
  ('Đài Indie News', 'TikTok', 'Direct', 'INDIE', 'https://www.tiktok.com/@daiindie', 4321, 'Key news/tổng hợp'),
  ('LỜI CA TIẾNG HÁT', 'Facebook', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.facebook.com/loicatienghat/', 80000, 'Key news/tổng hợp'),
  ('NHẠC NÀY MỚI', 'Facebook', 'Direct', 'VPOP', 'https://www.facebook.com/nhacnaymoi/', 5118, 'Reup lyrics'),
  ('Đài Indie', 'Thread', 'Direct', 'INDIE', 'https://www.threads.com/@dai.indie', 236, 'Key news/tổng hợp'),
  ('VSOUNDER', 'Facebook', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.facebook.com/vsounders/', NULL, 'Key news/tổng hợp'),
  ('MUZIP', 'Facebook', 'Direct', 'VPOP', 'https://www.facebook.com/profile.php?id=61586432272102', 818, 'Key news/tổng hợp'),
  ('Thời Báo Indie', 'Facebook', 'Direct', 'INDIE', 'https://www.facebook.com/profile.php?id=61585188922995', 566, 'Key news/tổng hợp'),
  ('CẨM NANG', 'Facebook', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.facebook.com/camnangmusicvn', NULL, 'Key news/tổng hợp'),
  ('3 đời nghe ngóng', 'TikTok', 'Direct', 'VPOP', 'https://www.tiktok.com/@3doinghengong', 6285, 'Key news/tổng hợp'),
  ('Thời Báo Indie', 'Thread', 'Direct', 'INDIE', 'https://www.threads.com/@thoibao.indie', 313, 'Key news/tổng hợp'),
  ('ai biết gì đâu vn', 'TikTok', 'Direct', 'VPOP', 'https://www.tiktok.com/@aibietgidauvn', 3037, 'Key news/tổng hợp'),
  ('Thời Báo Indie', 'Instagram', 'Direct', 'INDIE', 'https://www.instagram.com/thoibao.indie/', 85, 'Key news/tổng hợp'),
  ('Vsounder', 'YouTube', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.youtube.com/@Vsoundervn', 194, 'Key news/tổng hợp'),
  ('MUZIP', 'TikTok', 'Direct', 'VPOP', 'https://www.tiktok.com/@mu.zip', 2068, 'Key news/tổng hợp'),
  ('Thời Báo Indie', 'TikTok', 'Direct', 'INDIE', 'https://www.tiktok.com/@thoibaoindie', 1785, 'Key news/tổng hợp'),
  ('Líu lo líu lo', 'YouTube', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.youtube.com/@liuloliuloofficial', 131, 'Key news/tổng hợp'),
  ('VPOP CORN', 'Thread', 'Direct', 'VPOP', 'https://www.threads.com/@v.pop.corn', 32, 'Key news/tổng hợp'),
  ('WANNA This', 'Facebook', 'Direct', 'INDIE', 'https://www.facebook.com/wannathis4you/', 15, 'Key news/tổng hợp'),
  ('Đĩa nhạc quê hương', 'YouTube', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.youtube.com/@dianhacquehuong', 329, 'Key news/tổng hợp'),
  ('3 đời nghe ngóng', 'Thread', 'Direct', 'VPOP', 'https://www.threads.com/@3doi.nghengong', 6, 'Key news/tổng hợp'),
  ('WANNA This', 'Instagram', 'Direct', 'INDIE', 'https://www.instagram.com/wannathis4you/', 4, 'Key news/tổng hợp'),
  ('Quận musik', 'YouTube', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.youtube.com/@quanmusikvn', 939, 'Key news/tổng hợp'),
  ('BÚP MĂNG NON', 'Facebook', 'Direct', 'VPOP', 'https://www.facebook.com/bupmangnonvnn/', 533, 'Key news/tổng hợp'),
  ('Mê Indie', 'YouTube', 'Direct', 'INDIE', 'https://www.youtube.com/@meindieindieme', 31, 'Key lyrics'),
  ('BÚP MĂNG NON', 'TikTok', 'Direct', 'VPOP', 'https://www.tiktok.com/@bupmangnonvnn', 145, 'Key news/tổng hợp'),
  ('Tít ở trên cây', 'Thread', 'Direct', 'INDIE', 'https://www.threads.com/@titotrencayy', NULL, NULL),
  ('Nói đi đừng sợ', 'Thread', 'Direct', 'VPOP', 'https://www.threads.com/@noididungsovn', NULL, NULL),
  ('Note nhạc', 'TikTok', 'Direct', 'VPOP', 'https://www.tiktok.com/@notenhacvn', 39900, 'Reup lyrics'),
  ('Mê Indie', 'TikTok', 'Direct', 'INDIE', 'https://www.tiktok.com/@meindie.indieme', 16700, 'Key lyrics'),
  ('Envi Music Lyrics', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@envi.music.lyrics', 2779, 'Key lyrics'),
  ('Thích MV', 'TikTok', 'Direct', 'VPOP', 'https://www.tiktok.com/@thichmv', 34100, 'Reup lyrics'),
  ('Mẫu chuyện mẩu nhạc', 'TikTok', 'Direct', 'INDIE', 'https://www.tiktok.com/@mauchuyenmaunhac', 9916, 'Key news/tổng hợp'),
  ('Miền Âm Nhạc', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@mienamnhac', 72000, 'Key lyrics'),
  ('Hey lên nhạc', 'TikTok', 'Direct', 'VPOP', 'https://www.tiktok.com/@heylennhac', 21500, 'Reup lyrics'),
  ('Đài Indie', 'TikTok', 'Direct', 'INDIE', 'https://www.tiktok.com/@dai.indie', 7856, 'Key news/tổng hợp'),
  ('Mê Tỷ Tỷ', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@metytyvn', 61000, 'Reup lyrics'),
  ('Nhạc Có Gu', 'TikTok', 'Direct', 'VPOP', 'https://www.tiktok.com/@nhaccoguu', 9310, 'Key lyrics'),
  ('Indie Playlist 25', 'TikTok', 'Direct', 'INDIE', 'https://www.tiktok.com/@indieplaylist25', 5707, 'Key lyrics'),
  ('Vlyrics', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@vlyrics.vn', 60800, 'Key lyrics'),
  ('Sơ hở là so sánh', 'TikTok', 'Direct', 'VPOP', 'https://www.tiktok.com/@soholasosanh25', 4847, 'Key news/tổng hợp'),
  ('InD', 'TikTok', 'Direct', 'INDIE', 'https://www.tiktok.com/@indwithd', 4390, 'Key lyrics'),
  ('Lời Ca Tiếng Hát', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@loicatienghat', 18500, 'Key lyrics'),
  ('VTRENDING', 'TikTok', 'Direct', 'VPOP', 'https://www.tiktok.com/@vtrendingvnn', 4985, 'Key trend tổng hợp'),
  ('Hôm nay nghe gì?', 'TikTok', 'Direct', 'INDIE', 'https://www.tiktok.com/@homnay.nghegi25', 1429, 'Reup lyrics'),
  ('Nhạc có lời', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@nhaccoloi2025', 12400, 'Key lyrics'),
  ('Nhạc này mới', 'TikTok', 'Direct', 'VPOP', 'https://www.tiktok.com/@nhacnaymoivn', 1888, 'Key lyrics'),
  ('Híp Húp', 'TikTok', 'Direct', 'INDIE', 'https://www.tiktok.com/@hiphupvn', 1580, 'Key trend tổng hợp'),
  ('Nhạc Thường Thức', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@nhacthuongthucvn', 9391, 'Reup lyrics'),
  ('VPOPUP', 'TikTok', 'Direct', 'VPOP', 'https://www.tiktok.com/@vpopupvn', 552, 'Key lyrics'),
  ('Skrt.', 'TikTok', 'Direct', 'INDIE', 'https://www.tiktok.com/@skrtskrtvn', 1010, 'Key lyrics'),
  ('Thợ Săn Lyrics', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@thosanlyrics', 8360, 'Reup lyrics'),
  ('Máy phát nhạc', 'TikTok', 'Direct', 'VPOP', 'https://www.tiktok.com/@mayphatnhacvn', 274, 'Key lyrics'),
  ('Deyui Playlist', 'TikTok', 'Direct', 'INDIE', 'https://www.tiktok.com/@de_yuii', 443, 'Key lyrics'),
  ('Nhạc Không Nhạt', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@nhackhongnhatt', 7197, 'Reup lyrics'),
  ('Suy rồi sao', 'TikTok', 'Direct', 'VPOP', 'https://www.tiktok.com/@suyroisaoo', 15, 'Key lyrics'),
  ('WANNA!', 'TikTok', 'Direct', 'INDIE', 'https://www.tiktok.com/@wannathisone', 249, 'Key news/tổng hợp'),
  ('Cẩm Nang Music', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@camnangmusic', 4592, 'Key news/tổng hợp'),
  ('Picheolin 🐹', 'TikTok', 'Direct', 'VPOP', 'https://www.tiktok.com/@picheolinsayno', 214, 'ĐU PHIM'),
  ('Today Music', 'TikTok', 'Direct', 'INDIE', 'https://www.tiktok.com/@today.music4u', 130, 'Key lyrics'),
  ('Xập Xình Miền Tây', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@xapxinhmientay', 4181, 'Key lyrics'),
  ('Thích Thì Đồn', 'TikTok', 'Direct', 'VPOP', 'https://www.tiktok.com/@thichthidonvn', 116, 'Reup news/tổng hợp'),
  ('was_supvn', 'TikTok', 'Direct', 'INDIE', 'https://www.tiktok.com/@was_supvn', 11, 'Key lyrics'),
  ('Vsounders', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@vsoundervn', 3482, 'Key news/tổng hợp'),
  ('Melody Miền Tây', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@melodymientay', 2770, 'Key lyrics'),
  ('Đĩa nhạc quê hương', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@dianhacquehuongvn', 2544, 'Key lyrics'),
  ('Quận Musik', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@quanmusikk', 1218, 'Key trend tổng hợp'),
  ('Bản tin Nhạc Việt', 'TikTok', 'Direct', 'ENVI - MIỀN TÂY/BOLERO', 'https://www.tiktok.com/@bantinnhacviet', 1078, 'Key trend tổng hợp'),
  ('CAPCUT Booking Compilation', 'TikTok', 'Direct', 'capcut', 'https://docs.google.com/spreadsheets/d/1Jyuy_QjrDAk3ToG70Ql4O-6w2WMwVPi5IFRJJjWh9JQ/edit?gid=1492704126#gid=1492704126', NULL, 'External booking template — changes over time')
on conflict (name, platform, channel_type) do nothing;
