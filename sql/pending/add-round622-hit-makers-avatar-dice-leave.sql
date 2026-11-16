-- ============================================================================
-- Round 622 — HIT MAKERS: avatars (doodle pad), dice roll counter, leave-table fix
-- ============================================================================
-- Run once in the Supabase SQL editor AFTER add-round620-hit-makers.sql (idempotent).
--  * avatar: each player draws a small picture in the lobby (stored as a tiny PNG, max ~24 KB); the page polls only an 8-char hash and fetches pictures when it changes
--  * roll_no: counts rolls so every screen plays the dice animation when ANY player rolls
--  * leave fix: leaving a running game now marks the seat as "left" (a bot plays it), is logged ONCE, and the page goes back to the start screen;
--    a cancelled game no longer shows up as a board either
alter table public.hm_players add column if not exists avatar text;
alter table public.hm_players add column if not exists left_game boolean not null default false;
alter table public.hm_games add column if not exists roll_no int not null default 0;

create or replace function public.hm_player_of(p_profile uuid, p_guest uuid) returns public.hm_players language sql stable as $$
  select pl.* from public.hm_players pl join public.hm_games g on g.id = pl.game_id
  where ((p_profile is not null and pl.profile_id = p_profile) or (p_guest is not null and pl.guest_id = p_guest)) and not pl.left_game
  order by (g.status in ('lobby','running')) desc, g.created_at desc limit 1
$$;

create or replace function public.hm_leave(p_profile uuid, p_guest uuid) returns jsonb language plpgsql as $$
declare pl public.hm_players; g public.hm_games;
begin
  pl := public.hm_player_of(p_profile, p_guest);
  if pl.id is null then return jsonb_build_object('ok', true); end if;      -- already left: nothing to do, nothing to announce
  select * into g from public.hm_games where id = pl.game_id for update;
  if g.status = 'lobby' then
    delete from public.hm_players where id = pl.id;
    if not exists (select 1 from public.hm_players where game_id = g.id and not is_bot) then update public.hm_games set status = 'cancelled', finished_at = now() where id = g.id; end if;
  elsif g.status = 'running' then
    update public.hm_players set is_bot = true, left_game = true where id = pl.id;
    perform public.hm_log(g.id, '🚪 ' || pl.name || ' rời bàn — bot chơi tiếp.');
    perform public.hm_advance(g.id);
    if not exists (select 1 from public.hm_players where game_id = g.id and not is_bot and not bankrupt) then update public.hm_games set status = 'cancelled', finished_at = now() where id = g.id; end if;
  else
    update public.hm_players set left_game = true where id = pl.id;          -- finished / cancelled: just close it for this player (no announcement)
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.hm_set_avatar(p_profile uuid, p_guest uuid, p_avatar text) returns jsonb language plpgsql as $$
declare pl public.hm_players;
begin
  pl := public.hm_player_of(p_profile, p_guest);
  if pl.id is null then return jsonb_build_object('error', 'Bạn chưa ở trong ván nào.'); end if;
  if p_avatar is null or p_avatar !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or length(p_avatar) > 24000 then
    return jsonb_build_object('error', 'Ảnh không hợp lệ hoặc quá lớn — hãy vẽ đơn giản hơn.');
  end if;
  update public.hm_players set avatar = p_avatar where id = pl.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.hm_avatars(p_profile uuid, p_guest uuid) returns jsonb language plpgsql stable as $$
declare pl public.hm_players;
begin
  pl := public.hm_player_of(p_profile, p_guest);
  if pl.id is null then return '{}'::jsonb; end if;
  return (select coalesce(jsonb_object_agg(p.id::text, jsonb_build_object('h', left(md5(p.avatar), 8), 'd', p.avatar)), '{}'::jsonb)
          from public.hm_players p where p.game_id = pl.game_id and p.avatar is not null);
end $$;

create or replace function public.hm_do_roll(g uuid, pid uuid) returns void language plpgsql as $$
declare gm public.hm_games; pl public.hm_players; d1 int; d2 int; tot int; free boolean := false;
begin
  select * into gm from public.hm_games where id = g;
  select * into pl from public.hm_players where id = pid;
  d1 := 1 + floor(random() * 6)::int; d2 := 1 + floor(random() * 6)::int; tot := d1 + d2;
  update public.hm_games set last_dice = array[d1, d2], roll_no = roll_no + 1 where id = g;
  perform public.hm_log(g, '🎲 ' || pl.name || ' tung ' || d1 || ' + ' || d2 || ' = ' || tot || '.');
  if pl.in_jail then
    if d1 = d2 then
      free := true; perform public.hm_log(g, '🔓 ' || pl.name || ' tung đôi và ra khỏi Gỡ nhạc.');
    else
      update public.hm_players set jail_turns = jail_turns + 1 where id = pid;
      if pl.jail_turns + 1 >= 3 then
        perform public.hm_log(g, '🔓 ' || pl.name || ' hết 3 lượt, đóng phí 50 để ra.');
        if not public.hm_pay(g, pid, null, 50) then perform public.hm_after(g, pid); return; end if;
        free := true;
      else
        update public.hm_games set phase = 'end', extra = false where id = g; return;
      end if;
    end if;
    update public.hm_players set in_jail = false, jail_turns = 0 where id = pid;
    update public.hm_games set extra = false where id = g;
  else
    if d1 = d2 then
      update public.hm_games set doubles_count = doubles_count + 1, extra = true where id = g;
      if gm.doubles_count + 1 >= 3 then
        perform public.hm_log(g, '🚫 ' || pl.name || ' tung đôi 3 lần liền — bị gậy bản quyền.');
        perform public.hm_send_jail(g, pid); perform public.hm_after(g, pid); return;
      end if;
    else update public.hm_games set extra = false where id = g; end if;
  end if;
  perform public.hm_move_to(g, pid, (pl.pos + tot) % 36, pl.pos + tot >= 36, tot);
end $$;

create or replace function public.hm_state(p_profile uuid, p_guest uuid) returns jsonb language plpgsql as $$
declare pl public.hm_players; g public.hm_games; open_g public.hm_games;
begin
  pl := public.hm_player_of(p_profile, p_guest);
  if pl.id is not null then
    select * into g from public.hm_games where id = pl.game_id;
    if g.status = 'cancelled' or (g.status = 'finished' and g.finished_at < now() - interval '2 hours') then pl := null; end if;
  end if;
  if pl.id is null then
    select * into open_g from public.hm_games where status in ('lobby','running');
    return jsonb_build_object('status', 'none', 'open', case when open_g.id is null then null else jsonb_build_object('status', open_g.status,
      'players', (select coalesce(jsonb_agg(name order by seat), '[]'::jsonb) from public.hm_players where game_id = open_g.id)) end);
  end if;
  if g.status = 'running' then
    perform 1 from public.hm_games where id = g.id for update;
    perform public.hm_advance(g.id);
    select * into g from public.hm_games where id = g.id;
  end if;
  return jsonb_build_object(
    'status', g.status,
    'me', pl.id,
    'is_host', g.created_by is not distinct from p_profile and p_profile is not null,
    'code', case when g.status = 'lobby' then g.code else null end,
    'game', jsonb_build_object('year', g.year, 'target_year', g.target_year, 'round', g.round_no, 'cur', g.cur, 'phase', g.phase,
      'dice', g.last_dice, 'roll_no', g.roll_no, 'winner', g.winner, 'win_reason', g.win_reason, 'year_locked', g.year_locked,
      'turn_left', case when g.status = 'running' then greatest(0, 120 - extract(epoch from (clock_timestamp() - g.turn_started_at))::int) else null end),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'seat', p.seat, 'cash', p.cash, 'pos', p.pos,
        'in_jail', p.in_jail, 'jail_cards', p.jail_cards, 'bankrupt', p.bankrupt, 'bot', p.is_bot, 'guest', p.guest_id is not null,
        'worth', public.hm_worth(p.id), 'av', case when p.avatar is null then null else left(md5(p.avatar), 8) end) order by p.seat), '[]'::jsonb) from public.hm_players p where p.game_id = g.id),
    'props', (select coalesce(jsonb_agg(jsonb_build_object('space', space, 'owner', owner, 'level', level)), '[]'::jsonb) from public.hm_props where game_id = g.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'body', body) order by id), '[]'::jsonb) from (select id, body from public.hm_events where game_id = g.id order by id desc limit 40) e),
    'board', (select jsonb_agg(jsonb_build_object('space', space, 'kind', kind, 'name', name, 'grp', grp, 'price', price, 'up_cost', up_cost) order by space) from public.hm_board)
  );
end $$;
