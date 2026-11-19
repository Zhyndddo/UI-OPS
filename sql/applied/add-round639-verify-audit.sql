-- Round 639 — rights form: email-code verification record (who / when / where) kept with each declaration. Safe to re-run.
alter table public.rights_declarations add column if not exists verify_audit jsonb;
alter table public.rights_declarations add column if not exists pdf_sha256 text;
alter table public.rights_declarations add column if not exists consent_at timestamptz;
-- UNDO: alter table public.rights_declarations drop column verify_audit, drop column pdf_sha256, drop column consent_at;
