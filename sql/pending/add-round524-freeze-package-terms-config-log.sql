-- Round 524 — freeze package terms at lock + log Config changes.
--
-- WHAT THIS DOES
--  1. media_booking_packages gets frozen_terms (jsonb) + frozen_at. It holds a
--     copy of the commitment terms / Trợ Giá text / shared blocks as they were
--     when the package's release was locked. The artist link (pick-package)
--     reads the frozen copy first, so editing Config -> Package Terms no longer
--     rewrites what a locked/concluded release shows.
--  2. A trigger freezes automatically: when releases.package_locked turns true,
--     and when a package row is created on an already-locked release. Works for
--     every lock path (artist link, staff toggle, simulator, SQL).
--     It only fills packages whose frozen_terms is still empty, so unlocking and
--     relocking never refreshes an old freeze. A per-package override
--     (terms_text_override) still wins over the frozen copy.
--  3. Backfill: every release that is locked RIGHT NOW is frozen with today's
--     Config text (that is "freeze now").
--  4. config_change_log: records every change to the price defaults, package
--     terms, shared blocks and Trợ Giá items (old value, new value, who, when).
--  5. The Round 509 package_change_log ignores the new frozen_* columns so the
--     freeze does not show up as an "unexpected" artist_guest write.
--
-- Safe to re-run. Undo block at the bottom.

-- 1. columns ----------------------------------------------------------------
alter table media_booking_packages
  add column if not exists frozen_terms jsonb,
  add column if not exists frozen_at timestamptz;

-- 5 (first, so the freeze below is never logged). Patch Round 509's logger.
do $$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'log_package_change';
  if def is null then
    raise notice 'log_package_change() not found (Round 509 SQL not run) - skipped';
  elsif def like '%''frozen_terms''%' then
    raise notice 'log_package_change() already patched';
  elsif position('continue when k = ''updated_at'';' in def) = 0 then
    raise notice 'log_package_change() has an unexpected shape - NOT patched, check by hand';
  else
    execute replace(def, 'continue when k = ''updated_at'';', 'continue when k in (''updated_at'',''frozen_terms'',''frozen_at'');');
    raise notice 'log_package_change() patched';
  end if;
end $$;

-- 2. freeze function + triggers ---------------------------------------------
create or replace function freeze_release_package_terms(p_release uuid) returns int
language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  update media_booking_packages p set
    frozen_terms = jsonb_build_object(
      'terms_text',           (select c.terms_text           from contract_type_packages c where lower(trim(c.contract_type)) = lower(trim(p.name)) limit 1),
      'tro_gia_booking_text', (select c.tro_gia_booking_text from contract_type_packages c where lower(trim(c.contract_type)) = lower(trim(p.name)) limit 1),
      'shared_a',             (select g.value::text from global_settings g where g.key = 'package_terms_shared_a'),
      'shared_conditions',    (select g.value::text from global_settings g where g.key = 'package_terms_conditions'),
      'shared_b',             (select g.value::text from global_settings g where g.key = 'package_terms_shared_b'),
      'tro_gia_items',        (select g.value::text from global_settings g where g.key = 'tro_gia_booking_items')
    ),
    frozen_at = now()
  where p.release_id = p_release and p.frozen_terms is null;
  get diagnostics n = row_count;
  return n;
end
$fn$;
revoke all on function freeze_release_package_terms(uuid) from public, anon, authenticated;

create or replace function trg_freeze_on_lock() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if NEW.package_locked is true and OLD.package_locked is distinct from true then
    perform freeze_release_package_terms(NEW.id);
  end if;
  return null;
end
$fn$;
drop trigger if exists trg_freeze_on_lock on releases;
create trigger trg_freeze_on_lock after update of package_locked on releases
  for each row execute function trg_freeze_on_lock();

create or replace function trg_freeze_new_package() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if exists (select 1 from releases r where r.id = NEW.release_id and r.package_locked is true) then
    perform freeze_release_package_terms(NEW.release_id);
  end if;
  return null;
end
$fn$;
drop trigger if exists trg_freeze_new_package on media_booking_packages;
create trigger trg_freeze_new_package after insert on media_booking_packages
  for each row execute function trg_freeze_new_package();

-- 3. freeze what is locked right now ----------------------------------------
-- PREVIEW (run first): how many packages will be frozen
--   select count(*) from media_booking_packages p join releases r on r.id = p.release_id
--   where r.package_locked and p.frozen_terms is null;
select coalesce(sum(freeze_release_package_terms(r.id)), 0) as packages_frozen
from releases r where r.package_locked is true;

-- 4. config change log -------------------------------------------------------
create table if not exists config_change_log (
  id          bigserial primary key,
  changed_at  timestamptz not null default now(),
  source      text not null,          -- global_settings | contract_type_packages
  key         text not null,          -- setting key, or "<tier>.<column>"
  old_value   text,
  new_value   text,
  actor_id    uuid,
  actor_role  text
);
alter table config_change_log enable row level security;
revoke all on config_change_log from anon, authenticated;
grant select on config_change_log to authenticated;
drop policy if exists config_change_log_read on config_change_log;
create policy config_change_log_read on config_change_log for select to authenticated using (true);

create or replace function log_config_change() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare claims jsonb; uid uuid; rl text; col text; ov text; nv text;
begin
  begin claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb; exception when others then claims := null; end;
  rl := claims->>'role';
  begin uid := nullif(claims->>'sub','')::uuid; exception when others then uid := null; end;

  if TG_TABLE_NAME = 'global_settings' then
    if NEW.key not in ('media_booking_unit_price_defaults','package_terms_shared_a','package_terms_conditions','package_terms_shared_b','tro_gia_booking_items') then
      return null;
    end if;
    ov := case when TG_OP = 'UPDATE' then OLD.value::text end;
    nv := NEW.value::text;
    if ov is not distinct from nv then return null; end if;
    insert into config_change_log(source, key, old_value, new_value, actor_id, actor_role)
      values ('global_settings', NEW.key, ov, nv, uid, rl);
  else
    foreach col in array array['terms_text','tro_gia_booking_text','items','total_value'] loop
      ov := to_jsonb(OLD)->>col; nv := to_jsonb(NEW)->>col;
      if ov is distinct from nv then
        insert into config_change_log(source, key, old_value, new_value, actor_id, actor_role)
          values ('contract_type_packages', NEW.contract_type || '.' || col, ov, nv, uid, rl);
      end if;
    end loop;
  end if;
  return null;
end
$fn$;
drop trigger if exists trg_log_config_gs  on global_settings;
drop trigger if exists trg_log_config_ctp on contract_type_packages;
create trigger trg_log_config_gs  after insert or update on global_settings        for each row execute function log_config_change();
create trigger trg_log_config_ctp after update on contract_type_packages           for each row execute function log_config_change();

-- CHECKS ---------------------------------------------------------------------
-- every locked release's packages frozen? (expect 0)
--   select count(*) from media_booking_packages p join releases r on r.id = p.release_id
--   where r.package_locked and p.frozen_terms is null;
-- who changed config lately:
--   select changed_at, key, left(old_value,60) old, left(new_value,60) new, actor_id from config_change_log order by id desc limit 20;

-- UNDO -----------------------------------------------------------------------
-- drop trigger if exists trg_freeze_on_lock on releases;
-- drop trigger if exists trg_freeze_new_package on media_booking_packages;
-- drop trigger if exists trg_log_config_gs on global_settings;
-- drop trigger if exists trg_log_config_ctp on contract_type_packages;
-- update media_booking_packages set frozen_terms = null, frozen_at = null;
