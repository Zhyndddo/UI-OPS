-- Round 274 — adds anh.lan@vieent.vn to the Pitching PIC List
-- (global_settings.pitching_pic_list, see lib/pitchingPicList.js), per
-- explicit request. Paired with the same round's code change widening
-- that list to apply to ANY profile once configured (previously it was
-- always intersected with the OPS/AR team filter first, so a
-- non-OPS/AR pick here would have silently never shown up as an
-- assignable PIC on the workstation regardless of this row).
--
-- Idempotent: safe to run more than once — skips if the id is already
-- in the list, and upserts the settings row either way (creates it if
-- Config → Pitching → PIC List has never been saved before).
do $$
declare
  target_id text;
  current_val text;
  ids jsonb;
begin
  select id::text into target_id from profiles where email = 'anh.lan@vieent.vn';
  if target_id is null then
    raise notice 'No profile found for anh.lan@vieent.vn — nothing added. Check the email is correct and that a profile row exists for them.';
    return;
  end if;

  select value into current_val from global_settings where key = 'pitching_pic_list';
  ids := coalesce(current_val::jsonb, '[]'::jsonb);

  if not (ids ? target_id) then
    ids := ids || to_jsonb(target_id);
  end if;

  insert into global_settings (key, value, updated_at)
  values ('pitching_pic_list', ids::text, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;
