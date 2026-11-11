-- ============================================================================
-- Round 592 — merge the existing duplicate labels / artists, so add-round592b-name-unique.sql can run
-- ============================================================================
-- Run AFTER add-round592-name-dedupe.sql. One transaction: either everything merges or nothing does.
-- What it does for every duplicate group (same norm_name / norm_label):
--   * keeps ONE row — labels: the one with contract_signed = true, else the most hợp-tác progress, else the oldest;
--                     artists: the one with the most filled fields, else the oldest
--   * copies any empty field from the others into the kept row (lists/status are merged, nothing is overwritten)
--   * labels: repoints artists.label_id, labels.parent_label_id, tickets.data.labelId / labelName and releases.label
--     from the removed rows to the kept one (when the old spelling differed, the text is rewritten to the kept name)
--   * artists: repoints nothing by id (nothing references artists.id) — only same-spelling extras are removed;
--     groups whose spellings differ are NOT touched and are listed at the end for a manual decision
-- Labels with different spellings (e.g. "Chuchu" / "HĐ - Chuchu") ARE merged, using the kept row's name.
-- Check the SELECT at the bottom returns no rows, then run add-round592b-name-unique.sql.

begin;

-- ---------- labels ----------
create temp table _lm on commit drop as
with ranked as (
  select l.*, public.norm_label(l.label_name) k,
         row_number() over (partition by public.norm_label(l.label_name)
           order by l.contract_signed desc, (select count(*) from jsonb_object_keys(l.hop_tac_status)) desc, l.created_at, l.id) rn
  from public.labels l
)
select d.id as drop_id, d.label_name as drop_name, k.id as keep_id, k.label_name as keep_name
from ranked d join ranked k on k.k = d.k and k.rn = 1 where d.rn > 1;

update public.labels k set
  pl_nhom = coalesce(k.pl_nhom, x.pl_nhom), pic = coalesce(k.pic, x.pic),
  hinh_thuc_hoat_dong = coalesce(k.hinh_thuc_hoat_dong, x.hinh_thuc_hoat_dong),
  latest_activity_year = coalesce(k.latest_activity_year, x.latest_activity_year),
  hinh_thuc_phat_hanh = coalesce(k.hinh_thuc_phat_hanh, x.hinh_thuc_phat_hanh),
  parent_label_id = coalesce(k.parent_label_id, x.parent_label_id),
  phan_loai = coalesce(k.phan_loai, x.phan_loai), the_loai = coalesce(k.the_loai, x.the_loai),
  note = coalesce(k.note, x.note), curve_id = coalesce(k.curve_id, x.curve_id),
  label_master_file = coalesce(k.label_master_file, x.label_master_file),
  hop_tac_legacy = coalesce(k.hop_tac_legacy, x.hop_tac_legacy),
  contract_signed = k.contract_signed or x.signed,
  hop_tac = (select coalesce(array_agg(distinct t), '{}') from unnest(k.hop_tac || x.hop_tac) t),
  hop_tac_status = x.hop_tac_status || k.hop_tac_status
from (
  select m.keep_id,
         max(d.pl_nhom) pl_nhom, max(d.pic) pic, max(d.hinh_thuc_hoat_dong) hinh_thuc_hoat_dong,
         max(d.latest_activity_year) latest_activity_year, max(d.hinh_thuc_phat_hanh) hinh_thuc_phat_hanh,
         (array_agg(d.parent_label_id) filter (where d.parent_label_id is not null))[1] parent_label_id,
         max(d.phan_loai) phan_loai, max(d.the_loai) the_loai, max(d.note) note, max(d.curve_id) curve_id,
         max(d.label_master_file) label_master_file, max(d.hop_tac_legacy) hop_tac_legacy,
         bool_or(d.contract_signed) signed,
         coalesce((select array_agg(distinct t) from _lm m2 join public.labels d2 on d2.id = m2.drop_id, unnest(d2.hop_tac) t where m2.keep_id = m.keep_id), '{}') hop_tac,
         coalesce((select jsonb_object_agg(e.key, e.value) from _lm m3 join public.labels d3 on d3.id = m3.drop_id, jsonb_each(d3.hop_tac_status) e where m3.keep_id = m.keep_id), '{}'::jsonb) hop_tac_status
  from _lm m join public.labels d on d.id = m.drop_id group by m.keep_id
) x where k.id = x.keep_id;

update public.artists a set label_id = m.keep_id from _lm m where a.label_id = m.drop_id;
update public.labels l set parent_label_id = m.keep_id from _lm m where l.parent_label_id = m.drop_id;
update public.labels l set parent_label_id = null where parent_label_id = id;
update public.tickets t set data = jsonb_set(jsonb_set(t.data, '{labelId}', to_jsonb(m.keep_id::text)), '{labelName}', to_jsonb(m.keep_name))
  from _lm m where t.data->>'labelId' = m.drop_id::text;
update public.releases r set label = m.keep_name from _lm m where r.label = m.drop_name and m.drop_name <> m.keep_name;
delete from public.labels where id in (select drop_id from _lm);

-- ---------- artists (same spelling only) ----------
create temp table _am on commit drop as
with ranked as (
  select a.*, row_number() over (partition by a.stage_name, public.norm_name(a.stage_name)
    order by (a.real_name is not null)::int + (a.email is not null)::int + (a.label_id is not null)::int + (a.spotify_url is not null)::int
             + (a.note is not null)::int + (a.youtube_url is not null)::int + (a.tiktok_url is not null)::int desc, a.created_at, a.id) rn
  from public.artists a
)
select d.id drop_id, k.id keep_id from ranked d join ranked k on k.stage_name = d.stage_name and k.rn = 1 and public.norm_name(k.stage_name) = public.norm_name(d.stage_name) where d.rn > 1;

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
  from _am m join public.artists d on d.id = m.drop_id group by m.keep_id
) x where k.id = x.keep_id;
delete from public.artists where id in (select drop_id from _am);

select (select count(*) from _lm) as labels_merged, (select count(*) from _am) as artists_merged;
commit;

-- ---------- what is LEFT (different spellings of the same artist — decide by hand) ----------
select public.norm_name(stage_name) as key, array_agg(stage_name order by created_at) names, array_agg(id order by created_at) ids
from public.artists group by 1 having count(*) > 1 order by key;
select public.norm_label(label_name) as key, array_agg(label_name) names from public.labels group by 1 having count(*) > 1;
