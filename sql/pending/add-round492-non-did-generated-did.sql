-- Round 492 — generated DID for non-DID products (Booking Không Trong Package).
-- Needs add-round488-non-did-products.sql run first. Additive + idempotent.
-- Needs NO Round 418 resync. Existing products keep their current ND-XXXXXX code.
--
-- Code format:  ND-<initials of Tên bài>-<ddmmyyyy of Ngày phát hành>-<seq 4 digits>
-- e.g. "Tình Nhạt Tình Nồng", 27/08/2026  ->  ND-TNTN-27082026-0001
-- Own sequence (non_did_seq) + "ND-" prefix: can never clash with release DIDs.

alter table non_did_products add column if not exists release_date date;

create sequence if not exists non_did_seq start 1;

create or replace function create_non_did_product(
  p_name text, p_artist text, p_release_date date, p_created_by uuid
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

  insert into non_did_products (name, artist, release_date, code, created_by)
  values (trim(regexp_replace(p_name, '\s+', ' ', 'g')), nullif(trim(p_artist), ''), p_release_date, v_code, p_created_by)
  returning * into v_row;
  return v_row;
end $$;

grant execute on function create_non_did_product(text, text, date, uuid) to anon, authenticated;
grant usage, select on sequence non_did_seq to anon, authenticated;

-- CHECK (read-only), after running:
select column_name from information_schema.columns where table_name = 'non_did_products' and column_name = 'release_date';  -- 1 row
select proname from pg_proc where proname = 'create_non_did_product';                                                      -- 1 row
