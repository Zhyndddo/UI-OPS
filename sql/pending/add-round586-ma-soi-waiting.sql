-- ============================================================================
-- Round 586 — Ma Sói: show who has NOT acted yet (never how anybody acted)
-- ============================================================================
-- Run AFTER add-round576-ma-soi.sql (and 585). Idempotent: it only redefines ms_state, adding a "waiting" part to the screen.
--   Day vote: alive players see the names who have not voted yet.
--   Night: wolves see their pack (✅/⏳ per wolf); everyone else sees only the ROLE names still to act (no player names).
--   Hunter's last shot: everybody sees "Thợ săn".

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

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'alive', alive, 'role', case when gm.status = 'finished' then role end) order by joined_at), '[]') into players
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

do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ms_state' loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
