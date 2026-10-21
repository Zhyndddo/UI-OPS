-- Round 536 — Row-level-security AUDIT. READ-ONLY: only SELECTs, nothing is changed,
-- no secrets are returned (token/password columns are listed by NAME only, never by value).
-- Run each STEP separately in the Supabase SQL editor and paste me the result grids.
-- (The editor only shows the last result of a run, so one STEP per run.)

-- ============================ STEP 1 — the overview ============================
-- One result table. Sorted worst first. severity: HIGH / MEDIUM / INFO / OK.
with t as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity as rls, c.relforcerowsecurity as forced, c.reltuples::bigint as est_rows,
         coalesce(c.reloptions::text, '') as opts
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
),
pol as (select tablename, count(*) as n from pg_policies where schemaname = 'public' group by 1),
priv as (
  select t.*,
    coalesce(pol.n, 0) as policies,
    (case when has_table_privilege('anon', t.oid, 'SELECT') then 'S' else '' end ||
     case when has_table_privilege('anon', t.oid, 'INSERT') then 'I' else '' end ||
     case when has_table_privilege('anon', t.oid, 'UPDATE') then 'U' else '' end ||
     case when has_table_privilege('anon', t.oid, 'DELETE') then 'D' else '' end) as anon_p,
    (case when has_table_privilege('authenticated', t.oid, 'SELECT') then 'S' else '' end ||
     case when has_table_privilege('authenticated', t.oid, 'INSERT') then 'I' else '' end ||
     case when has_table_privilege('authenticated', t.oid, 'UPDATE') then 'U' else '' end ||
     case when has_table_privilege('authenticated', t.oid, 'DELETE') then 'D' else '' end) as auth_p
  from t left join pol on pol.tablename = t.relname
)
-- A: every table / view
select * from (
select 'A table/view' as section, relname as object,
       format('%s | rls=%s policies=%s | anon[%s] authenticated[%s] | ~%s rows', case relkind when 'v' then 'view' when 'm' then 'matview' else 'table' end, rls, policies, anon_p, auth_p, est_rows) as detail,
       case
         when relkind in ('v','m') and anon_p <> '' and opts not like '%security_invoker=true%' then 'HIGH'
         when relkind in ('r','p') and not rls and anon_p <> '' then 'HIGH'
         when relkind in ('r','p') and not rls then 'MEDIUM'
         when relkind in ('r','p') and rls and policies = 0 then 'INFO'
         else 'OK' end as severity
from priv
union all
-- B: existing policies
select 'B policy', tablename, policyname || ' [' || cmd || '] roles=' || roles::text || ' using=' || coalesce(qual, '-') || ' check=' || coalesce(with_check, '-'), 'INFO'
from pg_policies where schemaname = 'public'
union all
-- C: security-definer functions in public (they run with the owner's rights and bypass RLS)
select 'C function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'security definer, anon can execute=' || has_function_privilege('anon', p.oid, 'EXECUTE') || ', authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE'),
       case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'HIGH' else 'INFO' end
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosecdef
union all
-- D: columns whose NAME looks sensitive, readable by the logged-out role
select 'D sensitive column', c.table_name || '.' || c.column_name,
       'anon can SELECT this column; table rls=' || (select relrowsecurity from pg_class where oid = (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass),
       case when (select relrowsecurity from pg_class where oid = (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass) then 'MEDIUM' else 'HIGH' end
from information_schema.columns c
where c.table_schema = 'public'
  and c.column_name ~* '(token|password|secret|api_?key|email|phone|iban|bank|salary|payment|contract)'
  and has_column_privilege('anon', (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass, c.column_name, 'SELECT')
union all
-- E: privilege-escalation check on profiles (can any logged-in user change their own role / team?)
select 'E escalation', 'profiles.' || c.column_name, 'authenticated can UPDATE this column=' || has_column_privilege('authenticated', 'public.profiles'::regclass, c.column_name, 'UPDATE')
       || ', anon=' || has_column_privilege('anon', 'public.profiles'::regclass, c.column_name, 'UPDATE'),
       case when has_column_privilege('anon', 'public.profiles'::regclass, c.column_name, 'UPDATE') then 'HIGH'
            when has_column_privilege('authenticated', 'public.profiles'::regclass, c.column_name, 'UPDATE') then 'HIGH' else 'OK' end
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'profiles' and c.column_name in ('role', 'segment', 'email', 'auth_id', 'is_active')
union all
-- F: tables streamed through realtime (realtime follows the same rules; worth knowing)
select 'F realtime', tablename, 'in supabase_realtime publication', 'INFO'
from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
union all
-- Z: one summary line
select 'Z summary', 'ALL', format('tables=%s | rls ON=%s | anon can read %s | anon can write %s | authenticated can write %s',
        count(*) filter (where relkind in ('r','p')),
        count(*) filter (where relkind in ('r','p') and rls),
        count(*) filter (where relkind in ('r','p') and anon_p like '%S%'),
        count(*) filter (where relkind in ('r','p') and (anon_p like '%I%' or anon_p like '%U%' or anon_p like '%D%')),
        count(*) filter (where relkind in ('r','p') and (auth_p like '%I%' or auth_p like '%U%' or auth_p like '%D%'))), 'INFO'
from priv
) r
order by case severity when 'HIGH' then 1 when 'MEDIUM' then 2 when 'INFO' then 3 else 4 end, section, object;

-- ============================ STEP 2 — what can a LOGGED-OUT visitor actually read? ============================
-- Pretends to be the public (anon) role for a moment and counts the rows it can see in the tables the
-- magic-link pages touch. Run the whole STEP (begin … rollback) in one go. Still read-only (the role switch is undone, then rolled back). A row count > 0 means
-- an anonymous caller holding the public key can read that many rows today.
begin;
do $$
declare
  t text; n bigint; v jsonb := '[]'::jsonb;
  tabs text[] := array['releases','magic_links','tickets','ticket_tabs','release_package_items','media_booking_entries',
    'media_booking_packages','media_booking_package_lines','package_categories','contract_type_packages','global_settings',
    'milestone_chart_entries','milestone_viral_posts','release_stream_metrics','cost_mkt_snapshots','performance_share_links',
    'booking_channels','profiles','lookup_options','notifications','audit_log','artists'];
begin
  foreach t in array tabs loop
    if to_regclass('public.' || quote_ident(t)) is null then
      v := v || jsonb_build_array(jsonb_build_object('tbl', t, 'anon_can_see_rows', null, 'note', 'table not found'));
      continue;
    end if;
    begin
      set local role anon;
      execute format('select count(*) from public.%I', t) into n;
      reset role;
      v := v || jsonb_build_array(jsonb_build_object('tbl', t, 'anon_can_see_rows', n, 'note', case when n > 0 then 'READABLE by anon' else 'empty / hidden' end));
    exception when others then
      reset role;
      v := v || jsonb_build_array(jsonb_build_object('tbl', t, 'anon_can_see_rows', null, 'note', 'blocked: ' || sqlerrm));
    end;
  end loop;
  perform set_config('app.rls_probe', v::text, false);
end $$;
select * from jsonb_to_recordset(current_setting('app.rls_probe')::jsonb) as x(tbl text, anon_can_see_rows bigint, note text) order by 2 desc nulls last;
rollback;

-- ============================ STEP 3 — file storage buckets (optional, tiny) ============================
-- Which storage buckets are public?
select id as bucket, public as is_public, file_size_limit, allowed_mime_types from storage.buckets order by public desc, id;
