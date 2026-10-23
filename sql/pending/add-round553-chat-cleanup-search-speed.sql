-- Round 553 — chat cleanup + faster # (release) search. Idempotent.
-- Run order: this file only (after add-round552-chat-open.sql).
--
-- 1. Sandbox channel and the old "How this chat works" channel are removed (the app now has a
--    built-in Patch notes page instead). Their messages go with them (cascade) — Sandbox was test chatter.
-- 2. Trigram indexes so "did/title contains text" searches (the # tag, release search) stop scanning the whole table.
--
-- UNDO: drop index if exists releases_did_trgm_idx, releases_title_trgm_idx;
--       (removed channels can be re-created: insert into chatx_channels (name) values ('Sandbox');)

delete from chatx_channels where name = 'Sandbox' or kind = 'guide' or name = 'How this chat works';

create extension if not exists pg_trgm;
create index if not exists releases_did_trgm_idx   on releases using gin (did   gin_trgm_ops);
create index if not exists releases_title_trgm_idx on releases using gin (title gin_trgm_ops);

-- VERIFY: expect UPLOAD, SMARTLINK, CONFIRM, PITCHING only ...
select name from chatx_channels order by created_at, name;
-- ... and both indexes (2 rows)
select indexname from pg_indexes where tablename = 'releases' and indexname in ('releases_did_trgm_idx','releases_title_trgm_idx');
