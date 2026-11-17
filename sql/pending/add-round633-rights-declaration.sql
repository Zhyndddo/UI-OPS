-- Round 633 — public "Khai báo bản quyền ca khúc mới" form + AR confirm step. Safe to re-run.
-- The signed PDF lives in Google Drive (only its link is stored here), so the table stays tiny.
create table if not exists public.rights_declarations (
  id uuid primary key default gen_random_uuid(),
  release_id uuid references public.releases(id) on delete set null,
  song_title text,
  composer text,
  performer text,
  producer text,
  mixer text,
  owned jsonb not null default '{}'::jsonb,        -- { master, performing, publishing } booleans
  licensed jsonb not null default '{}'::jsonb,     -- same shape: licensed by the right holder
  proof text,                                      -- link / note for licensed rights
  platforms text check (platforms in ('all','some')),
  platforms_note text,
  term text check (term in ('perpetual','limited')),
  term_note text,
  signer_name text,
  pdf_url text,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists rights_declarations_status_created on public.rights_declarations (status, created_at desc);
create index if not exists rights_declarations_release on public.rights_declarations (release_id);
alter table public.rights_declarations enable row level security;
revoke all on public.rights_declarations from anon, authenticated;   -- only the server (service role) reads / writes it

-- The confirmed declaration shown on the release detail page.
alter table public.releases add column if not exists rights_declaration jsonb;
-- UNDO: drop table public.rights_declarations; alter table public.releases drop column rights_declaration;
