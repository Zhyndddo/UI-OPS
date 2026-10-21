-- Round 509 — database-level change log for packages (who/what/when/how), incl. per-column Cells.
-- ADDITIVE + idempotent. Does not change any existing data or behaviour. No Round 418 resync.
-- Safe to run in the Supabase SQL editor. To remove later: see "UNDO" at the bottom.
--
-- Logs every INSERT/UPDATE/DELETE on:
--   media_booking_packages, media_booking_package_lines (incl. brand_column_quantities),
--   media_booking_package_categories (rollups), media_booking_content_entries (the DSP grid),
--   release_package_items (artist snapshot), and releases ONLY when project_type /
--   package_locked / package_total_value / int_media_requested are written.
-- For UPDATEs only the columns that actually changed are stored (old + new). updated_at-only
-- touches are skipped.
--
-- actor_kind:
--   staff        = logged-in app user (Supabase auth)            -> actor_id = profiles.id
--   artist_guest = anonymous browser (magic-link page)
--   non_human    = service_role (server code, GitHub data-fixes / backup jobs),
--                  SQL editor / psql / cron / triggers (no request JWT)
-- unexpected = true when it should NOT normally happen:
--   * any non_human write, or
--   * an artist_guest write to a package/grid table (artists legitimately write only
--     releases + release_package_items when they confirm a package).

create table if not exists package_change_log (
  id          bigint generated always as identity primary key,
  changed_at  timestamptz not null default now(),
  table_name  text not null,
  op          text not null,                 -- INSERT / UPDATE / DELETE
  row_id      text,
  release_id  uuid,
  package_id  uuid,
  actor_kind  text not null,                 -- staff | artist_guest | non_human
  actor_id    uuid,                          -- auth uid (staff) when known
  db_role     text,                          -- JWT role (anon/authenticated/service_role) or null
  db_user     text,                          -- current_user (postgres, authenticator, ...)
  unexpected  boolean not null default false,
  changed_cols text[],
  old_vals    jsonb,
  new_vals    jsonb,
  user_agent  text,
  origin      text,
  client_info text,                          -- x-client-info (supabase-js version) when present
  txid        bigint default txid_current(),
  trigger_depth int                          -- >1 = fired by a cascade/another trigger
);

create index if not exists package_change_log_release_idx on package_change_log (release_id, changed_at desc);
create index if not exists package_change_log_row_idx     on package_change_log (table_name, row_id, changed_at desc);
create index if not exists package_change_log_unexp_idx   on package_change_log (changed_at desc) where unexpected;

-- Nobody can edit the log from the app; only the trigger function (owner) writes it.
alter table package_change_log enable row level security;
revoke all on package_change_log from anon, authenticated;
grant select on package_change_log to authenticated;          -- staff can read; no write grants
drop policy if exists package_change_log_read on package_change_log;
create policy package_change_log_read on package_change_log for select to authenticated using (true);

create or replace function log_package_change() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  claims jsonb; hdrs jsonb;
  v_role text; v_uid uuid; v_kind text; v_unexpected boolean;
  o jsonb; n jsonb; j jsonb;
  k text; cols text[] := '{}';
  oldv jsonb := '{}'::jsonb; newv jsonb := '{}'::jsonb;
  rid uuid; pid uuid; v_row text;
  watched text[] := array['project_type','package_locked','package_total_value','int_media_requested'];
begin
  if TG_OP = 'INSERT' then n := to_jsonb(NEW); j := n;
  elsif TG_OP = 'DELETE' then o := to_jsonb(OLD); j := o;
  else o := to_jsonb(OLD); n := to_jsonb(NEW); j := n;
  end if;

  if TG_OP = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      continue when k = 'updated_at';
      continue when TG_TABLE_NAME = 'releases' and not (k = any(watched));
      if o->k is distinct from n->k then
        cols := cols || k; oldv := oldv || jsonb_build_object(k, o->k); newv := newv || jsonb_build_object(k, n->k);
      end if;
    end loop;
    if array_length(cols,1) is null then return null; end if;   -- nothing meaningful changed
  elsif TG_OP = 'INSERT' then newv := n; cols := array(select jsonb_object_keys(n));
  else oldv := o; cols := array(select jsonb_object_keys(o));
  end if;

  begin claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb; exception when others then claims := null; end;
  begin hdrs   := nullif(current_setting('request.headers', true), '')::jsonb;    exception when others then hdrs := null; end;
  v_role := claims->>'role';
  begin v_uid := nullif(claims->>'sub','')::uuid; exception when others then v_uid := null; end;

  v_kind := case
    when claims is null or v_role is null then 'non_human'
    when v_role = 'service_role'          then 'non_human'
    when v_role = 'authenticated' and v_uid is not null then 'staff'
    when v_role = 'anon'                  then 'artist_guest'
    else 'non_human' end;
  v_unexpected := (v_kind = 'non_human')
               or (v_kind = 'artist_guest' and TG_TABLE_NAME not in ('releases','release_package_items'));

  v_row := j->>'id';
  if TG_TABLE_NAME = 'releases' then rid := (j->>'id')::uuid; else rid := nullif(j->>'release_id','')::uuid; end if;
  if TG_TABLE_NAME = 'media_booking_packages' then pid := (j->>'id')::uuid; else pid := nullif(j->>'package_id','')::uuid; end if;
  if rid is null and pid is not null then
    select release_id into rid from media_booking_packages where id = pid;
  end if;

  insert into package_change_log
    (table_name, op, row_id, release_id, package_id, actor_kind, actor_id, db_role, db_user, unexpected,
     changed_cols, old_vals, new_vals, user_agent, origin, client_info, trigger_depth)
  values
    (TG_TABLE_NAME, TG_OP, v_row, rid, pid, v_kind, case when v_kind = 'staff' then v_uid end, v_role, current_user, v_unexpected,
     cols, case when TG_OP = 'INSERT' then null else oldv end, case when TG_OP = 'DELETE' then null else newv end,
     left(hdrs->>'user-agent', 200), left(coalesce(hdrs->>'origin', hdrs->>'referer'), 200), left(hdrs->>'x-client-info', 100),
     pg_trigger_depth());
  return null;
end
$fn$;

drop trigger if exists trg_log_pkg_packages   on media_booking_packages;
drop trigger if exists trg_log_pkg_lines      on media_booking_package_lines;
drop trigger if exists trg_log_pkg_rollups    on media_booking_package_categories;
drop trigger if exists trg_log_pkg_entries    on media_booking_content_entries;
drop trigger if exists trg_log_pkg_items      on release_package_items;
drop trigger if exists trg_log_pkg_releases   on releases;

create trigger trg_log_pkg_packages after insert or update or delete on media_booking_packages         for each row execute function log_package_change();
create trigger trg_log_pkg_lines    after insert or update or delete on media_booking_package_lines    for each row execute function log_package_change();
create trigger trg_log_pkg_rollups  after insert or update or delete on media_booking_package_categories for each row execute function log_package_change();
create trigger trg_log_pkg_entries  after insert or update or delete on media_booking_content_entries  for each row execute function log_package_change();
create trigger trg_log_pkg_items    after insert or update or delete on release_package_items          for each row execute function log_package_change();
create trigger trg_log_pkg_releases after update of project_type, package_locked, package_total_value, int_media_requested
                                    on releases for each row execute function log_package_change();

-- Convenience view: everything that was NOT an ordinary staff edit.
create or replace view package_change_log_unexpected as
  select * from package_change_log where unexpected order by changed_at desc;
grant select on package_change_log_unexpected to authenticated;

-- CHECK 1: 6 triggers
select event_object_table, trigger_name from information_schema.triggers where trigger_name like 'trg_log_pkg_%' group by 1,2 order by 1;
-- CHECK 2 (after any package edit in the app): newest rows, expect actor_kind = staff
-- select changed_at, table_name, op, actor_kind, changed_cols, unexpected from package_change_log order by id desc limit 20;
-- WHEN THE NUMBERS CHANGE: select * from package_change_log_unexpected;   -- and look at the release:
-- select changed_at, table_name, op, actor_kind, db_user, user_agent, changed_cols, old_vals, new_vals
--   from package_change_log where release_id = '<release uuid>' order by id;

-- OPTIONAL housekeeping (run now and then): keep 90 days
-- delete from package_change_log where changed_at < now() - interval '90 days';

-- UNDO (removes logging; keeps the history table):
-- drop trigger if exists trg_log_pkg_packages on media_booking_packages; drop trigger if exists trg_log_pkg_lines on media_booking_package_lines;
-- drop trigger if exists trg_log_pkg_rollups on media_booking_package_categories; drop trigger if exists trg_log_pkg_entries on media_booking_content_entries;
-- drop trigger if exists trg_log_pkg_items on release_package_items; drop trigger if exists trg_log_pkg_releases on releases;
