-- ============================================================================
-- Round 592c — merge artists that differ ONLY by upper/lower case or extra spaces
-- ============================================================================
-- Run after merge-round592-duplicates.sql. Artists whose spelling differs by accents (Văn Hương / Văn Hưởng,
-- Ngọc Ký / Ngọc Kỳ ...) are NOT touched. One transaction. Per group it keeps the row with the most filled
-- fields (else the oldest), copies empty fields from the others into it, rewrites the old spelling in
-- releases.main_artist_tags / feature_artist_tags (and main_artist / feature_artist when they are exactly that name),
-- then deletes the extras.
begin;

create temp table _ac on commit drop as
with ranked as (
  select a.*, lower(btrim(regexp_replace(a.stage_name, '\s+', ' ', 'g'))) k,
    row_number() over (partition by lower(btrim(regexp_replace(a.stage_name, '\s+', ' ', 'g')))
      order by (a.real_name is not null)::int + (a.email is not null)::int + (a.label_id is not null)::int + (a.spotify_url is not null)::int
             + (a.note is not null)::int + (a.youtube_url is not null)::int + (a.tiktok_url is not null)::int
             + (a.facebook_url is not null)::int + (a.instagram_url is not null)::int desc, a.created_at, a.id) rn
  from public.artists a
)
select d.id drop_id, d.stage_name drop_name, k.id keep_id, k.stage_name keep_name
from ranked d join ranked k on k.k = d.k and k.rn = 1 where d.rn > 1;

update public.artists k set
  real_name = coalesce(k.real_name, x.real_name), email = coalesce(k.email, x.email), phan_loai = coalesce(k.phan_loai, x.phan_loai),
  spotify_url = coalesce(k.spotify_url, x.spotify_url), tiktok_url = coalesce(k.tiktok_url, x.tiktok_url),
  facebook_url = coalesce(k.facebook_url, x.facebook_url), fanpage_url = coalesce(k.fanpage_url, x.fanpage_url),
  youtube_url = coalesce(k.youtube_url, x.youtube_url), zing_url = coalesce(k.zing_url, x.zing_url),
  instagram_url = coalesce(k.instagram_url, x.instagram_url), apple_url = coalesce(k.apple_url, x.apple_url),
  nct_url = coalesce(k.nct_url, x.nct_url), note = coalesce(k.note, x.note), label_id = coalesce(k.label_id, x.label_id),
  company_name = coalesce(k.company_name, x.company_name), type = coalesce(k.type, x.type)
from (
  select m.keep_id, max(d.real_name) real_name, max(d.email) email, max(d.phan_loai) phan_loai, max(d.spotify_url) spotify_url,
         max(d.tiktok_url) tiktok_url, max(d.facebook_url) facebook_url, max(d.fanpage_url) fanpage_url, max(d.youtube_url) youtube_url,
         max(d.zing_url) zing_url, max(d.instagram_url) instagram_url, max(d.apple_url) apple_url, max(d.nct_url) nct_url,
         max(d.note) note, (array_agg(d.label_id) filter (where d.label_id is not null))[1] label_id, max(d.company_name) company_name, max(d.type) "type"
  from _ac m join public.artists d on d.id = m.drop_id group by m.keep_id
) x where k.id = x.keep_id;

-- rewrite the old spelling wherever releases store it (exact old text only; one pass per removed row)
update public.releases r set main_artist_tags = array_replace(r.main_artist_tags, m.drop_name, m.keep_name)
  from _ac m where r.main_artist_tags @> array[m.drop_name] and m.drop_name <> m.keep_name;
update public.releases r set feature_artist_tags = array_replace(r.feature_artist_tags, m.drop_name, m.keep_name)
  from _ac m where r.feature_artist_tags @> array[m.drop_name] and m.drop_name <> m.keep_name;
update public.releases r set main_artist = m.keep_name from _ac m where r.main_artist = m.drop_name and m.drop_name <> m.keep_name;
update public.releases r set feature_artist = m.keep_name from _ac m where r.feature_artist = m.drop_name and m.drop_name <> m.keep_name;

delete from public.artists where id in (select drop_id from _ac);
select count(*) as artists_merged from _ac;
commit;

-- left over (accent differences — decide by hand, or leave: add-round592b now only blocks case/space duplicates)
select public.norm_name(stage_name) as key, array_agg(stage_name order by created_at) names from public.artists group by 1 having count(*) > 1 order by 1;
