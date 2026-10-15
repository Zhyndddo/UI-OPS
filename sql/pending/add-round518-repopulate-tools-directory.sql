-- Round 518 — re-populate the Tools Directory (app_settings.tool_directory_links)
-- plus artist_profile_links. Safe to re-run: new groups are only added if
-- missing (so a dev's later edits to them are never overwritten), and the
-- three changes to existing tools are keyed by tool key.
-- Run STEP 1 (backup + preview), then STEP 2, then CHECK. UNDO at the bottom.
-- NOT included on purpose: the sheet's TOOL tab holds plaintext logins
-- (Spotify for Artist, DSP header row) — no passwords/accounts are stored here.

-- ───────── STEP 1: backup + preview ─────────
create table if not exists app_settings_backup_r518 as
  select now() as backed_up_at, key, value from app_settings
  where key in ('tool_directory_links','artist_profile_links');

select key, jsonb_typeof(value::jsonb) as value_type,
       (select count(*) from jsonb_object_keys(value::jsonb)) as top_level_keys
from app_settings where key in ('tool_directory_links','artist_profile_links');

-- ───────── STEP 2: apply ─────────
do $$
declare
  cur jsonb;
  newb jsonb := $j${
 "ops_vieent_tools": {
  "team": "OPS",
  "pageLabel": "VIEENT Tools",
  "route": null,
  "tools": [
   {
    "key": "pm",
    "label": "Vieent Project Management",
    "url": "https://docs.google.com/spreadsheets/d/1grHQTYRR9cl3TCCGv5TmWuh1sLwU22ElbFqu43KdXl0/edit?gid=1107655944#gid=1107655944"
   },
   {
    "key": "itunes",
    "label": "iTunes Pre-Save Link Generator",
    "url": "https://www.vieent.com/en/ituneslink"
   },
   {
    "key": "syncZing",
    "label": "Sync Lyric Zing MP3",
    "url": "https://static-zmp3.zadn.vn/skins/zmp3-lyric-tool/v0.0.6/index.html"
   },
   {
    "key": "merlin",
    "label": "Merlin | Bridge",
    "url": "https://bridge.merlinnetwork.org/login"
   },
   {
    "key": "streamPromo",
    "label": "Stream and promotion (check daily)",
    "url": "https://docs.google.com/spreadsheets/d/12K_1pXykyLEmrllpCyTiIBsJrtWagz-I217ns2eZAGI/edit?gid=946674881#gid=946674881"
   },
   {
    "key": "claimTikTok",
    "label": "Claim TikTok (form)",
    "url": "https://docs.google.com/forms/d/e/1FAIpQLSfvp1YoSkrVSHz8ThiL1cq8RYb3K9-SIMhomGueWbKnegQSJA/viewform"
   },
   {
    "key": "checkUpc",
    "label": "Check UPC - ISRC",
    "url": "https://app.linkfire.com/#/vieent-coltd/phan-hoa-roi/edit"
   },
   {
    "key": "milestone26",
    "label": "Milestone 2026",
    "url": "https://docs.google.com/spreadsheets/d/1bXuTZM_VWUHqW_ww8vM9dKRwddmuG7xTdqBurH8I5yY/edit?gid=0#gid=0"
   },
   {
    "key": "stream26",
    "label": "Stream 2026",
    "url": "https://docs.google.com/spreadsheets/d/18LspE8bvTrTsgcbuG5S5Bb-3CsonrwW_SfVxGa_p7ow/edit?gid=434095515#gid=434095515"
   },
   {
    "key": "shortlink",
    "label": "Shortlink Minter",
    "url": "https://internal.vieent.com/short-links"
   }
  ]
 },
 "ops_pitching_partners": {
  "team": "OPS",
  "pageLabel": "Pitching Partners",
  "route": null,
  "tools": [
   {
    "key": "keeng",
    "label": "Keeng x Vieent (sheet)",
    "url": "https://docs.google.com/spreadsheets/d/1AtqP_bb8mjtlM0JCVcDc7RUeIXPCn7rUtUEps7dEHTg/edit?gid=0#gid=0"
   },
   {
    "key": "zingTrack",
    "label": "Zing MP3 Link Tracking (sheet)",
    "url": "https://docs.google.com/spreadsheets/d/1tStLwX618d1nscy7y07FZkgb2TCuLb9M_eRqD4bak_A/edit?gid=0#gid=0"
   }
  ]
 },
 "ops_dsp": {
  "team": "OPS",
  "pageLabel": "Artist Profile - DSP",
  "route": null,
  "tools": [
   {
    "key": "appleContact",
    "label": "Apple Music for Artist - Contact",
    "url": "https://artists.apple.com/contact-us"
   },
   {
    "key": "zingForm",
    "label": "Zing MP3 - Artist Profile Form",
    "url": "https://docs.google.com/forms/d/e/1FAIpQLSdDcgbzdS4noZ90xAlnJJxNWaCuz2fnJmogsjLANZVoQr5gzw/viewform"
   },
   {
    "key": "tiktokMusicTab",
    "label": "TikTok - Music Tab Requirement",
    "url": "https://artists.tiktok.com/feedback?invitation_code=NzQ4NjA1Njk2NTUyMTU0MTE3NQ%3D%3D"
   },
   {
    "key": "tiktokCert",
    "label": "Music Artist Certification (TikTok)",
    "url": "https://www.tiktok.com/m-c/music_artist_certification_h5/index.html?enter_from=ops_scaled_education"
   }
  ]
 },
 "ops_guidelines": {
  "team": "OPS",
  "pageLabel": "Guidelines",
  "route": null,
  "tools": [
   {
    "key": "appleStyle",
    "label": "Apple Music Style Guide",
    "url": "https://help.apple.com/itc/musicstyleguide/#/itc638a0a411"
   },
   {
    "key": "spotifyMeta",
    "label": "Spotify - Music Metadata Guidelines",
    "url": "https://support.spotify.com/us/artists/article/metadata-formatting-guidelines/"
   },
   {
    "key": "spotifyProv",
    "label": "Spotify - Provider Support",
    "url": "https://providersupport.spotify.com/"
   },
   {
    "key": "lyricGuide",
    "label": "Lyrics Guidelines (Musixmatch)",
    "url": "https://community.musixmatch.com/guidelines?lng=vi"
   },
   {
    "key": "lyricSlides",
    "label": "Lyrics Guidelines - Summary Slides",
    "url": "https://docs.google.com/presentation/d/e/2PACX-1vSdySfTq4sB3QYi_aY9u8fn7OfnsRZ0YGw9eHZetaS8kOsKbb3-MFPEo_6SLnfaM2dcKq23kvjcMSuK/pub?start=false&loop=false&delayms=5000&slide=id.g2ed4106beea_0_94"
   },
   {
    "key": "mmStyle",
    "label": "Music Metadata Style Guide (PDF)",
    "url": "https://musicbiz.org/wp-content/uploads/2016/04/MusicMetadataStyleGuide_V2.1.pdf"
   },
   {
    "key": "lmGuide",
    "label": "Audio Salad / Label Master User Guide (Drive)",
    "url": "https://drive.google.com/drive/folders/117j4ILDs4dsBc2EdDUg5Eyuy7SokyD1R"
   }
  ]
 },
 "ops_form_mau": {
  "team": "OPS",
  "pageLabel": "Form mẫu",
  "route": null,
  "tools": [
   {
    "key": "fmDigital",
    "label": "Phát hành nhạc số",
    "url": "https://docs.google.com/spreadsheets/d/1m-zKQtX-X857NNZDoBbfp7bhlddX2NA3zTSoJceF0PM/edit?usp=drive_link"
   },
   {
    "key": "fmYoutube",
    "label": "Phát hành Youtube",
    "url": "https://docs.google.com/spreadsheets/d/1VsPgsiNNEDIBsgFkdhFDpCLPdOon74s8jI2Ziqp6tvw/edit?usp=drive_link"
   },
   {
    "key": "fmSupport",
    "label": "Form mẫu gói Hỗ Trợ Truyền Thông",
    "url": "https://docs.google.com/spreadsheets/d/14BrenWa9f2teEdN6tqEzDUAr7yf9V9OyxxCxUQbD8G8/edit?gid=873060569#gid=873060569"
   }
  ]
 },
 "ar_common": {
  "team": "AR",
  "pageLabel": "Common Tools",
  "route": null,
  "tools": [
   {
    "key": "shortlink",
    "label": "Shortlink Minter",
    "url": "https://internal.vieent.com/short-links"
   },
   {
    "key": "s4a",
    "label": "S4A",
    "url": "https://artists.spotify.com/c/artist/1949NgGs5369LNQZbPlUYc/home"
   },
   {
    "key": "linkfire",
    "label": "Linkfire",
    "url": "https://app.linkfire.com/#/vieent-coltd/dashboard"
   },
   {
    "key": "audioSalad",
    "label": "Audio Salad",
    "url": "https://dashboard.vieent.com/"
   }
  ]
 },
 "mkt_common": {
  "team": "Marketing",
  "pageLabel": "Common Tools",
  "route": null,
  "tools": [
   {
    "key": "shortlink",
    "label": "Shortlink Minter",
    "url": "https://internal.vieent.com/short-links"
   },
   {
    "key": "s4a",
    "label": "S4A",
    "url": "https://artists.spotify.com/c/artist/1949NgGs5369LNQZbPlUYc/home"
   },
   {
    "key": "linkfire",
    "label": "Linkfire",
    "url": "https://app.linkfire.com/#/vieent-coltd/dashboard"
   }
  ]
 },
 "legal_common": {
  "team": "Legal",
  "pageLabel": "Common Tools",
  "route": null,
  "tools": [
   {
    "key": "shortlink",
    "label": "Shortlink Minter",
    "url": "https://internal.vieent.com/short-links"
   }
  ]
 },
 "ar_tro_gia": {
  "team": "AR",
  "pageLabel": "Trợ Giá Booking",
  "route": null,
  "tools": [
   {
    "key": "troGiaTikTok",
    "label": "Trợ Giá Booking - TikTok Channel",
    "url": "https://docs.google.com/spreadsheets/d/1Jyuy_QjrDAk3ToG70Ql4O-6w2WMwVPi5IFRJJjWh9JQ/edit?gid=388080288#gid=388080288"
   },
   {
    "key": "troGiaCapcut",
    "label": "Trợ Giá Booking - Mẫu CapCut",
    "url": "https://docs.google.com/spreadsheets/d/1Jyuy_QjrDAk3ToG70Ql4O-6w2WMwVPi5IFRJJjWh9JQ/edit?gid=1000267329#gid=1000267329"
   },
   {
    "key": "rateCardAds",
    "label": "Rate Card Ads VIEENT",
    "url": "https://docs.google.com/spreadsheets/d/1vC-T1Vst4O0CtexP5LSJ2MGGWNQST72xK_vLCcrRJhM/edit?gid=0#gid=0"
   }
  ]
 },
 "mkt_tro_gia": {
  "team": "Marketing",
  "pageLabel": "Trợ Giá Booking",
  "route": null,
  "tools": [
   {
    "key": "troGiaTikTok",
    "label": "Trợ Giá Booking - TikTok Channel",
    "url": "https://docs.google.com/spreadsheets/d/1Jyuy_QjrDAk3ToG70Ql4O-6w2WMwVPi5IFRJJjWh9JQ/edit?gid=388080288#gid=388080288"
   },
   {
    "key": "troGiaCapcut",
    "label": "Trợ Giá Booking - Mẫu CapCut",
    "url": "https://docs.google.com/spreadsheets/d/1Jyuy_QjrDAk3ToG70Ql4O-6w2WMwVPi5IFRJJjWh9JQ/edit?gid=1000267329#gid=1000267329"
   },
   {
    "key": "rateCardAds",
    "label": "Rate Card Ads VIEENT",
    "url": "https://docs.google.com/spreadsheets/d/1vC-T1Vst4O0CtexP5LSJ2MGGWNQST72xK_vLCcrRJhM/edit?gid=0#gid=0"
   }
  ]
 },
 "legal_hop_dong": {
  "team": "Legal",
  "pageLabel": "Hợp đồng nhạc số",
  "route": null,
  "tools": [
   {
    "key": "hopDongInfo",
    "label": "Hợp đồng nhạc số - Info List",
    "url": "https://docs.google.com/spreadsheets/d/1QyqZlB2c-7rs6irQQjAUyNcd8F3x43vly6ay8Xmgxns?resourcekey=&usp=forms_web_b&urp=linked#gid=415829846"
   }
  ]
 }
}$j$::jsonb;
  k text;
begin
  select value::jsonb into cur from app_settings where key = 'tool_directory_links';
  if cur is null then cur := '{}'::jsonb; end if;

  -- (a) Label Master -> Audio Salad (+ new dashboard URL), New Release Setup
  if cur ? 'upload' then
    cur := jsonb_set(cur, '{upload,tools}', coalesce((
      select jsonb_agg(case when e->>'key' = 'labelMaster'
        then e || jsonb_build_object('label','Audio Salad','url','https://dashboard.vieent.com/') else e end order by o)
      from jsonb_array_elements(cur->'upload'->'tools') with ordinality as x(e,o)), '[]'::jsonb));
  end if;

  -- (b) Re-Check: Spotify Catalog -> general URL; add NCT Song Edit if missing
  if cur ? 'confirm' then
    cur := jsonb_set(cur, '{confirm,tools}', coalesce((
      select jsonb_agg(case when e->>'key' = 'spotifyCatalog'
        then e || jsonb_build_object('url','https://musicproviders.spotify.com/catalog?tab=recentlyViewed') else e end order by o)
      from jsonb_array_elements(cur->'confirm'->'tools') with ordinality as x(e,o)), '[]'::jsonb));
    if not exists (select 1 from jsonb_array_elements(cur->'confirm'->'tools') e where e->>'key' = 'nctSongEdit') then
      cur := jsonb_set(cur, '{confirm,tools}', (cur->'confirm'->'tools') ||
        '[{"key":"nctSongEdit","label":"NCT Song Edit","url":"https://provider.nct.vn/provider/song-edit?sk=3glujzaO4xFn"}]'::jsonb);
    end if;
  end if;

  -- (c) new groups (only if the group key doesn't exist yet)
  for k in select jsonb_object_keys(newb) loop
    if not (cur ? k) then cur := cur || jsonb_build_object(k, newb->k); end if;
  end loop;

  insert into app_settings(key, value) values ('tool_directory_links', cur)
  on conflict (key) do update set value = excluded.value;

  -- artist_profile_links: fill the two blank cards we now have URLs for
  update app_settings set value = (
    coalesce(value::jsonb,'{}'::jsonb)
    || jsonb_build_object(
         'apple',   case when coalesce(value::jsonb->>'apple','')   = '' then 'https://artists.apple.com/' else value::jsonb->>'apple' end,
         'spotify', case when coalesce(value::jsonb->>'spotify','') = '' then 'https://artists.spotify.com/c/artist/1949NgGs5369LNQZbPlUYc/home' else value::jsonb->>'spotify' end))
  where key = 'artist_profile_links';
end $$;

-- ───────── CHECK ─────────
select b.key as group_key, b.value->>'team' as team, b.value->>'pageLabel' as page_group,
       jsonb_array_length(b.value->'tools') as tools
from app_settings s, jsonb_each(s.value::jsonb) as b(key,value)
where s.key = 'tool_directory_links'
order by 2,3;

select e->>'label' as label, e->>'url' as url
from app_settings s, jsonb_array_elements(s.value::jsonb->'upload'->'tools') e
where s.key='tool_directory_links';

select value from app_settings where key='artist_profile_links';

-- ───────── UNDO (only if needed) ─────────
-- update app_settings a set value = b.value from app_settings_backup_r518 b
--   where a.key = b.key and b.backed_up_at = (select max(backed_up_at) from app_settings_backup_r518);
