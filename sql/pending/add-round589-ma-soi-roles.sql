-- ============================================================================
-- Round 589 — Ma Sói: three new roles (Thần Tình Yêu / Kẻ ngốc / Già làng) + a random role mix per game
-- ============================================================================
-- Run AFTER add-round576, 585 and 586 (in that order, already done). Idempotent. DO NOT re-run 576 afterwards (it wipes the story templates).
-- Safe while a game is running: the new roles only appear in games started AFTER this runs.
--   Thần Tình Yêu (Cupid): night 1 only — pairs two players (may include themself). If one lover dies the other dies of heartbreak.
--   Kẻ ngốc (Idiot): the first time the village votes them out they are spared, their role is shown to everybody and they lose the right to vote.
--   Già làng (Elder): survives the FIRST wolf bite (never told in advance); poison / lynch / a second bite still kill.
-- Role mix: wolves = n/3 (min 1); seer, witch, hunter first (as before); then the optional roles guard / cupid / idiot / elder are picked
-- at RANDOM for the places left (always keeping at least n/4 plain villagers).

alter table public.ms_players drop constraint if exists ms_players_role_check;
alter table public.ms_players add constraint ms_players_role_check check (role in ('wolf','villager','seer','witch','hunter','guard','cupid','idiot','elder'));
alter table public.ms_actions drop constraint if exists ms_actions_kind_check;
alter table public.ms_actions add constraint ms_actions_kind_check check (kind in ('wolf_vote','seer','guard','witch','vote','hunter','cupid'));

delete from public.ms_templates where kind in ('day_idiot','lover_death');
insert into public.ms_templates (kind, body) values
('day_idiot', 'Đám đông đã kéo {name} ra giữa sân — nhưng khi sợi dây vừa siết lại, ai đó nhận ra {name} chỉ là Kẻ ngốc của làng. Không ai nỡ ra tay. {name} được tha, nhưng từ nay sẽ không còn được bỏ phiếu nữa.'),
('day_idiot', 'Lá phiếu đã được đếm, và cái tên được gọi là {name}. Nhưng {name} bật cười ngô nghê, và cả làng chợt hiểu đây là Kẻ ngốc. Làng tha cho {name} — kèm một điều kiện: đừng bao giờ bỏ phiếu nữa.'),
('lover_death', 'Nhưng chuyện chưa dừng ở đó: {names} không chịu nổi nỗi đau mất người yêu và gục ngã theo. Hoá ra hai người đã được mũi tên Thần Tình Yêu buộc vào nhau từ đêm đầu.'),
('lover_death', 'Và rồi một tiếng thở dài nữa: {names} đã đi theo người thương. Ra là trái tim của họ vốn đã gắn chặt với nhau từ bao giờ.');

create or replace function public.ms_role_vi(r text) returns text language sql immutable as $$
  select case r when 'wolf' then 'Sói' when 'villager' then 'Dân làng' when 'seer' then 'Tiên tri' when 'witch' then 'Phù thủy'
                when 'hunter' then 'Thợ săn' when 'guard' then 'Bảo vệ' when 'cupid' then 'Thần Tình Yêu' when 'idiot' then 'Kẻ ngốc'
                when 'elder' then 'Già làng' else coalesce(r,'?') end $$;

create or replace function public.ms_expected(g uuid) returns setof uuid
language plpgsql stable as $$
declare gm public.ms_games;
begin
  select * into gm from public.ms_games where id = g;
  if gm.phase = 'night' and gm.stage = 1 then
    return query select id from public.ms_players where game_id = g and alive and (role in ('wolf','seer','guard') or (role = 'cupid' and gm.day_no = 1));
  elsif gm.phase = 'night' then
    return query select id from public.ms_players where game_id = g and alive
      and (role in ('seer','guard') or (role = 'witch' and coalesce((gm.ctx->>'witch_in')::boolean, false)));
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
  return query select id from public.ms_players where game_id = g and alive
    and (role in ('wolf','seer','guard') or (role = 'cupid' and gm.day_no = 1) or (role = 'witch' and coalesce((gm.ctx->>'witch_in')::boolean, false)));
end $$;

-- night 1: the night does not move on until the Cupid has chosen too (or the deadline passes)
create or replace function public.ms_wolves_done(g uuid) returns boolean
language plpgsql stable as $$
declare gm public.ms_games;
begin
  select * into gm from public.ms_games where id = g;
  return exists (select 1 from public.ms_players where game_id = g and alive and role = 'wolf')
    and not exists (select 1 from public.ms_players w where w.game_id = g and w.alive and w.role = 'wolf'
      and not exists (select 1 from public.ms_actions a where a.game_id = g and a.phase_no = gm.phase_no and a.player_id = w.id and a.kind = 'wolf_vote' and a.confirmed))
    and not exists (select 1 from public.ms_players c where c.game_id = g and c.alive and c.role = 'cupid' and gm.day_no = 1
      and not exists (select 1 from public.ms_actions a where a.game_id = g and a.phase_no = gm.phase_no and a.player_id = c.id and a.kind = 'cupid'));
end $$;

-- ---------- deaths -> lovers -> hunter -> story -> next phase ----------
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
    select nullif(state->>'lover','')::uuid into partner from public.ms_players where id = (e->>'id')::uuid;
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

create or replace function public.ms_resolve_night(g uuid, t timestamptz) returns void
language plpgsql as $$
declare gm public.ms_games; victim uuid; saved boolean; poison uuid; deaths jsonb := '[]'::jsonb; gtgt uuid;
        wl text; a record; healed boolean; any_death boolean := false; elder_hit boolean := false;
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
      case when elder_hit then ' (Già làng chịu được nhát cắn đầu tiên)' when gtgt is not null and gtgt = victim and healed then ' (được Bảo vệ che chở và cả Phù thủy cứu)'
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
  -- Round 589 — the Idiot is spared the first time: role shown to everybody, loses the vote
  if tgt is not null and exists (select 1 from public.ms_players where id = tgt and role = 'idiot' and not coalesce((state->>'revealed')::boolean, false)) then
    update public.ms_players set state = state || '{"revealed":true}'::jsonb where id = tgt;
    perform public.ms_log_add(g, gm.day_no, 'day', '🤡 ' || public.ms_pn(tgt) || ' là KẺ NGỐC — được tha chết lần này, lộ vai trò và mất quyền bỏ phiếu.');
    update public.ms_games set ctx = ctx || jsonb_build_object('deaths', '[]'::jsonb, 'source', 'day', 'idiot', tgt, 'votes', coalesce(votes,'')) where id = g;
    perform public.ms_commit(g, t);
    return;
  end if;
  if tgt is not null then
    deaths := jsonb_build_array(jsonb_build_object('id', tgt, 'reason', 'lynched'));
    perform public.ms_log_add(g, gm.day_no, 'day', '⚖️ ' || public.ms_pn(tgt) || ' bị làng trục xuất' || case when (select role from public.ms_players where id = tgt) = 'wolf' then ' — đúng là SÓI!' else ' — nhưng không phải sói.' end);
  else
    perform public.ms_log_add(g, gm.day_no, 'day', '⚖️ Không ai bị trục xuất.');
  end if;
  update public.ms_games set ctx = ctx || jsonb_build_object('deaths', deaths, 'source', 'day', 'lynched', tgt, 'votes', coalesce(votes,'')) where id = g;
  perform public.ms_commit(g, t);
end $$;

create or replace function public.ms_finish(g uuid, win text, t timestamptz) returns void
language plpgsql as $$
declare lst text; tl text := ''; r record; last_key text := '';
begin
  select string_agg(name || ' — ' || public.ms_role_vi(role) || ' · ' ||
    case when alive then 'còn sống' else case out_reason when 'killed' then 'bị sói cắn' when 'poisoned' then 'bị đầu độc' when 'lynched' then 'bị làng trục xuất'
      when 'shot' then 'bị thợ săn bắn' when 'heartbreak' then 'chết theo người yêu' when 'left' then 'rời làng' else 'đã chết' end end,
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
  if n > 16 then return jsonb_build_object('error','Tối đa 16 người.'); end if;
  wolves := greatest(1, n / 3);
  roles := array[]::text[];
  for i in 1..wolves loop roles := array_append(roles, 'wolf'); end loop;
  for r in select unnest(array['seer','witch','hunter']) loop
    if cardinality(roles) < n - 1 then roles := array_append(roles, r); end if;
  end loop;
  -- optional roles: random pick for the places left, always keeping at least n/4 (min 1) plain villagers
  for r in select x from unnest(array['guard','cupid','idiot','elder']) x order by random() loop
    if cardinality(roles) < n - greatest(1, n / 4) and n >= 7 then roles := array_append(roles, r); end if;
  end loop;
  while cardinality(roles) < n loop roles := array_append(roles, 'villager'); end loop;
  select array_agg(id order by random()) into ids from public.ms_players where game_id = gid;
  for i in 1..n loop update public.ms_players set role = roles[i] where id = ids[i]; end loop;
  select string_agg(name, ', ' order by name) into wnames from public.ms_players where game_id = gid and role = 'wolf';
  for pid, r in select id, role from public.ms_players where game_id = gid loop
    perform public.ms_card(gid, pid, 'role',
      case r when 'wolf' then '🐺 Bạn là SÓI' when 'villager' then '🧑‍🌾 Bạn là DÂN LÀNG' when 'seer' then '🔮 Bạn là TIÊN TRI'
             when 'witch' then '🧪 Bạn là PHÙ THỦY' when 'hunter' then '🏹 Bạn là THỢ SĂN' when 'guard' then '🛡️ Bạn là BẢO VỆ' when 'cupid' then '💘 Bạn là THẦN TÌNH YÊU' when 'idiot' then '🤡 Bạn là KẺ NGỐC' when 'elder' then '🧓 Bạn là GIÀ LÀNG' end,
      case r
        when 'wolf' then 'Mỗi đêm, cả bầy cùng chọn một người để cắn — mọi con sói phải bấm xác nhận thì lựa chọn mới được tính. Ban ngày hãy giả làm dân làng. Đồng bọn của bạn: ' || wnames || '.'
        when 'villager' then 'Bạn không có sức mạnh đặc biệt, chỉ có đôi mắt và lá phiếu. Hãy lắng nghe, nghi ngờ đúng người và bỏ phiếu tìm ra bầy sói.'
        when 'seer' then 'Mỗi đêm bạn soi một người và biết ngay người đó có phải Sói hay không. Dùng thông tin này thật khéo — nói quá sớm, bạn sẽ là mục tiêu.'
        when 'witch' then 'Bạn có 1 bình cứu và 1 bình độc, mỗi bình chỉ dùng một lần, mỗi đêm dùng tối đa một bình. Bạn sẽ biết ai bị sói nhắm tới mỗi đêm.'
        when 'hunter' then 'Khi bạn chết (trừ khi bị đầu độc), bạn được bắn chết một người. Hãy chọn thật kỹ.'
        when 'guard' then 'Mỗi đêm bạn bảo vệ một người (kể cả bản thân) khỏi nanh sói. Không được bảo vệ cùng một người hai đêm liên tiếp.'
        when 'cupid' then 'Chỉ trong đêm đầu tiên, bạn chọn hai người (có thể gồm cả bản thân) để kết đôi. Hai người đó sẽ biết nhau; nếu một người chết, người kia đau lòng chết theo. Sau đêm đầu bạn là một dân làng bình thường, hãy bảo vệ cặp đôi của mình.'
        when 'idiot' then 'Nếu làng bỏ phiếu trục xuất bạn lần đầu, bạn được tha — nhưng vai trò của bạn bị lộ và bạn mất quyền bỏ phiếu. Bị sói cắn hay bị trục xuất lần thứ hai thì bạn vẫn chết.'
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
declare gid uuid; gm public.ms_games; me public.ms_players; tp public.ms_players; wolf_target uuid; res text; sec uuid; sp public.ms_players;
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

  if p_kind = 'wolf_vote' or p_kind = 'wolf_confirm' then
    if not (gm.phase = 'night' and gm.stage = 1 and me.role = 'wolf') then return jsonb_build_object('error','Lúc này bạn không thể làm việc đó.'); end if;
    if p_kind = 'wolf_vote' then
      if p_target is null or tp.role = 'wolf' then return jsonb_build_object('error','Hãy chọn một người không phải sói.'); end if;
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
      tp.name || case when tp.role = 'wolf' then ' là SÓI.' else ' KHÔNG phải sói.' end, now());
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
    perform public.ms_log_add(gid, gm.day_no, 'night', '💘 Thần Tình Yêu ' || me.name || ' kết đôi ' || tp.name || ' và ' || sp.name || '.');
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
      if me.role = 'wolf' and gm.stage = 1 then
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'wolf_vote';
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and alive and role <> 'wolf';
        select coalesce(jsonb_agg(jsonb_build_object('name', w.name, 'vote', (select t.name from public.ms_players t where t.id = a.target), 'confirmed', coalesce(a.confirmed,false), 'me', w.id = me.id) order by w.name), '[]') into wolves
        from public.ms_players w left join public.ms_actions a on a.player_id = w.id and a.phase_no = gm.phase_no and a.kind = 'wolf_vote'
        where w.game_id = gid and w.alive and w.role = 'wolf';
        pr := jsonb_build_object('type','wolf','options',opts,'my_vote',mine.target,'my_confirmed',coalesce(mine.confirmed,false),'wolves',wolves);
      elsif me.role = 'cupid' and gm.stage = 1 and gm.day_no = 1 then
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'cupid';
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and alive;
        pr := jsonb_build_object('type','cupid','options',opts,'done',mine.id is not null);
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
      if me.role = 'wolf' and me.alive then
        select coalesce(jsonb_agg(jsonb_build_object('name', w.name, 'done', gm.stage = 2 or exists
          (select 1 from public.ms_actions a where a.game_id = gid and a.phase_no = gm.phase_no and a.player_id = w.id and a.kind = 'wolf_vote' and a.confirmed),
          'me', w.id = me.id) order by w.name), '[]') into wl
        from public.ms_players w where w.game_id = gid and w.alive and w.role = 'wolf';
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
    'prompt', pr, 'waiting', waiting, 'progress', jsonb_build_object('expected', exp_n, 'answered', ans_n), 'cards', cards);
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

-- VERIFY (read-only):   select count(*) from public.ms_templates where kind in ('day_idiot','lover_death');   -- expect 4
