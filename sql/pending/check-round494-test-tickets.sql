-- Round 494 — READ-ONLY: who/what created the "test tên bài" booking tickets.
select t.id, t.created_at, t.status, t.requester_name, t.requester_profile_id,
       t.data->>'tenBai' as ten_bai, t.data->>'productName' as product, t.data->>'nonDidCode' as nd_code,
       t.data->>'category' as category, t.data->>'brand' as brand, t.data->>'hangMuc' as hang_muc,
       t.data->>'linkUrl' as link, t.data->>'soLuong' as so_luong
from tickets t
join ticket_tabs tt on tt.id = t.tab_id and tt.key = 'booking_not_in_package'
where t.deleted_at is null and t.created_at >= current_date
order by t.created_at;

-- Audit trail for those ticket ids (replace the ids): who touched them.
-- select * from audit_log where entity = 'ticket' and entity_id in ('<id1>','<id2>','<id3>') order by created_at;
