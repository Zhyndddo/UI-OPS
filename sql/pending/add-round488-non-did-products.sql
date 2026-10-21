-- Round 488 — non-DID products for Booking Không Trong Package, the
-- NON-PACKAGE BOOKING workstation and Cost Marketing.
-- Additive + idempotent. Needs NO Round 418 resync.
--
-- 1) non_did_products: the reusable list. A product is just a name (+ optional
--    artist / note); `code` ("ND-XXXXXX") stands in for a DID wherever the app
--    needs a short id (Cost Marketing's DID column, import/export matching).
create table if not exists non_did_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  artist text,
  note text,
  code text not null default ('ND-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists non_did_products_name_idx on non_did_products (lower(name));
create unique index if not exists non_did_products_code_idx on non_did_products (code);
grant select, insert, update on public.non_did_products to anon, authenticated;

-- 2) Cost Marketing keys its rows by release_id. A non-DID product has no
--    release row, so it uses its non_did_products.id in that same column.
--    That only works if the column no longer demands a real release: drop the
--    foreign keys on release_id (the column itself, the unique keys and the
--    data stay exactly as they are). Trade-off: deleting a release no longer
--    cascades its cost / installment / PIC rows (releases are never hard-deleted
--    from the app, only soft-deleted).
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'public.releases'::regclass
      and a.attname = 'release_id'
      and c.conrelid in (
        'public.workstation_cost_mkt_entries'::regclass,
        'public.workstation_cost_mkt_installments'::regclass,
        'public.workstation_assignments'::regclass
      )
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- CHECK (read-only): 1 row, then 0 rows (no remaining release FKs on those 3 tables).
select table_name from information_schema.tables where table_name = 'non_did_products';
select c.conrelid::regclass, c.conname
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
where c.contype = 'f' and c.confrelid = 'public.releases'::regclass and a.attname = 'release_id'
  and c.conrelid in ('public.workstation_cost_mkt_entries'::regclass, 'public.workstation_cost_mkt_installments'::regclass, 'public.workstation_assignments'::regclass);
