-- Round 677 — "Fully held" tick (true/false) under the rights declaration on the release detail page (Copyrights tab).
alter table public.releases add column if not exists rights_fully_held boolean not null default false;
-- VERIFY: select count(*) filter (where rights_fully_held) from public.releases;   UNDO: alter table public.releases drop column rights_fully_held;
