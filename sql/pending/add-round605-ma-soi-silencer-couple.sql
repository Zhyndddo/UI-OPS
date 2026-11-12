-- ============================================================================
-- Round 605 — Ma Sói: (1) Người bịt miệng also BLOCKS the target's ability the next night, (2) the lover always follows in the SAME round
-- (partner is read from the player's state AND, as a fallback, from the Cupid's recorded action), (3) a MIXED couple (one wolf-side,
-- one village-side) is a third team: it wins only if the two of them are the last ones alive.
-- Run after 595/596/598. Safe to re-run (create or replace + one function). No data is changed.
-- ============================================================================

-- who is this player's lover?  state first, Cupid's recorded pairing as a fallback
create or replace function public.ms_lover_of(pid uuid) returns uuid language sql stable as $$
  select coalesce(
    (select nullif(state->>'lover','')::uuid from public.ms_players where id = pid),
    (select case when x.target = pid then nullif(x.data->>'second','')::uuid else x.target end
       from public.ms_actions x join public.ms_players p on p.id = pid and p.game_id = x.game_id
      where x.kind = 'cupid' and (x.target = pid or x.data->>'second' = pid::text) limit 1)) $$;


create or replace function public.ms_win_check(g uuid) returns text
language plpgsql stable as $$
declare w int; v int; n int; mixed boolean;
begin
  select count(*) filter (where public.ms_is_wolf(role)), count(*) filter (where not public.ms_is_wolf(role)), count(*) into w, v, n
  from public.ms_players where game_id = g and alive;
  -- Round 605 — a couple from BOTH sides is its own team: it wins only as the last two alive; until then neither side can win
  select exists (select 1 from public.ms_players a join public.ms_players b on b.game_id = a.game_id and b.alive and b.id = public.ms_lover_of(a.id)
                 where a.game_id = g and a.alive and public.ms_is_wolf(a.role) <> public.ms_is_wolf(b.role)) into mixed;
  if mixed and n = 2 then return 'couple'; end if;
  if w = 0 then return 'village'; end if;
  -- the flute-player wins for the village once everybody else still alive is enchanted
  if exists (select 1 from public.ms_players where game_id = g and alive and role = 'whisperer')
     and not exists (select 1 from public.ms_players where game_id = g and alive and role <> 'whisperer' and not coalesce((state->>'enchanted')::boolean, false)) then
    return 'village';
  end if;
  if mixed then return null; end if;
  if w >= v then return 'wolves'; end if;
  return null;
end $$;

create or replace function public.ms_expected(g uuid) returns setof uuid
language plpgsql stable as $$
declare gm public.ms_games;
begin
  select * into gm from public.ms_games where id = g;
  if gm.phase = 'night' and gm.stage = 1 then
    return query select id from public.ms_players where game_id = g and alive and id <> coalesce(nullif(gm.ctx->>'blocked','')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      and (public.ms_is_wolf(role) or role in ('seer','guard','silencer','whisperer') or (role = 'cupid' and gm.day_no = 1));
  elsif gm.phase = 'night' then
    return query select id from public.ms_players where game_id = g and alive and id <> coalesce(nullif(gm.ctx->>'blocked','')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      and (role in ('seer','guard','silencer','whisperer') or (role = 'whitewolf' and gm.day_no % 2 = 0)
           or (role = 'witch' and coalesce((gm.ctx->>'witch_in')::boolean, false)));
  elsif gm.phase in ('day','runoff') then
    return query select id from public.ms_players where game_id = g and alive and not coalesce((state->>'revealed')::boolean, false);
  elsif gm.phase = 'hunter' then
    return query select (gm.ctx->>'hunter_id')::uuid;
  end if;
end $$;

create or replace function public.ms_all_night(g uuid) returns setof uuid
language plpgsql stable as $$
declare gm public.ms_games;
begin
  select * into gm from public.ms_games where id = g;
  return query select id from public.ms_players where game_id = g and alive and id <> coalesce(nullif(gm.ctx->>'blocked','')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    and (public.ms_is_wolf(role) or role in ('seer','guard','silencer','whisperer') or (role = 'cupid' and gm.day_no = 1)
         or (role = 'witch' and coalesce((gm.ctx->>'witch_in')::boolean, false)));
end $$;

create or replace function public.ms_wolves_done(g uuid) returns boolean
language plpgsql stable as $$
declare gm public.ms_games;
begin
  select * into gm from public.ms_games where id = g;
  return exists (select 1 from public.ms_players where game_id = g and alive and public.ms_is_wolf(role))
    and not exists (select 1 from public.ms_players w where w.game_id = g and w.alive and public.ms_is_wolf(w.role) and w.id <> coalesce(nullif(gm.ctx->>'blocked','')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      and not exists (select 1 from public.ms_actions a where a.game_id = g and a.phase_no = gm.phase_no and a.player_id = w.id and a.kind = 'wolf_vote' and a.confirmed))
    and not exists (select 1 from public.ms_players c where c.game_id = g and c.alive and c.role = 'cupid' and gm.day_no = 1
      and not exists (select 1 from public.ms_actions a where a.game_id = g and a.phase_no = gm.phase_no and a.player_id = c.id and a.kind = 'cupid'));
end $$;

create or replace function public.ms_begin_night(g uuid, t timestamptz, min_hours numeric default 0) returns void
language plpgsql as $$
declare blk uuid;
begin
  -- Round 605 — whoever the Người bịt miệng silenced for the day can not use their ability this coming night
  select nullif(ctx->>'silenced','')::uuid into blk from public.ms_games where id = g;
  update public.ms_games set status = 'running', phase = 'night', stage = 1, phase_no = phase_no + 1, day_no = day_no + 1,
    phase_started_at = t, phase_ends_at = public.ms_next_hour(t, 0, min_hours),
    ctx = case when blk is not null then jsonb_build_object('blocked', blk) else '{}'::jsonb end where id = g;
  if blk is not null and exists (select 1 from public.ms_players where id = blk and alive) then
    perform public.ms_card(g, blk, 'info', '🤐 Đêm nay bạn bị bịt miệng', 'Người bịt miệng vẫn đang đè lên bạn: đêm nay bạn không thể dùng khả năng của mình. Hãy nghỉ ngơi — sáng mai mọi thứ trở lại bình thường.', t);
  end if;
end $$;

create or replace function public.ms_resolve_night(g uuid, t timestamptz) returns void
language plpgsql as $$
declare gm public.ms_games; victim uuid; saved boolean; poison uuid; deaths jsonb := '[]'::jsonb; gtgt uuid;
        wl text; a record; healed boolean; any_death boolean := false; elder_hit boolean := false;
        conv uuid; sil uuid; mates text; cnt int; tail_ text; w record; tg uuid;
begin
  select * into gm from public.ms_games where id = g;
  victim := nullif(gm.ctx->>'wolf_target','')::uuid;
  select target into gtgt from public.ms_actions where game_id = g and phase_no = gm.phase_no and kind = 'guard' limit 1;
  if gtgt is not null then update public.ms_players set state = state || jsonb_build_object('last_guard', gtgt) where game_id = g and role = 'guard'; end if;
  healed := coalesce((gm.ctx->>'heal')::boolean,false);
  saved := victim is not null and ((gtgt is not null and gtgt = victim) or healed);
  -- Round 589 — the Elder survives the first wolf bite (only if nobody else already saved them)
  if victim is not null and not saved and exists (select 1 from public.ms_players where id = victim and role = 'elder' and not coalesce((state->>'elder_used')::boolean, false)) then
    elder_hit := true; saved := true;
    update public.ms_players set state = state || '{"elder_used":true}'::jsonb where id = victim;
    perform public.ms_card(g, victim, 'info', '🧓 Bạn đã sống sót', 'Đêm qua bầy sói đã cắn bạn — nhưng người già dai sức, bạn vẫn đứng vững. Đừng lơ là: lần cắn thứ hai, hay một bình độc, sẽ kết thúc tất cả.', t);
  end if;
  poison := nullif(gm.ctx->>'poison','')::uuid;
  -- Round 595 — Sói nửa người: bitten (and not saved, not poisoned) = does not die, becomes a wolf (applied after the log below)
  if victim is not null and not saved and poison is distinct from victim
     and exists (select 1 from public.ms_players where id = victim and role = 'halfwolf') then
    conv := victim; saved := true;
  end if;
  if victim is not null and not saved then deaths := deaths || jsonb_build_array(jsonb_build_object('id', victim, 'reason', 'killed')); end if;
  if poison is not null and poison is distinct from victim then deaths := deaths || jsonb_build_array(jsonb_build_object('id', poison, 'reason', 'poisoned'));
  elsif poison is not null and victim = poison then
    if saved then deaths := deaths || jsonb_build_array(jsonb_build_object('id', poison, 'reason', 'poisoned'));
    else deaths := jsonb_set(deaths, '{0,reason}', '"poisoned"'); end if;
  end if;

  -- Round 595 — Sói trắng: the extra kill of an even night (guard / witch can not stop it)
  for a in select x.player_id, x.target from public.ms_actions x where x.game_id = g and x.phase_no = gm.phase_no and x.kind = 'wwolf' and x.target is not null loop
    if not exists (select 1 from jsonb_array_elements(deaths) d where (d->>'id')::uuid = a.target) then
      deaths := deaths || jsonb_build_array(jsonb_build_object('id', a.target, 'reason', 'killed'));
    end if;
    perform public.ms_log_add(g, gm.day_no, 'night', '🐺⚪ Sói trắng ' || public.ms_pn(a.player_id) || ' ra tay giết thêm ' || coalesce(public.ms_pn(a.target), '?') || '.');
  end loop;
  -- Round 595 — Người bịt miệng: the chosen player can not chat in the coming day
  select x.target into sil from public.ms_actions x where x.game_id = g and x.phase_no = gm.phase_no and x.kind = 'silence' and x.target is not null limit 1;
  if sil is not null then
    for a in select x.player_id from public.ms_actions x where x.game_id = g and x.phase_no = gm.phase_no and x.kind = 'silence' loop
      perform public.ms_log_add(g, gm.day_no, 'night', '🤐 Người bịt miệng ' || public.ms_pn(a.player_id) || ' bịt miệng ' || coalesce(public.ms_pn(sil), '?') || ' cho cả ngày hôm sau (và khoá khả năng của người đó đêm kế tiếp).');
    end loop;
    perform public.ms_card(g, sil, 'info', '🤐 Bạn bị bịt miệng', 'Ai đó đã bịt miệng bạn: cả ngày hôm nay bạn không thể nhắn trong phòng chat, và đêm kế tiếp bạn cũng không dùng được khả năng của mình. Bạn vẫn được bỏ phiếu — hãy dùng nó thật khéo.', t);
  end if;
  -- Round 595 — Người thổi sáo: enchant up to two players
  for a in select x.player_id, x.target, nullif(x.data->>'second','')::uuid as second from public.ms_actions x
           where x.game_id = g and x.phase_no = gm.phase_no and x.kind = 'whisper' loop
    for tg in select unnest(array[a.target, a.second]) loop
      if tg is not null then
        update public.ms_players set state = state || '{"enchanted":true}'::jsonb where id = tg;
        perform public.ms_card(g, tg, 'info', '🎶 Bạn đã nghe tiếng sáo', 'Một tiếng sáo ma mị vang lên trong đêm và bạn không thể cưỡng lại. Bạn đã bị mê hoặc — nhưng chưa ai biết kẻ thổi sáo là ai. Hãy cẩn thận.', t);
      end if;
    end loop;
    select count(*) into cnt from public.ms_players where game_id = g and alive and role <> 'whisperer' and not coalesce((state->>'enchanted')::boolean, false);
    perform public.ms_card(g, a.player_id, 'info', '🎶 Đêm ' || gm.day_no || ' — tiếng sáo', 'Bạn đã mê hoặc ' || coalesce(public.ms_pn(a.target), '?') || coalesce(' và ' || public.ms_pn(a.second), '') || '. Còn ' || cnt || ' người còn sống chưa bị mê hoặc.', t);
    perform public.ms_log_add(g, gm.day_no, 'night', '🎶 Người thổi sáo ' || public.ms_pn(a.player_id) || ' mê hoặc ' || coalesce(public.ms_pn(a.target), '?') || coalesce(' và ' || public.ms_pn(a.second), '') || ' (còn ' || cnt || ' người chưa bị mê hoặc).');
  end loop;
  -- log
  select string_agg(public.ms_pn(x.player_id) || ' → ' || coalesce(public.ms_pn(x.target), '?'), ', ' order by public.ms_pn(x.player_id)) into wl
  from public.ms_actions x where x.game_id = g and x.phase_no = gm.phase_no and x.kind = 'wolf_vote';
  perform public.ms_log_add(g, gm.day_no, 'night', '🐺 Bầy sói chọn: ' || coalesce(wl, 'không ai kịp chọn') || '. Mục tiêu chốt: ' || coalesce(public.ms_pn(victim), 'không có ai') || '.');
  for a in select player_id, target from public.ms_actions where game_id = g and phase_no = gm.phase_no and kind = 'guard' loop
    perform public.ms_log_add(g, gm.day_no, 'night', '🛡️ Bảo vệ ' || public.ms_pn(a.player_id) || ' che chở ' || coalesce(public.ms_pn(a.target), '?') || '.');
  end loop;
  for a in select x.player_id, x.target, (select role from public.ms_players where id = x.target) trole from public.ms_actions x
           where x.game_id = g and x.phase_no = gm.phase_no and x.kind = 'seer' loop
    perform public.ms_log_add(g, gm.day_no, 'night', '🔮 Tiên tri ' || public.ms_pn(a.player_id) || ' soi ' || coalesce(public.ms_pn(a.target), '?') || ' → ' || case when public.ms_is_wolf(a.trole) then 'là SÓI' else 'không phải sói' end || '.');
  end loop;
  for a in select x.player_id, x.target, x.data from public.ms_actions x where x.game_id = g and x.phase_no = gm.phase_no and x.kind = 'witch' loop
    perform public.ms_log_add(g, gm.day_no, 'night', '🧪 Phù thủy ' || public.ms_pn(a.player_id) || ' ' ||
      case when (a.data->>'heal') = 'true' then 'dùng bình cứu cho ' || coalesce(public.ms_pn(a.target), '?')
           when (a.data->>'poison') = 'true' then 'dùng bình độc cho ' || coalesce(public.ms_pn(a.target), '?')
           else 'không dùng bình nào' end || '.');
  end loop;
  if conv is not null then perform public.ms_log_add(g, gm.day_no, 'night', '🌗 ' || public.ms_pn(conv) || ' (Sói nửa người) bị bầy sói cắn — không chết, và từ nay là SÓI.'); end if;
  if victim is not null and saved and conv is null then
    perform public.ms_log_add(g, gm.day_no, 'night', '✅ ' || public.ms_pn(victim) || ' thoát chết' ||
      case when elder_hit then ' (Già làng chịu được nhát cắn đầu tiên)' when gtgt is not null and gtgt = victim and healed then ' (được Bảo vệ che chở và cả Phù thủy cứu)'
           when gtgt is not null and gtgt = victim then ' (nhờ Bảo vệ che chở)' else ' (nhờ Phù thủy cứu)' end || '.');
  end if;
  for a in select (e->>'id')::uuid id, e->>'reason' reason from jsonb_array_elements(deaths) e loop
    any_death := true;
    perform public.ms_log_add(g, gm.day_no, 'night', '💀 ' || public.ms_pn(a.id) || ' ' || case a.reason when 'poisoned' then 'bị Phù thủy đầu độc' else 'bị bầy sói cắn chết' end || '.');
  end loop;
  if not any_death then perform public.ms_log_add(g, gm.day_no, 'night', '🌅 Đêm này không ai chết.'); end if;

  -- apply the half-wolf's change now (after the log, so the Seer's line above still matches what the Seer was told)
  if conv is not null and not exists (select 1 from jsonb_array_elements(deaths) d where (d->>'id')::uuid = conv) then
    update public.ms_players set role = 'wolf', state = state || '{"was_half":true}'::jsonb where id = conv;
    select string_agg(name, ', ' order by name) into mates from public.ms_players where game_id = g and alive and public.ms_is_wolf(role);
    perform public.ms_card(g, conv, 'role', '🐺 Bạn đã bị cắn — từ nay bạn là SÓI', 'Đêm qua bầy sói cắn bạn, nhưng dòng máu sói trong bạn thức tỉnh: bạn không chết. Từ giờ bạn đứng về phía bầy sói và cùng chọn nạn nhân mỗi đêm. Bầy sói: ' || mates || '.', t);
    for w in select id from public.ms_players where game_id = g and alive and public.ms_is_wolf(role) and id <> conv loop
      perform public.ms_card(g, w.id, 'info', '🐺 Bầy có thêm một thành viên', public.ms_pn(conv) || ' vừa bị cắn và đã thức tỉnh dòng máu sói — từ nay là đồng bọn của bạn.', t);
    end loop;
  end if;
  update public.ms_games set ctx = ctx || jsonb_build_object('deaths', deaths, 'source', 'night', 'silenced', sil) where id = g;
  perform public.ms_commit(g, t);
end $$;

create or replace function public.ms_commit(g uuid, t timestamptz) returns void
language plpgsql as $$
declare gm public.ms_games; ids uuid[]; hid uuid; src text; story text; win text; lynched uuid; votes text; dj jsonb; e jsonb; partner uuid;
        hb uuid[]; others uuid[]; idiot uuid;
begin
  select * into gm from public.ms_games where id = g;
  src := gm.ctx->>'source';
  dj := coalesce(gm.ctx->'deaths','[]'::jsonb);
  -- a lover dies of heartbreak when the other one dies (also covers a hunter's shot)
  for e in select x.value from jsonb_array_elements(dj) x loop
    partner := public.ms_lover_of((e->>'id')::uuid);   -- Round 605 — state, or Cupid's recorded pairing
    if partner is not null and exists (select 1 from public.ms_players where id = partner and alive)
       and not exists (select 1 from jsonb_array_elements(dj) y where (y.value->>'id')::uuid = partner) then
      dj := dj || jsonb_build_array(jsonb_build_object('id', partner, 'reason', 'heartbreak'));
      perform public.ms_log_add(g, gm.day_no, case when src = 'night' then 'night' else 'day' end,
        '💘 ' || coalesce(public.ms_pn(partner), '?') || ' chết theo người yêu ' || coalesce(public.ms_pn((e->>'id')::uuid), '?') || '.');
    end if;
  end loop;
  update public.ms_games set ctx = ctx || jsonb_build_object('deaths', dj) where id = g;
  select * into gm from public.ms_games where id = g;
  -- mark everybody in ctx.deaths dead
  update public.ms_players p set alive = false, out_reason = x.reason
  from (select (e2->>'id')::uuid id, e2->>'reason' reason from jsonb_array_elements(coalesce(gm.ctx->'deaths','[]'::jsonb)) e2) x
  where p.id = x.id and p.alive;
  -- a dead hunter (not poisoned) gets one shot
  select p.id into hid from public.ms_players p
  where p.game_id = g and p.role = 'hunter' and not p.alive and p.out_reason in ('killed','lynched','heartbreak')
    and exists (select 1 from jsonb_array_elements(coalesce(gm.ctx->'deaths','[]'::jsonb)) e3 where (e3->>'id')::uuid = p.id)
    and coalesce((gm.ctx->>'hunter_done')::boolean, false) = false
    and exists (select 1 from public.ms_players q where q.game_id = g and q.alive);
  if hid is not null and coalesce(public.ms_win_check(g), '') <> 'village' then   -- the shot comes BEFORE the win check: it can change the outcome
    update public.ms_games set phase = 'hunter', stage = 1, phase_no = phase_no + 1, phase_started_at = t, phase_ends_at = t + interval '1 hour',
      ctx = gm.ctx || jsonb_build_object('hunter_id', hid) where id = g;
    perform public.ms_card(g, hid, 'hunter', '🏹 Phát súng cuối cùng',
      'Bạn đã ngã xuống, nhưng khẩu súng vẫn còn trong tay. Hãy chọn một người để bắn trước khi ánh sáng tắt hẳn (bạn có 1 giờ).', t);
    return;
  end if;
  -- publish the story for this resolution
  select array_agg((x.value->>'id')::uuid order by x.ord) into ids from jsonb_array_elements(coalesce(gm.ctx->'deaths','[]'::jsonb)) with ordinality as x(value, ord);
  select array_agg((x.value->>'id')::uuid) into hb from jsonb_array_elements(coalesce(gm.ctx->'deaths','[]'::jsonb)) x where x.value->>'reason' = 'heartbreak';
  if src = 'night' then
    if ids is null or array_length(ids,1) = 0 then story := public.ms_tpl('night_peace');
    elsif array_length(ids,1) = 1 then story := public.ms_tpl('night_death1', public.ms_names(ids));
    else story := public.ms_tpl('night_deathN', '', public.ms_names(ids)); end if;
    if hb is not null then story := story || E'\n\n' || public.ms_tpl('lover_death', '', public.ms_names(hb)); end if;
    perform public.ms_card(g, null, 'story', '🌅 Ngày ' || gm.day_no || ' — Bình minh', story, t);
  else
    lynched := nullif(gm.ctx->>'lynched','')::uuid;
    idiot := nullif(gm.ctx->>'idiot','')::uuid;
    if idiot is not null then story := public.ms_tpl('day_idiot', public.ms_names(array[idiot]));
    elsif lynched is null then story := public.ms_tpl('day_none');
    else
      story := public.ms_tpl('day_lynch', public.ms_names(array[lynched]));
      select array(select i from unnest(ids) i where i <> lynched and not (i = any(coalesce(hb, '{}'::uuid[])))) into others;
      if cardinality(others) > 0 then story := story || E'\n\n' || public.ms_tpl('shot_extra', public.ms_names(others)); end if;
      if hb is not null then story := story || E'\n\n' || public.ms_tpl('lover_death', '', public.ms_names(hb)); end if;
    end if;
    votes := coalesce(gm.ctx->>'votes','');
    if votes <> '' then story := story || E'\n\nPhiếu bầu: ' || votes; end if;
    perform public.ms_card(g, null, 'story', '⚖️ Ngày ' || gm.day_no || ' — Kết quả bỏ phiếu', story, t);
  end if;
  win := public.ms_win_check(g);
  if win is not null then perform public.ms_finish(g, win, t); return; end if;
  if src = 'night' then perform public.ms_begin_day(g, t); else perform public.ms_begin_night(g, t, 0); end if;
end $$;

create or replace function public.ms_finish(g uuid, win text, t timestamptz) returns void
language plpgsql as $$
declare lst text; tl text := ''; r record; last_key text := ''; fl boolean;
begin
  select string_agg(name || ' — ' || public.ms_role_vi(role) || ' · ' ||
    case when alive then 'còn sống' else case out_reason when 'killed' then 'bị sói cắn' when 'poisoned' then 'bị đầu độc' when 'lynched' then 'bị làng trục xuất'
      when 'shot' then 'bị thợ săn bắn' when 'heartbreak' then 'chết theo người yêu' when 'left' then 'rời làng' else 'đã chết' end end,
    E'\n' order by public.ms_is_wolf(role) desc, name) into lst
  from public.ms_players where game_id = g;
  fl := win = 'village' and exists (select 1 from public.ms_players where game_id = g and alive and role = 'whisperer')
    and public.ms_win_check_wolves(g) > 0;
  update public.ms_games set status = 'finished', finished_at = t, winner = win, phase_ends_at = null where id = g;
  perform public.ms_card(g, null, 'final',
    case win when 'wolves' then '🐺 Bầy sói chiến thắng' when 'village' then '🏡 Dân làng chiến thắng' when 'couple' then '💘 Cặp đôi chiến thắng' else 'Ván chơi đã kết thúc' end,
    case win when 'wolves' then 'Tiếng tru vang khắp thung lũng. Khi số sói đã ngang với số người còn lại, ngôi làng không còn nơi nào để trốn.'
             when 'village' then case when fl then 'Tiếng sáo vang lên đêm này qua đêm khác, và cuối cùng không ai còn đủ tỉnh táo để chống lại nó. Người thổi sáo đã dẫn cả làng vào giấc mơ — dân làng thắng, theo cách kỳ lạ nhất.'
                                       else 'Con sói cuối cùng đã bị lộ mặt. Sau bao đêm kinh hoàng, ngôi làng lại được đón một bình minh thật sự.' end
             when 'couple' then 'Giữa cuộc chiến của sói và người, có hai trái tim đã chọn nhau hơn là chọn phe. Khi tiếng tru lặng đi và ngôi làng chỉ còn là tàn tro, hai người là những kẻ cuối cùng còn đứng đó — cùng nhau.'
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

create or replace function public.ms_start(p_profile uuid, p_force boolean default false) returns jsonb
language plpgsql as $$
declare gid uuid; gm public.ms_games; n int; wolves int; roles text[]; ids uuid[]; i int; pid uuid; r text; mates text; wnames text; t timestamptz := now();
begin
  gid := public.ms_active();
  if gid is null then return jsonb_build_object('error','Chưa có ván chơi nào.'); end if;
  select * into gm from public.ms_games where id = gid for update;
  if gm.status <> 'lobby' then return jsonb_build_object('error','Ván chơi đã bắt đầu.'); end if;
  if p_force and not public.ms_is_staff_dev(p_profile) then return jsonb_build_object('error','Chỉ admin/dev mới bắt đầu sớm.'); end if;
  select count(*) into n from public.ms_players where game_id = gid;
  if n < 4 then return jsonb_build_object('error','Cần ít nhất 4 người để bắt đầu.'); end if;
  if n > 30 then return jsonb_build_object('error','Tối đa 30 người.'); end if;
  wolves := greatest(1, n / 3);
  roles := array[]::text[];
  for i in 1..wolves loop roles := array_append(roles, case when i = 1 and n >= 8 then 'whitewolf' else 'wolf' end); end loop;
  for r in select unnest(array['seer','witch','hunter']) loop
    if cardinality(roles) < n - 1 then roles := array_append(roles, r); end if;
  end loop;
  -- optional roles: random pick for the places left, always keeping at least n/4 (min 1) plain villagers
  for r in select x from unnest(case when n >= 9 then array['guard','cupid','idiot','silencer','whisperer','halfwolf'] else array['guard','cupid','idiot','silencer','whisperer'] end) x order by random() loop
    if cardinality(roles) < n - greatest(1, n / 4) and n >= 7 then roles := array_append(roles, r); end if;
  end loop;
  while cardinality(roles) < n loop roles := array_append(roles, 'villager'); end loop;
  select array_agg(id order by random()) into ids from public.ms_players where game_id = gid;
  for i in 1..n loop update public.ms_players set role = roles[i] where id = ids[i]; end loop;
  select string_agg(name, ', ' order by name) into wnames from public.ms_players where game_id = gid and public.ms_is_wolf(role);
  for pid, r in select id, role from public.ms_players where game_id = gid loop
    perform public.ms_card(gid, pid, 'role',
      case r when 'wolf' then '🐺 Bạn là SÓI' when 'villager' then '🧑‍🌾 Bạn là DÂN LÀNG' when 'seer' then '🔮 Bạn là TIÊN TRI'
             when 'witch' then '🧪 Bạn là PHÙ THỦY' when 'hunter' then '🏹 Bạn là THỢ SĂN' when 'guard' then '🛡️ Bạn là BẢO VỆ' when 'cupid' then '💘 Bạn là THẦN TÌNH YÊU' when 'idiot' then '🤡 Bạn là KẺ NGỐC' when 'elder' then '🧓 Bạn là GIÀ LÀNG'
             when 'whitewolf' then '🐺⚪ Bạn là SÓI TRẮNG' when 'halfwolf' then '🌗 Bạn là NỬA NGƯỜI NỬA SÓI'
             when 'silencer' then '🤐 Bạn là NGƯỜI BỊT MIỆNG' when 'whisperer' then '🎶 Bạn là NGƯỜI THỔI SÁO' end,
      case r
        when 'wolf' then 'Mỗi đêm, cả bầy cùng chọn một người để cắn — mọi con sói phải bấm xác nhận thì lựa chọn mới được tính. Ban ngày hãy giả làm dân làng. Đồng bọn của bạn: ' || wnames || '.'
        when 'villager' then 'Bạn không có sức mạnh đặc biệt, chỉ có đôi mắt và lá phiếu. Hãy lắng nghe, nghi ngờ đúng người và bỏ phiếu tìm ra bầy sói.'
        when 'seer' then 'Mỗi đêm bạn soi một người và biết ngay người đó có phải Sói hay không. Dùng thông tin này thật khéo — nói quá sớm, bạn sẽ là mục tiêu.'
        when 'witch' then 'Bạn có 1 bình cứu và 1 bình độc, mỗi bình chỉ dùng một lần, mỗi đêm dùng tối đa một bình. Bạn sẽ biết ai bị sói nhắm tới mỗi đêm.'
        when 'hunter' then 'Khi bạn chết (trừ khi bị đầu độc), bạn được bắn chết một người. Hãy chọn thật kỹ.'
        when 'guard' then 'Mỗi đêm bạn bảo vệ một người (kể cả bản thân) khỏi nanh sói. Không được bảo vệ cùng một người hai đêm liên tiếp.'
        when 'cupid' then 'Chỉ trong đêm đầu tiên, bạn chọn hai người (có thể gồm cả bản thân) để kết đôi. Hai người đó sẽ biết nhau; nếu một người chết, người kia đau lòng chết theo. Sau đêm đầu bạn là một dân làng bình thường, hãy bảo vệ cặp đôi của mình.'
        when 'idiot' then 'Nếu làng bỏ phiếu trục xuất bạn lần đầu, bạn được tha — nhưng vai trò của bạn bị lộ và bạn mất quyền bỏ phiếu. Bị sói cắn hay bị trục xuất lần thứ hai thì bạn vẫn chết.'
        when 'whitewolf' then 'Bạn thuộc bầy sói: cùng chọn nạn nhân mỗi đêm. Đồng bọn của bạn: ' || wnames || '. Ngoài ra, vào các đêm CHẴN (đêm 2, 4, 6…) bạn được giết thêm một người bất kỳ — sói hay dân, hoặc bỏ qua. Bảo vệ và Phù thủy không cứu được nhát này. Tiên tri sẽ thấy bạn là sói.'
        when 'halfwolf' then 'Bạn khởi đầu như một dân làng bình thường — Tiên tri soi bạn sẽ thấy "không phải sói". Nhưng trong bạn có dòng máu sói: nếu bầy sói cắn bạn, bạn KHÔNG chết mà thức tỉnh thành sói và gia nhập bầy. Cho đến lúc đó bạn thuộc về dân làng.'
        when 'silencer' then 'Mỗi đêm bạn chọn một người: cả ngày hôm sau người đó không thể nhắn trong phòng chat (vẫn được bỏ phiếu). Hãy bịt miệng người nói nhiều nhất — hoặc người bạn nghi nhất. Bạn thuộc phe dân làng. Người bị chọn còn bị khoá khả năng của mình ở đêm kế tiếp.'
        when 'whisperer' then 'Mỗi đêm bạn thổi sáo mê hoặc hai người (chỉ bạn biết). Khi mọi người còn sống, trừ bạn, đều đã bị mê hoặc, dân làng thắng ngay lập tức. Hãy sống sót và giấu mình thật kỹ. Bạn thuộc phe dân làng.'
        when 'elder' then 'Bạn chịu được nhát cắn đầu tiên của bầy sói (bạn sẽ không được báo trước). Nhưng bình độc, lá phiếu trục xuất hay nhát cắn thứ hai vẫn hạ gục bạn.'
      end, t);
  end loop;
  perform public.ms_card(gid, null, 'info', '🌙 Làng bắt đầu ván chơi', 'Có ' || n || ' người trong làng, trong đó ' || wolves || ' là sói. Đêm đầu tiên đã buông xuống — hãy kiểm tra thẻ vai trò của bạn.', t);
  update public.ms_games set started_at = t where id = gid;
  perform public.ms_begin_night(gid, t, 6);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ms_act(p_profile uuid, p_kind text, p_target uuid default null, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql as $$
declare gid uuid; gm public.ms_games; me public.ms_players; tp public.ms_players; wolf_target uuid; res text; sec uuid; sp public.ms_players; cands int;
begin
  gid := public.ms_active();
  if gid is null then return jsonb_build_object('error','Chưa có ván chơi.'); end if;
  perform public.ms_advance(gid);
  select * into gm from public.ms_games where id = gid for update;
  if gm.status <> 'running' then return jsonb_build_object('error', case when gm.status = 'paused' then 'Ván chơi đang tạm nghỉ.' else 'Ván chơi chưa chạy.' end); end if;
  select * into me from public.ms_players where game_id = gid and profile_id = p_profile;
  if me.id is null or (not me.alive and not (p_kind = 'hunter' and gm.phase = 'hunter' and (gm.ctx->>'hunter_id')::uuid = me.id)) then return jsonb_build_object('error','Bạn không còn trong cuộc.'); end if;
  if p_target is not null then
    select * into tp from public.ms_players where id = p_target and game_id = gid and alive;
    if tp.id is null then return jsonb_build_object('error','Mục tiêu không hợp lệ.'); end if;
  end if;

  -- Round 605 — the player the Người bịt miệng silenced can not use their ability this night
  if gm.phase = 'night' and nullif(gm.ctx->>'blocked','')::uuid = me.id then
    return jsonb_build_object('error','Bạn đang bị bịt miệng — đêm nay bạn không thể dùng khả năng.');
  end if;

  if p_kind = 'wolf_vote' or p_kind = 'wolf_confirm' then
    if not (gm.phase = 'night' and gm.stage = 1 and public.ms_is_wolf(me.role)) then return jsonb_build_object('error','Lúc này bạn không thể làm việc đó.'); end if;
    if p_kind = 'wolf_vote' then
      if p_target is null or public.ms_is_wolf(tp.role) then return jsonb_build_object('error','Hãy chọn một người không phải sói.'); end if;
      insert into public.ms_actions (game_id, phase_no, player_id, kind, target, confirmed) values (gid, gm.phase_no, me.id, 'wolf_vote', p_target, false)
        on conflict (game_id, phase_no, player_id, kind) do update set target = excluded.target, confirmed = false, created_at = now();
    else
      update public.ms_actions set confirmed = true where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'wolf_vote';
      if not found then return jsonb_build_object('error','Hãy chọn mục tiêu trước khi xác nhận.'); end if;
    end if;
  elsif p_kind = 'seer' then
    if not (gm.phase = 'night' and me.role = 'seer') then return jsonb_build_object('error','Lúc này bạn không thể soi.'); end if;
    if p_target is null or p_target = me.id then return jsonb_build_object('error','Hãy chọn một người khác.'); end if;
    if exists (select 1 from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'seer') then return jsonb_build_object('error','Đêm nay bạn đã soi rồi.'); end if;
    insert into public.ms_actions (game_id, phase_no, player_id, kind, target) values (gid, gm.phase_no, me.id, 'seer', p_target);
    perform public.ms_card(gid, me.id, 'seer', '🔮 Kết quả soi đêm ' || gm.day_no,
      tp.name || case when public.ms_is_wolf(tp.role) then ' là SÓI.' else ' KHÔNG phải sói.' end, now());
  elsif p_kind = 'guard' then
    if not (gm.phase = 'night' and me.role = 'guard') then return jsonb_build_object('error','Lúc này bạn không thể bảo vệ.'); end if;
    if p_target is null then return jsonb_build_object('error','Hãy chọn một người.'); end if;
    if (me.state->>'last_guard')::uuid = p_target then return jsonb_build_object('error','Không được bảo vệ cùng một người hai đêm liên tiếp.'); end if;
    if exists (select 1 from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'guard') then return jsonb_build_object('error','Đêm nay bạn đã chọn rồi.'); end if;
    insert into public.ms_actions (game_id, phase_no, player_id, kind, target) values (gid, gm.phase_no, me.id, 'guard', p_target);
  elsif p_kind = 'witch' then
    if not (gm.phase = 'night' and gm.stage = 2 and me.role = 'witch' and coalesce((gm.ctx->>'witch_in')::boolean,false)) then return jsonb_build_object('error','Chưa đến lượt bạn.'); end if;
    if exists (select 1 from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'witch') then return jsonb_build_object('error','Đêm nay bạn đã quyết định rồi.'); end if;
    wolf_target := nullif(gm.ctx->>'wolf_target','')::uuid;
    if coalesce((p_data->>'heal')::boolean,false) then
      if coalesce((me.state->>'heal_used')::boolean,false) then return jsonb_build_object('error','Bạn đã dùng bình cứu rồi.'); end if;
      if wolf_target is null then return jsonb_build_object('error','Không có ai để cứu.'); end if;
      update public.ms_players set state = state || '{"heal_used":true}' where id = me.id;
      update public.ms_games set ctx = ctx || '{"heal":true}' where id = gid;
      insert into public.ms_actions (game_id, phase_no, player_id, kind, target, data) values (gid, gm.phase_no, me.id, 'witch', wolf_target, '{"heal":true}');
    elsif coalesce((p_data->>'poison')::boolean,false) then
      if coalesce((me.state->>'poison_used')::boolean,false) then return jsonb_build_object('error','Bạn đã dùng bình độc rồi.'); end if;
      if p_target is null or p_target = me.id then return jsonb_build_object('error','Hãy chọn một người khác để đầu độc.'); end if;
      update public.ms_players set state = state || '{"poison_used":true}' where id = me.id;
      update public.ms_games set ctx = ctx || jsonb_build_object('poison', p_target) where id = gid;
      insert into public.ms_actions (game_id, phase_no, player_id, kind, target, data) values (gid, gm.phase_no, me.id, 'witch', p_target, '{"poison":true}');
    else
      insert into public.ms_actions (game_id, phase_no, player_id, kind, target, data) values (gid, gm.phase_no, me.id, 'witch', null, '{"skip":true}');
    end if;
  elsif p_kind = 'cupid' then
    if not (gm.phase = 'night' and gm.stage = 1 and gm.day_no = 1 and me.role = 'cupid') then return jsonb_build_object('error','Lúc này bạn không thể kết đôi.'); end if;
    if exists (select 1 from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'cupid') then return jsonb_build_object('error','Bạn đã kết đôi rồi.'); end if;
    sec := nullif(p_data->>'second','')::uuid;
    if p_target is null or sec is null or sec = p_target then return jsonb_build_object('error','Hãy chọn hai người khác nhau.'); end if;
    select * into sp from public.ms_players where id = sec and game_id = gid and alive;
    if sp.id is null then return jsonb_build_object('error','Mục tiêu không hợp lệ.'); end if;
    insert into public.ms_actions (game_id, phase_no, player_id, kind, target, data) values (gid, gm.phase_no, me.id, 'cupid', p_target, jsonb_build_object('second', sec));
    update public.ms_players set state = state || jsonb_build_object('lover', sec) where id = p_target;
    update public.ms_players set state = state || jsonb_build_object('lover', p_target) where id = sec;
    perform public.ms_card(gid, p_target, 'lover', '💘 Bạn đã trúng mũi tên Thần Tình Yêu', 'Người yêu của bạn là ' || sp.name || '. Hai người biết nhau, và nếu một người chết, người kia sẽ chết theo. Hãy bảo vệ nhau — nhưng đừng để lộ quá sớm.', now());
    perform public.ms_card(gid, sec, 'lover', '💘 Bạn đã trúng mũi tên Thần Tình Yêu', 'Người yêu của bạn là ' || tp.name || '. Hai người biết nhau, và nếu một người chết, người kia sẽ chết theo. Hãy bảo vệ nhau — nhưng đừng để lộ quá sớm.', now());
    if me.id <> p_target and me.id <> sec then
      perform public.ms_card(gid, me.id, 'lover', '💘 Cặp đôi của bạn', 'Bạn đã kết đôi ' || tp.name || ' và ' || sp.name || '.', now());
    end if;
    if public.ms_is_wolf((select role from public.ms_players where id = p_target)) <> public.ms_is_wolf(sp.role) then   -- Round 605 — a couple from both sides
      perform public.ms_card(gid, p_target, 'lover', '🥀 Hai phe, một trái tim', 'Hai người đứng ở hai phe đối địch. Từ giờ, hai người chỉ thắng khi CẢ HAI là những người cuối cùng còn sống — mọi người khác (kể cả đồng đội cũ) đều phải gục ngã. Nếu một người chết, người kia chết theo.', now());
      perform public.ms_card(gid, sec, 'lover', '🥀 Hai phe, một trái tim', 'Hai người đứng ở hai phe đối địch. Từ giờ, hai người chỉ thắng khi CẢ HAI là những người cuối cùng còn sống — mọi người khác (kể cả đồng đội cũ) đều phải gục ngã. Nếu một người chết, người kia chết theo.', now());
    end if;
    perform public.ms_log_add(gid, gm.day_no, 'night', '💘 Thần Tình Yêu ' || me.name || ' kết đôi ' || tp.name || ' và ' || sp.name || '.');
  elsif p_kind = 'wwolf' then
    if not (gm.phase = 'night' and me.role = 'whitewolf' and gm.day_no % 2 = 0) then return jsonb_build_object('error','Lúc này bạn không thể ra tay.'); end if;
    if exists (select 1 from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'wwolf') then return jsonb_build_object('error','Đêm nay bạn đã quyết định rồi.'); end if;
    if p_target = me.id then return jsonb_build_object('error','Hãy chọn một người khác.'); end if;
    insert into public.ms_actions (game_id, phase_no, player_id, kind, target, data) values (gid, gm.phase_no, me.id, 'wwolf', p_target, case when p_target is null then '{"skip":true}'::jsonb else '{}'::jsonb end);
  elsif p_kind = 'silence' then
    if not (gm.phase = 'night' and me.role = 'silencer') then return jsonb_build_object('error','Lúc này bạn không thể bịt miệng.'); end if;
    if p_target is null or p_target = me.id then return jsonb_build_object('error','Hãy chọn một người khác.'); end if;
    if exists (select 1 from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'silence') then return jsonb_build_object('error','Đêm nay bạn đã chọn rồi.'); end if;
    insert into public.ms_actions (game_id, phase_no, player_id, kind, target) values (gid, gm.phase_no, me.id, 'silence', p_target);
  elsif p_kind = 'whisper' then
    if not (gm.phase = 'night' and me.role = 'whisperer') then return jsonb_build_object('error','Lúc này bạn không thể thổi sáo.'); end if;
    if exists (select 1 from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'whisper') then return jsonb_build_object('error','Đêm nay bạn đã thổi sáo rồi.'); end if;
    sec := nullif(p_data->>'second','')::uuid;
    select count(*) into cands from public.ms_players where game_id = gid and alive and id <> me.id and not coalesce((state->>'enchanted')::boolean, false);
    if p_target is null or p_target = me.id or tp.role is null or coalesce((tp.state->>'enchanted')::boolean, false) then return jsonb_build_object('error','Hãy chọn một người chưa bị mê hoặc.'); end if;
    if sec is not null then
      select * into sp from public.ms_players where id = sec and game_id = gid and alive;
      if sp.id is null or sec = p_target or sec = me.id or coalesce((sp.state->>'enchanted')::boolean, false) then return jsonb_build_object('error','Người thứ hai không hợp lệ.'); end if;
    elsif cands >= 2 then return jsonb_build_object('error','Hãy chọn đủ hai người.');
    end if;
    insert into public.ms_actions (game_id, phase_no, player_id, kind, target, data) values (gid, gm.phase_no, me.id, 'whisper', p_target, case when sec is null then '{}'::jsonb else jsonb_build_object('second', sec) end);
  elsif p_kind = 'vote' then
    if gm.phase not in ('day','runoff') then return jsonb_build_object('error','Chưa đến giờ bỏ phiếu.'); end if;
    if coalesce((me.state->>'revealed')::boolean, false) then return jsonb_build_object('error','Bạn đã lộ vai Kẻ ngốc nên không còn quyền bỏ phiếu.'); end if;
    if p_target is not null then
      if p_target = me.id then return jsonb_build_object('error','Không thể tự bỏ phiếu cho mình.'); end if;
      if gm.phase = 'runoff' and not (gm.ctx->'runoff') @> to_jsonb(p_target::text) then return jsonb_build_object('error','Chỉ được chọn trong những người hoà phiếu.'); end if;
    end if;
    insert into public.ms_actions (game_id, phase_no, player_id, kind, target) values (gid, gm.phase_no, me.id, 'vote', p_target)
      on conflict (game_id, phase_no, player_id, kind) do update set target = excluded.target, created_at = now();
  elsif p_kind = 'hunter' then
    if not (gm.phase = 'hunter' and (gm.ctx->>'hunter_id')::uuid = me.id) then return jsonb_build_object('error','Lúc này bạn không thể bắn.'); end if;
    insert into public.ms_actions (game_id, phase_no, player_id, kind, target) values (gid, gm.phase_no, me.id, 'hunter', p_target)
      on conflict (game_id, phase_no, player_id, kind) do update set target = excluded.target;
  else
    return jsonb_build_object('error','Hành động không hợp lệ.');
  end if;
  perform public.ms_advance(gid);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ms_state(p_profile uuid) returns jsonb
language plpgsql as $$
declare gid uuid; gm public.ms_games; me public.ms_players; pr jsonb := 'null'::jsonb; players jsonb; cards jsonb; wolves jsonb := '[]'::jsonb;
        exp_n int := 0; ans_n int := 0; opts jsonb; mine public.ms_actions; wt uuid; dev boolean; waiting jsonb := 'null'::jsonb; wl jsonb;
begin
  dev := public.ms_is_staff_dev(p_profile);
  gid := public.ms_active();
  if gid is null then
    select * into gm from public.ms_games order by created_at desc limit 1;
    if gm.id is null then return jsonb_build_object('now', now(), 'game', null, 'dev', dev); end if;
    gid := gm.id;
  end if;
  perform public.ms_advance(gid);
  select * into gm from public.ms_games where id = gid;
  select * into me from public.ms_players where game_id = gid and profile_id = p_profile;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'alive', alive, 'role', case when gm.status = 'finished' then role end, 'revealed', coalesce((state->>'revealed')::boolean, false)) order by joined_at), '[]') into players
  from public.ms_players where game_id = gid;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'title', title, 'body', body, 'at', created_at) order by created_at desc, id), '[]') into cards
  from (select * from public.ms_cards where game_id = gid and (player_id is null or player_id = me.id) order by created_at desc limit 80) c;

  if gm.status = 'running' or gm.status = 'paused' then
    select count(*) into exp_n from public.ms_expected(gid);
    select count(*) into ans_n from public.ms_expected(gid) e(id) where exists
      (select 1 from public.ms_actions a where a.game_id = gid and a.phase_no = gm.phase_no and a.player_id = e.id and (a.kind <> 'wolf_vote' or a.confirmed));
  end if;

  if me.id is not null and gm.status = 'running' then
    if gm.phase = 'hunter' and (gm.ctx->>'hunter_id')::uuid = me.id then
      select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'hunter';
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and alive;
      pr := jsonb_build_object('type','hunter','options',opts,'done',mine.id is not null);
    elsif not me.alive then pr := jsonb_build_object('type','dead');
    elsif gm.phase = 'night' then
      if nullif(gm.ctx->>'blocked','')::uuid = me.id then pr := jsonb_build_object('type','sleep','blocked',true);   -- Round 605
      elsif public.ms_is_wolf(me.role) and gm.stage = 1 then
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'wolf_vote';
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and alive and not public.ms_is_wolf(role);
        select coalesce(jsonb_agg(jsonb_build_object('name', w.name, 'vote', (select t.name from public.ms_players t where t.id = a.target), 'confirmed', coalesce(a.confirmed,false), 'me', w.id = me.id) order by w.name), '[]') into wolves
        from public.ms_players w left join public.ms_actions a on a.player_id = w.id and a.phase_no = gm.phase_no and a.kind = 'wolf_vote'
        where w.game_id = gid and w.alive and public.ms_is_wolf(w.role);
        pr := jsonb_build_object('type','wolf','options',opts,'my_vote',mine.target,'my_confirmed',coalesce(mine.confirmed,false),'wolves',wolves);
        if me.role = 'whitewolf' and gm.day_no % 2 = 0 then   -- Round 595 — the extra kill, offered next to the pack vote
          select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'wwolf';
          select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and alive and id <> me.id;
          pr := pr || jsonb_build_object('ww', jsonb_build_object('options', opts, 'done', mine.id is not null, 'target', mine.target));
        end if;
      elsif me.role = 'cupid' and gm.stage = 1 and gm.day_no = 1 then
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'cupid';
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and alive;
        pr := jsonb_build_object('type','cupid','options',opts,'done',mine.id is not null);
      elsif me.role = 'whitewolf' and gm.day_no % 2 = 0 then   -- stage 2: the pack is locked in, the extra kill may still be open
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'wwolf';
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and alive and id <> me.id;
        pr := jsonb_build_object('type','whitewolf','options',opts,'done',mine.id is not null,'target',mine.target);
      elsif me.role = 'silencer' then
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'silence';
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and alive and id <> me.id;
        pr := jsonb_build_object('type','silencer','options',opts,'done',mine.id is not null);
      elsif me.role = 'whisperer' then
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'whisper';
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players
          where game_id = gid and alive and id <> me.id and not coalesce((state->>'enchanted')::boolean, false);
        pr := jsonb_build_object('type','whisperer','options',opts,'done',mine.id is not null,
          'left', (select count(*) from public.ms_players where game_id = gid and alive and id <> me.id and not coalesce((state->>'enchanted')::boolean, false)));
      elsif me.role = 'seer' then
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'seer';
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and alive and id <> me.id;
        pr := jsonb_build_object('type','seer','options',opts,'done',mine.id is not null);
      elsif me.role = 'guard' then
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'guard';
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players
          where game_id = gid and alive and (me.state->>'last_guard' is null or id <> (me.state->>'last_guard')::uuid);
        pr := jsonb_build_object('type','guard','options',opts,'done',mine.id is not null);
      elsif me.role = 'witch' and gm.stage = 2 and coalesce((gm.ctx->>'witch_in')::boolean,false) then
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'witch';
        wt := nullif(gm.ctx->>'wolf_target','')::uuid;
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and alive and id <> me.id;
        pr := jsonb_build_object('type','witch','done',mine.id is not null,'victim',(select name from public.ms_players where id = wt),
          'can_heal', wt is not null and not coalesce((me.state->>'heal_used')::boolean,false),
          'can_poison', not coalesce((me.state->>'poison_used')::boolean,false), 'options', opts);
      else pr := jsonb_build_object('type','sleep'); end if;
    elsif gm.phase in ('day','runoff') then
      select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'vote';
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players
        where game_id = gid and alive and id <> me.id and (gm.phase = 'day' or (gm.ctx->'runoff') @> to_jsonb(id::text));
      pr := jsonb_build_object('type','vote','options',opts,'voted',mine.id is not null,'my_vote',mine.target,'runoff',gm.phase = 'runoff');
      if coalesce((me.state->>'revealed')::boolean, false) then pr := jsonb_build_object('type','mute'); end if;
    elsif gm.phase = 'hunter' then pr := jsonb_build_object('type','wait');
    end if;
  end if;

  -- Round 586 — who is still to answer, WITHOUT saying how anybody answered.
  --   day / runoff : alive players see the NAMES that have not voted yet
  --   night        : wolves see their pack (who has confirmed); everybody else sees only the ROLES (not names) still to act
  --   hunter shot  : everybody sees "Thợ săn"
  if me.id is not null and gm.status = 'running' then
    if gm.phase in ('day','runoff') then
      if me.alive then
        select coalesce(jsonb_agg(p.name order by p.name), '[]') into wl from public.ms_players p
        where p.game_id = gid and p.id in (select e from public.ms_expected(gid) e)
          and not exists (select 1 from public.ms_actions a where a.game_id = gid and a.phase_no = gm.phase_no and a.player_id = p.id);
        waiting := jsonb_build_object('type', 'names', 'list', wl);
      end if;
    elsif gm.phase = 'night' then
      if public.ms_is_wolf(me.role) and me.alive then
        select coalesce(jsonb_agg(jsonb_build_object('name', w.name, 'done', gm.stage = 2 or exists
          (select 1 from public.ms_actions a where a.game_id = gid and a.phase_no = gm.phase_no and a.player_id = w.id and a.kind = 'wolf_vote' and a.confirmed),
          'me', w.id = me.id) order by w.name), '[]') into wl
        from public.ms_players w where w.game_id = gid and w.alive and public.ms_is_wolf(w.role);
        waiting := jsonb_build_object('type', 'pack', 'list', wl);
      else
        select coalesce(jsonb_agg(x.l order by x.l), '[]') into wl from (
          select distinct public.ms_role_vi(p.role) l from public.ms_players p
          where p.game_id = gid and p.id in (select e from public.ms_expected(gid) e)
            and not exists (select 1 from public.ms_actions a where a.game_id = gid and a.phase_no = gm.phase_no and a.player_id = p.id and (a.kind <> 'wolf_vote' or a.confirmed))
        ) x;
        waiting := jsonb_build_object('type', 'roles', 'list', wl);
      end if;
    elsif gm.phase = 'hunter' then
      waiting := jsonb_build_object('type', 'roles', 'list', jsonb_build_array(public.ms_role_vi('hunter')));
    end if;
  end if;

  return jsonb_build_object(
    'now', now(), 'dev', dev,
    'game', jsonb_build_object('id', gm.id, 'status', gm.status, 'phase', gm.phase, 'stage', gm.stage, 'day_no', gm.day_no, 'ends_at', gm.phase_ends_at,
        'winner', gm.winner, 'auto_start', gm.auto_start_count),
    'players', players, 'joined', me.id is not null, 'alive', coalesce(me.alive, false),
    'my_role', case when me.id is not null and me.role is not null then jsonb_build_object('role', me.role, 'label', public.ms_role_vi(me.role)) end,
    'silenced', (me.id is not null and gm.phase in ('day','runoff') and nullif(gm.ctx->>'silenced','')::uuid = me.id),
    'wolfteam', (me.id is not null and public.ms_is_wolf(me.role)),
    'prompt', pr, 'waiting', waiting, 'progress', jsonb_build_object('expected', exp_n, 'answered', ans_n), 'cards', cards);
end $$;


-- VERIFY (read-only): all three should say true
select position('ms_lover_of' in pg_get_functiondef('public.ms_commit(uuid,timestamptz)'::regprocedure)) > 0 as commit_uses_lover_of,
       position('couple' in pg_get_functiondef('public.ms_win_check(uuid)'::regprocedure)) > 0 as win_has_couple,
       position('blocked' in pg_get_functiondef('public.ms_begin_night(uuid,timestamptz,numeric)'::regprocedure)) > 0 as night_has_block;

