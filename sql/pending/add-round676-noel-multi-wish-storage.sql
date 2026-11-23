-- Round 676 — several wishes per person; pictures leave the database (private Storage bucket 'noel-wishes' + Drive copy).
-- Safe whether or not add-round675-noel-wishes.sql was run. Run AFTER add-round672-noel-tree.sql.
create table if not exists public.noel_people (
  profile_id uuid primary key,
  ornament text not null default 'bulb',
  updated_at timestamptz not null default now()
);
create table if not exists public.noel_wishes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 280),
  photo_path text,                 -- object path in Storage bucket noel-wishes (picture is NOT stored in this table)
  show_name boolean not null default false,
  name text,
  drive_url text,
  created_at timestamptz not null default now()
);
-- upgrade a round-675 table (one wish per person, picture inside the row)
alter table public.noel_wishes add column if not exists id uuid default gen_random_uuid();
update public.noel_wishes set id = gen_random_uuid() where id is null;
alter table public.noel_wishes alter column id set not null;
alter table public.noel_wishes drop constraint if exists noel_wishes_pkey;
alter table public.noel_wishes add primary key (id);
alter table public.noel_wishes add column if not exists photo_path text;
alter table public.noel_wishes add column if not exists created_at timestamptz not null default now();
alter table public.noel_wishes drop column if exists photo;
alter table public.noel_wishes drop column if exists updated_at;
create index if not exists idx_noel_wishes_profile on public.noel_wishes (profile_id, created_at desc);

alter table public.noel_people enable row level security;
alter table public.noel_wishes enable row level security;
revoke all on public.noel_people from anon, authenticated;
revoke all on public.noel_wishes from anon, authenticated;

insert into storage.buckets (id, name, public) values ('noel-wishes', 'noel-wishes', false) on conflict (id) do nothing;
-- VERIFY: select count(*) from public.noel_wishes;  select id, public from storage.buckets where id = 'noel-wishes';
-- UNDO: drop table public.noel_wishes; drop table public.noel_people; (and empty/delete the bucket in Storage)
