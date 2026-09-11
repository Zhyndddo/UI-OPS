-- Round 303 — Booking Board (app/booking/page.js) real server-side
-- pagination, per explicit request to pick up the highest-impact page in
-- the pagination rollout given the Supabase egress grace period notice.
--
-- ============================================================================
-- READ THIS BEFORE RUNNING, AND BEFORE TRUSTING THE NUMBERS AFTERWARD
-- ============================================================================
-- Booking Board's "Done/Not Done" status was never a stored column — it's
-- computed live in JS (bookedFor/addedFor/isReleaseDone/adsAllViewStatus/
-- brandHasAnyTarget in app/booking/page.js) by cross-referencing whatever
-- category/brand/platform columns are currently drilled into against
-- media_booking_packages/media_booking_package_lines (targets) and
-- media_booking_entries (what's been added), with several category-specific
-- rules (Ads' multi-metric sum, TikTok Channel/Social/Community's mushed
-- brand-"" package lines, a "Cancel" status override, etc).
--
-- The functions below are a line-by-line SQL port of that JS so the Done
-- counts and the "has a target" filter can be computed for EVERY matching
-- release (not just the current page) without pulling every release's
-- entries/packages to the client. I do not have live database access in
-- this environment — I cannot run these against your real data before you
-- do. Please do NOT treat this as pre-verified:
--   1. Run this migration on a copy/staging project first if at all possible.
--   2. After deploying, deliberately pick a handful of releases you already
--      know the real Done/Not-Done answer for (across Social, Community,
--      Ads — especially a multi-metric Ads brand — and TikTok Channel) and
--      confirm the board still shows the same answer it did before this
--      round.
--   3. Watch the "Tổng/INT/Đợt 1/Đợt 2" stat cards and the Done/Not Done
--      counts for the first few days for anything that looks off compared
--      to what the team expects.
-- If ANY of these functions is ever wrong, it fails silently (a release
-- reads as done when it isn't, or the reverse) — it will not throw an
-- error or fail the build.
--
-- MAINTENANCE WARNING: booking_ads_all_view_status hardcodes the same
-- brand/metric list as ADS_METRICS in app/booking/page.js. If that JS
-- constant ever changes (a brand or metric added/removed/renamed), this
-- function's VALUES list must be updated to match, or the "All" Hạng Mục's
-- Ads done-ness will silently drift from what the drilled-in Ads columns
-- show. Same for MUSHED_BRAND_CATEGORIES ('Social','Community','TikTok
-- Channel') and the multi-metric Ads brand list ('Facebook Ads','TikTok
-- Ads','Spotify Ads') — both appear in the JS and are re-hardcoded here.
--
-- Idempotent: every function is CREATE OR REPLACE, safe to re-run.
-- ============================================================================

-- The package actually locked in for a release (matched by name to
-- releases.project_type — same match app/booking/page.js's packageByRelease
-- useMemo already uses). Returns no row if there isn't one.
create or replace function booking_pkg_for_release(p_release_id uuid)
returns table(pkg_id uuid) language sql stable as $$
  select mbp.id
  from media_booking_packages mbp
  join releases r on r.id = mbp.release_id
  where mbp.release_id = p_release_id and mbp.name = r.project_type
  limit 1
$$;

-- Mirrors bookedFor() in app/booking/page.js exactly, branch for branch.
create or replace function booking_booked_for(
  p_release_id uuid, p_category_name text, p_brand text, p_platform text, p_subchannel_type text
) returns numeric language plpgsql stable as $$
declare
  v_pkg_id uuid;
  v_cat_id uuid;
  v_result numeric;
  v_is_multi_metric_ads boolean;
  v_column_key text;
  v_mushed boolean;
begin
  select pkg_id into v_pkg_id from booking_pkg_for_release(p_release_id);
  if v_pkg_id is null then return null; end if;
  select id into v_cat_id from package_categories where name = p_category_name;
  if v_cat_id is null then return null; end if;

  -- "All" aggregate (brand is null): sum every line in the category,
  -- falling back to summing metric_quantities' own values for a line whose
  -- plain quantity is null (Round 114's fix, mirrored here).
  if p_brand is null then
    select sum(
      coalesce(l.quantity, (select sum(v::numeric) from jsonb_each_text(coalesce(l.metric_quantities, '{}'::jsonb)) as t(k, v)))
    ) into v_result
    from media_booking_package_lines l
    where l.package_id = v_pkg_id and l.category_id = v_cat_id;
    return v_result; -- null when no line exists at all for this category
  end if;

  -- Multi-metric Ads brand (Facebook/TikTok/Spotify Ads) drilled into one
  -- metric column: read metric_quantities, never the line's lump quantity.
  v_is_multi_metric_ads := p_category_name = 'Ads' and p_platform is not null
    and p_brand in ('Facebook Ads', 'TikTok Ads', 'Spotify Ads');
  if v_is_multi_metric_ads then
    select sum((l.metric_quantities ->> p_platform)::numeric) into v_result
    from media_booking_package_lines l
    where l.package_id = v_pkg_id and l.category_id = v_cat_id and coalesce(l.brand, '') = coalesce(p_brand, '');
    return v_result;
  end if;

  -- Social / Community / TikTok Channel: package lines are always mushed
  -- under brand '' — read the real per-column number from
  -- brand_column_quantities instead (Round 120's fix, mirrored here).
  v_mushed := p_category_name in ('TikTok Channel', 'Social', 'Community');
  if v_mushed then
    v_column_key := case when p_category_name = 'TikTok Channel' then p_subchannel_type else coalesce(p_platform, p_subchannel_type) end;
    select (l.brand_column_quantities ->> (coalesce(p_brand, '') || '::' || coalesce(v_column_key, '')))::numeric into v_result
    from media_booking_package_lines l
    where l.package_id = v_pkg_id and l.category_id = v_cat_id and coalesce(l.brand, '') = ''
    limit 1;
    return v_result;
  end if;

  -- Generic exact-brand match (e.g. YouTube Ads' single-metric line, or any
  -- other category never mushed). No fallback to a combined line — a
  -- missing real per-brand line means no target, full stop (Round 96).
  select sum(l.quantity) into v_result
  from media_booking_package_lines l
  where l.package_id = v_pkg_id and l.category_id = v_cat_id and coalesce(l.brand, '') = coalesce(p_brand, '');
  return v_result;
end;
$$;

-- Mirrors addedFor() — Ads sums quantity, everything else counts rows.
create or replace function booking_added_for(
  p_release_id uuid, p_category_name text, p_brand text, p_platform text, p_subchannel_type text, p_round text
) returns numeric language plpgsql stable as $$
declare
  v_cat_id uuid;
  v_result numeric;
begin
  select id into v_cat_id from package_categories where name = p_category_name;
  if v_cat_id is null then return 0; end if;
  if p_category_name = 'Ads' then
    select coalesce(sum(e.quantity), 0) into v_result
    from media_booking_entries e
    where e.release_id = p_release_id and e.category_id = v_cat_id and e.booking_round = p_round
      and (p_brand is null or coalesce(e.channel_name, '') = p_brand)
      and (p_platform is null or coalesce(e.platform, '') = p_platform)
      and (p_subchannel_type is null or coalesce(e.subchannel_type, '') = p_subchannel_type);
    return v_result;
  end if;
  select count(*) into v_result
  from media_booking_entries e
  where e.release_id = p_release_id and e.category_id = v_cat_id and e.booking_round = p_round
    and (p_brand is null or coalesce(e.channel_name, '') = p_brand)
    and (p_platform is null or coalesce(e.platform, '') = p_platform)
    and (p_subchannel_type is null or coalesce(e.subchannel_type, '') = p_subchannel_type);
  return v_result;
end;
$$;

-- Mirrors adsAllViewStatus() — the "All" Hạng Mục view's Ads column status:
-- every real per-metric target (across every Ads brand) must itself be
-- done (added >= booked, or forced "Cancel") for the release to read done;
-- a release with no Ads target anywhere returns null (not targeted), same
-- as every other column's "grey — not booked" state.
create or replace function booking_ads_all_view_status(p_release_id uuid, p_round text)
returns boolean language plpgsql stable as $$
declare
  v_any_target boolean := false;
  v_any_done boolean := false;
  v_all_done_or_untargeted boolean := true;
  v_cat_id uuid;
  rec record;
  v_booked numeric;
  v_canceled boolean;
  v_added numeric;
begin
  select id into v_cat_id from package_categories where name = 'Ads';
  for rec in
    select * from (values
      ('Facebook Ads', 'Lượt tiếp cận'), ('Facebook Ads', 'Lượt tương tác'), ('Facebook Ads', 'Lượt truy cập (Link click)'),
      ('YouTube Ads', 'Thruplay (Views)'),
      ('TikTok Ads', 'Lượt tiếp cận'), ('TikTok Ads', 'Lượt xem video'), ('TikTok Ads', 'Lượt theo dõi'), ('TikTok Ads', 'Lượt truy cập (Link click)'),
      ('Spotify Ads', 'HPTO'), ('Spotify Ads', 'In-Stream Audio'), ('Spotify Ads', 'In-Stream Video'), ('Spotify Ads', 'In-Feed Display'), ('Spotify Ads', 'In-Feed Video')
    ) as t(brand, metric)
  loop
    v_booked := booking_booked_for(p_release_id, 'Ads', rec.brand, rec.metric, null);
    if v_booked is null or v_booked <= 0 then continue; end if;
    v_any_target := true;
    select exists(
      select 1 from media_booking_entries e
      where e.release_id = p_release_id and e.category_id = v_cat_id
        and coalesce(e.channel_name, '') = rec.brand and coalesce(e.platform, '') = rec.metric
        and e.booking_round = p_round and e.status = 'Cancel'
    ) into v_canceled;
    if v_canceled then
      v_any_done := true;
      continue;
    end if;
    select coalesce(sum(e.quantity), 0) into v_added
    from media_booking_entries e
    where e.release_id = p_release_id and e.category_id = v_cat_id
      and coalesce(e.channel_name, '') = rec.brand and coalesce(e.platform, '') = rec.metric
      and e.booking_round = p_round;
    if v_added >= v_booked then
      v_any_done := true;
    else
      v_all_done_or_untargeted := false;
    end if;
  end loop;
  if not v_any_target then return null; end if;
  return v_any_done and v_all_done_or_untargeted;
end;
$$;

-- Mirrors brandHasAnyTarget() — used to keep a release visible once
-- drilled into a specific brand, even when its columns all individually
-- read null (the mushed-brand / multi-metric-Ads null-forcing above).
create or replace function booking_brand_has_any_target(p_release_id uuid, p_category_name text, p_brand text)
returns boolean language plpgsql stable as $$
declare
  v_pkg_id uuid;
  v_cat_id uuid;
  v_effective_brand text;
begin
  select pkg_id into v_pkg_id from booking_pkg_for_release(p_release_id);
  if v_pkg_id is null then return false; end if;
  select id into v_cat_id from package_categories where name = p_category_name;
  v_effective_brand := case when p_category_name in ('Social', 'Community', 'TikTok Channel') then '' else p_brand end;
  return exists(
    select 1 from media_booking_package_lines l
    where l.package_id = v_pkg_id and l.category_id = v_cat_id and coalesce(l.brand, '') = coalesce(v_effective_brand, '')
  );
end;
$$;

-- Mirrors isReleaseDone() for one release given the CURRENT `columns` array
-- (computed client-side by the same useMemo the UI already trusts — see
-- app/booking/page.js's `columns` — and passed in as jsonb: each element
-- {categoryName, brand, platform, subchannelType}). A release with no
-- targeted column at all is never "done" (nothing finished to report).
create or replace function booking_is_release_done(p_release_id uuid, p_round text, p_columns jsonb)
returns boolean language plpgsql stable as $$
declare
  col jsonb;
  v_category_name text;
  v_brand text;
  v_platform text;
  v_subchannel text;
  v_targeted_count int := 0;
  v_all_ok boolean := true;
  v_status boolean;
  v_booked numeric;
  v_added numeric;
  v_canceled boolean;
  v_cat_id uuid;
begin
  for col in select * from jsonb_array_elements(coalesce(p_columns, '[]'::jsonb))
  loop
    v_category_name := col ->> 'categoryName';
    v_brand := col ->> 'brand';
    v_platform := col ->> 'platform';
    v_subchannel := col ->> 'subchannelType';

    if v_category_name = 'Ads' and v_brand is null then
      v_status := booking_ads_all_view_status(p_release_id, p_round);
      if v_status is null then continue; end if;
      v_targeted_count := v_targeted_count + 1;
      if v_status = false then v_all_ok := false; end if;
      continue;
    end if;

    v_booked := booking_booked_for(p_release_id, v_category_name, v_brand, v_platform, v_subchannel);
    if v_booked is null or v_booked <= 0 then continue; end if;
    v_targeted_count := v_targeted_count + 1;

    if v_category_name = 'Ads' then
      select id into v_cat_id from package_categories where name = 'Ads';
      select exists(
        select 1 from media_booking_entries e
        where e.release_id = p_release_id and e.category_id = v_cat_id
          and (v_brand is null or coalesce(e.channel_name, '') = v_brand)
          and (v_platform is null or coalesce(e.platform, '') = v_platform)
          and (v_subchannel is null or coalesce(e.subchannel_type, '') = v_subchannel)
          and e.booking_round = p_round and e.status = 'Cancel'
      ) into v_canceled;
      if v_canceled then continue; end if;
    end if;

    v_added := booking_added_for(p_release_id, v_category_name, v_brand, v_platform, v_subchannel, p_round);
    if v_added < v_booked then v_all_ok := false; end if;
  end loop;

  if v_targeted_count = 0 then return false; end if;
  return v_all_ok;
end;
$$;

-- Mirrors the preDoneFilteredReleases "anyFilled" check — whether this
-- release has a real target for at least one currently-shown column (or,
-- when that's forced null by a mushed/multi-metric column, at least one
-- for the drilled-into brand as a whole).
create or replace function booking_has_target(
  p_release_id uuid, p_columns jsonb, p_hang_muc text, p_sub_filter text, p_tiktok_brand text
) returns boolean language plpgsql stable as $$
declare
  col jsonb;
  v_any_filled boolean := false;
  v_booked numeric;
begin
  if p_columns is null or jsonb_array_length(p_columns) = 0 then
    return true; -- no columns shown yet => no target-based filtering, matches the JS
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

-- The paginated entry point app/booking/page.js's load() calls: applies the
-- same base filters as roundFilteredReleases + preDoneFilteredReleases
-- (search/month/type/label/round + pseudo-package exclusion), then
-- booking_has_target, then booking_is_release_done, then the Done/Not-Done
-- toggle — same ordering and same "which count reflects which stage" split
-- as the JS (doneCounts off the pre-doneFilter set, stats off the final
-- post-doneFilter set — see Round 286's "count only what is filtering").
-- Returns one release_date-desc page of release ids plus every count the
-- board's stat cards / Done-Not-Done buttons need — never the release rows
-- themselves; the app fetches those (and the entries/packages needed to
-- render them) separately, scoped to just this page's ids.
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
          (p_round = 'INT' and r.project_type is not null and r.project_type ~* 'int\s*media')
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
        (f.project_type is not null and f.project_type ~* 'int\s*media') as is_int,
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

-- Supporting indexes — booking_has_target/booking_is_release_done run
-- these lookups once per candidate release (potentially several hundred
-- per page load), so unindexed scans here would scale badly.
create index if not exists idx_media_booking_entries_release_cat_round
  on media_booking_entries(release_id, category_id, booking_round);
create index if not exists idx_media_booking_package_lines_pkg_cat
  on media_booking_package_lines(package_id, category_id);
create index if not exists idx_media_booking_packages_release_name
  on media_booking_packages(release_id, name);
create index if not exists idx_media_booking_dot2_targets_release
  on media_booking_dot2_targets(release_id);

-- PERFORMANCE NOTE (cannot be verified without live data/EXPLAIN access):
-- booking_board_page evaluates booking_has_target/booking_is_release_done
-- once per candidate release that survives the base filters — each of
-- those calls several more small lookups. On a `releases` table in the
-- hundreds this is a lot of PL/pgSQL function calls per page load, not a
-- single flat query. It should still be far less DATA transferred than
-- today's full-table fetch, but the QUERY TIME itself needs to be checked
-- against your real row counts (e.g. EXPLAIN ANALYZE select
-- booking_board_page(...) with your actual filter values) — if it's slow,
-- the fix is almost certainly the indexes above already covering the hot
-- paths; if it's still slow, consider materializing per-release done-ness
-- into a real column updated on write, rather than computing it fresh on
-- every page load.
