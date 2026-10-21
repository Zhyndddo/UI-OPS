-- Round 495 — one-off cleanup of blank Booking Không Trong Package tickets
-- (link / quantity removed, nothing left). Run the SELECT first.
-- Cancelling is reversible (status can be set back) and Cost Marketing ignores CANCELED.
-- Needs NO Round 418 resync.

-- 1) PREVIEW
select t.id, t.created_at, t.status, t.requester_name, t.data->>'tenBai' as ten_bai, t.data->>'brand' as brand, t.data->>'hangMuc' as hang_muc
from tickets t join ticket_tabs tt on tt.id = t.tab_id and tt.key = 'booking_not_in_package'
where t.deleted_at is null and t.status not in ('CANCELED','REFUND')
  and coalesce(t.data->>'linkUrl','') = '' and coalesce(t.data->>'soLuong','') = ''
order by t.created_at;

-- 2) CANCEL them
update tickets t
set status = 'CANCELED',
    status_log = coalesce(t.status_log, '{}'::jsonb) || jsonb_build_object('CANCELED', now())
from ticket_tabs tt
where tt.id = t.tab_id and tt.key = 'booking_not_in_package'
  and t.deleted_at is null and t.status not in ('CANCELED','REFUND')
  and coalesce(t.data->>'linkUrl','') = '' and coalesce(t.data->>'soLuong','') = '';
