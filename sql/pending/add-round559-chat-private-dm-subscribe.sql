-- Round 559 — chat: direct messages, private channels (admin+ create / delete / add people), per-channel subscribe.
-- Run order (see doc559.md): needs add-round530, 552, 553, 555 and rls-round556 already run.
-- Safe to re-run. The five existing channels stay OPEN to everyone exactly as now.
--
-- WHAT THE DATABASE NOW ENFORCES (not just the screen):
--   * open channel     — every signed-in staff member can read/write (the existing channels).
--   * private channel  — only people in chatx_members can read/write. Admin/dev can create, delete and add/remove
--                        people. A dev can SEE that it exists + who is in it (name only), never its messages.
--   * direct message   — exactly two members; only those two can read it (nobody else, dev included).
--   * subscribe        — chatx_members.subscribed; the app only counts / pings for subscribed channels (+ every DM).
-- All writes to channels/members go through the functions below (security definer, role-checked).
--
-- UNDO (does not touch messages in open channels):
--   drop function if exists chat_create_channel(text), chat_delete_channel(uuid), chat_add_member(uuid,uuid),
--     chat_remove_member(uuid,uuid), chat_set_subscribed(uuid,boolean), chat_open_dm(uuid);
--   drop policy if exists chatx_channels_sel_r559 on chatx_channels; drop policy if exists chatx_messages_sel_r559 on chatx_messages; ...
--   (simplest undo: re-run rls-round556 section "staff_all_r556" policy for chatx_* and drop table chatx_members;
--    delete from chatx_channels where visibility in ('private','dm'); alter table chatx_channels drop column visibility, drop column dm_key;)

-- 1. columns + members table ---------------------------------------------------------------------------
alter table chatx_channels add column if not exists visibility text not null default 'open';
alter table chatx_channels drop constraint if exists chatx_channels_visibility_chk;
alter table chatx_channels add constraint chatx_channels_visibility_chk check (visibility in ('open','private','dm'));
alter table chatx_channels add column if not exists dm_key text;
create unique index if not exists chatx_channels_dm_key_uq on chatx_channels (dm_key) where dm_key is not null;

create table if not exists chatx_members (
  channel_id uuid not null references chatx_channels(id) on delete cascade,
  profile_id uuid not null,
  subscribed boolean not null default false,
  is_owner boolean not null default false,
  added_by uuid,
  created_at timestamptz not null default now(),
  primary key (channel_id, profile_id)
);
create index if not exists chatx_members_profile_idx on chatx_members (profile_id);

-- 2. who am I / what am I (security definer so policies never recurse into profiles' own RLS) ----------------
create or replace function public.chat_me() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where auth_id = auth.uid() limit 1
$$;
create or replace function public.chat_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text in ('admin','dev') from profiles where auth_id = auth.uid() limit 1), false)
$$;
create or replace function public.chat_is_dev() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text = 'dev' from profiles where auth_id = auth.uid() limit 1), false)
$$;
create or replace function public.chat_can_read(p_ch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from chatx_channels c
    where c.id = p_ch
      and (c.visibility = 'open'
           or exists (select 1 from chatx_members m where m.channel_id = c.id and m.profile_id = public.chat_me()))
  )
$$;
create or replace function public.chat_vis(p_ch uuid) returns text
language sql stable security definer set search_path = public as $$
  select visibility from chatx_channels where id = p_ch
$$;
revoke all on function public.chat_me(), public.chat_is_admin(), public.chat_is_dev(), public.chat_can_read(uuid), public.chat_vis(uuid) from public, anon;
grant execute on function public.chat_me(), public.chat_is_admin(), public.chat_is_dev(), public.chat_can_read(uuid), public.chat_vis(uuid) to authenticated;

-- 3. row-level security: replace the Round 556 "staff can do everything" policy on the three chat tables ----
alter table chatx_channels enable row level security;
alter table chatx_members  enable row level security;
alter table chatx_messages enable row level security;
drop policy if exists staff_all_r556 on chatx_channels;
drop policy if exists staff_all_r556 on chatx_messages;
drop policy if exists staff_all_r556 on chatx_members;

drop policy if exists chatx_channels_sel_r559 on chatx_channels;
create policy chatx_channels_sel_r559 on chatx_channels for select to authenticated
  using (public.chat_can_read(id) or (public.chat_is_dev() and visibility = 'private'));   -- dev: name only, never a DM

drop policy if exists chatx_members_sel_r559 on chatx_members;
create policy chatx_members_sel_r559 on chatx_members for select to authenticated
  using (profile_id = public.chat_me()
         or (public.chat_vis(channel_id) in ('private','dm') and public.chat_can_read(channel_id))
         or (public.chat_vis(channel_id) = 'private' and public.chat_is_dev()));

drop policy if exists chatx_messages_sel_r559 on chatx_messages;
create policy chatx_messages_sel_r559 on chatx_messages for select to authenticated
  using (public.chat_can_read(channel_id));
drop policy if exists chatx_messages_ins_r559 on chatx_messages;
create policy chatx_messages_ins_r559 on chatx_messages for insert to authenticated
  with check (public.chat_can_read(channel_id)
              and ((kind = 'user' and sender_id = public.chat_me()) or (kind = 'bot' and sender_id is null)));
drop policy if exists chatx_messages_upd_r559 on chatx_messages;
create policy chatx_messages_upd_r559 on chatx_messages for update to authenticated
  using (sender_id = public.chat_me() and public.chat_can_read(channel_id))
  with check (sender_id = public.chat_me() and public.chat_can_read(channel_id));

revoke all on chatx_channels, chatx_members, chatx_messages from public, anon;
revoke insert, update, delete on chatx_channels, chatx_members from authenticated;
grant select on chatx_channels, chatx_members to authenticated;
grant select, insert, update on chatx_messages to authenticated;

-- 4. the only way to change channels / people / subscriptions ---------------------------------------------
create or replace function public.chat_create_channel(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := public.chat_me(); nm text := btrim(coalesce(p_name, '')); cid uuid;
begin
  if not public.chat_is_admin() then raise exception 'Only an admin can create channels' using errcode = '42501'; end if;
  if char_length(nm) < 1 or char_length(nm) > 40 then raise exception 'Channel name must be 1-40 characters'; end if;
  if exists (select 1 from chatx_channels where lower(name) = lower(nm)) then raise exception 'A channel with that name already exists'; end if;
  insert into chatx_channels (name, visibility, created_by) values (nm, 'private', me) returning id into cid;
  insert into chatx_members (channel_id, profile_id, subscribed, is_owner, added_by) values (cid, me, true, true, me);
  return cid;
end $$;

create or replace function public.chat_delete_channel(p_ch uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.chat_is_admin() then raise exception 'Only an admin can delete channels' using errcode = '42501'; end if;
  if (select visibility from chatx_channels where id = p_ch) = 'dm' then raise exception 'Direct messages cannot be deleted here'; end if;
  delete from chatx_channels where id = p_ch;   -- messages + members cascade
end $$;

create or replace function public.chat_add_member(p_ch uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.chat_is_admin() then raise exception 'Only an admin can add people' using errcode = '42501'; end if;
  if (select visibility from chatx_channels where id = p_ch) is distinct from 'private' then raise exception 'People can only be added to private channels'; end if;
  if not exists (select 1 from profiles where id = p_profile) then raise exception 'Unknown person'; end if;
  insert into chatx_members (channel_id, profile_id, subscribed, added_by) values (p_ch, p_profile, true, public.chat_me())
  on conflict (channel_id, profile_id) do nothing;
end $$;

create or replace function public.chat_remove_member(p_ch uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.chat_is_admin() then raise exception 'Only an admin can remove people' using errcode = '42501'; end if;
  if (select visibility from chatx_channels where id = p_ch) is distinct from 'private' then raise exception 'Only private channels have a people list'; end if;
  delete from chatx_members where channel_id = p_ch and profile_id = p_profile;
end $$;

create or replace function public.chat_set_subscribed(p_ch uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.chat_me(); v text;
begin
  if me is null or not public.chat_can_read(p_ch) then raise exception 'No access to this channel' using errcode = '42501'; end if;
  v := public.chat_vis(p_ch);
  if v = 'dm' then raise exception 'Direct messages always notify you'; end if;
  insert into chatx_members (channel_id, profile_id, subscribed) values (p_ch, me, coalesce(p_on, false))
  on conflict (channel_id, profile_id) do update set subscribed = coalesce(p_on, false);
end $$;

create or replace function public.chat_open_dm(p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := public.chat_me(); k text; cid uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_other is null or p_other = me then raise exception 'Pick someone else'; end if;
  if not exists (select 1 from profiles where id = p_other) then raise exception 'Unknown person'; end if;
  k := least(me::text, p_other::text) || ':' || greatest(me::text, p_other::text);
  select id into cid from chatx_channels where dm_key = k;
  if cid is null then
    insert into chatx_channels (name, kind, visibility, dm_key, created_by) values ('dm:' || k, 'dm', 'dm', k, me)
    on conflict (dm_key) where dm_key is not null do nothing returning id into cid;
    if cid is null then select id into cid from chatx_channels where dm_key = k; end if;
    insert into chatx_members (channel_id, profile_id, subscribed) values (cid, me, true), (cid, p_other, true)
    on conflict (channel_id, profile_id) do nothing;
  end if;
  return cid;
end $$;

revoke all on function public.chat_create_channel(text), public.chat_delete_channel(uuid), public.chat_add_member(uuid, uuid),
  public.chat_remove_member(uuid, uuid), public.chat_set_subscribed(uuid, boolean), public.chat_open_dm(uuid) from public, anon;
grant execute on function public.chat_create_channel(text), public.chat_delete_channel(uuid), public.chat_add_member(uuid, uuid),
  public.chat_remove_member(uuid, uuid), public.chat_set_subscribed(uuid, boolean), public.chat_open_dm(uuid) to authenticated;

-- VERIFY (expect: 4 open channels, policies listed, no anon grants)
select name, visibility from chatx_channels order by created_at, name;
select tablename, policyname, cmd from pg_policies where tablename like 'chatx_%' order by 1, 2;
select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_name like 'chatx_%' and grantee in ('anon','authenticated') order by 1,2,3;
