-- READ-ONLY diagnostic. Lists what the Package Builder (media-booking
-- ticket popup) expects and whether it exists. Any row with ok = false is
-- a pending migration that needs running.
select 'table media_booking_package_entry_snapshots (round 287)' as expected,
       to_regclass('public.media_booking_package_entry_snapshots') is not null as ok
union all
select 'column media_booking_packages.terms_text_override (round 453)',
       exists (select 1 from information_schema.columns where table_name='media_booking_packages' and column_name='terms_text_override')
union all
select 'column media_booking_package_lines.updated_at (round 439)',
       exists (select 1 from information_schema.columns where table_name='media_booking_package_lines' and column_name='updated_at')
union all
select 'column tickets.pic_profile_ids (round 279)',
       exists (select 1 from information_schema.columns where table_name='tickets' and column_name='pic_profile_ids')
union all
select 'column workstation_assignments.pic_profile_ids (round 457)',
       exists (select 1 from information_schema.columns where table_name='workstation_assignments' and column_name='pic_profile_ids')
union all
select 'column phai_sinh_batch_items.pic_profile_ids (round 455)',
       exists (select 1 from information_schema.columns where table_name='phai_sinh_batch_items' and column_name='pic_profile_ids')
union all
select 'table task_kpi_daily_snapshots (round 461)',
       to_regclass('public.task_kpi_daily_snapshots') is not null;
