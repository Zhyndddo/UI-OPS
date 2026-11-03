-- ============================================================================
-- Round 576 — MA SÓI (Werewolf) office game, slice 1: tables + game engine (no cron)
-- ============================================================================
-- Run once in the Supabase SQL editor (idempotent: safe to run again; it does NOT delete a running game).
-- Everything is server-side: the browser never reads these tables. All access goes through the /api/ma-soi route
-- (service key) which calls the functions below, so a player can never see another player's role.
--
-- HOW THE CLOCK WORKS (no cron): the game row stores phase_ends_at. Every time someone opens the game or answers,
-- ms_advance() runs under a row lock: if everyone expected has answered, or phase_ends_at has passed, it resolves the
-- phase and starts the next one (catching up phase by phase if several deadlines passed). Times are Vietnam time:
-- night poll ends 00:00 at the latest, day vote ends 19:00 at the latest.
-- ============================================================================

-- ---------- tables ----------
create table if not exists public.ms_games (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'lobby' check (status in ('lobby','running','paused','finished')),
  phase text check (phase in ('night','day','runoff','hunter')),
  stage int not null default 1,                 -- night: 1 = wolves/seer/guard, 2 = witch
  phase_no int not null default 0,
  day_no int not null default 0,
  phase_started_at timestamptz,
  phase_ends_at timestamptz,
  auto_start_count int not null default 6,      -- game starts by itself when this many have joined (0 = only the dev starts it)
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  winner text,                                  -- 'wolves' | 'village' | 'cancelled'
  ctx jsonb not null default '{}'::jsonb        -- scratch for the current night/day (targets, runoff candidates, pending deaths)
);
create unique index if not exists ms_one_active_game on public.ms_games ((true)) where status in ('lobby','running','paused');

create table if not exists public.ms_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.ms_games(id) on delete cascade,
  profile_id uuid not null,
  name text not null,
  role text check (role in ('wolf','villager','seer','witch','hunter','guard')),
  alive boolean not null default true,
  out_reason text,                              -- killed | poisoned | lynched | shot | left   (never shown before the game ends)
  missed int not null default 0,                -- phases in a row without an answer
  state jsonb not null default '{}'::jsonb,     -- witch: heal_used, poison_used; guard: last_guard
  joined_at timestamptz not null default now(),
  unique (game_id, profile_id)
);

create table if not exists public.ms_actions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.ms_games(id) on delete cascade,
  phase_no int not null,
  player_id uuid not null references public.ms_players(id) on delete cascade,
  kind text not null check (kind in ('wolf_vote','seer','guard','witch','vote','hunter')),
  target uuid,                                  -- ms_players.id (null = abstain / skip)
  data jsonb not null default '{}'::jsonb,
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (game_id, phase_no, player_id, kind)
);

create table if not exists public.ms_cards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.ms_games(id) on delete cascade,
  player_id uuid references public.ms_players(id) on delete cascade,   -- null = for everybody
  kind text not null,                           -- role | story | seer | witch | hunter | info | final
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists ms_cards_game_idx on public.ms_cards (game_id, created_at desc);

create table if not exists public.ms_templates (
  id serial primary key,
  kind text not null,
  body text not null
);

alter table public.ms_games enable row level security;
alter table public.ms_players enable row level security;
alter table public.ms_actions enable row level security;
alter table public.ms_cards enable row level security;
alter table public.ms_templates enable row level security;
-- no policies on purpose: only the server (service key) touches these tables.
grant usage on schema public to service_role;
grant all on public.ms_games, public.ms_players, public.ms_actions, public.ms_cards, public.ms_templates to service_role;
grant usage, select on sequence public.ms_templates_id_seq to service_role;

-- ---------- story templates (Vietnamese; edit freely; {name} {names} are replaced; NEVER mention a role) ----------
delete from public.ms_templates;
insert into public.ms_templates (kind, body) values
('night_peace', 'Bình minh ló dạng, sương mù phủ trắng mái nhà. Chó không sủa, gà vẫn gáy — và lần đầu tiên sau bao đêm, cả làng thở phào: không ai gục ngã. Nhưng sự yên tĩnh này là may mắn, hay chỉ là khoảng lặng trước cơn bão?'),
('night_peace', 'Tiếng gà gáy đầu tiên vang lên và mọi cánh cửa đều còn mở được. Không ai mất tích. Vậy mà những người tỉnh táo nhất vẫn không ngủ yên: nếu đêm qua êm ả thì ai đã giữ cho nó êm ả?'),
('night_peace', 'Đêm qua trăng sáng bất thường, những cái bóng lướt qua các con hẻm — nhưng sáng nay ai cũng còn đứng đây. Phải chăng lũ sói đã chùn bước, hay chúng đang kiên nhẫn chờ thời cơ?'),
('night_death1', 'Sáng nay, một tiếng hét thất thanh xé toạc sự im lặng của làng. Người ta tìm thấy {name} nằm lạnh giá trước hiên nhà, dấu vết hỗn loạn còn in trên nền đất. Đêm qua, bóng tối đã chọn một cái tên — và cái tên ấy là {name}.'),
('night_death1', 'Mặt trời lên, nhưng {name} sẽ không bao giờ thấy nó nữa. Cánh cửa nhà mở toang, trên nền đất còn nguyên những vết cào sâu. Cả làng lặng đi, và mỗi người nhìn người bên cạnh bằng một ánh mắt khác.'),
('night_death1', 'Chuông làng đổ dồn lúc rạng sáng. {name} đã không qua nổi đêm qua. Có ai đó trong làng biết rõ chuyện gì đã xảy ra — và kẻ ấy đang đứng ngay giữa chúng ta, mặt đẫm sương như mọi người.'),
('night_deathN', 'Rạng sáng đẫm nước mắt: {names} đã không còn nữa. Đêm qua trở thành đêm dài nhất của ngôi làng, và nỗi sợ lan đi nhanh hơn bất kỳ tin đồn nào.'),
('night_deathN', 'Cả làng tụ lại trước sân đình: {names} đã gục ngã trong đêm. Không ai nói nên lời, chỉ còn tiếng gió lùa qua những ngôi nhà bỏ trống. Ai sẽ là người tiếp theo?'),
('day_lynch', 'Sau cuộc tranh cãi gay gắt, đa số đã chọn {name}. Đám đông kéo {name} ra giữa sân, không còn đường quay lại. Làng đã quyết định — chỉ mong quyết định ấy là đúng.'),
('day_lynch', 'Tiếng hò hét tắt dần khi {name} bị đưa ra khỏi làng. Dù sự thật là gì, lá phiếu đã được bỏ. Đêm nay sẽ cho biết làng đã đúng hay đã sai.'),
('day_none', 'Không ai nhận đủ phiếu để bị trục xuất. Buổi họp làng tan trong im lặng, nỗi nghi ngờ vẫn còn nguyên. Rồi màn đêm lại buông xuống.'),
('day_tie', 'Hai phe ngang tài ngang sức! {names} nhận số phiếu bằng nhau. Làng buộc phải bỏ phiếu lại, lần này chỉ giữa những cái tên đó.'),
('shot_extra', 'Giữa cơn hỗn loạn, {name} cũng ngã xuống.'),
('left', '{name} đã lặng lẽ rời làng, không ai thấy đi đâu. Có người nói là vì quá sợ hãi; người khác lại thì thầm rằng đó là một mưu kế.');

-- ---------- helpers ----------
create or replace function public.ms_next_hour(t timestamptz, hr int, min_hours numeric default 0) returns timestamptz
language plpgsql stable as $$
declare d timestamp; loc timestamp; e timestamptz;
begin
  loc := t at time zone 'Asia/Ho_Chi_Minh';
  d := date_trunc('day', loc) + make_interval(hours => hr);
  if d <= loc then d := d + interval '1 day'; end if;
  e := d at time zone 'Asia/Ho_Chi_Minh';
  if e - t < make_interval(secs => (min_hours * 3600)::int) then e := e + interval '1 day'; end if;
  return e;
end $$;

create or replace function public.ms_card(g uuid, p uuid, k text, ttl text, bd text, at_ timestamptz default now()) returns void
language sql as $$ insert into public.ms_cards (game_id, player_id, kind, title, body, created_at) values (g, p, k, ttl, bd, at_) $$;

create or replace function public.ms_tpl(k text, nm text default '', nms text default '') returns text
language sql volatile as $$
  select replace(replace(body, '{name}', nm), '{names}', nms) from public.ms_templates where kind = k order by random() limit 1
$$;

create or replace function public.ms_names(ids uuid[]) returns text
language plpgsql stable as $$
declare arr text[]; res text;
begin
  select array_agg(name order by name) into arr from public.ms_players where id = any(ids);
  if arr is null then return ''; end if;
  if array_length(arr,1) = 1 then return arr[1]; end if;
  res := array_to_string(arr[1:array_length(arr,1)-1], ', ') || ' và ' || arr[array_length(arr,1)];
  return res;
end $$;

create or replace function public.ms_role_vi(r text) returns text language sql immutable as $$
  select case r when 'wolf' then 'Sói' when 'villager' then 'Dân làng' when 'seer' then 'Tiên tri' when 'witch' then 'Phù thủy'
                when 'hunter' then 'Thợ săn' when 'guard' then 'Bảo vệ' else coalesce(r,'?') end $$;

create or replace function public.ms_win_check(g uuid) returns text
language plpgsql stable as $$
declare w int; v int;
begin
  select count(*) filter (where role = 'wolf'), count(*) filter (where role <> 'wolf') into w, v
  from public.ms_players where game_id = g and alive;
  if w = 0 then return 'village'; end if;
  if w >= v then return 'wolves'; end if;
  return null;
end $$;

create or replace function public.ms_finish(g uuid, win text, t timestamptz) returns void
language plpgsql as $$
declare lst text;
begin
  select string_agg(name || ' — ' || public.ms_role_vi(role) || case when alive then '' else ' (đã chết)' end, E'\n' order by (role='wolf') desc, name) into lst
  from public.ms_players where game_id = g;
  update public.ms_games set status = 'finished', finished_at = t, winner = win, phase_ends_at = null where id = g;
  perform public.ms_card(g, null, 'final',
    case win when 'wolves' then '🐺 Bầy sói chiến thắng' when 'village' then '🏡 Dân làng chiến thắng' else 'Ván chơi đã kết thúc' end,
    case win when 'wolves' then 'Tiếng tru vang khắp thung lũng. Khi số sói đã ngang với số người còn lại, ngôi làng không còn nơi nào để trốn.'
             when 'village' then 'Con sói cuối cùng đã bị lộ mặt. Sau bao đêm kinh hoàng, ngôi làng lại được đón một bình minh thật sự.'
             else 'Ván chơi đã bị huỷ.' end
      || E'\n\nVai trò của mọi người:\n' || coalesce(lst, ''), t);
end $$;

-- who must answer in the current phase (ids)
create or replace function public.ms_expected(g uuid) returns setof uuid
language plpgsql stable as $$
declare gm public.ms_games;
begin
  select * into gm from public.ms_games where id = g;
  if gm.phase = 'night' and gm.stage = 1 then
    return query select id from public.ms_players where game_id = g and alive and role in ('wolf','seer','guard');
  elsif gm.phase = 'night' then   -- stage 2: wolves are locked in; still waiting for seer / guard / witch
    return query select id from public.ms_players where game_id = g and alive
      and (role in ('seer','guard') or (role = 'witch' and coalesce((gm.ctx->>'witch_in')::boolean, false)));
  elsif gm.phase in ('day','runoff') then
    return query select id from public.ms_players where game_id = g and alive;
  elsif gm.phase = 'hunter' then
    return query select (gm.ctx->>'hunter_id')::uuid;
  end if;
end $$;

-- everybody who owed an answer during the whole night (used for the "missed" count at the end of the night)
create or replace function public.ms_all_night(g uuid) returns setof uuid
language plpgsql stable as $$
declare gm public.ms_games;
begin
  select * into gm from public.ms_games where id = g;
  return query select id from public.ms_players where game_id = g and alive
    and (role in ('wolf','seer','guard') or (role = 'witch' and coalesce((gm.ctx->>'witch_in')::boolean, false)));
end $$;

create or replace function public.ms_wolves_done(g uuid) returns boolean
language plpgsql stable as $$
declare gm public.ms_games;
begin
  select * into gm from public.ms_games where id = g;
  return exists (select 1 from public.ms_players where game_id = g and alive and role = 'wolf')
    and not exists (select 1 from public.ms_players w where w.game_id = g and w.alive and w.role = 'wolf'
      and not exists (select 1 from public.ms_actions a where a.game_id = g and a.phase_no = gm.phase_no and a.player_id = w.id and a.kind = 'wolf_vote' and a.confirmed));
end $$;

-- who has answered (any row), and who has COMPLETED (wolves must also confirm)
create or replace function public.ms_answered(g uuid) returns setof uuid
language sql stable as $$
  select a.player_id from public.ms_actions a join public.ms_games gm on gm.id = a.game_id
  where a.game_id = g and a.phase_no = gm.phase_no
$$;

create or replace function public.ms_is_complete(g uuid) returns boolean
language plpgsql stable as $$
declare gm public.ms_games; missing int;
begin
  select * into gm from public.ms_games where id = g;
  if gm.phase = 'night' and gm.stage = 1 then return false; end if;   -- stage 1 ends by the wolves locking in (see ms_lock_wolves)
  select count(*) into missing from public.ms_expected(g) e(id)
  where not exists (select 1 from public.ms_actions a where a.game_id = g and a.phase_no = gm.phase_no and a.player_id = e.id);
  if gm.phase = 'night' then return missing = 0; end if;               -- stage 2 may have nobody left to wait for
  return missing = 0 and exists (select 1 from public.ms_expected(g));
end $$;

-- ---------- phase starters ----------
create or replace function public.ms_begin_night(g uuid, t timestamptz, min_hours numeric default 0) returns void
language plpgsql as $$
begin
  update public.ms_games set status = 'running', phase = 'night', stage = 1, phase_no = phase_no + 1, day_no = day_no + 1,
    phase_started_at = t, phase_ends_at = public.ms_next_hour(t, 0, min_hours), ctx = '{}'::jsonb where id = g;
end $$;

create or replace function public.ms_begin_day(g uuid, t timestamptz) returns void
language plpgsql as $$
begin
  update public.ms_games set status = 'running', phase = 'day', stage = 1, phase_no = phase_no + 1,
    phase_started_at = t, phase_ends_at = public.ms_next_hour(t, 19, 0), ctx = '{}'::jsonb where id = g;
end $$;

-- ---------- plurality helper: returns uuid[] of the top-voted targets ----------
create or replace function public.ms_top(g uuid, kind_ text, ph int) returns uuid[]
language plpgsql stable as $$
declare res uuid[];
begin
  select array_agg(target) into res from (
    select target, count(*) c, max(count(*)) over () m from public.ms_actions
    where game_id = g and phase_no = ph and kind = kind_ and target is not null group by target
  ) x where c = m;
  return res;
end $$;

-- ---------- deaths -> hunter -> story -> next phase ----------
create or replace function public.ms_commit(g uuid, t timestamptz) returns void
language plpgsql as $$
declare gm public.ms_games; d jsonb; ids uuid[]; hid uuid; src text; story text; win text; lynched uuid; names text; votes text;
begin
  select * into gm from public.ms_games where id = g;
  src := gm.ctx->>'source';
  -- mark everybody in ctx.deaths dead
  update public.ms_players p set alive = false, out_reason = x.reason
  from (select (e->>'id')::uuid id, e->>'reason' reason from jsonb_array_elements(coalesce(gm.ctx->'deaths','[]'::jsonb)) e) x
  where p.id = x.id and p.alive;
  -- a dead hunter (not poisoned) gets one shot
  select p.id into hid from public.ms_players p
  where p.game_id = g and p.role = 'hunter' and not p.alive and p.out_reason in ('killed','lynched')
    and exists (select 1 from jsonb_array_elements(coalesce(gm.ctx->'deaths','[]'::jsonb)) e where (e->>'id')::uuid = p.id)
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
  select array_agg((e->>'id')::uuid order by ord) into ids from jsonb_array_elements(coalesce(gm.ctx->'deaths','[]'::jsonb)) with ordinality as z(e, ord);
  if src = 'night' then
    if ids is null or array_length(ids,1) = 0 then story := public.ms_tpl('night_peace');
    elsif array_length(ids,1) = 1 then story := public.ms_tpl('night_death1', public.ms_names(ids));
    else story := public.ms_tpl('night_deathN', '', public.ms_names(ids)); end if;
    perform public.ms_card(g, null, 'story', '🌅 Ngày ' || gm.day_no || ' — Bình minh', story, t);
  else
    lynched := nullif(gm.ctx->>'lynched','')::uuid;
    if lynched is null then story := public.ms_tpl('day_none');
    else
      story := public.ms_tpl('day_lynch', public.ms_names(array[lynched]));
      if ids is not null and array_length(ids,1) > 1 then
        story := story || E'\n\n' || public.ms_tpl('shot_extra', public.ms_names(array(select i from unnest(ids) i where i <> lynched)));
      end if;
    end if;
    votes := coalesce(gm.ctx->>'votes','');
    if votes <> '' then story := story || E'\n\nPhiếu bầu: ' || votes; end if;
    perform public.ms_card(g, null, 'story', '⚖️ Ngày ' || gm.day_no || ' — Kết quả bỏ phiếu', story, t);
  end if;
  win := public.ms_win_check(g);
  if win is not null then perform public.ms_finish(g, win, t); return; end if;
  if src = 'night' then perform public.ms_begin_day(g, t); else perform public.ms_begin_night(g, t, 0); end if;
end $$;

-- ---------- stage / phase resolvers ----------
create or replace function public.ms_resolve_night(g uuid, t timestamptz) returns void
language plpgsql as $$
declare gm public.ms_games; victim uuid; saved boolean; poison uuid; deaths jsonb := '[]'::jsonb; gtgt uuid;
begin
  select * into gm from public.ms_games where id = g;
  victim := nullif(gm.ctx->>'wolf_target','')::uuid;
  select target into gtgt from public.ms_actions where game_id = g and phase_no = gm.phase_no and kind = 'guard' limit 1;
  if gtgt is not null then update public.ms_players set state = state || jsonb_build_object('last_guard', gtgt) where game_id = g and role = 'guard'; end if;
  saved := victim is not null and ((gtgt is not null and gtgt = victim) or coalesce((gm.ctx->>'heal')::boolean,false));
  poison := nullif(gm.ctx->>'poison','')::uuid;
  if victim is not null and not saved then deaths := deaths || jsonb_build_array(jsonb_build_object('id', victim, 'reason', 'killed')); end if;
  if poison is not null and poison is distinct from victim then deaths := deaths || jsonb_build_array(jsonb_build_object('id', poison, 'reason', 'poisoned'));
  elsif poison is not null and victim = poison then
    if saved then deaths := deaths || jsonb_build_array(jsonb_build_object('id', poison, 'reason', 'poisoned'));
    else deaths := jsonb_set(deaths, '{0,reason}', '"poisoned"'); end if;
  end if;
  update public.ms_games set ctx = ctx || jsonb_build_object('deaths', deaths, 'source', 'night') where id = g;
  perform public.ms_commit(g, t);
end $$;

create or replace function public.ms_lock_wolves(g uuid, t timestamptz) returns void
language plpgsql as $$
declare gm public.ms_games; tops uuid[]; tgt uuid; wi uuid;
begin
  select * into gm from public.ms_games where id = g;
  tops := public.ms_top(g, 'wolf_vote', gm.phase_no);
  if tops is not null then tgt := tops[1 + floor(random() * array_length(tops,1))::int]; end if;
  select id into wi from public.ms_players where game_id = g and alive and role = 'witch'
    and not ((state->>'heal_used')::boolean is true and (state->>'poison_used')::boolean is true);
  update public.ms_games set stage = 2, ctx = ctx || jsonb_build_object('wolf_target', tgt, 'witch_in', wi is not null),
    phase_ends_at = case when wi is not null then greatest(phase_ends_at, t + interval '1 hour') else phase_ends_at end where id = g;
  if wi is not null then
    perform public.ms_card(g, wi, 'witch', '🧪 Đêm nay có người bị tấn công',
      case when tgt is null then 'Bầy sói chưa chọn được ai. Bạn có thể dùng bình độc nếu muốn.'
           else 'Bầy sói đã nhắm vào ' || public.ms_names(array[tgt]) || '. Bạn có muốn cứu người đó, hay dùng bình độc cho ai khác?' end, t);
  end if;
end $$;

create or replace function public.ms_resolve_day(g uuid, t timestamptz) returns void
language plpgsql as $$
declare gm public.ms_games; tops uuid[]; tgt uuid; votes text; deaths jsonb := '[]'::jsonb;
begin
  select * into gm from public.ms_games where id = g;
  select string_agg(pa.name || ' → ' || coalesce(pt.name, 'bỏ phiếu trắng'), ', ' order by pa.name) into votes
  from public.ms_actions a join public.ms_players pa on pa.id = a.player_id left join public.ms_players pt on pt.id = a.target
  where a.game_id = g and a.phase_no = gm.phase_no and a.kind = 'vote';
  tops := public.ms_top(g, 'vote', gm.phase_no);
  if tops is not null and array_length(tops,1) > 1 and gm.phase = 'day' then
    perform public.ms_card(g, null, 'story', '⚖️ Ngày ' || gm.day_no || ' — Hoà phiếu',
      public.ms_tpl('day_tie', '', public.ms_names(tops)) || case when coalesce(votes,'') <> '' then E'\n\nPhiếu bầu: ' || votes else '' end, t);
    update public.ms_games set phase = 'runoff', stage = 1, phase_no = phase_no + 1, phase_started_at = t, phase_ends_at = t + interval '2 hours',
      ctx = jsonb_build_object('runoff', to_jsonb(tops)) where id = g;
    return;
  end if;
  if tops is not null and array_length(tops,1) = 1 then tgt := tops[1]; end if;
  if tgt is not null then deaths := jsonb_build_array(jsonb_build_object('id', tgt, 'reason', 'lynched')); end if;
  update public.ms_games set ctx = ctx || jsonb_build_object('deaths', deaths, 'source', 'day', 'lynched', tgt, 'votes', coalesce(votes,'')) where id = g;
  perform public.ms_commit(g, t);
end $$;

create or replace function public.ms_resolve_hunter(g uuid, t timestamptz) returns void
language plpgsql as $$
declare gm public.ms_games; tgt uuid; deaths jsonb;
begin
  select * into gm from public.ms_games where id = g;
  select target into tgt from public.ms_actions where game_id = g and phase_no = gm.phase_no and kind = 'hunter' limit 1;
  deaths := coalesce(gm.ctx->'deaths','[]'::jsonb);
  if tgt is not null then deaths := deaths || jsonb_build_array(jsonb_build_object('id', tgt, 'reason', 'shot')); end if;
  update public.ms_games set ctx = ctx || jsonb_build_object('deaths', deaths, 'hunter_done', true) where id = g;
  perform public.ms_commit(g, t);
end $$;

-- ---------- the clock: resolve whatever is due ----------
create or replace function public.ms_advance(g uuid) returns void
language plpgsql as $$
declare gm public.ms_games; t timestamptz; deadline boolean; i int := 0; exp_ids uuid[]; ans int; r record; left_any boolean;
begin
  loop
    i := i + 1; exit when i > 12;
    select * into gm from public.ms_games where id = g for update;
    exit when gm.id is null or gm.status <> 'running';

    -- night stage 1: the wolves lock in as soon as every wolf confirmed, or at the deadline with whatever votes are in
    if gm.phase = 'night' and gm.stage = 1 then
      if public.ms_wolves_done(g) then perform public.ms_lock_wolves(g, now()); continue;
      elsif gm.phase_ends_at is not null and gm.phase_ends_at <= now() then perform public.ms_lock_wolves(g, gm.phase_ends_at); continue;
      else exit; end if;
    end if;

    deadline := false;
    if public.ms_is_complete(g) then t := now();
    elsif gm.phase_ends_at is not null and gm.phase_ends_at <= now() then t := gm.phase_ends_at; deadline := true;
    else exit; end if;

    if gm.phase = 'night' then select coalesce(array_agg(e), '{}') into exp_ids from public.ms_all_night(g) e;
    else select coalesce(array_agg(e), '{}') into exp_ids from public.ms_expected(g) e; end if;

    if deadline then
      select count(*) into ans from public.ms_actions a where a.game_id = g and a.phase_no = gm.phase_no and a.player_id = any(exp_ids);
      -- nobody at all answered a big phase: pause instead of running the game on its own
      if cardinality(exp_ids) >= 2 and ans = 0 and gm.phase <> 'hunter' then
        update public.ms_games set status = 'paused' where id = g;
        perform public.ms_card(g, null, 'info', '⏸️ Làng tạm nghỉ', 'Không ai trả lời trong lượt này nên ván chơi được tạm dừng. Người còn trong làng có thể bấm "Tiếp tục" để mở lại.', t);
        exit;
      end if;
    end if;
    -- missed streak: answered -> 0 ; not answered -> +1 ; two in a row -> leaves the village
    update public.ms_players set missed = 0 where id = any(exp_ids) and exists
      (select 1 from public.ms_actions a where a.game_id = g and a.phase_no = gm.phase_no and a.player_id = ms_players.id);
    left_any := false;
    for r in select p.id, p.name, p.missed + 1 as m from public.ms_players p where p.id = any(exp_ids) and not exists
      (select 1 from public.ms_actions a where a.game_id = g and a.phase_no = gm.phase_no and a.player_id = p.id) loop
      if r.m >= 2 then
        left_any := true;
        update public.ms_players set alive = false, out_reason = 'left', missed = r.m where id = r.id;
        perform public.ms_card(g, null, 'story', '🚪 Một người rời làng', public.ms_tpl('left', r.name), t);
      else
        update public.ms_players set missed = r.m where id = r.id;
      end if;
    end loop;
    if left_any and public.ms_win_check(g) is not null then perform public.ms_finish(g, public.ms_win_check(g), t); exit; end if;

    if gm.phase = 'night' then perform public.ms_resolve_night(g, t);
    elsif gm.phase in ('day','runoff') then perform public.ms_resolve_day(g, t);
    elsif gm.phase = 'hunter' then perform public.ms_resolve_hunter(g, t);
    else exit; end if;
  end loop;
end $$;

-- ---------- lobby / start ----------
create or replace function public.ms_is_staff_dev(p uuid) returns boolean
language sql stable as $$ select exists (select 1 from public.profiles where id = p and role in ('dev','admin')) $$;

create or replace function public.ms_active() returns uuid
language sql stable as $$
  select id from public.ms_games where status in ('lobby','running','paused') order by created_at desc limit 1
$$;

create or replace function public.ms_create(p_profile uuid, p_auto int default 6) returns jsonb
language plpgsql as $$
declare gid uuid;
begin
  if not public.ms_is_staff_dev(p_profile) then return jsonb_build_object('error','Chỉ admin/dev mới mở ván chơi.'); end if;
  if public.ms_active() is not null then return jsonb_build_object('error','Đang có một ván chơi chưa kết thúc.'); end if;
  insert into public.ms_games (created_by, auto_start_count) values (p_profile, greatest(0, p_auto)) returning id into gid;
  return jsonb_build_object('ok', true, 'game', gid);
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
  for r in select unnest(array['seer','witch','hunter','guard']) loop
    if cardinality(roles) < n - 1 and (r <> 'guard' or n >= 7) then roles := array_append(roles, r); end if;
  end loop;
  while cardinality(roles) < n loop roles := array_append(roles, 'villager'); end loop;
  select array_agg(id order by random()) into ids from public.ms_players where game_id = gid;
  for i in 1..n loop update public.ms_players set role = roles[i] where id = ids[i]; end loop;
  select string_agg(name, ', ' order by name) into wnames from public.ms_players where game_id = gid and role = 'wolf';
  for pid, r in select id, role from public.ms_players where game_id = gid loop
    perform public.ms_card(gid, pid, 'role',
      case r when 'wolf' then '🐺 Bạn là SÓI' when 'villager' then '🧑‍🌾 Bạn là DÂN LÀNG' when 'seer' then '🔮 Bạn là TIÊN TRI'
             when 'witch' then '🧪 Bạn là PHÙ THỦY' when 'hunter' then '🏹 Bạn là THỢ SĂN' when 'guard' then '🛡️ Bạn là BẢO VỆ' end,
      case r
        when 'wolf' then 'Mỗi đêm, cả bầy cùng chọn một người để cắn — mọi con sói phải bấm xác nhận thì lựa chọn mới được tính. Ban ngày hãy giả làm dân làng. Đồng bọn của bạn: ' || wnames || '.'
        when 'villager' then 'Bạn không có sức mạnh đặc biệt, chỉ có đôi mắt và lá phiếu. Hãy lắng nghe, nghi ngờ đúng người và bỏ phiếu tìm ra bầy sói.'
        when 'seer' then 'Mỗi đêm bạn soi một người và biết ngay người đó có phải Sói hay không. Dùng thông tin này thật khéo — nói quá sớm, bạn sẽ là mục tiêu.'
        when 'witch' then 'Bạn có 1 bình cứu và 1 bình độc, mỗi bình chỉ dùng một lần, mỗi đêm dùng tối đa một bình. Bạn sẽ biết ai bị sói nhắm tới mỗi đêm.'
        when 'hunter' then 'Khi bạn chết (trừ khi bị đầu độc), bạn được bắn chết một người. Hãy chọn thật kỹ.'
        when 'guard' then 'Mỗi đêm bạn bảo vệ một người (kể cả bản thân) khỏi nanh sói. Không được bảo vệ cùng một người hai đêm liên tiếp.'
      end, t);
  end loop;
  perform public.ms_card(gid, null, 'info', '🌙 Làng bắt đầu ván chơi', 'Có ' || n || ' người trong làng, trong đó ' || wolves || ' là sói. Đêm đầu tiên đã buông xuống — hãy kiểm tra thẻ vai trò của bạn.', t);
  update public.ms_games set started_at = t where id = gid;
  perform public.ms_begin_night(gid, t, 6);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ms_join(p_profile uuid) returns jsonb
language plpgsql as $$
declare gid uuid; gm public.ms_games; nm text; n int;
begin
  gid := public.ms_active();
  if gid is null then return jsonb_build_object('error','Chưa có ván chơi nào để tham gia.'); end if;
  select * into gm from public.ms_games where id = gid for update;
  if gm.status <> 'lobby' then return jsonb_build_object('error','Ván chơi đã bắt đầu, hẹn ván sau nhé.'); end if;
  select coalesce(nullif(trim(name),''), split_part(email,'@',1)) into nm from public.profiles where id = p_profile;
  if nm is null then return jsonb_build_object('error','Không tìm thấy tài khoản.'); end if;
  insert into public.ms_players (game_id, profile_id, name) values (gid, p_profile, nm) on conflict (game_id, profile_id) do nothing;
  select count(*) into n from public.ms_players where game_id = gid;
  if gm.auto_start_count > 0 and n >= gm.auto_start_count then return public.ms_start(p_profile, false); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ms_leave(p_profile uuid) returns jsonb
language plpgsql as $$
declare gid uuid; gm public.ms_games;
begin
  gid := public.ms_active();
  if gid is null then return jsonb_build_object('ok', true); end if;
  select * into gm from public.ms_games where id = gid;
  if gm.status <> 'lobby' then return jsonb_build_object('error','Ván chơi đã bắt đầu, không thể rời.'); end if;
  delete from public.ms_players where game_id = gid and profile_id = p_profile;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ms_cancel(p_profile uuid) returns jsonb
language plpgsql as $$
declare gid uuid;
begin
  if not public.ms_is_staff_dev(p_profile) then return jsonb_build_object('error','Chỉ admin/dev.'); end if;
  gid := public.ms_active();
  if gid is null then return jsonb_build_object('ok', true); end if;
  update public.ms_games set status = 'finished', winner = 'cancelled', finished_at = now(), phase_ends_at = null where id = gid;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ms_resume(p_profile uuid) returns jsonb
language plpgsql as $$
declare gid uuid; gm public.ms_games; me public.ms_players; e timestamptz;
begin
  gid := public.ms_active();
  select * into gm from public.ms_games where id = gid for update;
  if gm.status <> 'paused' then return jsonb_build_object('ok', true); end if;
  select * into me from public.ms_players where game_id = gid and profile_id = p_profile and alive;
  if me.id is null and not public.ms_is_staff_dev(p_profile) then return jsonb_build_object('error','Chỉ người còn trong làng mới mở lại được.'); end if;
  e := case gm.phase when 'night' then public.ms_next_hour(now(), 0, 3)
                     when 'day' then public.ms_next_hour(now(), 19, 3)
                     else now() + interval '2 hours' end;
  update public.ms_games set status = 'running', phase_started_at = now(), phase_ends_at = e where id = gid;
  perform public.ms_card(gid, null, 'info', '▶️ Làng tiếp tục', 'Ván chơi đã được mở lại.', now());
  return jsonb_build_object('ok', true);
end $$;

-- ---------- answering ----------
create or replace function public.ms_act(p_profile uuid, p_kind text, p_target uuid default null, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql as $$
declare gid uuid; gm public.ms_games; me public.ms_players; tp public.ms_players; wolf_target uuid; res text;
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
  elsif p_kind = 'vote' then
    if gm.phase not in ('day','runoff') then return jsonb_build_object('error','Chưa đến giờ bỏ phiếu.'); end if;
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

-- ---------- the screen: everything ONE player may see ----------
create or replace function public.ms_state(p_profile uuid) returns jsonb
language plpgsql as $$
declare gid uuid; gm public.ms_games; me public.ms_players; pr jsonb := 'null'::jsonb; players jsonb; cards jsonb; wolves jsonb := '[]'::jsonb;
        exp_n int := 0; ans_n int := 0; opts jsonb; mine public.ms_actions; wt uuid; dev boolean;
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

  return jsonb_build_object(
    'now', now(), 'dev', dev,
    'game', jsonb_build_object('id', gm.id, 'status', gm.status, 'phase', gm.phase, 'stage', gm.stage, 'day_no', gm.day_no, 'ends_at', gm.phase_ends_at,
        'winner', gm.winner, 'auto_start', gm.auto_start_count),
    'players', players, 'joined', me.id is not null, 'alive', coalesce(me.alive, false),
    'my_role', case when me.id is not null and me.role is not null then jsonb_build_object('role', me.role, 'label', public.ms_role_vi(me.role)) end,
    'prompt', pr, 'progress', jsonb_build_object('expected', exp_n, 'answered', ans_n), 'cards', cards);
end $$;

-- only the server (service key) may call these
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'ms\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- VERIFY (read-only):   select count(*) from public.ms_templates;   -- expect 14
-- START A GAME (as dev, from the /ma-soi page), or by hand:  select public.ms_create('<your profile id>', 6);
-- CANCEL A GAME:  select public.ms_cancel('<your profile id>');
