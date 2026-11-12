-- Round 607 — a person can belong to a SECOND team. Only a dev may set it.
alter table profiles add column if not exists segment2 text;

create or replace function public.profiles_guard_r607() returns trigger
language plpgsql security definer set search_path = public as $$
declare arole text;
begin
  if auth.uid() is null then return new; end if;   -- SQL editor / service key
  if new.segment2 is distinct from old.segment2 then
    select role::text into arole from profiles where auth_id = auth.uid() limit 1;
    if arole is distinct from 'dev' then
      raise exception 'Only a dev can set a second team' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_guard_r607 on profiles;
create trigger trg_profiles_guard_r607 before update on profiles
  for each row execute function public.profiles_guard_r607();
