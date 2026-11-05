-- ============================================================================
-- Round 587 — Training survey (form + who read / who answered). Run once in the Supabase SQL editor; safe to run again.
-- ============================================================================
-- Three small tables, all reached ONLY through /api/training-survey (service key). RLS on, no policies.
--   training_survey_config    one row: the secret key inside the results link (rotate it from the results page)
--   training_survey_views     who opened the form (first / last time, how many times)  = "read"
--   training_survey_responses one row per person: answers + submitted time              = "answered"

create table if not exists public.training_survey_config (
  id int primary key default 1 check (id = 1),
  results_key text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now()
);
insert into public.training_survey_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.training_survey_views (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  first_opened_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  opens int not null default 1
);

create table if not exists public.training_survey_responses (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  answers jsonb not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.training_survey_config enable row level security;
alter table public.training_survey_views enable row level security;
alter table public.training_survey_responses enable row level security;
grant all on public.training_survey_config, public.training_survey_views, public.training_survey_responses to service_role;

-- VERIFY (read-only):  select count(*) from public.training_survey_config;   -- expect 1
