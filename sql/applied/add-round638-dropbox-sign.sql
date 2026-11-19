-- Round 638 — rights form: right-holder e-signature through Dropbox Sign (test mode first). Safe to re-run.
alter table public.rights_declarations add column if not exists holder_name text;
alter table public.rights_declarations add column if not exists holder_email text;
alter table public.rights_declarations add column if not exists sign_request_id text;
alter table public.rights_declarations add column if not exists sign_status text not null default 'none';   -- none | not_configured | sent | signed | declined
alter table public.rights_declarations add column if not exists sign_test boolean not null default false;
alter table public.rights_declarations add column if not exists signed_pdf_url text;
alter table public.rights_declarations add column if not exists signed_at timestamptz;
create index if not exists rights_declarations_sign_request on public.rights_declarations (sign_request_id) where sign_request_id is not null;
-- UNDO: alter table public.rights_declarations drop column holder_name, drop column holder_email, drop column sign_request_id, drop column sign_status, drop column sign_test, drop column signed_pdf_url, drop column signed_at;
