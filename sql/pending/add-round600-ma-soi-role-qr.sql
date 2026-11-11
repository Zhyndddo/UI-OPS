-- Round 600 — Ma Sói: scan-to-see-role QR. Each player gets a private, unguessable link token; the QR on their screen opens
-- /ma-soi/role?t=<token> on the phone (no login needed), which shows their role card. Reopenable any time. Safe to re-run.
alter table public.ms_players add column if not exists role_token text;
create unique index if not exists ms_players_role_token_uq on public.ms_players (role_token) where role_token is not null;

-- the caller's own token (created the first time it is asked for)
create or replace function public.ms_role_token(p_profile uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare gid uuid := public.ms_active(); me public.ms_players; tk text;
begin
  if gid is null then return jsonb_build_object('error', 'Chưa có ván chơi.'); end if;
  select * into me from public.ms_players where game_id = gid and profile_id = p_profile;
  if me.id is null then return jsonb_build_object('error', 'Bạn không ở trong ván này.'); end if;
  if me.role is null then return jsonb_build_object('error', 'Chưa chia vai — đợi ván bắt đầu.'); end if;
  tk := me.role_token;
  if tk is null then
    tk := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    update public.ms_players set role_token = tk where id = me.id;
  end if;
  return jsonb_build_object('token', tk);
end $$;

-- the public card: only what that one player is allowed to know (their own latest role card)
create or replace function public.ms_role_by_token(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.ms_players; gm public.ms_games; c record;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error', 'Mã không hợp lệ.'); end if;
  select * into me from public.ms_players where role_token = p_token;
  if me.id is null then return jsonb_build_object('error', 'Không tìm thấy thẻ vai trò.'); end if;
  select * into gm from public.ms_games where id = me.game_id;
  select title, body into c from public.ms_cards where game_id = me.game_id and player_id = me.id and kind = 'role' order by created_at desc limit 1;
  return jsonb_build_object('name', me.name, 'role', me.role, 'label', public.ms_role_vi(me.role), 'title', c.title, 'body', c.body,
                            'alive', me.alive, 'status', gm.status);
end $$;

revoke all on function public.ms_role_token(uuid) from public, anon, authenticated;
revoke all on function public.ms_role_by_token(text) from public, anon, authenticated;
grant execute on function public.ms_role_token(uuid) to service_role;
grant execute on function public.ms_role_by_token(text) to service_role;
