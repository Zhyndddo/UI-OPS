-- Round 588 — FIX: "Not ours" / "Dismiss" on kworb rows failed because the Round 565 trigger read new.video_id on the TRACKS table
-- (and new.track_id on the VIDEOS table), which PostgreSQL rejects even in the branch that is not used. Every dismissal was rolled back.
-- This version reads the ids from the row as JSON, so it works for both tables. Safe to run again. Changes no data.
create or replace function kworb_sync_ignored() returns trigger language plpgsql security definer set search_path = public as $$
declare k text := case tg_table_name when 'kworb_vn_videos' then 'video' else 'track' end;
        j jsonb := to_jsonb(new);
        rid text; art text;
begin
  rid := case when k = 'video' then j->>'video_id' else j->>'track_id' end;
  art := case when k = 'video' then null else j->>'artist' end;
  if new.review = 'dismissed' then
    insert into kworb_vn_ignored (kind, ref_id, title, artist, ignored_by) values (k, rid, j->>'title', art, new.reviewed_by)
    on conflict (kind, ref_id) do nothing;
  elsif old.review = 'dismissed' then
    delete from kworb_vn_ignored where kind = k and ref_id = rid;
  end if;
  return new;
end $$;
revoke all on function kworb_sync_ignored() from public, anon, authenticated;
