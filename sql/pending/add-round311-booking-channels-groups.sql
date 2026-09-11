-- Round 311 — channel_group on booking_channels, matching the reference
-- sheet's own colored row-header sections (VIEENT - SOCIAL / VPOP -
-- COMMUNITY / VPOP - TIKTOK / INDIE - COMMUNITY / INDIE - TIKTOK / ENVI /
-- MIỀN TÂY/BOLERO - COMMUNITY / TIKTOK MIỀN TÂY/BOLERO), plus the "move
-- the compilation link to its own group" request.
--
-- This is a NEW, finer-grained concept than the existing `brand` column
-- (VPOP/INDIE/ENVI - MIỀN TÂY/BOLERO/VIEENT/capcut) — brand alone can't
-- tell "VPOP - COMMUNITY" apart from "VPOP - TIKTOK" (both brand='VPOP'),
-- since the sheet's Community section includes some TikTok-platform rows
-- too (e.g. "MUZIP" is a TikTok channel but sits in VPOP - COMMUNITY, not
-- VPOP - TIKTOK) — so group can't be derived from platform either. Every
-- row below is assigned by matching its exact position in the source
-- sheet (same order Round 304's import used), not by any formula.
--
-- Idempotent — safe to run again: the backfill UPDATE always sets the
-- same values for the same (name, platform, channel_type) key, and the
-- capcut rename below is keyed off its OLD name so a second run is a
-- no-op (nothing still has the old name to match).
alter table booking_channels add column if not exists channel_group text;
comment on column booking_channels.channel_group is
  'Round 311 — the reference sheet''s own row-header grouping (e.g. "VPOP - COMMUNITY", "VIEENT - SOCIAL"), finer-grained than `brand`. Display-only, used to group and subtotal (count + follower sum) the channel list on /channels/[token] and Config''s reference table.';

update booking_channels bc
set channel_group = v.group_name
from (values
  ('VIEENT', 'TikTok', 'Direct', 'VIEENT - SOCIAL', 'VIEENT'),
  ('ENVI', 'Facebook', 'Direct', 'ENVI', 'ENVI'),
  ('VIEENT', 'YouTube', 'Direct', 'VIEENT - SOCIAL', 'VIEENT'),
  ('ENVI', 'Instagram', 'Direct', 'ENVI', 'ENVI'),
  ('VIEENT', 'Facebook', 'Direct', 'VIEENT - SOCIAL', 'VIEENT'),
  ('Envi Music', 'TikTok', 'Direct', 'ENVI', 'Envi Music'),
  ('VIEENT', 'Instagram', 'Direct', 'VIEENT - SOCIAL', 'VIEENT'),
  ('ENVI', 'YouTube', 'Direct', 'ENVI', 'ENVI'),
  ('VIEENT', 'Thread', 'Direct', 'VIEENT - SOCIAL', 'VIEENT'),
  ('3 đời nghe ngóng', 'Facebook', 'Direct', 'VPOP - COMMUNITY', '3 đời nghe ngóng'),
  ('Đài Indie', 'Facebook', 'Direct', 'INDIE - COMMUNITY', 'Đài Indie'),
  ('ĐĨA NHẠC QUÊ HƯƠNG', 'Facebook', 'Direct', 'MIỀN TÂY/BOLERO - COMMUNITY', 'ĐĨA NHẠC QUÊ HƯƠNG'),
  ('VPOP CORN', 'Facebook', 'Direct', 'VPOP - COMMUNITY', 'VPOP CORN'),
  ('Đài Indie', 'Instagram', 'Direct', 'INDIE - COMMUNITY', 'Đài Indie'),
  ('MIỀN ÂM NHẠC', 'Facebook', 'Direct', 'MIỀN TÂY/BOLERO - COMMUNITY', 'MIỀN ÂM NHẠC'),
  ('Ai biết gì đâu', 'Facebook', 'Direct', 'VPOP - COMMUNITY', 'Ai biết gì đâu'),
  ('Đài Indie News', 'TikTok', 'Direct', 'INDIE - COMMUNITY', 'Đài Indie News'),
  ('LỜI CA TIẾNG HÁT', 'Facebook', 'Direct', 'MIỀN TÂY/BOLERO - COMMUNITY', 'LỜI CA TIẾNG HÁT'),
  ('NHẠC NÀY MỚI', 'Facebook', 'Direct', 'VPOP - COMMUNITY', 'NHẠC NÀY MỚI'),
  ('Đài Indie', 'Thread', 'Direct', 'INDIE - COMMUNITY', 'Đài Indie'),
  ('VSOUNDER', 'Facebook', 'Direct', 'MIỀN TÂY/BOLERO - COMMUNITY', 'VSOUNDER'),
  ('MUZIP', 'Facebook', 'Direct', 'VPOP - COMMUNITY', 'MUZIP'),
  ('Thời Báo Indie', 'Facebook', 'Direct', 'INDIE - COMMUNITY', 'Thời Báo Indie'),
  ('CẨM NANG', 'Facebook', 'Direct', 'MIỀN TÂY/BOLERO - COMMUNITY', 'CẨM NANG'),
  ('3 đời nghe ngóng', 'TikTok', 'Direct', 'VPOP - COMMUNITY', '3 đời nghe ngóng'),
  ('Thời Báo Indie', 'Thread', 'Direct', 'INDIE - COMMUNITY', 'Thời Báo Indie'),
  ('ai biết gì đâu vn', 'TikTok', 'Direct', 'VPOP - COMMUNITY', 'ai biết gì đâu vn'),
  ('Thời Báo Indie', 'Instagram', 'Direct', 'INDIE - COMMUNITY', 'Thời Báo Indie'),
  ('Vsounder', 'YouTube', 'Direct', 'MIỀN TÂY/BOLERO - COMMUNITY', 'Vsounder'),
  ('MUZIP', 'TikTok', 'Direct', 'VPOP - COMMUNITY', 'MUZIP'),
  ('Thời Báo Indie', 'TikTok', 'Direct', 'INDIE - COMMUNITY', 'Thời Báo Indie'),
  ('Líu lo líu lo', 'YouTube', 'Direct', 'MIỀN TÂY/BOLERO - COMMUNITY', 'Líu lo líu lo'),
  ('VPOP CORN', 'Thread', 'Direct', 'VPOP - COMMUNITY', 'VPOP CORN'),
  ('WANNA This', 'Facebook', 'Direct', 'INDIE - COMMUNITY', 'WANNA This'),
  ('Đĩa nhạc quê hương', 'YouTube', 'Direct', 'MIỀN TÂY/BOLERO - COMMUNITY', 'Đĩa nhạc quê hương'),
  ('3 đời nghe ngóng', 'Thread', 'Direct', 'VPOP - COMMUNITY', '3 đời nghe ngóng'),
  ('WANNA This', 'Instagram', 'Direct', 'INDIE - COMMUNITY', 'WANNA This'),
  ('Quận musik', 'YouTube', 'Direct', 'MIỀN TÂY/BOLERO - COMMUNITY', 'Quận musik'),
  ('BÚP MĂNG NON', 'Facebook', 'Direct', 'VPOP - COMMUNITY', 'BÚP MĂNG NON'),
  ('Mê Indie', 'YouTube', 'Direct', 'INDIE - COMMUNITY', 'Mê Indie'),
  ('BÚP MĂNG NON', 'TikTok', 'Direct', 'VPOP - COMMUNITY', 'BÚP MĂNG NON'),
  ('Tít ở trên cây', 'Thread', 'Direct', 'INDIE - COMMUNITY', 'Tít ở trên cây'),
  ('Nói đi đừng sợ', 'Thread', 'Direct', 'VPOP - COMMUNITY', 'Nói đi đừng sợ'),
  ('Note nhạc', 'TikTok', 'Direct', 'VPOP - TIKTOK', 'Note nhạc'),
  ('Mê Indie', 'TikTok', 'Direct', 'INDIE - TIKTOK', 'Mê Indie'),
  ('Envi Music Lyrics', 'TikTok', 'Direct', 'TIKTOK MIỀN TÂY/BOLERO', 'Envi Music Lyrics'),
  ('Thích MV', 'TikTok', 'Direct', 'VPOP - TIKTOK', 'Thích MV'),
  ('Mẫu chuyện mẩu nhạc', 'TikTok', 'Direct', 'INDIE - TIKTOK', 'Mẫu chuyện mẩu nhạc'),
  ('Miền Âm Nhạc', 'TikTok', 'Direct', 'TIKTOK MIỀN TÂY/BOLERO', 'Miền Âm Nhạc'),
  ('Hey lên nhạc', 'TikTok', 'Direct', 'VPOP - TIKTOK', 'Hey lên nhạc'),
  ('Đài Indie', 'TikTok', 'Direct', 'INDIE - TIKTOK', 'Đài Indie'),
  ('Mê Tỷ Tỷ', 'TikTok', 'Direct', 'TIKTOK MIỀN TÂY/BOLERO', 'Mê Tỷ Tỷ'),
  ('Nhạc Có Gu', 'TikTok', 'Direct', 'VPOP - TIKTOK', 'Nhạc Có Gu'),
  ('Indie Playlist 25', 'TikTok', 'Direct', 'INDIE - TIKTOK', 'Indie Playlist 25'),
  ('Vlyrics', 'TikTok', 'Direct', 'TIKTOK MIỀN TÂY/BOLERO', 'Vlyrics'),
  ('Sơ hở là so sánh', 'TikTok', 'Direct', 'VPOP - TIKTOK', 'Sơ hở là so sánh'),
  ('InD', 'TikTok', 'Direct', 'INDIE - TIKTOK', 'InD'),
  ('Lời Ca Tiếng Hát', 'TikTok', 'Direct', 'TIKTOK MIỀN TÂY/BOLERO', 'Lời Ca Tiếng Hát'),
  ('VTRENDING', 'TikTok', 'Direct', 'VPOP - TIKTOK', 'VTRENDING'),
  ('Hôm nay nghe gì?', 'TikTok', 'Direct', 'INDIE - TIKTOK', 'Hôm nay nghe gì?'),
  ('Nhạc có lời', 'TikTok', 'Direct', 'TIKTOK MIỀN TÂY/BOLERO', 'Nhạc có lời'),
  ('Nhạc này mới', 'TikTok', 'Direct', 'VPOP - TIKTOK', 'Nhạc này mới'),
  ('Híp Húp', 'TikTok', 'Direct', 'INDIE - TIKTOK', 'Híp Húp'),
  ('Nhạc Thường Thức', 'TikTok', 'Direct', 'TIKTOK MIỀN TÂY/BOLERO', 'Nhạc Thường Thức'),
  ('VPOPUP', 'TikTok', 'Direct', 'VPOP - TIKTOK', 'VPOPUP'),
  ('Skrt.', 'TikTok', 'Direct', 'INDIE - TIKTOK', 'Skrt.'),
  ('Thợ Săn Lyrics', 'TikTok', 'Direct', 'TIKTOK MIỀN TÂY/BOLERO', 'Thợ Săn Lyrics'),
  ('Máy phát nhạc', 'TikTok', 'Direct', 'VPOP - TIKTOK', 'Máy phát nhạc'),
  ('Deyui Playlist', 'TikTok', 'Direct', 'INDIE - TIKTOK', 'Deyui Playlist'),
  ('Nhạc Không Nhạt', 'TikTok', 'Direct', 'TIKTOK MIỀN TÂY/BOLERO', 'Nhạc Không Nhạt'),
  ('Suy rồi sao', 'TikTok', 'Direct', 'VPOP - TIKTOK', 'Suy rồi sao'),
  ('WANNA!', 'TikTok', 'Direct', 'INDIE - TIKTOK', 'WANNA!'),
  ('Cẩm Nang Music', 'TikTok', 'Direct', 'TIKTOK MIỀN TÂY/BOLERO', 'Cẩm Nang Music'),
  ('Picheolin 🐹', 'TikTok', 'Direct', 'VPOP - TIKTOK', 'Picheolin 🐹'),
  ('Today Music', 'TikTok', 'Direct', 'INDIE - TIKTOK', 'Today Music'),
  ('Xập Xình Miền Tây', 'TikTok', 'Direct', 'TIKTOK MIỀN TÂY/BOLERO', 'Xập Xình Miền Tây'),
  ('Thích Thì Đồn', 'TikTok', 'Direct', 'VPOP - TIKTOK', 'Thích Thì Đồn'),
  ('was_supvn', 'TikTok', 'Direct', 'INDIE - TIKTOK', 'was_supvn'),
  ('Vsounders', 'TikTok', 'Direct', 'TIKTOK MIỀN TÂY/BOLERO', 'Vsounders'),
  ('Melody Miền Tây', 'TikTok', 'Direct', 'TIKTOK MIỀN TÂY/BOLERO', 'Melody Miền Tây'),
  ('Đĩa nhạc quê hương', 'TikTok', 'Direct', 'TIKTOK MIỀN TÂY/BOLERO', 'Đĩa nhạc quê hương'),
  ('Quận Musik', 'TikTok', 'Direct', 'TIKTOK MIỀN TÂY/BOLERO', 'Quận Musik'),
  ('Bản tin Nhạc Việt', 'TikTok', 'Direct', 'TIKTOK MIỀN TÂY/BOLERO', 'Bản tin Nhạc Việt'),
  ('CAPCUT Booking Compilation', 'TikTok', 'Direct', 'Distribution Support - MEDIA BOOKING CHANNEL', 'Distribution Support - MEDIA BOOKING CHANNEL')
) as v(old_name, platform, channel_type, group_name, new_name)
where bc.name = v.old_name and bc.platform = v.platform and bc.channel_type = v.channel_type;

-- The compilation link's own rename — per explicit request, moved to its
-- own group and relabeled to match the sheet's own text for it
-- ("[Distribution Support] MEDIA BOOKING CHANNEL"). Keyed off the OLD
-- name so this is a no-op on a second run. url/note/brand/follower_count
-- are untouched — only name and channel_group change.
update booking_channels
set name = 'Distribution Support - MEDIA BOOKING CHANNEL'
where name = 'CAPCUT Booking Compilation'
  and platform = 'TikTok'
  and channel_type = 'Direct';

-- Note: "NHẠC NÀY MỚI" (Facebook) — per Round 304's known collision flag
-- — is stored once, under brand 'VPOP', so it only picks up
-- 'VPOP - COMMUNITY' here even though the sheet also listed it under
-- MIỀN TÂY/BOLERO - COMMUNITY. Unchanged by this migration; still worth
-- asking about if the team wants it double-counted (see Round 304's
-- header for the full explanation — that needs a disambiguated second
-- row, this migration doesn't add one).
