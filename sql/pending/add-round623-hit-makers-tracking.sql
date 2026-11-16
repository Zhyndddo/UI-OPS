-- ============================================================================
-- Round 623 — HIT MAKERS: tracking pack + card reveal (one patch with round 622)
-- ============================================================================
-- Run once in the Supabase SQL editor AFTER the round 620 and 622 files (idempotent).
-- Only change: the game state now returns the last 80 log lines instead of 40, so the "since your last turn" summary
-- and the log filters still work after a long stretch of other players' turns. Everything else in this round is on the page.

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
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'body', body) order by id), '[]'::jsonb) from (select id, body from public.hm_events where game_id = g.id order by id desc limit 80) e),
    'board', (select jsonb_agg(jsonb_build_object('space', space, 'kind', kind, 'name', name, 'grp', grp, 'price', price, 'up_cost', up_cost) order by space) from public.hm_board)
  );
end $$;
