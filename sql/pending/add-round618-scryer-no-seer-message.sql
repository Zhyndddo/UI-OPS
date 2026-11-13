-- Round 618 — Nhà chiêm tinh: when the Tiên tri is dead (and not found yet) the player now sees a message instead of nothing.
-- Replaces ms_state only. Safe to run more than once.

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

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'alive', alive, 'role', case when gm.status = 'finished' then role end, 'revealed', coalesce((state->>'revealed')::boolean, false), 'shown', case when coalesce((state->>'prince_shown')::boolean, false) then 'prince' end) order by joined_at), '[]') into players
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
      elsif public.ms_is_wolf(me.role) and gm.stage = 1 and coalesce((me.state->>'no_bite_day')::int, 0) <> gm.day_no then
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
        if me.role = 'scryer' and public.ms_night_extra(gid, me.role, me.state, gm.day_no) then   -- Round 608 — the wolf-side Nhà chiêm tinh
          select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'scry';
          select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and alive and id <> me.id and not public.ms_is_wolf(role);
          pr := pr || jsonb_build_object('scry', jsonb_build_object('options', opts, 'done', mine.id is not null));
        elsif me.role = 'scryer' and not coalesce((me.state->>'found')::boolean, false) then   -- Round 618 — the Tiên tri is gone: say so instead of silently hiding the box
          pr := pr || jsonb_build_object('scry_none', true);
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
      elsif me.role = 'seerapprentice' and public.ms_apprentice_on(gid) then   -- Round 606 — inherited power, same screen as the Tiên tri
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'seer';
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and alive and id <> me.id;
        pr := jsonb_build_object('type','seer','options',opts,'done',mine.id is not null);
      elsif me.role = 'detective' then
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'detect';
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and alive and id <> me.id;
        pr := jsonb_build_object('type','detective','options',opts,'done',mine.id is not null);
      elsif me.role = 'scryer' and public.ms_night_extra(gid, me.role, me.state, gm.day_no) then
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'scry';
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and alive and id <> me.id;
        pr := jsonb_build_object('type','scryer','options',opts,'done',mine.id is not null);
      elsif me.role = 'scryer' and not coalesce((me.state->>'found')::boolean, false) then   -- Round 618 — nothing left to scry
        pr := jsonb_build_object('type','scryer_none');
      elsif me.role = 'rogue' then
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'rob';
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and alive and id <> me.id;
        pr := jsonb_build_object('type','rogue','options',opts,'done',mine.id is not null);
      elsif me.role = 'ghost' then
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'ghost';
        pr := jsonb_build_object('type','ghost','done',mine.id is not null);
      elsif me.role = 'wildchild' and gm.day_no = 1 then
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'model';
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and alive and id <> me.id;
        pr := jsonb_build_object('type','wildchild','options',opts,'done',mine.id is not null);
      elsif me.role = 'medium' and public.ms_night_extra(gid, me.role, me.state, gm.day_no) then
        select * into mine from public.ms_actions where game_id = gid and phase_no = gm.phase_no and player_id = me.id and kind = 'medium';
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') into opts from public.ms_players where game_id = gid and not alive;
        pr := jsonb_build_object('type','medium','options',opts,'done',mine.id is not null,'can_learn',not coalesce((me.state->>'used')::boolean,false),'can_revive',not coalesce((me.state->>'revive_used')::boolean,false));
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
        pr := jsonb_build_object('type','witch','done',mine.id is not null,'victim',(select name from public.ms_players where id = wt), 'victim2', (select name from public.ms_players where id = nullif(gm.ctx->>'wolf_target2','')::uuid),
          'can_heal', (wt is not null or nullif(gm.ctx->>'wolf_target2','') is not null) and not coalesce((me.state->>'heal_used')::boolean,false),
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
