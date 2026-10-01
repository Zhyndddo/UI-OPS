-- Round 442 step 0b -- read-only. Quick check: has package_id actually
-- been added to these two tables yet? If both rows come back empty/null,
-- the migration has NOT been applied -- that's why adding grid rows and
-- cloning are failing right now (the live code writes package_id on
-- every insert/upsert to these tables, but the column doesn't exist).
select
  table_name,
  column_name,
  is_nullable
from information_schema.columns
where table_name in ('media_booking_content_entries', 'media_booking_package_categories')
  and column_name = 'package_id';
