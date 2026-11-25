-- Round 695 — release info form (step 2 of /khai-bao, DEMO first): one row per release, answers as jsonb.
-- Server only (the API route uses the service role); no anon / authenticated access. Safe to re-run.
create table if not exists public.release_info_forms (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'submitted',        -- draft | submitted | confirmed | rejected
  source text not null default 'demo',             -- demo (/khai-bao-demo) | public (/khai-bao)
  contact_email text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (release_id)
);
alter table public.release_info_forms enable row level security;
revoke all on public.release_info_forms from anon, authenticated;
grant all on public.release_info_forms to service_role;
-- VERIFY: select count(*) from public.release_info_forms;
