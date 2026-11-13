-- ============================================================================
-- Round 620 — HIT MAKERS (music-label board game), slice 1+2 backend: tables + engine + guest codes
-- ============================================================================
-- Run once in the Supabase SQL editor (idempotent). Server-only tables (RLS on, no policies); everything goes through /api/hit-makers.
-- One shared room, like Ma Sói. Staff play with their profile; guests join with a code + alias (no account) and get a private token.
-- Rules (agreed 13 Nov): start 1500 Music Dollar, pass "Music Award" = +200 and the YEAR goes up (first player across moves the year;
-- it can go up again only after every player who is not in jail / bankrupt has crossed); jail "Gỡ nhạc": roll a double, use a card,
-- or pay 50 (forced after 3 failed turns); no auction, no mortgage, no pot on the rest square; last label standing wins, or the
-- richest label when the target year is reached. Idle humans are auto-played after 120 s (3 misses in a row = bot for good).
-- ============================================================================

create table if not exists public.hm_games (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'lobby',               -- lobby | running | finished | cancelled
  code text not null,                                  -- join code for guests
  year int not null default 2026,
  target_year int,                                     -- null = play until one label is left
  year_locked boolean not null default false,
  crossed uuid[] not null default '{}',
  round_no int not null default 1,
  cur uuid,                                            -- hm_players.id whose turn it is
  phase text not null default 'roll',                  -- roll | buy | end
  last_dice int[] not null default '{}',
  doubles_count int not null default 0,
  extra boolean not null default false,
  turn_started_at timestamptz,
  decks jsonb not null default '{}'::jsonb,
  winner uuid,
  win_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create unique index if not exists hm_one_active_game on public.hm_games ((true)) where status in ('lobby','running');

create table if not exists public.hm_guests (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  name text not null,
  game_id uuid not null references public.hm_games(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.hm_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.hm_games(id) on delete cascade,
  profile_id uuid,
  guest_id uuid references public.hm_guests(id) on delete cascade,
  name text not null,
  seat int not null default 0,
  cash int not null default 1500,
  pos int not null default 0,
  in_jail boolean not null default false,
  jail_turns int not null default 0,
  jail_cards int not null default 0,
  bankrupt boolean not null default false,
  is_bot boolean not null default false,
  missed int not null default 0,
  joined_at timestamptz not null default now()
);
create unique index if not exists hm_players_profile on public.hm_players (game_id, profile_id) where profile_id is not null;

create table if not exists public.hm_props (
  game_id uuid not null references public.hm_games(id) on delete cascade,
  space int not null,
  owner uuid not null references public.hm_players(id) on delete cascade,
  level int not null default 0,
  primary key (game_id, space)
);

create table if not exists public.hm_events (
  id bigserial primary key,
  game_id uuid not null references public.hm_games(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists hm_events_game on public.hm_events (game_id, id desc);

create table if not exists public.hm_board (
  space int primary key, kind text not null, name text not null,
  grp int, price int, base_rent int, up_cost int
);
create table if not exists public.hm_cards (
  deck text not null, idx int not null, body text not null, eff text not null, amt int not null default 0,
  primary key (deck, idx)
);
alter table public.hm_games enable row level security; alter table public.hm_guests enable row level security;
alter table public.hm_players enable row level security; alter table public.hm_props enable row level security;
alter table public.hm_events enable row level security; alter table public.hm_board enable row level security;
alter table public.hm_cards enable row level security;
grant usage on schema public to service_role;
grant all on public.hm_games, public.hm_guests, public.hm_players, public.hm_props, public.hm_events, public.hm_board, public.hm_cards to service_role;
grant usage, select on sequence public.hm_events_id_seq to service_role;

-- ---------- board (36 spaces) ----------
delete from public.hm_board;
insert into public.hm_board (space, kind, name, grp, price, base_rent, up_cost) values
(0,'start','Music Award',null,null,null,null),
(1,'act','Hải Gokume',1,60,6,50),(2,'news','Tin nóng',null,null,null,null),(3,'act','Ngọc Xuyên',1,60,6,50),
(4,'plat','NCT',null,150,null,null),
(5,'act','SYNTHEX',2,100,10,50),(6,'act','OGG',2,100,10,50),(7,'deal','Hợp đồng',null,null,null,null),(8,'act','VẾT XƯỚC',2,120,12,50),
(9,'jail','Gỡ nhạc',null,null,null,null),
(10,'act','DAQUIN',3,140,14,100),(11,'util','Phòng Thu 2608 LM81',null,120,null,null),(12,'act','YÊN',3,140,14,100),(13,'act','HIVANE',3,160,16,100),
(14,'plat','ZING',null,175,null,null),
(15,'act','Ari',4,180,18,100),(16,'news','Tin nóng',null,null,null,null),(17,'act','Thoại Nghi',4,180,18,100),
(18,'rest','Phát hành bài mới',null,null,null,null),
(19,'act','Huỳnh Văn',4,200,20,100),(20,'act','Xệ Xệ',5,220,22,150),(21,'deal','Hợp đồng',null,null,null,null),(22,'act','Jackie Jnine',5,220,22,150),(23,'act','Thịnh Suy',5,240,24,150),
(24,'plat','APPLE MUSIC',null,200,null,null),
(25,'act','Lương Gia Hùng',6,260,26,150),(26,'util','Creative Space 19T21',null,180,null,null),
(27,'gojail','Gậy bản quyền',null,null,null,null),
(28,'act','Hamlet Trương',6,260,26,150),(29,'act','Nguyen Van Chung',6,280,28,150),
(30,'plat','SPOTIFY',null,225,null,null),
(31,'act','Ngô Lan Hương',7,300,30,200),(32,'act','Ái Phương',7,300,30,200),(33,'act','THANH DUY',7,320,32,200),
(34,'act','TÙNG',8,350,35,200),(35,'act','Nhạc của Trang',8,400,40,200);

-- ---------- cards (own wording, written from the effect only) ----------
delete from public.hm_cards;
insert into public.hm_cards (deck, idx, body, eff, amt) values
('news',0,'Một clip của bạn bỗng nổ trên mạng. Nhận 150.','gain',150),
('news',1,'Bị khiếu nại bản quyền, phải đóng phạt 100.','lose',100),
('news',2,'Được mời lên sân khấu lớn: tiến thẳng tới Music Award, nhận tiền vòng.','goto',0),
('news',3,'Lỡ chuyến bay đi diễn: lùi 3 ô.','back',3),
('news',4,'Một cuộc hợp tác bất ngờ: tiến tới nền tảng gần nhất (nếu đã có chủ, trả gấp đôi tiền thuê).','nearest_plat',0),
('news',5,'Buổi livestream gặp sự cố, nộp 50 cho ngân hàng.','lose',50),
('news',6,'Bạn nhận được một tấm vé miễn phí ra khỏi Gỡ nhạc. Giữ lại để dùng.','jailcard',0),
('news',7,'Bị gậy bản quyền: đi thẳng tới Gỡ nhạc, không nhận tiền vòng.','jail',0),
('news',8,'Mỗi cấp nâng cấp của bạn phải bảo trì: trả 25 mỗi cấp.','repair',25),
('news',9,'Chương trình truyền hình mời bạn: tiến tới SPOTIFY.','goto',30),
('news',10,'Thắng một giải nhỏ. Nhận 100.','gain',100),
('news',11,'Sửa lại phòng thu, trả 75.','lose',75),
('news',12,'Fan quyên góp ủng hộ: nhận 50 từ mỗi người chơi.','collect_each',50),
('news',13,'Nghệ sĩ lớn nhất làng nhạc rủ bạn đi cùng: tiến tới Nhạc của Trang.','goto',35),
('deal',0,'Hợp đồng quảng cáo mới. Nhận 200.','gain',200),
('deal',1,'Phí phát hành bài mới, trả 150.','lose',150),
('deal',2,'Tiền bản quyền quý này về tài khoản: nhận 100.','gain',100),
('deal',3,'Nộp thuế thu nhập, trả 100.','lose',100),
('deal',4,'Bạn nhận được một tấm vé miễn phí ra khỏi Gỡ nhạc. Giữ lại để dùng.','jailcard',0),
('deal',5,'Mở tiệc ra mắt: trả 50 cho mỗi người chơi.','pay_each',50),
('deal',6,'Phí tư vấn từ một đàn em: nhận 25.','gain',25),
('deal',7,'Trả tiền khám sức khỏe cho cả ê-kíp: 100.','lose',100),
('deal',8,'Bán đấu giá đĩa than hiếm: nhận 75.','gain',75),
('deal',9,'Tiến thẳng tới Music Award, nhận tiền vòng.','goto',0),
('deal',10,'Sinh nhật công ty: nhận 25 từ mỗi người chơi.','collect_each',25),
('deal',11,'Đóng bảo hiểm thiết bị, trả 50.','lose',50),
('deal',12,'Được hoàn thuế: nhận 20.','gain',20),
('deal',13,'Sửa sân khấu: trả 40 cho mỗi cấp nâng cấp bạn có.','repair',40);

-- ---------- small helpers ----------
create or replace function public.hm_log(g uuid, t text) returns void language sql as
$$ insert into public.hm_events (game_id, body) values (g, t) $$;

create or replace function public.hm_worth(pid uuid) returns int language sql stable as $$
  select coalesce((select cash from public.hm_players where id = pid), 0)
       + coalesce((select sum(coalesce(b.price, 0) + p.level * coalesce(b.up_cost, 0))::int
                   from public.hm_props p join public.hm_board b on b.space = p.space where p.owner = pid), 0)
$$;

create or replace function public.hm_finish(g uuid, w uuid, why text) returns void language plpgsql as $$
begin
  update public.hm_games set status = 'finished', winner = w, win_reason = why, finished_at = now(), phase = 'end' where id = g and status = 'running';
  if found then perform public.hm_log(g, '🏆 ' || coalesce((select name from public.hm_players where id = w), '?') || ' thắng ván này! ' || why); end if;
end $$;

create or replace function public.hm_check_end(g uuid) returns void language plpgsql as $$
declare gm public.hm_games; n int; w uuid;
begin
  select * into gm from public.hm_games where id = g;
  if gm.status <> 'running' then return; end if;
  select count(*) into n from public.hm_players where game_id = g and not bankrupt;
  if n <= 1 then
    select id into w from public.hm_players where game_id = g and not bankrupt limit 1;
    perform public.hm_finish(g, w, 'Là hãng đĩa cuối cùng còn trụ lại.'); return;
  end if;
  if gm.target_year is not null and gm.year >= gm.target_year then
    select id into w from public.hm_players where game_id = g and not bankrupt order by public.hm_worth(id) desc, cash desc limit 1;
    perform public.hm_finish(g, w, 'Năm ' || gm.year || ' đã tới — giàu nhất (tiền + tài sản) thắng.');
  end if;
end $$;

-- every eligible player (not jailed, not bankrupt) has crossed since the year last went up → the year may go up again
create or replace function public.hm_year_recheck(g uuid) returns void language plpgsql as $$
declare gm public.hm_games; pending int;
begin
  select * into gm from public.hm_games where id = g;
  if not gm.year_locked then return; end if;
  select count(*) into pending from public.hm_players p where p.game_id = g and not p.bankrupt and not p.in_jail and not (p.id = any (gm.crossed));
  if pending = 0 then update public.hm_games set year_locked = false, crossed = '{}' where id = g; end if;
end $$;

create or replace function public.hm_cross_start(g uuid, pid uuid) returns void language plpgsql as $$
declare gm public.hm_games; nm text;
begin
  update public.hm_players set cash = cash + 200 where id = pid;
  select name into nm from public.hm_players where id = pid;
  select * into gm from public.hm_games where id = g;
  if not gm.year_locked then
    update public.hm_games set year = year + 1, year_locked = true, crossed = array[pid] where id = g;
    perform public.hm_log(g, '🎉 ' || nm || ' qua Music Award, nhận 200 — bước sang năm ' || (gm.year + 1) || '.');
  else
    update public.hm_games set crossed = case when pid = any (crossed) then crossed else crossed || pid end where id = g;
    perform public.hm_log(g, '🎵 ' || nm || ' qua Music Award, nhận 200.');
  end if;
  perform public.hm_year_recheck(g);
  perform public.hm_check_end(g);
end $$;

create or replace function public.hm_bankrupt(g uuid, pid uuid, creditor uuid) returns void language plpgsql as $$
declare nm text; c int;
begin
  select name, cash into nm, c from public.hm_players where id = pid;
  if creditor is not null then
    update public.hm_players set cash = cash + c where id = creditor;
    update public.hm_props set owner = creditor, level = 0 where game_id = g and owner = pid;
  else
    delete from public.hm_props where game_id = g and owner = pid;
  end if;
  update public.hm_players set cash = 0, bankrupt = true, in_jail = false, jail_cards = 0 where id = pid;
  perform public.hm_log(g, '💥 ' || nm || ' phá sản' || case when creditor is not null then ' — tài sản về tay ' || (select name from public.hm_players where id = creditor) else ' — tài sản trả về ngân hàng' end || '.');
  perform public.hm_year_recheck(g);
  perform public.hm_check_end(g);
end $$;

-- pay `amt` from pid to `to_` (null = the bank). Upgrades are sold at half price automatically when cash is short. Not enough → bankrupt.
create or replace function public.hm_pay(g uuid, pid uuid, to_ uuid, amt int) returns boolean language plpgsql as $$
declare c int; pr record; cost int;
begin
  if amt <= 0 then return true; end if;
  loop
    select cash into c from public.hm_players where id = pid;
    exit when c >= amt;
    select p.space, b.up_cost into pr from public.hm_props p join public.hm_board b on b.space = p.space
      where p.game_id = g and p.owner = pid and p.level > 0 order by p.level desc limit 1;
    exit when pr.space is null;
    update public.hm_props set level = level - 1 where game_id = g and space = pr.space;
    update public.hm_players set cash = cash + pr.up_cost / 2 where id = pid;
    perform public.hm_log(g, '🔧 ' || (select name from public.hm_players where id = pid) || ' bán bớt một cấp nâng cấp để có tiền.');
  end loop;
  select cash into c from public.hm_players where id = pid;
  if c >= amt then
    update public.hm_players set cash = cash - amt where id = pid;
    if to_ is not null then update public.hm_players set cash = cash + amt where id = to_; end if;
    return true;
  end if;
  perform public.hm_bankrupt(g, pid, to_);
  return false;
end $$;

create or replace function public.hm_send_jail(g uuid, pid uuid) returns void language plpgsql as $$
begin
  update public.hm_players set pos = 9, in_jail = true, jail_turns = 0 where id = pid;
  update public.hm_games set extra = false, doubles_count = 0 where id = g;
  perform public.hm_log(g, '🚫 ' || (select name from public.hm_players where id = pid) || ' bị đưa tới Gỡ nhạc.');
  perform public.hm_year_recheck(g);
end $$;

-- what the next phase is once a landing has been settled
create or replace function public.hm_after(g uuid, pid uuid) returns void language plpgsql as $$
declare gm public.hm_games; pl public.hm_players;
begin
  select * into gm from public.hm_games where id = g;
  if gm.status <> 'running' then return; end if;
  select * into pl from public.hm_players where id = pid;
  update public.hm_games set phase = case when gm.extra and not pl.in_jail and not pl.bankrupt then 'roll' else 'end' end where id = g;
end $$;

create or replace function public.hm_rent(g uuid, sp int, dice int, owner_ uuid) returns int language plpgsql stable as $$
declare b public.hm_board; lv int; n int; own int; tot int;
begin
  select * into b from public.hm_board where space = sp;
  if b.kind = 'act' then
    select level into lv from public.hm_props where game_id = g and space = sp;
    select count(*) into tot from public.hm_board where grp = b.grp;
    select count(*) into own from public.hm_props p join public.hm_board x on x.space = p.space where p.game_id = g and p.owner = owner_ and x.grp = b.grp;
    if lv > 0 then return b.base_rent * (array[0,5,15,35,50])[lv + 1]; end if;
    return b.base_rent * (case when own = tot then 2 else 1 end);
  elsif b.kind = 'plat' then
    select count(*) into n from public.hm_props p join public.hm_board x on x.space = p.space where p.game_id = g and p.owner = owner_ and x.kind = 'plat';
    return (array[25,50,100,200])[greatest(1, n)];
  else
    select count(*) into n from public.hm_props p join public.hm_board x on x.space = p.space where p.game_id = g and p.owner = owner_ and x.kind = 'util';
    return dice * case when n >= 2 then 10 else 4 end;
  end if;
end $$;

create or replace function public.hm_move_to(g uuid, pid uuid, target int, collect boolean, dice int, rent_mult int default 1) returns void language plpgsql as $$
declare old int;
begin
  select pos into old from public.hm_players where id = pid;
  update public.hm_players set pos = target where id = pid;
  if collect and (target <= old) then perform public.hm_cross_start(g, pid); end if;
  if (select status from public.hm_games where id = g) <> 'running' then return; end if;
  perform public.hm_land(g, pid, dice, rent_mult);
end $$;

-- returns true when the card itself moved the player (and so already settled the landing)
drop function if exists public.hm_draw(uuid, uuid, text, integer);
create or replace function public.hm_draw(g uuid, pid uuid, dk text, dice int) returns boolean language plpgsql as $$
declare gm public.hm_games; i int; cd public.hm_cards; nm text; o record; lv int; pos_ int; tgt int; n int; q int;
begin
  select * into gm from public.hm_games where id = g;
  i := coalesce((gm.decks ->> dk)::int, 0);
  update public.hm_games set decks = jsonb_set(decks, array[dk], to_jsonb(i + 1)) where id = g;
  select * into cd from public.hm_cards where hm_cards.deck = dk and idx = ((gm.decks -> ('perm_' || dk)) ->> (i % 14))::int;
  select name, pos into nm, pos_ from public.hm_players where id = pid;
  perform public.hm_log(g, case when dk = 'news' then '⚡ Tin nóng' else '✍️ Hợp đồng' end || ' — ' || nm || ': ' || cd.body);
  case cd.eff
    when 'gain' then update public.hm_players set cash = cash + cd.amt where id = pid;
    when 'lose' then perform public.hm_pay(g, pid, null, cd.amt);
    when 'jailcard' then update public.hm_players set jail_cards = jail_cards + 1 where id = pid;
    when 'jail' then perform public.hm_send_jail(g, pid);
    when 'collect_each' then
      for o in select id from public.hm_players where game_id = g and not bankrupt and id <> pid loop
        perform public.hm_pay(g, o.id, pid, cd.amt);
      end loop;
    when 'pay_each' then
      for o in select id from public.hm_players where game_id = g and not bankrupt and id <> pid loop
        exit when (select bankrupt from public.hm_players where id = pid);
        perform public.hm_pay(g, pid, o.id, cd.amt);
      end loop;
    when 'repair' then
      select coalesce(sum(level), 0) into lv from public.hm_props where game_id = g and owner = pid;
      perform public.hm_pay(g, pid, null, lv * cd.amt);
    when 'back' then
      update public.hm_players set pos = (pos + 36 - cd.amt) % 36 where id = pid;
      perform public.hm_land(g, pid, dice, 1); return true;
    when 'goto' then
      perform public.hm_move_to(g, pid, cd.amt, true, dice); return true;
    when 'nearest_plat' then
      tgt := case when pos_ < 4 then 4 when pos_ < 14 then 14 when pos_ < 24 then 24 when pos_ < 30 then 30 else 4 end;
      perform public.hm_move_to(g, pid, tgt, true, dice, 2); return true;
    else null;
  end case;
  return false;
end $$;

create or replace function public.hm_land(g uuid, pid uuid, dice int, rent_mult int default 1) returns void language plpgsql as $$
declare b public.hm_board; pr public.hm_props; pl public.hm_players; r int; moved boolean;
begin
  select * into pl from public.hm_players where id = pid;
  select * into b from public.hm_board where space = pl.pos;
  if b.kind = 'gojail' then perform public.hm_send_jail(g, pid);
  elsif b.kind in ('news', 'deal') then
    moved := public.hm_draw(g, pid, b.kind, dice);
    if moved then return; end if;
  elsif b.kind in ('act', 'plat', 'util') then
    select * into pr from public.hm_props where game_id = g and space = b.space;
    if pr.owner is null then
      update public.hm_games set phase = 'buy' where id = g; return;
    elsif pr.owner <> pid and not (select bankrupt from public.hm_players where id = pr.owner) then
      r := public.hm_rent(g, b.space, dice, pr.owner) * rent_mult;
      perform public.hm_log(g, '💸 ' || pl.name || ' trả ' || r || ' tiền thuê ' || b.name || ' cho ' || (select name from public.hm_players where id = pr.owner) || '.');
      perform public.hm_pay(g, pid, pr.owner, r);
    end if;
  end if;
  perform public.hm_after(g, pid);
end $$;

create or replace function public.hm_end(g uuid) returns void language plpgsql as $$
declare gm public.hm_games; cur_seat int; nxt record;
begin
  select * into gm from public.hm_games where id = g;
  if gm.status <> 'running' then return; end if;
  select seat into cur_seat from public.hm_players where id = gm.cur;
  select id, seat into nxt from public.hm_players where game_id = g and not bankrupt and seat > cur_seat order by seat limit 1;
  if nxt.id is null then
    select id, seat into nxt from public.hm_players where game_id = g and not bankrupt order by seat limit 1;
    update public.hm_games set round_no = round_no + 1 where id = g;
  end if;
  update public.hm_games set cur = nxt.id, phase = 'roll', doubles_count = 0, extra = false, turn_started_at = clock_timestamp() where id = g;
end $$;

-- ---------- player actions (all assume the game row is locked and it is that player's turn) ----------
create or replace function public.hm_do_roll(g uuid, pid uuid) returns void language plpgsql as $$
declare gm public.hm_games; pl public.hm_players; d1 int; d2 int; tot int; free boolean := false;
begin
  select * into gm from public.hm_games where id = g;
  select * into pl from public.hm_players where id = pid;
  d1 := 1 + floor(random() * 6)::int; d2 := 1 + floor(random() * 6)::int; tot := d1 + d2;
  update public.hm_games set last_dice = array[d1, d2] where id = g;
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

create or replace function public.hm_do_buy(g uuid, pid uuid) returns void language plpgsql as $$
declare pl public.hm_players; b public.hm_board;
begin
  select * into pl from public.hm_players where id = pid;
  select * into b from public.hm_board where space = pl.pos;
  if pl.cash < b.price then raise exception 'Không đủ tiền để mua % (cần %).', b.name, b.price; end if;
  update public.hm_players set cash = cash - b.price where id = pid;
  insert into public.hm_props (game_id, space, owner, level) values (g, b.space, pid, 0);
  perform public.hm_log(g, '🛒 ' || pl.name || ' ký ' || b.name || ' với giá ' || b.price || '.');
  perform public.hm_after(g, pid);
end $$;

create or replace function public.hm_do_upgrade(g uuid, pid uuid, sp int) returns void language plpgsql as $$
declare b public.hm_board; pr public.hm_props; mn int; cnt int; tot int; pl public.hm_players;
begin
  select * into b from public.hm_board where space = sp;
  select * into pr from public.hm_props where game_id = g and space = sp;
  if b.kind <> 'act' or pr.owner is distinct from pid then raise exception 'Bạn không sở hữu nghệ sĩ này.'; end if;
  select count(*) into tot from public.hm_board where grp = b.grp;
  select count(*), min(p.level) into cnt, mn from public.hm_props p join public.hm_board x on x.space = p.space where p.game_id = g and p.owner = pid and x.grp = b.grp;
  if cnt < tot then raise exception 'Cần sở hữu đủ cả nhóm màu này mới được nâng cấp.'; end if;
  if pr.level >= 4 then raise exception 'Đã ở cấp cao nhất (Tour).'; end if;
  if pr.level > mn then raise exception 'Hãy nâng cấp đều các nghệ sĩ trong nhóm.'; end if;
  select * into pl from public.hm_players where id = pid;
  if pl.cash < b.up_cost then raise exception 'Không đủ tiền nâng cấp (cần %).', b.up_cost; end if;
  update public.hm_players set cash = cash - b.up_cost where id = pid;
  update public.hm_props set level = level + 1 where game_id = g and space = sp;
  perform public.hm_log(g, '⬆️ ' || pl.name || ' nâng ' || b.name || ' lên ' || (array['Single','EP','Album','Tour'])[pr.level + 1] || '.');
end $$;

create or replace function public.hm_do_sell(g uuid, pid uuid, sp int) returns void language plpgsql as $$
declare b public.hm_board; pr public.hm_props; mx int;
begin
  select * into b from public.hm_board where space = sp;
  select * into pr from public.hm_props where game_id = g and space = sp;
  if b.kind <> 'act' or pr.owner is distinct from pid or pr.level < 1 then raise exception 'Không có cấp nâng cấp nào để bán.'; end if;
  select max(p.level) into mx from public.hm_props p join public.hm_board x on x.space = p.space where p.game_id = g and p.owner = pid and x.grp = b.grp;
  if pr.level < mx then raise exception 'Hãy bán từ nghệ sĩ có cấp cao nhất trong nhóm.'; end if;
  update public.hm_props set level = level - 1 where game_id = g and space = sp;
  update public.hm_players set cash = cash + b.up_cost / 2 where id = pid;
  perform public.hm_log(g, '↩️ ' || (select name from public.hm_players where id = pid) || ' bán một cấp của ' || b.name || '.');
end $$;

create or replace function public.hm_do_jail_pay(g uuid, pid uuid) returns void language plpgsql as $$
begin
  if not (select in_jail from public.hm_players where id = pid) then raise exception 'Bạn không ở Gỡ nhạc.'; end if;
  if (select cash from public.hm_players where id = pid) < 50 then raise exception 'Không đủ 50 để đóng phí.'; end if;
  perform public.hm_pay(g, pid, null, 50);
  update public.hm_players set in_jail = false, jail_turns = 0 where id = pid;
  perform public.hm_log(g, '🔓 ' || (select name from public.hm_players where id = pid) || ' đóng phí 50 để ra khỏi Gỡ nhạc.');
end $$;

create or replace function public.hm_do_jail_card(g uuid, pid uuid) returns void language plpgsql as $$
begin
  if not (select in_jail from public.hm_players where id = pid) then raise exception 'Bạn không ở Gỡ nhạc.'; end if;
  if (select jail_cards from public.hm_players where id = pid) < 1 then raise exception 'Bạn không có thẻ ra tù.'; end if;
  update public.hm_players set in_jail = false, jail_turns = 0, jail_cards = jail_cards - 1 where id = pid;
  perform public.hm_log(g, '🔓 ' || (select name from public.hm_players where id = pid) || ' dùng thẻ để ra khỏi Gỡ nhạc.');
end $$;

-- ---------- bots (also plays for a human who is idle) ----------
create or replace function public.hm_bot_step(g uuid, pid uuid) returns void language plpgsql as $$
declare gm public.hm_games; pl public.hm_players; b public.hm_board; sp record; done boolean := false;
begin
  select * into gm from public.hm_games where id = g;
  select * into pl from public.hm_players where id = pid;
  if gm.phase = 'roll' then
    if pl.in_jail and pl.jail_cards > 0 then perform public.hm_do_jail_card(g, pid); return; end if;
    if pl.in_jail and pl.cash >= 400 then perform public.hm_do_jail_pay(g, pid); return; end if;
    for sp in select p.space, x.up_cost from public.hm_props p join public.hm_board x on x.space = p.space
              where p.game_id = g and p.owner = pid and x.kind = 'act' and p.level < 4 order by p.level, p.space loop
      if pl.cash >= sp.up_cost + 400 then
        begin perform public.hm_do_upgrade(g, pid, sp.space); done := true; exit;
        exception when raise_exception then null; end;
      end if;
    end loop;
    if done then return; end if;
    perform public.hm_do_roll(g, pid);
  elsif gm.phase = 'buy' then
    select * into b from public.hm_board where space = pl.pos;
    if pl.cash - b.price >= 100 then perform public.hm_do_buy(g, pid); else perform public.hm_after(g, pid); end if;
  else
    perform public.hm_end(g);
  end if;
end $$;

create or replace function public.hm_advance(g uuid) returns void language plpgsql as $$
declare gm public.hm_games; pl public.hm_players; n int := 0; k int;
begin
  loop
    n := n + 1; exit when n > 250;
    select * into gm from public.hm_games where id = g;
    exit when gm.status <> 'running';
    select * into pl from public.hm_players where id = gm.cur;
    if pl.bankrupt then perform public.hm_end(g);
    elsif pl.is_bot then perform public.hm_bot_step(g, pl.id);
    elsif clock_timestamp() - gm.turn_started_at > interval '120 seconds' then
      update public.hm_players set missed = missed + 1, is_bot = (missed + 1 >= 3) where id = pl.id;
      perform public.hm_log(g, '⏰ ' || pl.name || ' vắng mặt — hệ thống chơi thay lượt này.');
      for k in 1..40 loop
        perform public.hm_bot_step(g, pl.id);
        select * into gm from public.hm_games where id = g;
        exit when gm.status <> 'running' or gm.cur <> pl.id;
      end loop;
    else exit;
    end if;
  end loop;
end $$;

-- ---------- room / lobby ----------
create or replace function public.hm_new_code() returns text language plpgsql as $$
declare c text := ''; i int; chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  for i in 1..6 loop c := c || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
  return c;
end $$;

create or replace function public.hm_player_of(p_profile uuid, p_guest uuid) returns public.hm_players language sql stable as $$
  select pl.* from public.hm_players pl join public.hm_games g on g.id = pl.game_id
  where (p_profile is not null and pl.profile_id = p_profile) or (p_guest is not null and pl.guest_id = p_guest)
  order by (g.status in ('lobby','running')) desc, g.created_at desc limit 1
$$;

create or replace function public.hm_create(p_profile uuid, p_alias text, p_target int) returns jsonb language plpgsql as $$
declare g uuid; nm text;
begin
  if exists (select 1 from public.hm_games where status in ('lobby','running')) then return jsonb_build_object('error', 'Đang có một ván — hãy tham gia hoặc đợi ván đó xong.'); end if;
  if p_target is not null and (p_target < 2027 or p_target > 2100) then return jsonb_build_object('error', 'Năm đích phải từ 2027 tới 2100 (hoặc để trống).'); end if;
  nm := coalesce(nullif(left(trim(p_alias), 20), ''), (select name from public.profiles where id = p_profile), 'Label');
  insert into public.hm_games (code, target_year, created_by) values (public.hm_new_code(), p_target, p_profile) returning id into g;
  insert into public.hm_players (game_id, profile_id, name, seat) values (g, p_profile, nm, 0);
  perform public.hm_log(g, '🎤 ' || nm || ' mở ván Hit Makers mới.');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.hm_join(p_profile uuid, p_alias text) returns jsonb language plpgsql as $$
declare g public.hm_games; nm text; n int;
begin
  select * into g from public.hm_games where status = 'lobby';
  if g.id is null then return jsonb_build_object('error', 'Chưa có ván nào đang chờ.'); end if;
  if exists (select 1 from public.hm_players where game_id = g.id and profile_id = p_profile) then return jsonb_build_object('ok', true); end if;
  select count(*) into n from public.hm_players where game_id = g.id;
  if n >= 6 then return jsonb_build_object('error', 'Ván đã đủ 6 người.'); end if;
  nm := coalesce(nullif(left(trim(p_alias), 20), ''), (select name from public.profiles where id = p_profile), 'Label');
  if exists (select 1 from public.hm_players where game_id = g.id and lower(name) = lower(nm)) then nm := left(nm, 17) || ' ' || (n + 1); end if;
  insert into public.hm_players (game_id, profile_id, name, seat) values (g.id, p_profile, nm, n);
  perform public.hm_log(g.id, '👋 ' || nm || ' vào phòng.');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.hm_guest_join(p_code text, p_name text) returns jsonb language plpgsql as $$
declare g public.hm_games; nm text; n int; gid uuid; tok text;
begin
  select * into g from public.hm_games where status = 'lobby' and code = upper(trim(p_code));
  if g.id is null then return jsonb_build_object('error', 'Mã không đúng, hoặc ván đã bắt đầu / đã đóng.'); end if;
  nm := left(trim(coalesce(p_name, '')), 20);
  if char_length(nm) < 2 then return jsonb_build_object('error', 'Hãy đặt tên hãng đĩa (ít nhất 2 ký tự).'); end if;
  select count(*) into n from public.hm_players where game_id = g.id;
  if n >= 6 then return jsonb_build_object('error', 'Ván đã đủ 6 người.'); end if;
  if exists (select 1 from public.hm_players where game_id = g.id and lower(name) = lower(nm)) then nm := left(nm, 17) || ' ' || (n + 1); end if;
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.hm_guests (token, name, game_id) values (tok, nm, g.id) returning id into gid;
  insert into public.hm_players (game_id, guest_id, name, seat) values (g.id, gid, nm, n);
  perform public.hm_log(g.id, '👋 ' || nm || ' (khách) vào phòng.');
  return jsonb_build_object('ok', true, 'token', tok, 'name', nm);
end $$;

create or replace function public.hm_guest_by_token(p_token text) returns uuid language sql stable as
$$ select id from public.hm_guests where token = p_token $$;

create or replace function public.hm_lobby_edit(p_profile uuid, p_admin boolean, p_what text, p_n int) returns jsonb language plpgsql as $$
declare g public.hm_games; n int; i int; names text[] := array['Bot Mai','Bot Hải','Bot Linh','Bot Nam','Bot Vy','Bot Khoa'];
begin
  select * into g from public.hm_games where status = 'lobby';
  if g.id is null then return jsonb_build_object('error', 'Không có ván đang chờ.'); end if;
  if g.created_by is distinct from p_profile and not p_admin then return jsonb_build_object('error', 'Chỉ người mở ván mới làm được việc này.'); end if;
  if p_what = 'code' then update public.hm_games set code = public.hm_new_code() where id = g.id;
  elsif p_what = 'target' then
    if p_n is not null and (p_n < 2027 or p_n > 2100) then return jsonb_build_object('error', 'Năm đích phải từ 2027 tới 2100.'); end if;
    update public.hm_games set target_year = p_n where id = g.id;
  elsif p_what = 'bots' then
    select count(*) into n from public.hm_players where game_id = g.id;
    for i in 1..greatest(0, least(p_n, 6 - n)) loop
      insert into public.hm_players (game_id, name, seat, is_bot) values (g.id,
        (select nm from unnest(names) nm where not exists (select 1 from public.hm_players x where x.game_id = g.id and x.name = nm) limit 1), n + i - 1, true);
    end loop;
  elsif p_what = 'kick_bots' then delete from public.hm_players where game_id = g.id and is_bot;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.hm_start(p_profile uuid, p_admin boolean) returns jsonb language plpgsql as $$
declare g public.hm_games; n int; pn jsonb; pd jsonb; first_id uuid;
begin
  select * into g from public.hm_games where status = 'lobby' for update;
  if g.id is null then return jsonb_build_object('error', 'Không có ván đang chờ.'); end if;
  if g.created_by is distinct from p_profile and not p_admin then return jsonb_build_object('error', 'Chỉ người mở ván mới bắt đầu được.'); end if;
  select count(*) into n from public.hm_players where game_id = g.id;
  if n < 2 then return jsonb_build_object('error', 'Cần ít nhất 2 người (có thể thêm bot).'); end if;
  with o as (select id, row_number() over (order by random()) - 1 as s from public.hm_players where game_id = g.id)
  update public.hm_players p set seat = o.s from o where p.id = o.id;
  select jsonb_agg(idx order by random()) into pn from public.hm_cards where deck = 'news';
  select jsonb_agg(idx order by random()) into pd from public.hm_cards where deck = 'deal';
  select id into first_id from public.hm_players where game_id = g.id order by seat limit 1;
  update public.hm_games set status = 'running', started_at = now(), year = 2026, year_locked = false, crossed = '{}', round_no = 1,
    cur = first_id, phase = 'roll', turn_started_at = clock_timestamp(),
    decks = jsonb_build_object('news', 0, 'deal', 0, 'perm_news', pn, 'perm_deal', pd) where id = g.id;
  perform public.hm_log(g.id, '🚀 Ván bắt đầu — năm 2026' || case when g.target_year is not null then ', đích là năm ' || g.target_year else '' end || '. Lượt đầu: ' || (select name from public.hm_players where id = first_id) || '.');
  perform public.hm_advance(g.id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.hm_cancel(p_profile uuid, p_admin boolean) returns jsonb language plpgsql as $$
declare g public.hm_games;
begin
  select * into g from public.hm_games where status in ('lobby','running') for update;
  if g.id is null then return jsonb_build_object('error', 'Không có ván nào.'); end if;
  if g.created_by is distinct from p_profile and not p_admin then return jsonb_build_object('error', 'Chỉ người mở ván mới đóng được.'); end if;
  update public.hm_games set status = 'cancelled', finished_at = now() where id = g.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.hm_leave(p_profile uuid, p_guest uuid) returns jsonb language plpgsql as $$
declare pl public.hm_players; g public.hm_games;
begin
  pl := public.hm_player_of(p_profile, p_guest);
  if pl.id is null then return jsonb_build_object('ok', true); end if;
  select * into g from public.hm_games where id = pl.game_id for update;
  if g.status = 'lobby' then
    delete from public.hm_players where id = pl.id;
    if not exists (select 1 from public.hm_players where game_id = g.id and not is_bot) then update public.hm_games set status = 'cancelled', finished_at = now() where id = g.id; end if;
  elsif g.status = 'running' then
    update public.hm_players set is_bot = true where id = pl.id;
    perform public.hm_log(g.id, '🚪 ' || pl.name || ' rời bàn — bot chơi tiếp.');
    perform public.hm_advance(g.id);
    if not exists (select 1 from public.hm_players where game_id = g.id and not is_bot and not bankrupt) then update public.hm_games set status = 'cancelled', finished_at = now() where id = g.id; end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- the one action entry ----------
create or replace function public.hm_act(p_profile uuid, p_guest uuid, p_kind text, p_arg int) returns jsonb language plpgsql as $$
declare pl public.hm_players; g public.hm_games;
begin
  pl := public.hm_player_of(p_profile, p_guest);
  if pl.id is null then return jsonb_build_object('error', 'Bạn chưa ở trong ván nào.'); end if;
  select * into g from public.hm_games where id = pl.game_id for update;
  if g.status <> 'running' then return jsonb_build_object('error', 'Ván chưa chạy hoặc đã kết thúc.'); end if;
  perform public.hm_advance(g.id);
  select * into g from public.hm_games where id = g.id;
  if g.status <> 'running' then return jsonb_build_object('ok', true); end if;
  select * into pl from public.hm_players where id = pl.id;
  if pl.bankrupt then return jsonb_build_object('error', 'Bạn đã phá sản.'); end if;
  if g.cur is distinct from pl.id then return jsonb_build_object('error', 'Chưa tới lượt của bạn.'); end if;
  update public.hm_players set missed = 0 where id = pl.id;
  begin
    if p_kind = 'roll' then
      if g.phase <> 'roll' then raise exception 'Bây giờ không phải lúc tung xúc xắc.'; end if;
      perform public.hm_do_roll(g.id, pl.id);
    elsif p_kind = 'buy' then
      if g.phase <> 'buy' then raise exception 'Không có gì để mua.'; end if;
      perform public.hm_do_buy(g.id, pl.id);
    elsif p_kind = 'skip' then
      if g.phase <> 'buy' then raise exception 'Không có gì để bỏ qua.'; end if;
      perform public.hm_after(g.id, pl.id);
    elsif p_kind = 'end' then
      if g.phase <> 'end' then raise exception 'Bạn cần xong lượt này trước.'; end if;
      perform public.hm_end(g.id);
    elsif p_kind = 'jail_pay' then
      if g.phase <> 'roll' then raise exception 'Chỉ làm được ở đầu lượt.'; end if;
      perform public.hm_do_jail_pay(g.id, pl.id);
    elsif p_kind = 'jail_card' then
      if g.phase <> 'roll' then raise exception 'Chỉ làm được ở đầu lượt.'; end if;
      perform public.hm_do_jail_card(g.id, pl.id);
    elsif p_kind = 'upgrade' then perform public.hm_do_upgrade(g.id, pl.id, p_arg);
    elsif p_kind = 'sell' then perform public.hm_do_sell(g.id, pl.id, p_arg);
    else raise exception 'Hành động không hợp lệ.';
    end if;
  exception when raise_exception then
    return jsonb_build_object('error', sqlerrm);
  end;
  perform public.hm_advance(g.id);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- state for the page ----------
create or replace function public.hm_state(p_profile uuid, p_guest uuid) returns jsonb language plpgsql as $$
declare pl public.hm_players; g public.hm_games; open_g public.hm_games;
begin
  pl := public.hm_player_of(p_profile, p_guest);
  if pl.id is not null then
    select * into g from public.hm_games where id = pl.game_id;
    if g.status in ('finished','cancelled') and g.finished_at < now() - interval '2 hours' then pl := null; end if;
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
      'dice', g.last_dice, 'winner', g.winner, 'win_reason', g.win_reason, 'year_locked', g.year_locked,
      'turn_left', case when g.status = 'running' then greatest(0, 120 - extract(epoch from (clock_timestamp() - g.turn_started_at))::int) else null end),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'seat', p.seat, 'cash', p.cash, 'pos', p.pos,
        'in_jail', p.in_jail, 'jail_cards', p.jail_cards, 'bankrupt', p.bankrupt, 'bot', p.is_bot, 'guest', p.guest_id is not null,
        'worth', public.hm_worth(p.id)) order by p.seat), '[]'::jsonb) from public.hm_players p where p.game_id = g.id),
    'props', (select coalesce(jsonb_agg(jsonb_build_object('space', space, 'owner', owner, 'level', level)), '[]'::jsonb) from public.hm_props where game_id = g.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'body', body) order by id), '[]'::jsonb) from (select id, body from public.hm_events where game_id = g.id order by id desc limit 40) e),
    'board', (select jsonb_agg(jsonb_build_object('space', space, 'kind', kind, 'name', name, 'grp', grp, 'price', price, 'up_cost', up_cost) order by space) from public.hm_board)
  );
end $$;
