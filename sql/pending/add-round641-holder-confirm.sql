-- Round 641 — rights form: in-house right-holder confirmation (email link + email code + evidence record). Safe to re-run. Needs round 638 SQL first.
alter table public.rights_declarations add column if not exists sign_provider text;     -- 'inhouse' | 'dropbox'
alter table public.rights_declarations add column if not exists holder_audit jsonb;     -- name typed, time, IP, device, location, hash
-- UNDO: alter table public.rights_declarations drop column sign_provider, drop column holder_audit;
