-- ============================================================================
-- Round 585 — Ma Sói: full end-of-game log (who targeted / saved / killed whom, every vote) + how each player went out
-- ============================================================================
-- Run AFTER add-round576-ma-soi.sql. Idempotent. Safe while a game is running (the log starts from the next resolved phase).
-- Nothing is shown during the game: the log is written to a table and published as one card when the game ends.

create table if not exists public.ms_log (
  id bigserial primary key,
  game_id uuid not null references public.ms_games(id) on delete cascade,
  day_no int not null default 0,
  phase text not null,                      -- night | day | hunter
  line text not null,
  created_at timestamptz not null default now()
);
create index if not exists ms_log_game_idx on public.ms_log (game_id, id);
alter table public.ms_log enable row level security;
grant all on public.ms_log to service_role;
grant usage, select on sequence public.ms_log_id_seq to service_role;

create or replace function public.ms_pn(p uuid) returns text language sql stable as $$ select name from public.ms_players where id = p $$;

create or replace function public.ms_log_add(g uuid, d int, ph text, l text) returns void
language sql as $$ insert into public.ms_log (game_id, day_no, phase, line) values (g, d, ph, l) $$;

-- ---------- night: same rules as before + log lines ----------
create or replace function public.ms_resolve_night(g uuid, t timestamptz) returns void
language plpgsql as $$
declare gm public.ms_games; victim uuid; saved boolean; poison uuid; deaths jsonb := '[]'::jsonb; gtgt uuid;
        wl text; a record; healed boolean; any_death boolean := false;
begin
  select * into gm from public.ms_games where id = g;
  victim := nullif(gm.ctx->>'wolf_target','')::uuid;
  select target into gtgt from public.ms_actions where game_id = g and phase_no = gm.phase_no and kind = 'guard' limit 1;
  if gtgt is not null then update public.ms_players set state = state || jsonb_build_object('last_guard', gtgt) where game_id = g and role = 'guard'; end if;
  healed := coalesce((gm.ctx->>'heal')::boolean,false);
  saved := victim is not null and ((gtgt is not null and gtgt = victim) or healed);
  poison := nullif(gm.ctx->>'poison','')::uuid;
  if victim is not null and not saved then deaths := deaths || jsonb_build_array(jsonb_build_object('id', victim, 'reason', 'killed')); end if;
  if poison is not null and poison is distinct from victim then deaths := deaths || jsonb_build_array(jsonb_build_object('id', poison, 'reason', 'poisoned'));
  elsif poison is not null and victim = poison then
    if saved then deaths := deaths || jsonb_build_array(jsonb_build_object('id', poison, 'reason', 'poisoned'));
    else deaths := jsonb_set(deaths, '{0,reason}', '"poisoned"'); end if;
  end if;

  -- log
  select string_agg(public.ms_pn(x.player_id) || ' → ' || coalesce(public.ms_pn(x.target), '?'), ', ' order by public.ms_pn(x.player_id)) into wl
  from public.ms_actions x where x.game_id = g and x.phase_no = gm.phase_no and x.kind = 'wolf_vote';
  perform public.ms_log_add(g, gm.day_no, 'night', '🐺 Bầy sói chọn: ' || coalesce(wl, 'không ai kịp chọn') || '. Mục tiêu chốt: ' || coalesce(public.ms_pn(victim), 'không có ai') || '.');
  for a in select player_id, target from public.ms_actions where game_id = g and phase_no = gm.phase_no and kind = 'guard' loop
    perform public.ms_log_add(g, gm.day_no, 'night', '🛡️ Bảo vệ ' || public.ms_pn(a.player_id) || ' che chở ' || coalesce(public.ms_pn(a.target), '?') || '.');
  end loop;
  for a in select x.player_id, x.target, (select role from public.ms_players where id = x.target) trole from public.ms_actions x
           where x.game_id = g and x.phase_no = gm.phase_no and x.kind = 'seer' loop
    perform public.ms_log_add(g, gm.day_no, 'night', '🔮 Tiên tri ' || public.ms_pn(a.player_id) || ' soi ' || coalesce(public.ms_pn(a.target), '?') || ' → ' || case when a.trole = 'wolf' then 'là SÓI' else 'không phải sói' end || '.');
  end loop;
  for a in select x.player_id, x.target, x.data from public.ms_actions x where x.game_id = g and x.phase_no = gm.phase_no and x.kind = 'witch' loop
    perform public.ms_log_add(g, gm.day_no, 'night', '🧪 Phù thủy ' || public.ms_pn(a.player_id) || ' ' ||
      case when (a.data->>'heal') = 'true' then 'dùng bình cứu cho ' || coalesce(public.ms_pn(a.target), '?')
           when (a.data->>'poison') = 'true' then 'dùng bình độc cho ' || coalesce(public.ms_pn(a.target), '?')
           else 'không dùng bình nào' end || '.');
  end loop;
  if victim is not null and saved then
    perform public.ms_log_add(g, gm.day_no, 'night', '✅ ' || public.ms_pn(victim) || ' thoát chết' ||
      case when gtgt is not null and gtgt = victim and healed then ' (được Bảo vệ che chở và cả Phù thủy cứu)'
           when gtgt is not null and gtgt = victim then ' (nhờ Bảo vệ che chở)' else ' (nhờ Phù thủy cứu)' end || '.');
  end if;
  for a in select (e->>'id')::uuid id, e->>'reason' reason from jsonb_array_elements(deaths) e loop
    any_death := true;
    perform public.ms_log_add(g, gm.day_no, 'night', '💀 ' || public.ms_pn(a.id) || ' ' || case a.reason when 'poisoned' then 'bị Phù thủy đầu độc' else 'bị bầy sói cắn chết' end || '.');
  end loop;
  if not any_death then perform public.ms_log_add(g, gm.day_no, 'night', '🌅 Đêm này không ai chết.'); end if;

  update public.ms_games set ctx = ctx || jsonb_build_object('deaths', deaths, 'source', 'night') where id = g;
  perform public.ms_commit(g, t);
end $$;

-- ---------- day vote: same rules + log ----------
create or replace function public.ms_resolve_day(g uuid, t timestamptz) returns void
language plpgsql as $$
declare gm public.ms_games; tops uuid[]; tgt uuid; votes text; deaths jsonb := '[]'::jsonb;
begin
  select * into gm from public.ms_games where id = g;
  select string_agg(pa.name || ' → ' || coalesce(pt.name, 'bỏ phiếu trắng'), ', ' order by pa.name) into votes
  from public.ms_actions a join public.ms_players pa on pa.id = a.player_id left join public.ms_players pt on pt.id = a.target
  where a.game_id = g and a.phase_no = gm.phase_no and a.kind = 'vote';
  perform public.ms_log_add(g, gm.day_no, 'day', '🗳️ ' || case when gm.phase = 'runoff' then 'Bỏ phiếu lại: ' else 'Phiếu bầu: ' end || coalesce(votes, 'không ai bỏ phiếu') || '.');
  tops := public.ms_top(g, 'vote', gm.phase_no);
  if tops is not null and array_length(tops,1) > 1 and gm.phase = 'day' then
    perform public.ms_log_add(g, gm.day_no, 'day', '⚖️ Hoà phiếu giữa ' || public.ms_names(tops) || ' → bỏ phiếu lại.');
    perform public.ms_card(g, null, 'story', '⚖️ Ngày ' || gm.day_no || ' — Hoà phiếu',
      public.ms_tpl('day_tie', '', public.ms_names(tops)) || case when coalesce(votes,'') <> '' then E'\n\nPhiếu bầu: ' || votes else '' end, t);
    update public.ms_games set phase = 'runoff', stage = 1, phase_no = phase_no + 1, phase_started_at = t, phase_ends_at = t + interval '2 hours',
      ctx = jsonb_build_object('runoff', to_jsonb(tops)) where id = g;
    return;
  end if;
  if tops is not null and array_length(tops,1) = 1 then tgt := tops[1]; end if;
  if tgt is not null then
    deaths := jsonb_build_array(jsonb_build_object('id', tgt, 'reason', 'lynched'));
    perform public.ms_log_add(g, gm.day_no, 'day', '⚖️ ' || public.ms_pn(tgt) || ' bị làng trục xuất' || case when (select role from public.ms_players where id = tgt) = 'wolf' then ' — đúng là SÓI!' else ' — nhưng không phải sói.' end);
  else
    perform public.ms_log_add(g, gm.day_no, 'day', '⚖️ Không ai bị trục xuất.');
  end if;
  update public.ms_games set ctx = ctx || jsonb_build_object('deaths', deaths, 'source', 'day', 'lynched', tgt, 'votes', coalesce(votes,'')) where id = g;
  perform public.ms_commit(g, t);
end $$;

-- ---------- hunter ----------
create or replace function public.ms_resolve_hunter(g uuid, t timestamptz) returns void
language plpgsql as $$
declare gm public.ms_games; tgt uuid; deaths jsonb;
begin
  select * into gm from public.ms_games where id = g;
  select target into tgt from public.ms_actions where game_id = g and phase_no = gm.phase_no and kind = 'hunter' limit 1;
  deaths := coalesce(gm.ctx->'deaths','[]'::jsonb);
  if tgt is not null then
    deaths := deaths || jsonb_build_array(jsonb_build_object('id', tgt, 'reason', 'shot'));
    perform public.ms_log_add(g, gm.day_no, 'hunter', '🏹 Thợ săn ' || coalesce(public.ms_pn((gm.ctx->>'hunter_id')::uuid), '?') || ' bắn ' || public.ms_pn(tgt) || '.');
  else
    perform public.ms_log_add(g, gm.day_no, 'hunter', '🏹 Thợ săn ' || coalesce(public.ms_pn((gm.ctx->>'hunter_id')::uuid), '?') || ' không bắn ai.');
  end if;
  update public.ms_games set ctx = ctx || jsonb_build_object('deaths', deaths, 'hunter_done', true) where id = g;
  perform public.ms_commit(g, t);
end $$;

-- ---------- end of game: roles + how everybody went out, then the full timeline ----------
create or replace function public.ms_finish(g uuid, win text, t timestamptz) returns void
language plpgsql as $$
declare lst text; tl text := ''; r record; last_key text := '';
begin
  select string_agg(name || ' — ' || public.ms_role_vi(role) || ' · ' ||
    case when alive then 'còn sống' else case out_reason when 'killed' then 'bị sói cắn' when 'poisoned' then 'bị đầu độc' when 'lynched' then 'bị làng trục xuất'
      when 'shot' then 'bị thợ săn bắn' when 'left' then 'rời làng' else 'đã chết' end end,
    E'\n' order by (role='wolf') desc, name) into lst
  from public.ms_players where game_id = g;
  update public.ms_games set status = 'finished', finished_at = t, winner = win, phase_ends_at = null where id = g;
  perform public.ms_card(g, null, 'final',
    case win when 'wolves' then '🐺 Bầy sói chiến thắng' when 'village' then '🏡 Dân làng chiến thắng' else 'Ván chơi đã kết thúc' end,
    case win when 'wolves' then 'Tiếng tru vang khắp thung lũng. Khi số sói đã ngang với số người còn lại, ngôi làng không còn nơi nào để trốn.'
             when 'village' then 'Con sói cuối cùng đã bị lộ mặt. Sau bao đêm kinh hoàng, ngôi làng lại được đón một bình minh thật sự.'
             else 'Ván chơi đã bị huỷ.' end
      || E'\n\nVai trò và số phận của mọi người:\n' || coalesce(lst, ''), t);
  for r in select day_no, phase, line from public.ms_log where game_id = g order by id loop
    if r.day_no::text || r.phase <> last_key then
      last_key := r.day_no::text || r.phase;
      tl := tl || case when tl = '' then '' else E'\n\n' end || case r.phase when 'night' then '🌙 Đêm ' || r.day_no when 'day' then '☀️ Ngày ' || r.day_no else '🏹 Ngày ' || r.day_no || ' — súng thợ săn' end;
    end if;
    tl := tl || E'\n' || r.line;
  end loop;
  if tl <> '' then
    perform public.ms_card(g, null, 'log', '📋 Nhật ký ván chơi — ai làm gì, ai chết vì ai', tl, t - interval '1 millisecond');
  end if;
end $$;

-- same lock-down as the rest of the game functions
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'ms\_%') loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- VERIFY (read-only):   select count(*) from public.ms_log;     -- 0 until a night/day is resolved
