-- Round 535 — Milestone workstation, Viral Posts:
--  1. a viral post may now have NO matched release (team leaders log a track without a DID),
--  2. Platform / Channel become reference selects; platforms and channels that are not in the
--     existing lists are kept in their OWN small tables, used only by this field.
-- Additive and idempotent. Run order: this file only, then push the app.
--
-- UNDO:
--   drop table if exists viral_post_channels, viral_post_platforms;
--   -- (only if no row has release_id null:)  alter table milestone_viral_posts alter column release_id set not null;

alter table milestone_viral_posts alter column release_id drop not null;

create table if not exists viral_post_platforms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create unique index if not exists viral_post_platforms_name_uniq on viral_post_platforms (lower(name));

create table if not exists viral_post_channels (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  name text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create unique index if not exists viral_post_channels_uniq on viral_post_channels (lower(platform), lower(name));

grant select, insert on viral_post_platforms to authenticated;
grant select, insert on viral_post_channels to authenticated;

-- Check:
--   select is_nullable from information_schema.columns where table_name='milestone_viral_posts' and column_name='release_id';  -- YES
--   select count(*) from viral_post_platforms; select count(*) from viral_post_channels;  -- 0, 0
