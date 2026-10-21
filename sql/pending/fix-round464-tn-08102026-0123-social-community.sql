-- Round 464 — T#TN-08102026-0123 ("thoiquen"), package "Độc Quyền 2 năm"
-- (89e18de7-9077-4e53-a575-704625a15244).
-- The package was cloned from HIKARI II on 2026-10-03 with HIKARI's
-- already-overwritten "2 năm" numbers. TikTok Channel and YouTube Ads were
-- corrected by hand on 2026-10-05; Social went back to the grid's 11 posts
-- (Summarize rebuilds it from the DSP grid) and the Community line is gone.
--
-- NOTE: values below are HIKARI II's original 2 năm figures (2026-09-20
-- backup). They may not be right for THIS deal — confirm with the team and
-- edit the numbers before running if needed.
--
-- IMPORTANT: this package's DSP grid (Social/Community entries) is still the
-- HIKARI copy. After running this, fix the Social and Community grid rows on
-- this package's tab to match (Social total 3, Community total 8) BEFORE
-- pressing Summarize — otherwise Summarize rebuilds the lines from the old
-- grid again. (From Round 464 on, the app asks before it replaces a line
-- that was changed by hand.)

-- STEP 1 (read-only): what is there now.
select l.id, l.category_id, l.brand, l.quantity, l.amount, l.unit_price, l.updated_at
from media_booking_package_lines l
where l.package_id = '89e18de7-9077-4e53-a575-704625a15244'
order by l.sort_order;

begin;

-- STEP 2: Social back to 3 posts / 600,000 (only while it still holds the
-- grid's 11 / 2,200,000, so a later hand edit is never touched).
update media_booking_package_lines set
  quantity = 3, amount = 600000,
  brand_column_quantities = '{"VIEENT::YouTube":1,"VIEENT::Facebook":1,"VIEENT::Instagram":1}'::jsonb
where id = '2d963167-4142-4992-8c39-daccf7abfd31'
  and package_id = '89e18de7-9077-4e53-a575-704625a15244'
  and quantity = 11 and amount = 2200000;

-- STEP 3: put the Community line back (8 posts / 1,600,000) ONLY if the
-- package has no Community line right now. Skip this step if the team
-- removed it on purpose (then run just step 2: select the file's text up
-- to here).
insert into media_booking_package_lines
  (id, package_id, category_id, brand, platform, unit, quantity, detail,
   unit_price, is_package_priced, package_count, amount, sort_order,
   metric_quantities, brand_column_quantities)
select
  '306f3fe3-cbf5-4f22-ba6d-012d02a3a574', '89e18de7-9077-4e53-a575-704625a15244',
  '01a26838-d9fb-434d-9972-b539024cd987', '', null, 'Bài Đăng', 8,
  'News: Thông tin về nghệ sĩ và dự án',
  200000, false, null, 1600000, 2,
  null, '{"PAGE INDIE::TikTok":2,"PAGE INDIE::Facebook":3,"PAGE INDIE::Instagram":3}'::jsonb
where not exists (
  select 1 from media_booking_package_lines
  where package_id = '89e18de7-9077-4e53-a575-704625a15244'
    and category_id = '01a26838-d9fb-434d-9972-b539024cd987'
)
on conflict (id) do nothing;

-- Expect 5 lines, total 19,475,000 (7,000,000 + 600,000 + 1,600,000 + 275,000 + 10,000,000)
-- if TikTok and YouTube Ads still hold the hand-corrected values.
select count(*) as lines, sum(amount) as total
from media_booking_package_lines
where package_id = '89e18de7-9077-4e53-a575-704625a15244';

commit;
