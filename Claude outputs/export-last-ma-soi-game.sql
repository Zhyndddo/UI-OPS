-- Export of the LAST Ma Sói game (cancelled games included): game state, every player + role, the full game log, and every action.
-- Run in the Supabase SQL editor, then use "Download CSV" (or copy the "line" column). Read-only: changes nothing.
with g as (select id from public.ms_games order by created_at desc limit 1)
select ord, kind, line from (
  select 1 as ord, 'GAME' as kind, gm.created_at as ts, 0::bigint as n,
         format('status=%s | winner=%s | phase=%s stage=%s | day=%s phase_no=%s | phase_ends=%s | ctx=%s',
                gm.status, gm.winner, gm.phase, gm.stage, gm.day_no, gm.phase_no, gm.phase_ends_at, gm.ctx) as line
  from public.ms_games gm where gm.id = (select id from g)
  union all
  select 2, 'PLAYER', p.joined_at, 0,
         format('%s | role=%s | alive=%s | out=%s | missed=%s | state=%s', p.name, p.role, p.alive, p.out_reason, p.missed, p.state)
  from public.ms_players p where p.game_id = (select id from g)
  union all
  select 3, 'LOG', l.created_at, l.id, format('[đêm/ngày %s · %s] %s', l.day_no, l.phase, l.line)
  from public.ms_log l where l.game_id = (select id from g)
  union all
  select 4, 'ACTION', a.created_at, 0,
         format('phase_no=%s | %s -> %s | %s | confirmed=%s | data=%s', a.phase_no, pl.name, coalesce(tg.name, '(không chọn)'), a.kind, a.confirmed, a.data)
  from public.ms_actions a join public.ms_players pl on pl.id = a.player_id left join public.ms_players tg on tg.id = a.target
  where a.game_id = (select id from g)
) x order by ord, ts, n;
