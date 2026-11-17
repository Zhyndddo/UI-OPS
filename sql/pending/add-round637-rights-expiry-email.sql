-- Round 637 — rights form: per-right "Thời hạn" (valid-until date) + optional contact email. Safe to re-run.
alter table public.rights_declarations add column if not exists licensed_until jsonb not null default '{}'::jsonb;  -- { master:'YYYY-MM-DD', performing:..., publishing:... }
alter table public.rights_declarations add column if not exists contact_email text;
-- UNDO: alter table public.rights_declarations drop column licensed_until, drop column contact_email;
