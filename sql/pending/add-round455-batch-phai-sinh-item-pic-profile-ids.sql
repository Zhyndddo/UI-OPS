-- Round 455 — multi-PIC conversion, batch_phai_sinh's child item table.
--
-- Every other ticket type's multi-PIC array (tickets.pic_profile_ids) was
-- added globally back in Round 279. batch_phai_sinh is the one PIC-bearing
-- type whose PIC actually lives on a *child* table instead of `tickets`
-- itself (one row per song inside the batch) — phai_sinh_batch_items.
-- pic_profile_id — so it never got that column and needs its own copy of
-- the same additive migration here.
--
-- Additive, same pattern as Round 279: the old singular column stays
-- (nothing drops it), the new array is backfilled from whatever's already
-- assigned so no existing row goes blank on cutover, and the app writes
-- BOTH columns going forward (array = real multi-PIC list, singular =
-- array's first entry) for any code not yet reading the array.
--
-- Idempotent: safe to run more than once.
alter table if exists phai_sinh_batch_items
  add column if not exists pic_profile_ids uuid[];

update phai_sinh_batch_items
  set pic_profile_ids = array[pic_profile_id]
  where pic_profile_id is not null
    and pic_profile_ids is null;

comment on column phai_sinh_batch_items.pic_profile_ids is
  'Round 455 — multi-PIC tag list for this batch item, same shape as tickets.pic_profile_ids (Round 279). pic_profile_id (singular) is kept in sync as the array''s first entry by the page that writes this column.';
