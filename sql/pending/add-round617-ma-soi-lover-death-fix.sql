-- Round 617 — FIX: a Thợ săn who shoots one of two lovers got "Lỗi hệ thống".
-- Cause: the "lover_death" story texts (round 589) were missing from ms_templates, so the dawn/vote story became empty and the card insert failed.
-- This (1) puts the missing story texts back, only if they are missing, and (2) makes ms_tpl() never return an empty text again. Safe to run more than once.

insert into public.ms_templates (kind, body)
select v.kind, v.body from (values
 ('lover_death', 'Nhưng chuyện chưa dừng ở đó: {names} không chịu nổi nỗi đau mất người yêu và gục ngã theo. Hoá ra hai người đã được mũi tên Thần Tình Yêu buộc vào nhau từ đêm đầu.'),
 ('lover_death', 'Và rồi một tiếng thở dài nữa: {names} đã đi theo người thương. Ra là trái tim của họ vốn đã gắn chặt với nhau từ bao giờ.'),
 ('day_idiot', 'Đám đông đã kéo {name} ra giữa sân — nhưng khi sợi dây vừa siết lại, ai đó nhận ra {name} chỉ là Kẻ ngốc của làng. Không ai nỡ ra tay. {name} được tha, nhưng từ nay sẽ không còn được bỏ phiếu nữa.'),
 ('day_idiot', 'Lá phiếu đã được đếm, và cái tên được gọi là {name}. Nhưng {name} bật cười ngô nghê, và cả làng chợt hiểu đây là Kẻ ngốc. Làng tha cho {name} — kèm một điều kiện: đừng bao giờ bỏ phiếu nữa.')
) as v(kind, body)
where not exists (select 1 from public.ms_templates t where t.kind = v.kind);

create or replace function public.ms_tpl(k text, nm text default '', nms text default '') returns text
language sql as $$
  select coalesce(
    (select replace(replace(body, '{name}', nm), '{names}', nms) from public.ms_templates where kind = k order by random() limit 1),
    case k when 'lover_death' then nms || ' không chịu nổi nỗi đau mất người yêu và gục ngã theo.'
           when 'day_idiot' then nm || ' là Kẻ ngốc và được làng tha.'
           else btrim(nm || ' ' || nms) end)
$$;

-- VERIFY (read-only): both should be 2 or more
select kind, count(*) from public.ms_templates where kind in ('lover_death','day_idiot') group by kind;
