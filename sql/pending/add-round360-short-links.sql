-- Round 360 — "can we make a custom minter for the url we generate...
-- make a table somewhere that do something like an auto re-direct or
-- some thing that make sure no url is the same... like
-- Internal.vieent.com/vsounder, no where else can the app generate same
-- /vsounder any more". A general-purpose short-link table: mint a
-- friendly slug (internal.vieent.com/<slug>) that redirects to any
-- destination URL — the existing per-feature magic links
-- (channel_reference_share_links, magic_links, etc.) each mint their own
-- opaque random token; this is a separate, human-picked-name layer on
-- top of any of those (or any other URL), not a replacement for them.
--
-- `slug` is the uniqueness guarantee the request asked for: a `unique`
-- constraint means the database itself refuses a second row with the
-- same slug, on top of the app-level check in app/api/short-links/
-- route.js — belt and suspenders, same as every other unique-token table
-- in this app (channel_reference_share_links.token, magic_links.token).
-- Stored lowercased (see lib/shortLinks.js's normalizeSlug) so
-- "VSounder" and "vsounder" can't both be minted as if they were
-- different links — the actual URL path is case-insensitive in every
-- browser that matters here anyway.
create table if not exists short_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  destination_url text not null,
  label text,
  created_by text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  click_count integer not null default 0,
  revoked_at timestamptz
);

create index if not exists short_links_slug_idx on short_links (slug);
