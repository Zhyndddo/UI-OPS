-- Round 529 — Booking Board INT tab: "Chỉ Phát Hành" releases with NOTHING to
-- book (no booking entries, no package line with a quantity) were showing as
-- rows of dashes. Cause: Round 378 let EVERY Chỉ Phát Hành release into the INT
-- tab (it was meant for the ones with real booking activity) and Round 379 made
-- them always pass the target filter. In the 2026-10-20 backup that was 231 of
-- 237 Chỉ Phát Hành releases with nothing in them.
--
-- FIX: a Chỉ Phát Hành release now shows under INT (and counts in the INT stat
-- card) only when booking_cph_has_activity() is true = it has at least one
-- media_booking_entries row OR a package line with quantity > 0 (e.g. an INT
-- MEDIA follow-up package built later). Those with real activity keep showing
-- exactly as before; the 231 empty ones disappear. Nothing is deleted, and if
-- one later gets an entry or a package line it reappears by itself.
--
-- Run order: this one file only. Idempotent (CREATE OR REPLACE). Supersedes the
-- bodies from Rounds 378/379 — no need to re-run those.
-- Undo: re-run add-round378 then add-round379 (in that order).
-- After running, check (should be about 6, matching the backup):
--   select count(*) from releases r where r.project_type='Chỉ Phát Hành'
--     and r.pseudo_package_parent_did is null and booking_cph_has_activity(r.id);

create or replace function booking_cph_has_activity(p_release_id uuid)
returns boolean language sql stable as $$
  select exists (select 1 from media_booking_entries e where e.release_id = p_release_id)
      or exists (
        select 1 from media_booking_packages p
        join media_booking_package_lines l on l.package_id = p.id
        where p.release_id = p_release_id and coalesce(l.quantity, 0) > 0
      );
$$;

create or replace function booking_board_page(
  p_search text, p_month text, p_type text, p_label text, p_round text,
  p_hang_muc text, p_sub_filter text, p_tiktok_brand text,
  p_columns jsonb, p_done_filter text, p_page int, p_page_size int
) returns jsonb language plpgsql stable as $$
declare
  v_offset int := greatest(0, (coalesce(p_page, 1) - 1) * coalesce(p_page_size, 50));
  v_limit int := coalesce(p_page_size, 50);
begin
  return (
    with base as (
      select r.id, r.release_date, r.project_type
      from releases r
      where r.pseudo_package_parent_did is null
        and (
          -- Round 378 — also matches project_type = 'Chỉ Phát Hành' into
          -- INT (was INT MEDIA only).
          (p_round = 'INT' and r.project_type is not null and (r.project_type ~* 'int\s*media' or (r.project_type = 'Chỉ Phát Hành' and booking_cph_has_activity(r.id))))
          or (p_round = 'Đợt 1' and r.project_type is not null and r.project_type <> 'Chỉ Phát Hành' and not (r.project_type ~* 'int\s*media'))
          or (p_round = 'Đợt 2' and exists (select 1 from media_booking_dot2_targets d where d.release_id = r.id))
          or (p_round is not null and p_round not in ('INT', 'Đợt 1', 'Đợt 2'))
        )
        and (p_search is null or p_search = '' or
             r.title ilike '%' || p_search || '%' or r.main_artist ilike '%' || p_search || '%' or r.did ilike '%' || p_search || '%')
        and (p_month is null or p_month = '' or r.release_date::text like p_month || '%')
        and (p_type is null or p_type = '' or r.project_type = p_type)
        and (p_label is null or p_label = '' or r.label = p_label)
    ),
    filled as (
      select b.*
      from base b
      where booking_has_target(b.id, p_columns, p_hang_muc, p_sub_filter, p_tiktok_brand)
    ),
    withdone as (
      select f.*,
        booking_is_release_done(f.id, p_round, p_columns) as is_done,
        -- Round 378 — widened the same way as the `base` CTE's INT
        -- branch above, so the INT stat card count matches which
        -- releases actually show under the INT tab.
        (f.project_type is not null and (f.project_type ~* 'int\s*media' or (f.project_type = 'Chỉ Phát Hành' and booking_cph_has_activity(f.id)))) as is_int,
        exists(select 1 from media_booking_dot2_targets d where d.release_id = f.id) as is_dot2
      from filled f
    ),
    predone_counts as (
      select count(*) as total, count(*) filter (where is_done) as done_count
      from withdone
    ),
    final as (
      select w.*, (not w.is_int and w.project_type is not null and w.project_type <> 'Chỉ Phát Hành') as is_dot1
      from withdone w
      where p_done_filter is null or p_done_filter = ''
         or (p_done_filter = 'done' and w.is_done)
         or (p_done_filter = 'not_done' and not w.is_done)
    ),
    final_stats as (
      select count(*) as total,
        count(*) filter (where is_int) as int_count,
        count(*) filter (where is_dot1) as dot1_count,
        count(*) filter (where is_dot2) as dot2_count
      from final
    ),
    paged as (
      select id from final order by release_date desc nulls last, id desc limit v_limit offset v_offset
    )
    select jsonb_build_object(
      'release_ids', coalesce((select jsonb_agg(id) from paged), '[]'::jsonb),
      'pre_done_total', (select total from predone_counts),
      'done_count', (select done_count from predone_counts),
      'not_done_count', (select total - done_count from predone_counts),
      'final_total', (select total from final_stats),
      'int_count', (select int_count from final_stats),
      'dot1_count', (select dot1_count from final_stats),
      'dot2_count', (select dot2_count from final_stats)
    )
  );
end;
$$;

create or replace function booking_has_target(
  p_release_id uuid, p_columns jsonb, p_hang_muc text, p_sub_filter text, p_tiktok_brand text
) returns boolean language plpgsql stable as $$
declare
  col jsonb;
  v_any_filled boolean := false;
  v_booked numeric;
  v_project_type text;
begin
  if p_columns is null or jsonb_array_length(p_columns) = 0 then
    return true; -- no columns shown yet => no target-based filtering, matches the JS
  end if;

  -- Round 379 — see this file's header. Chỉ Phát Hành releases never have
  -- package lines to have "a target" in, so this filter can never
  -- validly hide one — checked before the per-column loop below, which
  -- would otherwise always come back empty for them.
  select r.project_type into v_project_type from releases r where r.id = p_release_id;
  if v_project_type = 'Chỉ Phát Hành' then
    return booking_cph_has_activity(p_release_id);
  end if;

  for col in select * from jsonb_array_elements(p_columns)
  loop
    v_booked := booking_booked_for(p_release_id, col ->> 'categoryName', col ->> 'brand', col ->> 'platform', col ->> 'subchannelType');
    if v_booked is not null then
      v_any_filled := true;
      exit;
    end if;
  end loop;

  if not v_any_filled and p_hang_muc = 'TikTok Channel' and p_tiktok_brand is not null then
    v_any_filled := booking_brand_has_any_target(p_release_id, 'TikTok Channel', p_tiktok_brand);
  end if;
  if not v_any_filled and p_hang_muc = 'Ads' and p_sub_filter is not null then
    v_any_filled := booking_brand_has_any_target(p_release_id, 'Ads', p_sub_filter);
  end if;
  if not v_any_filled and p_hang_muc = 'Social' and p_sub_filter is not null then
    v_any_filled := booking_brand_has_any_target(p_release_id, 'Social', p_sub_filter);
  end if;
  if not v_any_filled and p_hang_muc = 'Community' and p_sub_filter is not null then
    v_any_filled := booking_brand_has_any_target(p_release_id, 'Community', p_sub_filter);
  end if;
  return v_any_filled;
end;
$$;
