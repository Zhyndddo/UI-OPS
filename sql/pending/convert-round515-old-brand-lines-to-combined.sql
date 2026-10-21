-- Round 515 — convert OLD per-brand package lines into ONE combined line (the new style the Booking Board,
-- Summarize, Brand Comparison and the Round 510-513 fixes all use).
--
-- Why the new style: the Booking Board reads per-column targets ONLY from the combined line (blank brand + Cells
-- "brand::column"). An old per-brand line gives no per-column target (cells show "—"), and when a tier has both kinds
-- the "All" total counts them twice.
--
-- Rules (as agreed in Round 507):
--   * Social / Community / TikTok Channel, on the package the board actually reads for each release
--     (booking_pkg_for_release: INT MEDIA follow-up -> Internal Package -> exact name).
--   * Only old brand lines still ACTIVE (links added so far < target) and with at least one link. Brands with no links,
--     and brands already fully booked, are left exactly as they are.
--   * Split = the line's target spread over the columns IN PROPORTION to the links already added per column
--     (largest-remainder rounding, so the pieces add up to the old target exactly).
--     Column of a link: TikTok Channel -> subchannel_type; Social and Community -> platform (what the board reads).
--   * A tier/category that ALREADY has a combined line is skipped (shown as such in the preview) — decide by hand.
--   * The combined line: quantity = sum of the converted brands' targets, amount = sum of their amounts (money never
--     changes), Chi Tiết = their distinct Chi Tiết texts, manual_lock = true (Summarize will ask before overwriting).
--   * The old brand lines it replaces are deleted. A backup copy of every deleted line is kept.
--
-- STEP 1  run the STEP 1 block (worklist + backup + preview). Read the preview.
--         To leave one out:  delete from package_convert_r515 where line_id = '<old line id>';
-- STEP 2  run the STEP 2 block, then the CHECK.     UNDO at the bottom.
-- No app code change, no resync.

-- ===== STEP 1 =====
create table if not exists package_convert_r515 (
  line_id uuid primary key, package_id uuid not null, category_id uuid not null, release_id uuid not null,
  category text, brand text not null, old_qty int not null, old_amount numeric, old_unit text, old_unit_price numeric,
  old_detail text, old_sort int, links_added int not null, split jsonb not null);

with old_lines as (
  select r.id as release_id, p.pkg_id, l.id as line_id, l.category_id, c.name as category, l.brand, l.quantity,
         l.amount, l.unit, l.unit_price, l.detail, l.sort_order
  from releases r
  cross join lateral booking_pkg_for_release(r.id) p
  join media_booking_package_lines l on l.package_id = p.pkg_id
  join package_categories c on c.id = l.category_id
  where c.name in ('Social', 'Community', 'TikTok Channel')
    and coalesce(l.brand, '') <> '' and l.quantity is not null and l.quantity > 0
    and not exists (select 1 from media_booking_package_lines x
                    where x.package_id = l.package_id and x.category_id = l.category_id and coalesce(x.brand, '') = '')
),
cols as (
  select o.line_id,
         case when o.category = 'TikTok Channel' then e.subchannel_type else e.platform end as col, count(*) as n
  from old_lines o
  join media_booking_entries e
    on e.release_id = o.release_id and e.category_id = o.category_id and coalesce(e.channel_name, '') = o.brand
  where coalesce(case when o.category = 'TikTok Channel' then e.subchannel_type else e.platform end, '') <> ''
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
  select line_id, col, base + case when rk <= (quantity - base_sum) then 1 else 0 end as proposed from ranked
)
insert into package_convert_r515
select o.line_id, o.pkg_id, o.category_id, o.release_id, o.category, o.brand, o.quantity, o.amount, o.unit, o.unit_price,
       o.detail, o.sort_order, t.n_total,
       (select jsonb_object_agg(o.brand || '::' || f.col, f.proposed) from final f where f.line_id = o.line_id)
from old_lines o join tot t on t.line_id = o.line_id
where t.n_total < o.quantity
on conflict (line_id) do nothing;

-- backup copy of every old line that may be deleted
create table if not exists package_lines_backup_r515 as select * from media_booking_package_lines where false;
insert into package_lines_backup_r515 select l.* from media_booking_package_lines l
  where l.id in (select line_id from package_convert_r515)
    and not exists (select 1 from package_lines_backup_r515 b where b.id = l.id);

-- PREVIEW: one row per old line to convert
select r.did, r.title, p.name as tier, w.category, w.brand, w.old_qty as old_target, w.links_added,
       (select string_agg(k || '=' || v, ', ' order by k) from jsonb_each_text(w.split) as s(k, v)) as proposed_split,
       w.old_amount
from package_convert_r515 w
join media_booking_packages p on p.id = w.package_id
join releases r on r.id = w.release_id
order by r.did, w.category, w.brand;

-- PREVIEW 2: tiers/categories skipped because they ALREADY have a combined line AND old brand lines (decide by hand)
select r.did, r.title, p.name as tier, c.name as category, count(*) filter (where coalesce(l.brand,'') <> '') as old_brand_lines
from releases r
cross join lateral booking_pkg_for_release(r.id) bp
join media_booking_packages p on p.id = bp.pkg_id
join media_booking_package_lines l on l.package_id = p.id
join package_categories c on c.id = l.category_id and c.name in ('Social','Community','TikTok Channel')
group by r.did, r.title, p.name, c.name, l.package_id, l.category_id
having count(*) filter (where coalesce(l.brand,'') = '') > 0 and count(*) filter (where coalesce(l.brand,'') <> '' and l.quantity > 0) > 0
order by r.did;

-- ===== STEP 2 =====
-- 2a. one combined line per (package, category). Only where the old lines still look like the worklist and no combined line exists.
insert into media_booking_package_lines
  (id, package_id, category_id, brand, platform, unit, quantity, detail, unit_price, amount, sort_order, brand_column_quantities, manual_lock)
select gen_random_uuid(), g.package_id, g.category_id, '', null,
       coalesce(min(g.old_unit), 'Bài Đăng'),
       sum(g.old_qty),
       nullif(string_agg(distinct g.old_detail, E'\n'), ''),
       case when count(distinct g.old_unit_price) = 1 then min(g.old_unit_price) else null end,
       case when bool_or(g.old_amount is not null) then sum(g.old_amount) else null end,
       coalesce(min(g.old_sort), 0),
       (select jsonb_object_agg(k, v) from package_convert_r515 w2, jsonb_each(w2.split) as s(k, v)
         where w2.package_id = g.package_id and w2.category_id = g.category_id
           and exists (select 1 from media_booking_package_lines l2 where l2.id = w2.line_id and l2.quantity = w2.old_qty)),
       true
from package_convert_r515 g
join media_booking_package_lines l on l.id = g.line_id and l.quantity = g.old_qty and coalesce(l.brand, '') = g.brand
where not exists (select 1 from media_booking_package_lines x
                  where x.package_id = g.package_id and x.category_id = g.category_id and coalesce(x.brand, '') = '')
group by g.package_id, g.category_id;

-- 2b. delete the old brand lines that were folded in (only those whose package/category now has the combined line)
delete from media_booking_package_lines l
using package_convert_r515 g
where l.id = g.line_id and l.quantity = g.old_qty and coalesce(l.brand, '') = g.brand
  and exists (select 1 from media_booking_package_lines x
              where x.package_id = g.package_id and x.category_id = g.category_id and coalesce(x.brand, '') = ''
                and x.manual_lock and x.brand_column_quantities is not null);

-- CHECK: converted combined lines — quantity must equal the sum of their Cells; old lines left = 0
select r.did, p.name as tier, c.name as category, l.quantity, (select sum(v::int) from jsonb_each_text(l.brand_column_quantities) as s(k, v)) as cells_sum
from package_convert_r515 g
join media_booking_packages p on p.id = g.package_id
join releases r on r.id = p.release_id
join package_categories c on c.id = g.category_id
join media_booking_package_lines l on l.package_id = g.package_id and l.category_id = g.category_id and coalesce(l.brand, '') = ''
group by r.did, p.name, c.name, l.id, l.quantity, l.brand_column_quantities
order by r.did;
select count(*) as old_lines_still_there from media_booking_package_lines l where l.id in (select line_id from package_convert_r515);

-- ===== UNDO (only if needed) =====
-- delete from media_booking_package_lines l using package_convert_r515 g
--   where l.package_id = g.package_id and l.category_id = g.category_id and coalesce(l.brand,'') = '' and l.manual_lock;
-- insert into media_booking_package_lines select * from package_lines_backup_r515 b where not exists (select 1 from media_booking_package_lines x where x.id = b.id);
