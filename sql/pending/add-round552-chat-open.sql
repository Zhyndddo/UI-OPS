-- Round 552 — chat opened to all staff + topic channels + Helper bot support.
-- Builds on the Round 530 tables (chatx_channels / chatx_messages). Additive, idempotent.
-- Run order: this file only (needs add-round530-chat-prototype.sql to have been run already).
--
-- UNDO:
--   alter table chatx_messages drop column if exists kind, drop column if exists sender_name;
--   delete from chatx_channels where name in ('UPLOAD','SMARTLINK','CONFIRM','PITCHING');   -- also deletes their messages
--   (sender_id stays nullable; harmless.)  update chatx_channels set name='General', kind='channel' where kind='guide';
--   delete from notifications where type in ('chat_mention','chat_help');

-- 1. who wrote it (others used to show as "User") and whether the Helper bot wrote it
alter table chatx_messages add column if not exists sender_name text;
alter table chatx_messages add column if not exists kind text not null default 'user';   -- 'user' | 'bot'
alter table chatx_messages alter column sender_id drop not null;                         -- bot rows have no sender

-- 2. the old General channel becomes the pinned "how this chat works" channel
update chatx_channels set name = 'How this chat works', kind = 'guide'
where name = 'General' and not exists (select 1 from chatx_channels where name = 'How this chat works');
insert into chatx_channels (name, kind) values ('How this chat works', 'guide')
on conflict (name) do nothing;

-- 3. topic channels
insert into chatx_channels (name) values ('UPLOAD'), ('SMARTLINK'), ('CONFIRM'), ('PITCHING')
on conflict (name) do nothing;

-- 4. access: signed-in staff read + write (edit/hide own is enforced in the UI), logged-out nothing
revoke all on chatx_channels from public;
revoke all on chatx_messages from public;
revoke all on chatx_channels from anon;
revoke all on chatx_messages from anon;
grant select, insert, update on chatx_channels to authenticated;
grant select, insert, update on chatx_messages to authenticated;

-- VERIFY: channels (expect How this chat works, Sandbox, UPLOAD, SMARTLINK, CONFIRM, PITCHING) ...
select name, kind from chatx_channels order by created_at, name;
-- ... and grants (expect authenticated only, no anon rows)
select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_name in ('chatx_channels','chatx_messages') and grantee in ('anon','authenticated') order by 1,2,3;
