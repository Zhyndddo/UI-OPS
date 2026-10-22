-- Round 543 — Cost Marketing egress cut (Supabase egress follow-up).
-- Cost Marketing used to download every TikTok-Channel/Ads row of media_booking_entries (~8 paged requests,
-- ~455 kB) plus media_booking_content_entries (~107 kB) on EVERY page load, only to count them. These two
-- functions return the same counts already grouped, so the page downloads a fraction of that.
--
-- ORDER: run this SQL BEFORE or AFTER pushing the code — either is safe. The page falls back to the old full
-- download if these functions don't exist yet (it just doesn't save any egress until they do).
-- Read-only functions, SECURITY INVOKER (RLS will apply to them like any query once RLS is on).
-- UNDO: drop function public.cost_mkt_entry_totals(uuid[]); drop function public.cost_mkt_content_totals(uuid[]);
--   (the page then silently goes back to the full download)

create or replace function public.cost_mkt_entry_totals(p_category_ids uuid[])
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  -- [release_id, category_id, channel_name, platform, subchannel_type, n (row count), qty (sum of quantity)]
  select coalesce(jsonb_agg(jsonb_build_array(release_id, category_id, channel_name, platform, subchannel_type, n, qty)), '[]'::jsonb)
  from (
    select release_id, category_id,
           coalesce(channel_name, '')     as channel_name,
           coalesce(platform, '')         as platform,
           coalesce(subchannel_type, '')  as subchannel_type,
           count(*)                       as n,
           coalesce(sum(quantity), 0)     as qty
    from public.media_booking_entries
    where category_id = any (p_category_ids)
    group by release_id, category_id, coalesce(channel_name, ''), coalesce(platform, ''), coalesce(subchannel_type, '')
  ) t;
$$;

create or replace function public.cost_mkt_content_totals(p_category_ids uuid[])
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  -- [release_id, package_id, category_id, brand, platform, n (row count), posts (sum of count_posts)]
  select coalesce(jsonb_agg(jsonb_build_array(release_id, package_id, category_id, brand, platform, n, posts)), '[]'::jsonb)
  from (
    select release_id, package_id, category_id, brand,
           coalesce(platform, '')      as platform,
           count(*)                    as n,
           coalesce(sum(count_posts), 0) as posts
    from public.media_booking_content_entries
    where category_id = any (p_category_ids)
    group by release_id, package_id, category_id, brand, coalesce(platform, '')
  ) t;
$$;

-- staff only (not the logged-out role)
revoke execute on function public.cost_mkt_entry_totals(uuid[]) from public, anon;
revoke execute on function public.cost_mkt_content_totals(uuid[]) from public, anon;
grant execute on function public.cost_mkt_entry_totals(uuid[]) to authenticated, service_role;
grant execute on function public.cost_mkt_content_totals(uuid[]) to authenticated, service_role;

-- VERIFY (should return a small JSON array; compare the count with the old full download if you like):
--   select jsonb_array_length(public.cost_mkt_entry_totals(array(select id from package_categories where name in ('TikTok Channel','Ads'))));
--   select jsonb_array_length(public.cost_mkt_content_totals(array(select id from package_categories where name in ('TikTok Channel','Ads'))));
