-- Round 506 — Booking Board: a release no longer shows under a Community / TikTok Channel / Social
-- brand tab unless its package really has something for THAT brand.
--
-- Before: booking_brand_has_any_target() looked for ANY package line with a blank brand in the
-- category. For Social / Community / TikTok Channel the real numbers live in that one blank-brand
-- line's brand_column_quantities ("PAGE VPOP::TikTok": 4 ...), so every release with ANY such line
-- passed EVERY brand tab (BOLERO, VPOP, INDIE ...), while releases built the older way (one line per
-- brand, e.g. "INT Media Support" EP 42 / EP 41) never passed any tab (VPOP tab empty).
--
-- Now: visible under brand B when
--   (a) its blank-brand line has a brand_column_quantities key starting "B::", or
--   (b) it has an older per-brand line whose brand is exactly B.
-- Other categories (Ads, ...) behave as before. Idempotent (CREATE OR REPLACE). No resync needed.

create or replace function booking_brand_has_any_target(p_release_id uuid, p_category_name text, p_brand text)
returns boolean language plpgsql stable as $$
declare
  v_pkg_id uuid;
  v_cat_id uuid;
begin
  select pkg_id into v_pkg_id from booking_pkg_for_release(p_release_id);
  if v_pkg_id is null then return false; end if;
  select id into v_cat_id from package_categories where name = p_category_name;
  if v_cat_id is null then return false; end if;

  if p_category_name in ('Social', 'Community', 'TikTok Channel') then
    return exists(
      select 1 from media_booking_package_lines l
      where l.package_id = v_pkg_id and l.category_id = v_cat_id
        and (
          (coalesce(l.brand, '') = '' and exists (
            select 1 from jsonb_object_keys(coalesce(l.brand_column_quantities, '{}'::jsonb)) k
            where k like (p_brand || '::%')))
          or coalesce(l.brand, '') = coalesce(p_brand, '')
        )
    );
  end if;

  return exists(
    select 1 from media_booking_package_lines l
    where l.package_id = v_pkg_id and l.category_id = v_cat_id and coalesce(l.brand, '') = coalesce(p_brand, '')
  );
end;
$$;

-- CHECK (read-only), after running — The Khang Show, Hạng Mục Community, brand tab PAGE VPOP:
-- EP 44, EP 43, EP 42 and EP 41 should all show; PAGE BOLERO / MT should show none of them.
-- TikTok Channel > In-house > TIKTOK VPOP: EP 44 and EP 42; TIKTOK BOLERO / MT: EP 44 and EP 43.
select r.title,
       booking_brand_has_any_target(r.id, 'Community', 'PAGE VPOP')        as community_vpop,
       booking_brand_has_any_target(r.id, 'Community', 'PAGE BOLERO / MT') as community_bolero,
       booking_brand_has_any_target(r.id, 'TikTok Channel', 'TIKTOK VPOP') as tt_vpop,
       booking_brand_has_any_target(r.id, 'TikTok Channel', 'TIKTOK BOLERO / MT') as tt_bolero
from releases r where r.title ilike '%khang show%' order by r.release_date;
