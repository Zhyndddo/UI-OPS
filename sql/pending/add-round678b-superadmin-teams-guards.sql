-- Round 678 STEP 2 of 2 — run AFTER step 1. Extra teams for Super admins + database guards that treat a Super admin like an admin.
alter table public.profiles add column if not exists segments_extra text[] not null default '{}';

-- only a dev may set a second / extra team (extends the round-607 guard)
create or replace function public.profiles_guard_r607() returns trigger
language plpgsql security definer set search_path = public as $$
declare arole text;
begin
  if auth.uid() is null then return new; end if;   -- SQL editor / service key
  if new.segment2 is distinct from old.segment2 or new.segments_extra is distinct from old.segments_extra then
    select role::text into arole from profiles where auth_id = auth.uid() limit 1;
    if arole is distinct from 'dev' then
      raise exception 'Only a dev can set a second or extra team' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_guard_r607 on profiles;
create trigger trg_profiles_guard_r607 before update on profiles
  for each row execute function public.profiles_guard_r607();

-- fan-out notifications also reach Super admins who hold the team as an extra
create or replace function public.fanout_notification(p_team text, p_type text, p_title text, p_body text, p_link text, p_ticket_id uuid) returns void
language plpgsql as $$
begin
  if p_team is null then return; end if;
  insert into notifications (profile_id, type, title, body, link, ticket_id)
  select id, p_type, p_title, p_body, p_link, p_ticket_id
  from profiles
  where segment = p_team or segment2 = p_team or p_team = any (segments_extra) or (role = 'dev' and coalesce(notify_all_teams, false));
end $$;

-- round-556 profile guard / policies (only if that baseline is installed): Super admin = admin, but cannot touch dev, and only a dev can make or change a Super admin
do $do$
begin
  if to_regprocedure('public.profiles_guard_r556()') is not null then
    execute $f$
    create or replace function public.profiles_guard_r556() returns trigger
    language plpgsql security definer set search_path = public as $b$
    declare
      uid uuid := auth.uid();
      arole text;
      jwt_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
      sensitive boolean;
    begin
      if uid is null then return new; end if;
      sensitive := new.role is distinct from old.role or new.segment is distinct from old.segment or new.email is distinct from old.email
                or new.auth_id is distinct from old.auth_id or new.subteam is distinct from old.subteam;
      if not sensitive then return new; end if;
      if old.auth_id is null and new.auth_id = uid and lower(old.email) = jwt_email
         and new.role is not distinct from old.role and new.segment is not distinct from old.segment
         and new.email is not distinct from old.email and new.subteam is not distinct from old.subteam then
        return new;
      end if;
      select role::text into arole from profiles where auth_id = uid limit 1;
      if arole = 'dev' then return new; end if;
      if arole in ('admin', 'superadmin') then
        if new.auth_id is distinct from old.auth_id or new.email is distinct from old.email then
          raise exception 'Email and login link are changed through the admin API only' using errcode = '42501';
        end if;
        if new.role::text = 'dev' or old.role::text = 'dev' then
          raise exception 'Only a dev can change a dev account' using errcode = '42501';
        end if;
        if new.role is distinct from old.role and (new.role::text = 'superadmin' or old.role::text = 'superadmin') then
          raise exception 'Only a dev can make or change a Super admin' using errcode = '42501';
        end if;
        return new;
      end if;
      raise exception 'Only an admin can change role, team, subteam or email' using errcode = '42501';
    end $b$;
    $f$;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_insert_r556') then
    drop policy profiles_insert_r556 on public.profiles;
    create policy profiles_insert_r556 on public.profiles for insert to authenticated with check (
      (public.rls_actor_role() = 'dev')
      or (public.rls_actor_role() in ('admin', 'superadmin') and role::text not in ('dev', 'superadmin'))
      or (public.rls_actor_role() = 'teamlead' and role::text = 'exc' and segment::text = public.rls_actor_segment())
    );
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_r556') then
    drop policy profiles_update_r556 on public.profiles;
    create policy profiles_update_r556 on public.profiles for update to authenticated
      using (auth_id = auth.uid() or public.rls_actor_role() in ('admin', 'superadmin', 'dev') or (auth_id is null and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
      with check (auth_id = auth.uid() or public.rls_actor_role() in ('admin', 'superadmin', 'dev'));
  end if;
end $do$;
-- VERIFY: select column_name from information_schema.columns where table_name='profiles' and column_name='segments_extra';
-- UNDO: alter table public.profiles drop column segments_extra;  (role value stays; set the role back to admin on any Super admin first)
