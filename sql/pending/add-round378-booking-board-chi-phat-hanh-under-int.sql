-- Round 378 — Booking Board (app/booking/page.js): "Chỉ Phát Hành" releases
-- with real booking activity (a PIC assigned in the Media Booking ticket,
-- entries already logged) were invisible on the Booking Board no matter
-- which round tab (INT / Đợt 1 / Đợt 2) was selected. Per explicit
-- request ("add it to internal, it should be internal or INT").
--
-- ROOT CAUSE — booking_board_page()'s `base` CTE (added in Round 303,
-- sql/pending/add-round303-booking-board-pagination.sql) only matches a
-- release into a round if:
--   INT     — project_type ~* 'int media'
--   Đợt 1   — project_type is set, is NOT 'Chỉ Phát Hành', and isn't INT MEDIA
--   Đợt 2   — has a row in media_booking_dot2_targets
-- A release locked to project_type = 'Chỉ Phát Hành' matches none of
-- these — Đợt 1 explicitly excludes it (by design: a Chỉ Phát Hành
-- package has no itemized media-booking breakdown to track), it isn't
-- INT MEDIA, and it has no Đợt 2 targets. So it fell through every round
-- filter and never appeared on the board at all, even once someone
-- actually needed to track work against it (this round's reported case:
-- a Complete Media Booking ticket with a PIC already assigned).
--
-- FIX — CREATE OR REPLACE booking_board_page(), same as every other
-- change to this function: two one-line edits from Round 303's version,
-- everything else byte-for-byte identical.
--   1. The `base` CTE's INT branch now also matches project_type = 'Chỉ
--      Phát Hành', so it appears under the INT tab.
--   2. `withdone`'s `is_int` flag (feeds the "INT" stat card count) is
--      widened the same way, so the Tổng/INT/Đợt 1/Đợt 2 stat cards stay
--      consistent with which tab the release actually shows under.
-- Đợt 1's own exclusion (`project_type <> 'Chỉ Phát Hành'`) is untouched
-- — a Chỉ Phát Hành release still never double-counts into Đợt 1.
--
-- I do not have live database access in this environment — I cannot run
-- this against your real data before you do. Please:
--   1. Run this on a copy/staging project first if at all possible.
--   2. After deploying, switch the Booking Board to the INT tab and
--      confirm the Chỉ Phát Hành release(s) you already know about now
--      show up there, with their existing entries/PIC intact.
--   3. Check the INT stat card count moved by however many Chỉ Phát
--      Hành releases now qualify, and that Đợt 1's count is unchanged.
--
-- Idempotent: CREATE OR REPLACE, safe to re-run.

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
          (p_round = 'INT' and r.project_type is not null and (r.project_type ~* 'int\s*media' or r.project_type = 'Chỉ Phát Hành'))
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
        (f.project_type is not null and (f.project_type ~* 'int\s*media' or f.project_type = 'Chỉ Phát Hành')) as is_int,
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
