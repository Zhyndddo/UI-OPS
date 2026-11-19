-- Round 645 — rights form: duplicate detection, replace flow, change log and an AR ticket type (replaces the Rights workstation).
-- Safe to re-run. Run after the round 633/637/638/639/641 rights SQL.
alter table public.rights_declarations add column if not exists title_key text;      -- normalised title (accents, case, symbols, look-alike letters removed)
alter table public.rights_declarations add column if not exists artist_key text;     -- normalised performer(s), order-independent
alter table public.rights_declarations add column if not exists ticket_id uuid;      -- the AR ticket this song's declarations live in
alter table public.rights_declarations add column if not exists replaced_by uuid;    -- set on the OLD declaration when a new one replaces it (never really deleted)
alter table public.rights_declarations add column if not exists replace_reason text; -- why the declarer asked to delete the old one
alter table public.rights_declarations add column if not exists change_reason text;  -- why the declarer saved the new one (replacements only)
alter table public.rights_declarations drop constraint if exists rights_declarations_status_check;
alter table public.rights_declarations add constraint rights_declarations_status_check check (status in ('pending','confirmed','rejected','superseded'));
create index if not exists rights_declarations_keys on public.rights_declarations (title_key, artist_key) where status in ('pending','confirmed');

-- Everything that happens on /khai-bao and in the ticket, one row per event (service role only).
create table if not exists public.rights_declaration_log (
  id bigserial primary key,
  song_key text,                 -- title_key|artist_key
  declaration_id uuid,
  ticket_id uuid,
  action text not null,          -- declared | replaced | copy_sent | delete_requested | delete_verified | old_email_mismatch | link_resent | confirmed | rejected | reopened | ...
  actor text,                    -- 'public' or the AR user's name
  reason text,
  detail jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists rights_declaration_log_song on public.rights_declaration_log (song_key, created_at desc);
create index if not exists rights_declaration_log_decl on public.rights_declaration_log (declaration_id, created_at desc);
alter table public.rights_declaration_log enable row level security;
revoke all on public.rights_declaration_log from anon, authenticated;

-- The ticket type (AR). PENDING = needs AR action (new or changed declaration), COMPLETE = latest one confirmed, CANCELED = rejected.
insert into public.ticket_tabs (key, label, segment, status_options, default_status, sort_order, executor_team)
values ('rights_declaration', 'Khai báo bản quyền', 'AR', array['PENDING','COMPLETE','CANCELED'], 'PENDING', 0, 'AR')
on conflict (key) do nothing;
-- UNDO: drop table public.rights_declaration_log; alter table public.rights_declarations drop column title_key, drop column artist_key, drop column ticket_id, drop column replaced_by, drop column replace_reason, drop column change_reason; delete from public.ticket_tabs where key = 'rights_declaration';
