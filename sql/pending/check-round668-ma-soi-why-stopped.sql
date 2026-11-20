-- Round 668 — READ-ONLY: why did the last Ma Sói game stop? Run each block; nothing is changed.
-- 1) the last 3 games: status finished + winner = 'cancelled' means someone pressed "Huỷ ván"; status = 'paused' means nobody answered a phase; winner wolves/village/... = a normal ending
select id, status, winner, phase, day_no, chat_on, created_at, finished_at, phase_ends_at from public.ms_games order by created_at desc limit 3;

-- 2) what the village saw in the feed (newest first) — a "Làng tạm nghỉ" card means the automatic pause; a "final" card means a real win
select c.created_at, c.kind, c.title, left(c.body, 90) as body from public.ms_cards c
where c.game_id = (select id from public.ms_games order by created_at desc limit 1) order by c.created_at desc limit 12;

-- 3) the game log (night / day lines) of that game
select day_no, phase, line, created_at from public.ms_log
where game_id = (select id from public.ms_games order by created_at desc limit 1) order by id desc limit 15;

-- 4) players: alive / left / role counts (did the village empty out?)
select alive, role, count(*) from public.ms_players where game_id = (select id from public.ms_games order by created_at desc limit 1) group by alive, role order by alive desc, role;
