-- Round 496 — NON-PACKAGE BOOKING works like the Booking Board.
--   BOOKED = Booking Không Trong Package tickets' Số liệu / Số lượng
--   ADDED  = rows in this new table (links for TikTok, quantities for Ads)
-- Additive + idempotent. Needs NO Round 418 resync. Run PART 1 first, deploy,
-- then PART 2 (preview, then the conversion) if you want old test data moved.

-- PART 1 — the table
create table if not exists non_package_booking_entries (
  id uuid primary key default gen_random_uuid(),
  row_key text not null,            -- release DID, or the non-DID product's code (ND-…)
  row_label text,                   -- title shown when the row has no ticket
  category text not null,           -- 'TikTok Channel' | 'Ads'
  brand text not null,
  hang_muc text not null,
  link text,                        -- TikTok
  quantity numeric,                 -- Ads
  status text,                      -- Chưa Booking/Đã Gửi/Done  |  Chưa Chạy/Đang Chạy/Đã Chạy/Pending
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists npb_entries_row_idx on non_package_booking_entries (row_key);
grant select, insert, update, delete on public.non_package_booking_entries to anon, authenticated;

-- CHECK: 1 row
select table_name from information_schema.tables where table_name = 'non_package_booking_entries';

-- PART 2 — convert what the OLD workstation wrote as tickets (Rounds 448–495).
-- "Workstation-made" = a ticket whose data has no 'note' key (every form ticket has one).
-- Row key = DID, else the non-DID code, else the code of a product with that name, else a release whose
-- title equals the ticket's Tên bài. Tickets with a link/qty but NO resolvable key are left untouched
-- (listed in 2a as 'NO KEY - leave') so nothing is lost.

-- 2a) PREVIEW
select t.id, t.status, t.created_at, t.data->>'tenBai' as ten_bai, t.data->>'brand' as brand, t.data->>'hangMuc' as hang_muc,
       t.data->>'category' as category, t.data->>'linkUrl' as link, t.data->>'soLuong' as qty,
       k.row_key,
       case when coalesce(t.data->>'linkUrl','') = '' and coalesce(t.data->>'soLuong','') = '' then 'blank -> cancel'
            when k.row_key is null or coalesce(t.data->>'brand','') = '' then 'NO KEY/BRAND - leave'
            else 'convert to entry + cancel' end as action
from tickets t
join ticket_tabs tt on tt.id = t.tab_id and tt.key = 'booking_not_in_package'
left join non_did_products p on lower(p.name) = lower(t.data->>'productName')
left join lateral (select r.did from releases r where lower(r.title) = lower(t.data->>'tenBai') limit 1) rr on true
left join lateral (select coalesce(nullif(t.data->>'relatedDid',''), nullif(t.data->>'nonDidCode',''), p.code, rr.did) as row_key) k on true
where t.deleted_at is null and t.status not in ('CANCELED','REFUND') and not (t.data ? 'note')
order by t.created_at;

-- 2b) CONVERT + CANCEL (run once, all together)
create temp table npb_src on commit drop as
select t.id as ticket_id,
       coalesce(nullif(t.data->>'relatedDid',''), nullif(t.data->>'nonDidCode',''), p.code, rr.did) as row_key,
       coalesce(nullif(t.data->>'productName',''), t.data->>'tenBai') as row_label,
       t.data->>'category' as category, t.data->>'brand' as brand, t.data->>'hangMuc' as hang_muc,
       nullif(t.data->>'linkUrl','') as link, nullif(t.data->>'soLuong','') as qty,
       coalesce(nullif(t.data->>'linkStatus',''), nullif(t.data->>'adsStatus','')) as st,
       t.requester_profile_id, t.created_at
from tickets t
join ticket_tabs tt on tt.id = t.tab_id and tt.key = 'booking_not_in_package'
left join non_did_products p on lower(p.name) = lower(t.data->>'productName')
left join lateral (select r.did from releases r where lower(r.title) = lower(t.data->>'tenBai') limit 1) rr on true
where t.deleted_at is null and t.status not in ('CANCELED','REFUND') and not (t.data ? 'note');

insert into non_package_booking_entries (row_key, row_label, category, brand, hang_muc, link, quantity, status, created_by, created_at)
select row_key, row_label, category, brand, hang_muc,
       case when category = 'TikTok Channel' then link end,
       case when category = 'Ads' then qty::numeric end,
       coalesce(st, case when category = 'Ads' then 'Chưa Chạy' else 'Chưa Booking' end),
       requester_profile_id, created_at
from npb_src
where row_key is not null and coalesce(brand,'') <> ''
  and ((category = 'TikTok Channel' and link is not null) or (category = 'Ads' and qty is not null));

update tickets t
set status = 'CANCELED', status_log = coalesce(t.status_log, '{}'::jsonb) || jsonb_build_object('CANCELED', now())
from npb_src s
where s.ticket_id = t.id
  and ( (s.link is null and s.qty is null)                                           -- blank
     or (s.row_key is not null and coalesce(s.brand,'') <> ''))                      -- converted above
;

-- 2c) form tickets from the OLD form that carry a TikTok link but no Số liệu: it counted 1 before -> booked 1
update tickets t
set data = jsonb_set(t.data, '{soLuong}', '"1"')
from ticket_tabs tt
where tt.id = t.tab_id and tt.key = 'booking_not_in_package'
  and t.deleted_at is null and t.status not in ('CANCELED','REFUND') and (t.data ? 'note')
  and t.data->>'category' = 'TikTok Channel' and coalesce(t.data->>'linkUrl','') <> '' and coalesce(t.data->>'soLuong','') = '';
