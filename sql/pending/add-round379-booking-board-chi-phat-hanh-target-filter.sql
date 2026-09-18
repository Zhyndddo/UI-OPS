-- Round 379 — follow-up to Round 378
-- (add-round378-booking-board-chi-phat-hanh-under-int.sql). User ran that
-- migration and confirmed the release STILL doesn't show under INT.
--
-- ROOT CAUSE #2 — Round 378 only fixed the ROUND match (base CTE). There
-- is a second, independent filter the release also has to pass:
-- booking_has_target(), which runs right after in the `filled` CTE and
-- hides any release with no target in whichever columns are currently
-- drilled into. The Booking Board's default view is Hạng Mục = "All",
-- which builds one column per category (non-empty p_columns) — so this
-- filter is active by default, not just when you drill into a specific
-- category.
--
-- "Chỉ Phát Hành" is a SIMPLE_OPTIONS pick on the magic link
-- (app/pick-package/[token]/page.js) — "no breakdown" by design
-- (distribution-only, nothing to media-book). Confirming it never builds
-- a media_booking_packages/media_booking_package_lines row for the
-- release. booking_booked_for()'s very first step is
-- booking_pkg_for_release(), which finds nothing and returns null —
-- immediately, for every category. So booking_has_target()'s per-column
-- loop finds v_booked = null every time, v_any_filled never flips true,
-- and the release fails this filter and gets excluded from `filled` —
-- regardless of round, regardless of Round 378's fix. This is why Round
-- 378 alone wasn't enough: the release cleared the (now-fixed) round
-- filter and was immediately caught by this second, separate filter.
--
-- FIX — CREATE OR REPLACE booking_has_target(): a release whose
-- project_type is 'Chỉ Phát Hành' now always passes this filter. There's
-- no itemized target to filter against for these releases by design, so
-- "no target in the currently-drilled-into columns" is never a valid
-- reason to hide one.
--
-- KNOWN FOLLOW-ON EFFECT, WORTH KNOWING ABOUT: once visible, these
-- releases will show under the board's "Not Done" bucket permanently
-- (booking_is_release_done() also finds no booked/added targets, so
-- v_targeted_count stays 0 and it returns false — "not done" is the only
-- answer it can give with zero itemized targets). If the team wants Chỉ
-- Phát Hành releases to be markable "done" some other way (e.g. off the
-- Media Booking ticket's own Complete status, not off targets), that is
-- a separate, larger change — flag it if the "always shows Not Done"
-- result isn't what's wanted, rather than assuming this migration should
-- also solve that.
--
-- Same caveats as every migration in this pending/ folder — I have no
-- live database access in this environment. Please:
--   1. Run this on a copy/staging project first if at all possible.
--   2. After deploying, confirm the release now shows under the INT tab
--      (Hạng Mục = "All", the board's default) and that it lands in the
--      Not Done bucket.
--
-- Idempotent: CREATE OR REPLACE, safe to re-run.

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
    return true;
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
