-- Round 627 — Supabase linter WARN 0011 (function_search_path_mutable): pin the search path of our own public functions.
-- Without it, a caller could shadow a table/function name by creating objects in a schema earlier in their search path.
-- "public, extensions, pg_temp" keeps every unqualified name working (our tables, pgcrypto/pg_trgm helpers) and puts temp objects last.
-- Touches only functions in schema public that are not owned by an extension and have no search_path yet. Idempotent.
do $$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', r.sig);
    n := n + 1;
  end loop;
  raise notice 'search_path pinned on % functions', n;
end $$;
-- CHECK (expect 0):
-- select count(*) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.prokind in ('f','p')
--   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
--   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
-- UNDO (one function): alter function public.<name>(<args>) reset search_path;
