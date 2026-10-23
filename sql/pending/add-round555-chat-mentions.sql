-- Round 555 — chat mentions live on the chat itself (number on the chat bubble + sound), NOT in the bell.
-- Run order: this file only (after add-round552 / 553). Idempotent.
--
-- What it does:
--  1. messages get a `mention_ids uuid[]` column (who a message tags) + a small GIN index, so
--     "which messages tag me" is a fast lookup. Backfilled from the tags already stored.
--  2. removes the chat rows that earlier rounds put in the notifications table (chat_mention / chat_help).
--     From now on chat writes ZERO notification rows.
--
-- UNDO: drop index if exists chatx_messages_mentions_idx; alter table chatx_messages drop column if exists mention_ids;

alter table chatx_messages add column if not exists mention_ids uuid[] not null default '{}';
create index if not exists chatx_messages_mentions_idx on chatx_messages using gin (mention_ids);

update chatx_messages m
set mention_ids = coalesce((
  select array_agg(distinct (t->>'id')::uuid)
  from jsonb_array_elements(m.tags) t
  where t->>'t' = 'u' and t->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
), '{}')
where m.tags @> '[{"t":"u"}]'::jsonb and m.mention_ids = '{}';

delete from notifications where type in ('chat_mention', 'chat_help');

-- VERIFY: column + index (2 rows) ...
select 'column' as what, column_name as name from information_schema.columns where table_name = 'chatx_messages' and column_name = 'mention_ids'
union all select 'index', indexname from pg_indexes where indexname = 'chatx_messages_mentions_idx';
-- ... and no leftover chat bell rows (expect 0)
select count(*) as leftover_chat_notifications from notifications where type in ('chat_mention', 'chat_help');
