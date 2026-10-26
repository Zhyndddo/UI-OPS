-- Round 559 follow-up: run this ONLY if you already ran add-round559-chat-private-dm-subscribe.sql (the updated file already contains it).
-- Your VERIFY showed extra privileges (TRUNCATE, TRIGGER, REFERENCES, and DELETE on messages) that Supabase grants by default.
-- RLS already blocked DELETE (no delete policy), but TRUNCATE is not covered by RLS, so remove them.
revoke all on chatx_channels, chatx_members, chatx_messages from authenticated;
grant select on chatx_channels, chatx_members to authenticated;
grant select, insert, update on chatx_messages to authenticated;
-- VERIFY (expect exactly: channels SELECT, members SELECT, messages INSERT/SELECT/UPDATE)
select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_name like 'chatx_%' and grantee in ('anon','authenticated') order by 1,2,3;
