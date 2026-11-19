-- Round 650 — remember each linked person's Telegram @username so Friday can list who tagged them in the group chat.
-- Safe to rerun. (Friday fills it automatically the next time the person writes in a group.)
alter table public.tg_links add column if not exists tg_username text;
-- UNDO: alter table public.tg_links drop column if exists tg_username;

-- Round 651 — Friday DMs a linked person when someone @tags them in the internal group (on by default; /tagalert off in the private chat turns it off)
alter table public.tg_links add column if not exists tag_dm boolean not null default true;
-- UNDO: alter table public.tg_links drop column if exists tag_dm;
