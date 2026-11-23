-- Round 675 — Noel tree wishes + ornaments. Run AFTER add-round672-noel-tree.sql (it creates noel_tree_lights).
-- Tables are locked: only the server (app/api/noel-tree/route.js, service role) reads/writes them.
create table if not exists public.noel_people (
  profile_id uuid primary key,
  ornament text not null default 'bulb',
  updated_at timestamptz not null default now()
);
create table if not exists public.noel_wishes (
  profile_id uuid primary key,
  body text not null check (char_length(btrim(body)) between 1 and 280),
  photo text,                      -- small JPEG data-URL (resized in the browser, <= ~200 KB)
  show_name boolean not null default false,
  name text,
  drive_url text,                  -- archive copy on Google Drive (best effort)
  updated_at timestamptz not null default now()
);
alter table public.noel_people enable row level security;
alter table public.noel_wishes enable row level security;
revoke all on public.noel_people from anon, authenticated;
revoke all on public.noel_wishes from anon, authenticated;
-- UNDO: drop table public.noel_wishes; drop table public.noel_people;
