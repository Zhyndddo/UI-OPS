-- Round 577 — Full catalog (daily TRACK report upload) + kworb matches against it.
-- RUN ORDER: after add-round561 / 563 / 565 kworb SQL; run this BEFORE pushing Round 577. Additive + idempotent.
-- Both new tables are reachable only through the server (service role, dev-checked API route); no browser access.
-- UNDO: drop function if exists kworb_catalog_in_text(text[]); drop table if exists full_catalog, full_catalog_meta;
--       alter table kworb_vn_tracks drop column if exists catalog_id, drop column if exists upc;
--       alter table kworb_vn_videos drop column if exists catalog_id, drop column if exists upc;

create table if not exists full_catalog (
  id               bigint primary key,           -- "Id" of the track report (one row per track)
  isrc             text,
  upc              text,
  title            text not null default '',     -- track name; for a single (empty Title in the report) = the product title
  track_title      text,                         -- the report's own Title cell (null for singles)
  title_version    text,
  product_title    text,
  product_version  text,
  track_order      integer,
  label            text,
  main_artist      text not null default '',
  featured_artist  text,
  release_date     date,
  title_key        text not null default '',     -- cleaned title used for matching (accents/case/brackets removed)
  row_hash         text                          -- lets the daily upload skip unchanged tracks
);
create index if not exists full_catalog_title_key_idx on full_catalog (title_key);

create table if not exists full_catalog_meta (
  id           integer primary key default 1 check (id = 1),
  row_count    integer,
  file_name    text,
  uploaded_by  text,
  finished_at  timestamptz,
  counts       jsonb
);
insert into full_catalog_meta (id) values (1) on conflict do nothing;

alter table full_catalog enable row level security;
alter table full_catalog_meta enable row level security;
revoke all on full_catalog, full_catalog_meta from public, anon, authenticated;
grant all on full_catalog, full_catalog_meta to service_role;

-- kworb: catalog tracks whose cleaned title sits inside a YouTube video title (given as cleaned text). Server-side only.
create or replace function kworb_catalog_in_text(p_texts text[])
returns table (id bigint, upc text, title text, main_artist text, featured_artist text, title_key text, matched_text text)
language sql stable security definer set search_path = public as $$
  select c.id, c.upc, c.title, c.main_artist, c.featured_artist, c.title_key, t.txt
    from full_catalog c
    join unnest(p_texts) as t(txt) on position(c.title_key in t.txt) > 0
   where length(c.title_key) >= 6
   limit 5000
$$;
revoke all on function kworb_catalog_in_text(text[]) from public, anon, authenticated;
grant execute on function kworb_catalog_in_text(text[]) to service_role;

-- kworb matches can now come from the catalog (no DID there): remember which track it was
alter table kworb_vn_tracks add column if not exists catalog_id bigint;
alter table kworb_vn_tracks add column if not exists upc text;
alter table kworb_vn_videos add column if not exists catalog_id bigint;
alter table kworb_vn_videos add column if not exists upc text;

-- VERIFY (expect 2 tables with RLS on, 4 columns, 1 function)
select c.relname, c.relrowsecurity from pg_class c where c.relname in ('full_catalog','full_catalog_meta') order by 1;
select table_name, column_name from information_schema.columns
 where table_name in ('kworb_vn_tracks','kworb_vn_videos') and column_name in ('catalog_id','upc') order by 1, 2;
select proname from pg_proc where proname = 'kworb_catalog_in_text';
