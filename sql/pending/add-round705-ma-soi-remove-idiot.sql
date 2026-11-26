-- Round 705 — Ma Sói: take the "Kẻ ngốc" (idiot) card out of the role pool (it was almost the same as "Thằng ngu" / fool).
-- Only the pool in ms_start() changes (patched in place, so nothing else in the function is retyped). Games already running that
-- already dealt an idiot keep working; old game logs still show the name. Re-runnable.
do $$
declare r record; d text; n int := 0;
begin
  for r in select p.oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'ms_start' loop
    d := pg_get_functiondef(r.oid);
    if position('''idiot'',' in d) > 0 then
      execute replace(d, '''idiot'',', '');
      n := n + 1;
    end if;
  end loop;
  raise notice 'ms_start patched: % function(s) (0 = already removed or not found)', n;
end $$;

-- check (read-only): must be false
select position('''idiot''' in pg_get_functiondef(p.oid)) > 0 as idiot_still_in_pool
from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'ms_start';
