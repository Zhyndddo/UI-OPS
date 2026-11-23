-- Round 678 STEP 1 of 2 — allow the new role value 'superadmin' on profiles.role. Run this ALONE first (an enum value cannot be used in the same run it is added).
do $$
declare ty text; kind "char"; c record;
begin
  select a.atttypid::regtype::text, t.typtype into ty, kind
    from pg_attribute a join pg_type t on t.oid = a.atttypid
   where a.attrelid = 'public.profiles'::regclass and a.attname = 'role' and not a.attisdropped;
  if kind = 'e' then
    execute format('alter type %s add value if not exists %L before %L', ty, 'superadmin', 'dev');
    raise notice 'enum % now has superadmin', ty;
  else
    for c in select conname from pg_constraint
              where conrelid = 'public.profiles'::regclass and contype = 'c'
                and pg_get_constraintdef(oid) ilike '%role%' and pg_get_constraintdef(oid) ilike '%dev%'
    loop
      execute format('alter table public.profiles drop constraint %I', c.conname);
    end loop;
    alter table public.profiles add constraint profiles_role_check check (role in ('exc','teamlead','admin','superadmin','dev'));
    raise notice 'role check now allows superadmin';
  end if;
end $$;
-- VERIFY: select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_role_check';   -- or: select enum_range(null::<role enum>);
