-- Round 493 — Label on Booking Không Trong Package (non-DID products keep one).
-- Run AFTER add-round488 and add-round492. Additive + idempotent. No Round 418 resync.
-- The new "External (Hợp Tác)" label type (LBL_EXTERNAL) is app-side only: pick it
-- in Labels → LBL Tag; no table change.

alter table non_did_products add column if not exists label text;

drop function if exists create_non_did_product(text, text, date, uuid);

create or replace function create_non_did_product(
  p_name text, p_artist text, p_release_date date, p_label text, p_created_by uuid
) returns non_did_products
language plpgsql
as $$
declare
  v_initials text;
  v_code text;
  v_row non_did_products;
begin
  select coalesce(string_agg(upper(left(w, 1)), ''), '')
    into v_initials
  from regexp_split_to_table(
         regexp_replace(
           translate(lower(p_name),
             'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
             'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'),
           '[^a-z0-9 ]', '', 'g'),
         '\s+') as w
  where w <> '';
  if v_initials = '' then v_initials := 'XX'; end if;
  v_initials := left(v_initials, 6);

  v_code := 'ND-' || v_initials || '-' ||
            to_char(coalesce(p_release_date, current_date), 'DDMMYYYY') || '-' ||
            lpad(nextval('non_did_seq')::text, 4, '0');

  insert into non_did_products (name, artist, release_date, label, code, created_by)
  values (trim(regexp_replace(p_name, '\s+', ' ', 'g')), nullif(trim(p_artist), ''), p_release_date, nullif(trim(p_label), ''), v_code, p_created_by)
  returning * into v_row;
  return v_row;
end $$;

grant execute on function create_non_did_product(text, text, date, text, uuid) to anon, authenticated;

-- CHECK (read-only): 1 row each
select column_name from information_schema.columns where table_name = 'non_did_products' and column_name = 'label';
select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'create_non_did_product';
