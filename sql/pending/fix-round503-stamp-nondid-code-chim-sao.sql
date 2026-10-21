-- Round 503 — Chim Sáo Ngày Xưa tickets: stamp the Non-DID code on them so
-- Cost Marketing counts them. Run PART 1 (read-only) first.

-- PART 1 — every Booking Không Trong Package ticket for this song and what it holds.
select t.id, t.status, t.created_at,
       t.data->>'tenBai' as ten_bai, t.data->>'relatedDid' as related_did,
       t.data->>'nonDidCode' as non_did_code, t.data->>'brand' as brand,
       t.data->>'hangMuc' as hang_muc, t.data->>'soLuong' as so_luong
from tickets t
join ticket_tabs tb on tb.id = t.tab_id and tb.key = 'booking_not_in_package'
where t.deleted_at is null and lower(t.data->>'tenBai') = lower('Chim Sáo Ngày Xưa')
order by t.created_at;

-- PART 1b — does the product exist?
select * from non_did_products where code = 'ND-CSNX-04102026-0001';

-- PART 2 — stamp the code on live tickets that have no DID and no code yet.
update tickets t
set data = t.data || jsonb_build_object('nonDidCode', 'ND-CSNX-04102026-0001')
from ticket_tabs tb
where tb.id = t.tab_id and tb.key = 'booking_not_in_package'
  and t.deleted_at is null
  and t.status not in ('CANCELED','REFUND')
  and lower(t.data->>'tenBai') = lower('Chim Sáo Ngày Xưa')
  and coalesce(t.data->>'relatedDid','') = ''
  and coalesce(t.data->>'nonDidCode','') = '';
