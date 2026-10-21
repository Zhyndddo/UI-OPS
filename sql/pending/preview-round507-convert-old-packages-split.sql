-- Round 507 — PREVIEW ONLY (reads, writes nothing). Old-style package lines (one line per brand, no
-- per-column split) -> proposed per-column split, so you can review it before anything is converted.
--
-- Rules (as agreed):
--   * Social / Community / TikTok Channel brand lines only, on each release's resolved package.
--   * "Still active" = the brand's links added so far are fewer than its target (not fully booked yet).
--   * Brands with NO links yet are skipped (left exactly as they are).
--   * Split = the target spread over the columns IN PROPORTION to the links already added per column
--     (largest-remainder rounding, so the pieces add up to the old target exactly).
-- Column of a link: TikTok Channel / Community -> subchannel_type; Social -> platform.

with old_lines as (
  select r.id as release_id, r.did, r.title, p.pkg_id, mbp.name as package_name,
         l.id as line_id, l.category_id, c.name as category, l.brand, l.quantity
  from releases r
  cross join lateral booking_pkg_for_release(r.id) p
  join media_booking_packages mbp on mbp.id = p.pkg_id
  join media_booking_package_lines l on l.package_id = p.pkg_id
  join package_categories c on c.id = l.category_id
  where c.name in ('Social', 'Community', 'TikTok Channel')
    and coalesce(l.brand, '') <> '' and l.quantity is not null and l.quantity > 0
),
cols as (
  select o.line_id,
         case when o.category = 'Social' then e.platform else e.subchannel_type end as col,
         count(*) as n
  from old_lines o
  join media_booking_entries e
    on e.release_id = o.release_id and e.category_id = o.category_id and coalesce(e.channel_name, '') = o.brand
  where coalesce(case when o.category = 'Social' then e.platform else e.subchannel_type end, '') <> ''
  group by o.line_id, 2
),
tot as (select line_id, sum(n) as n_total from cols group by line_id),
raw as (
  select c.line_id, c.col, c.n, o.quantity, t.n_total,
         floor(o.quantity::numeric * c.n / t.n_total) as base,
         (o.quantity::numeric * c.n / t.n_total) - floor(o.quantity::numeric * c.n / t.n_total) as frac
  from cols c join tot t using (line_id) join old_lines o using (line_id)
),
ranked as (
  select *, sum(base) over (partition by line_id) as base_sum,
         row_number() over (partition by line_id order by frac desc, n desc, col) as rk
  from raw
),
final as (
  select line_id, col, n, base + case when rk <= (quantity - base_sum) then 1 else 0 end as proposed
  from ranked
)
select o.did, o.title, o.package_name, o.category, o.brand,
       o.quantity as old_target, t.n_total as links_added,
       (t.n_total < o.quantity) as still_active,
       string_agg(f.col || '=' || f.proposed, ', ' order by f.col) as proposed_split
from old_lines o
join tot t on t.line_id = o.line_id
join final f on f.line_id = o.line_id
group by o.did, o.title, o.package_name, o.category, o.brand, o.quantity, t.n_total
order by (t.n_total < o.quantity) desc, o.did, o.category, o.brand;

-- Note: links in a column the old line never planned for still get a share (proportional), which is the
-- honest reading of what was actually booked. Review the list; the CONVERT step is separate and not written yet.
