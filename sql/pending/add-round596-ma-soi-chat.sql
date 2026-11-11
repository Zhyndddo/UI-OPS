-- ============================================================================
-- Round 596 — Ma Sói: CHAT CHANNEL (realtime) + dev test tools (bots, chat storm, kill switch)
-- ============================================================================
-- Run AFTER add-round595. Idempotent. Needs nothing else (Supabase Realtime is already on: chatx_messages uses it).
-- Rooms:   'day'  — one shared room PER DAY (Ngày N). Open for alive, non-silenced players while it is day (day / runoff / hunter phase);
--                   at night it is read-only. Everybody in the game (dead too) can READ it. Dead players can not type.
--          'wolf' — wolf team only (Sói, Sói trắng, converted Sói nửa người); alive wolves type any time; dead wolves can read.
-- Realtime: the browser subscribes to table ms_chat; row level security decides who receives which row (function ms_chat_can_read).
--           Writing goes ONLY through the server route (service key) -> ms_chat_send(): rules + 1 message / second per player.
-- Retention: messages older than 3 days are deleted (every ~20th send). Kill switch: ms_games.chat_on (dev button on the page).
-- Test tools (dev only): ms_add_bots, ms_bot_turn (bots answer the current phase randomly), ms_bot_chat (storm of N messages in ONE insert).

alter table public.ms_games add column if not exists chat_on boolean not null default true;
alter table public.ms_players add column if not exists is_bot boolean not null default false;

create table if not exists public.ms_chat (
  id bigserial primary key,
  game_id uuid not null references public.ms_games(id) on delete cascade,
  room text not null check (room in ('day','wolf')),
  day_no int not null,
  player_id uuid references public.ms_players(id) on delete set null,
  name text not null,
  body text not null check (char_length(body) between 1 and 300),
  is_bot boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ms_chat_room_idx on public.ms_chat (game_id, room, day_no, id);
create index if not exists ms_chat_created_idx on public.ms_chat (created_at);
alter table public.ms_chat enable row level security;
grant all on public.ms_chat to service_role;
grant usage, select on sequence public.ms_chat_id_seq to service_role;
grant select on public.ms_chat to authenticated;

-- who may READ a row (used by the RLS policy, i.e. by Realtime). security definer: the game tables themselves stay closed.
create or replace function public.ms_chat_can_read(g uuid, rm text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.ms_players p join public.profiles pr on pr.id = p.profile_id
    where p.game_id = g and pr.auth_id = auth.uid() and (rm = 'day' or (rm = 'wolf' and public.ms_is_wolf(p.role))))
$$;
drop policy if exists ms_chat_read on public.ms_chat;
create policy ms_chat_read on public.ms_chat for select to authenticated using (public.ms_chat_can_read(game_id, room));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ms_chat') then
    alter publication supabase_realtime add table public.ms_chat;
  end if;
end $$;

-- ---------- what this player may do right now ----------
create or replace function public.ms_chat_meta(p_profile uuid) returns jsonb
language plpgsql stable as $$
declare gm public.ms_games; me public.ms_players; open_day boolean; sil boolean; why_day text := null; why_wolf text := null;
begin
  select * into gm from public.ms_games where status in ('running','paused','finished') order by created_at desc limit 1;
  if gm.id is null then return jsonb_build_object('game', null); end if;
  select * into me from public.ms_players where game_id = gm.id and profile_id = p_profile;
  open_day := gm.status = 'running' and gm.phase in ('day','runoff','hunter');
  sil := me.id is not null and gm.phase in ('day','runoff') and nullif(gm.ctx->>'silenced','')::uuid = me.id;
  if me.id is null then why_day := 'Bạn không tham gia ván này.';
  elsif not gm.chat_on then why_day := 'Chat đang được tắt.';
  elsif gm.status <> 'running' then why_day := 'Ván chơi không còn chạy.';
  elsif not me.alive then why_day := 'Bạn đã rời cuộc chơi — chỉ được xem.';
  elsif not open_day then why_day := 'Ban đêm: phòng chat ban ngày đóng cửa.';
  elsif sil then why_day := 'Bạn bị bịt miệng cả ngày hôm nay.';
  end if;
  if me.id is null or not public.ms_is_wolf(me.role) then why_wolf := 'Chỉ bầy sói mới vào được phòng này.';
  elsif not gm.chat_on then why_wolf := 'Chat đang được tắt.';
  elsif gm.status <> 'running' then why_wolf := 'Ván chơi không còn chạy.';
  elsif not me.alive then why_wolf := 'Bạn đã rời cuộc chơi — chỉ được xem.';
  end if;
  return jsonb_build_object('game', gm.id, 'me_id', me.id, 'status', gm.status, 'phase', gm.phase, 'day_no', gm.day_no, 'chat_on', gm.chat_on,
    'joined', me.id is not null, 'wolf', me.id is not null and public.ms_is_wolf(me.role),
    'can_day', why_day is null, 'why_day', why_day, 'can_wolf', why_wolf is null, 'why_wolf', why_wolf);
end $$;

create or replace function public.ms_chat_list(p_profile uuid, p_room text, p_day int default null, p_after bigint default 0) returns jsonb
language plpgsql stable as $$
declare gm public.ms_games; me public.ms_players; res jsonb;
begin
  select * into gm from public.ms_games where status in ('running','paused','finished') order by created_at desc limit 1;
  if gm.id is null then return '[]'::jsonb; end if;
  select * into me from public.ms_players where game_id = gm.id and profile_id = p_profile;
  if me.id is null or p_room not in ('day','wolf') or (p_room = 'wolf' and not public.ms_is_wolf(me.role)) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'room', m.room, 'day', m.day_no, 'name', m.name, 'body', m.body, 'at', m.created_at,
           'bot', m.is_bot, 'me', m.player_id = me.id) order by m.id), '[]') into res
  from (select * from public.ms_chat where game_id = gm.id and room = p_room and day_no = coalesce(p_day, gm.day_no) and id > p_after order by id desc limit 200) m;
  return res;
end $$;

create or replace function public.ms_chat_load(p_profile uuid, p_day int default null) returns jsonb
language plpgsql stable as $$
declare meta jsonb := public.ms_chat_meta(p_profile);
begin
  if meta->>'game' is null then return meta; end if;
  return meta || jsonb_build_object('day', public.ms_chat_list(p_profile, 'day', p_day, 0),
    'wolf', case when (meta->>'wolf')::boolean then public.ms_chat_list(p_profile, 'wolf', p_day, 0) else '[]'::jsonb end);
end $$;

create or replace function public.ms_chat_send(p_profile uuid, p_room text, p_body text) returns jsonb
language plpgsql as $$
declare gm public.ms_games; me public.ms_players; b text; meta jsonb; id_ bigint;
begin
  b := btrim(regexp_replace(coalesce(p_body, ''), '[[:cntrl:]]+', ' ', 'g'));
  if char_length(b) = 0 then return jsonb_build_object('error', 'Tin nhắn trống.'); end if;
  if char_length(b) > 300 then b := left(b, 300); end if;
  if p_room not in ('day','wolf') then return jsonb_build_object('error', 'Phòng không hợp lệ.'); end if;
  meta := public.ms_chat_meta(p_profile);
  if meta->>'game' is null then return jsonb_build_object('error', 'Chưa có ván chơi.'); end if;
  if not coalesce((meta->>(case p_room when 'day' then 'can_day' else 'can_wolf' end))::boolean, false) then
    return jsonb_build_object('error', coalesce(meta->>(case p_room when 'day' then 'why_day' else 'why_wolf' end), 'Bạn chưa thể nhắn lúc này.'));
  end if;
  select * into gm from public.ms_games where id = (meta->>'game')::uuid;
  select * into me from public.ms_players where game_id = gm.id and profile_id = p_profile;
  if exists (select 1 from public.ms_chat where player_id = me.id and created_at > now() - interval '1 second') then
    return jsonb_build_object('error', 'Chậm lại một chút nhé.');
  end if;
  insert into public.ms_chat (game_id, room, day_no, player_id, name, body, is_bot) values (gm.id, p_room, gm.day_no, me.id, me.name, b, me.is_bot) returning id into id_;
  if random() < 0.05 then delete from public.ms_chat where created_at < now() - interval '3 days'; end if;
  return jsonb_build_object('ok', true, 'id', id_);
end $$;

-- ---------- dev tools ----------
create or replace function public.ms_chat_toggle(p_profile uuid, p_on boolean) returns jsonb
language plpgsql as $$
begin
  if not public.ms_is_staff_dev(p_profile) then return jsonb_build_object('error', 'Chỉ admin/dev.'); end if;
  update public.ms_games set chat_on = p_on where id = (select id from public.ms_games order by created_at desc limit 1);
  return jsonb_build_object('ok', true, 'chat_on', p_on);
end $$;

create or replace function public.ms_add_bots(p_profile uuid, p_n int) returns jsonb
language plpgsql as $$
declare gid uuid; have int; i int; k int;
begin
  if not public.ms_is_staff_dev(p_profile) then return jsonb_build_object('error', 'Chỉ admin/dev.'); end if;
  gid := public.ms_active();
  if gid is null or (select status from public.ms_games where id = gid) <> 'lobby' then return jsonb_build_object('error', 'Chỉ thêm bot khi đang chờ người.'); end if;
  select count(*) into have from public.ms_players where game_id = gid;
  select count(*) into k from public.ms_players where game_id = gid and is_bot;
  for i in 1..greatest(0, least(p_n, 30 - have)) loop
    insert into public.ms_players (game_id, profile_id, name, is_bot) values (gid, gen_random_uuid(), 'Bot ' || lpad((k + i)::text, 2, '0'), true);
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- every bot answers the current phase with a random legal choice (like a real player would, but instantly)
create or replace function public.ms_bot_turn(p_profile uuid) returns jsonb
language plpgsql as $$
declare gid uuid; b record; st jsonb; pr jsonb; pick jsonb; sec jsonb; n int := 0; len int;
begin
  if not public.ms_is_staff_dev(p_profile) then return jsonb_build_object('error', 'Chỉ admin/dev.'); end if;
  gid := public.ms_active();
  if gid is null then return jsonb_build_object('error', 'Chưa có ván chơi.'); end if;
  for b in select profile_id from public.ms_players where game_id = gid and is_bot order by random() loop
    begin
      st := public.ms_state(b.profile_id); pr := st->'prompt';
      continue when pr is null or pr = 'null'::jsonb;
      len := coalesce(jsonb_array_length(pr->'options'), 0);
      if pr->>'type' = 'wolf' then
        if len > 0 then
          pick := pr->'options'->(floor(random() * len)::int);
          perform public.ms_act(b.profile_id, 'wolf_vote', (pick->>'id')::uuid);
          perform public.ms_act(b.profile_id, 'wolf_confirm', null);
        end if;
        if pr ? 'ww' and not (pr->'ww'->>'done')::boolean then
          if random() < 0.6 then pick := pr->'ww'->'options'->(floor(random() * jsonb_array_length(pr->'ww'->'options'))::int); perform public.ms_act(b.profile_id, 'wwolf', (pick->>'id')::uuid);
          else perform public.ms_act(b.profile_id, 'wwolf', null); end if;
        end if;
      elsif pr->>'type' = 'whitewolf' and not (pr->>'done')::boolean then
        if random() < 0.6 then pick := pr->'options'->(floor(random() * len)::int); perform public.ms_act(b.profile_id, 'wwolf', (pick->>'id')::uuid);
        else perform public.ms_act(b.profile_id, 'wwolf', null); end if;
      elsif pr->>'type' in ('seer','guard','silencer','hunter') and not (pr->>'done')::boolean and len > 0 then
        pick := pr->'options'->(floor(random() * len)::int);
        perform public.ms_act(b.profile_id, case pr->>'type' when 'seer' then 'seer' when 'guard' then 'guard' when 'silencer' then 'silence' else 'hunter' end, (pick->>'id')::uuid);
      elsif pr->>'type' = 'whisperer' and not (pr->>'done')::boolean and len > 0 then
        pick := pr->'options'->(floor(random() * len)::int);
        if len >= 2 then
          loop sec := pr->'options'->(floor(random() * len)::int); exit when sec <> pick; end loop;
          perform public.ms_act(b.profile_id, 'whisper', (pick->>'id')::uuid, jsonb_build_object('second', sec->>'id'));
        else perform public.ms_act(b.profile_id, 'whisper', (pick->>'id')::uuid, '{}'::jsonb); end if;
      elsif pr->>'type' = 'cupid' and not (pr->>'done')::boolean and len >= 2 then
        pick := pr->'options'->(floor(random() * len)::int);
        loop sec := pr->'options'->(floor(random() * len)::int); exit when sec <> pick; end loop;
        perform public.ms_act(b.profile_id, 'cupid', (pick->>'id')::uuid, jsonb_build_object('second', sec->>'id'));
      elsif pr->>'type' = 'witch' and not (pr->>'done')::boolean then
        if (pr->>'can_heal')::boolean and random() < 0.5 then perform public.ms_act(b.profile_id, 'witch', null, '{"heal":true}');
        elsif (pr->>'can_poison')::boolean and random() < 0.25 and len > 0 then pick := pr->'options'->(floor(random() * len)::int); perform public.ms_act(b.profile_id, 'witch', (pick->>'id')::uuid, '{"poison":true}');
        else perform public.ms_act(b.profile_id, 'witch', null, '{}'::jsonb); end if;
      elsif pr->>'type' = 'vote' and not (pr->>'voted')::boolean and len > 0 then
        pick := pr->'options'->(floor(random() * len)::int);
        perform public.ms_act(b.profile_id, 'vote', (pick->>'id')::uuid);
      else continue;
      end if;
      n := n + 1;
    exception when others then null;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'acted', n);
end $$;

-- a storm of N chat messages from random living bots, written by ONE insert statement (the point is to see what Realtime does)
create or replace function public.ms_bot_chat(p_profile uuid, p_count int) returns jsonb
language plpgsql as $$
declare gm public.ms_games; n int := least(greatest(coalesce(p_count, 1), 1), 300); lines text[] := array[
  'Tôi nghĩ hôm qua có gì đó sai sai…','Ai là người im lặng nhất nhỉ?','Mình là dân thường, thề luôn!','Đừng vội bỏ phiếu, nghe thêm đã.','Tiên tri đâu rồi, lên tiếng đi.',
  'Nhìn cách bạn ấy nói là thấy lạ.','Tôi bỏ phiếu theo trực giác.','Sói chắc chắn đang ở ngay đây.','Bình tĩnh nào mọi người.','Đêm qua yên ắng quá mức.',
  'Ai hôm qua không trả lời kịp vậy?','Nhớ lại ai đã bảo vệ ai đi.','Mình ủng hộ bỏ phiếu lại.','Nghi nhất vẫn là bạn đó.','Haha chắc tại bạn nói nhiều quá.'];
begin
  if not public.ms_is_staff_dev(p_profile) then return jsonb_build_object('error', 'Chỉ admin/dev.'); end if;
  select * into gm from public.ms_games where status = 'running' order by created_at desc limit 1;
  if gm.id is null then return jsonb_build_object('error', 'Ván chơi chưa chạy.'); end if;
  if not gm.chat_on then return jsonb_build_object('error', 'Chat đang tắt.'); end if;
  if not exists (select 1 from public.ms_players where game_id = gm.id and is_bot and alive) then return jsonb_build_object('error', 'Không còn bot nào còn sống.'); end if;
  insert into public.ms_chat (game_id, room, day_no, player_id, name, body, is_bot)
  select gm.id, 'day', gm.day_no, b.id, b.name, lines[1 + floor(random() * array_length(lines, 1))::int] || ' #' || s, true
  from generate_series(1, n) s cross join lateral (select id, name from public.ms_players where game_id = gm.id and is_bot and alive and s > 0 order by random() limit 1) b;   -- 's > 0' makes the pick differ for every message
  return jsonb_build_object('ok', true, 'sent', n);
end $$;

-- same lock-down as the rest of the game functions (only the server calls them) ...
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'ms\_%') loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
-- ... except the one the Realtime policy needs
grant execute on function public.ms_chat_can_read(uuid, text) to authenticated;

-- VERIFY (read-only):
--   select count(*) from pg_policies where tablename = 'ms_chat';                                                       -- 1
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ms_chat';          -- 1 row
