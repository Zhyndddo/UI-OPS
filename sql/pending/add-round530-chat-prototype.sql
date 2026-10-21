-- Round 530 — chat PROTOTYPE (one test account only; see lib/chatProto.js).
-- Separate tables (chatx_*) so nothing clashes with the unused chat_* tables
-- from Round 486, if those were ever created. Additive only. Idempotent.
-- Run order: this file only, then push/run the app. Until it is run the chat
-- button simply shows "tables missing".
--
-- UNDO (removes everything this round created):
--   drop table if exists chatx_messages, chatx_channels cascade;

create table if not exists chatx_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null default 'channel',
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists chatx_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references chatx_channels(id) on delete cascade,
  sender_id uuid not null,
  body text not null,
  -- parsed tags, e.g. [{"t":"r","id":"<release uuid>","did":"ABC-0001"},{"t":"u","id":"<profile uuid>","name":"An"}]
  tags jsonb not null default '[]'::jsonb,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chatx_messages_channel_created on chatx_messages (channel_id, created_at desc);
create index if not exists chatx_messages_channel_updated on chatx_messages (channel_id, updated_at desc);

create or replace function chatx_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_chatx_touch on chatx_messages;
create trigger trg_chatx_touch before update on chatx_messages for each row execute function chatx_touch();

grant select, insert, update on chatx_channels to authenticated;
grant select, insert, update on chatx_messages to authenticated;

insert into chatx_channels (name) values ('General'), ('Sandbox')
on conflict (name) do nothing;

-- Live delivery: add the messages table to Supabase's realtime publication
-- (skipped if it is already there).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chatx_messages') then
    alter publication supabase_realtime add table chatx_messages;
  end if;
end $$;

-- Check:
--   select name from chatx_channels;                                   -- General, Sandbox
--   select tablename from pg_publication_tables where pubname='supabase_realtime' and tablename='chatx_messages';  -- 1 row
