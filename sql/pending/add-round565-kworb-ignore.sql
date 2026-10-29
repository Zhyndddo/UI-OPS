-- Round 565 — "Dismiss" on a kworb suspect now excludes that track / video from the crawler for good.
-- RUN ORDER: after add-round561-kworb-vn.sql and add-round563-kworb-sources.sql; then push. Additive + idempotent.
-- The list lives in its own table, so it survives wiping kworb_vn_tracks / kworb_vn_videos and re-crawling.
-- It is maintained automatically: setting review = 'dismissed' adds the row, Undo (review back to null / follow_up) removes it.
-- UNDO: drop trigger if exists kworb_tracks_ignore on kworb_vn_tracks; drop trigger if exists kworb_videos_ignore on kworb_vn_videos; drop function if exists kworb_sync_ignored(); drop table if exists kworb_vn_ignored;

create table if not exists kworb_vn_ignored (
  kind        text not null check (kind in ('track','video')),
  ref_id      text not null,                    -- Spotify track id / YouTube video id
  title       text,
  artist      text,
  ignored_by  text,
  ignored_at  timestamptz not null default now(),
  primary key (kind, ref_id)
);
alter table kworb_vn_ignored enable row level security;
drop policy if exists kworb_ignored_sel on kworb_vn_ignored;
create policy kworb_ignored_sel on kworb_vn_ignored for select to authenticated using (true);
revoke all on kworb_vn_ignored from public, anon, authenticated;
grant select on kworb_vn_ignored to authenticated;

create or replace function kworb_sync_ignored() returns trigger language plpgsql security definer set search_path = public as $$
declare k text := case tg_table_name when 'kworb_vn_videos' then 'video' else 'track' end;
        rid text; art text;
begin
  rid := case when k = 'video' then new.video_id else new.track_id end;
  art := case when k = 'video' then null else new.artist end;
  if new.review = 'dismissed' then
    insert into kworb_vn_ignored (kind, ref_id, title, artist, ignored_by) values (k, rid, new.title, art, new.reviewed_by)
    on conflict (kind, ref_id) do nothing;
  elsif old.review = 'dismissed' then
    delete from kworb_vn_ignored where kind = k and ref_id = rid;
  end if;
  return new;
end $$;
revoke all on function kworb_sync_ignored() from public, anon, authenticated;

drop trigger if exists kworb_tracks_ignore on kworb_vn_tracks;
create trigger kworb_tracks_ignore after update of review on kworb_vn_tracks for each row execute function kworb_sync_ignored();
drop trigger if exists kworb_videos_ignore on kworb_vn_videos;
create trigger kworb_videos_ignore after update of review on kworb_vn_videos for each row execute function kworb_sync_ignored();

-- backfill: everything already dismissed
insert into kworb_vn_ignored (kind, ref_id, title, artist, ignored_by)
  select 'track', track_id, title, artist, reviewed_by from kworb_vn_tracks where review = 'dismissed' on conflict do nothing;
insert into kworb_vn_ignored (kind, ref_id, title, artist, ignored_by)
  select 'video', video_id, title, null, reviewed_by from kworb_vn_videos where review = 'dismissed' on conflict do nothing;

-- VERIFY (expect the table, 2 triggers, and the count of dismissed rows)
select (select count(*) from kworb_vn_ignored) as ignored_rows,
       (select count(*) from pg_trigger where tgname in ('kworb_tracks_ignore','kworb_videos_ignore')) as triggers;
