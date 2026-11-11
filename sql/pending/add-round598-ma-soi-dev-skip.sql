-- ============================================================================
-- Round 598 — Ma Sói dev tool: "⏩ Chốt lượt ngay" (close the current phase now, so a test game can keep moving)
-- ============================================================================
-- Run AFTER add-round596. Idempotent. Dev/admin only, called from the page's test-tools box (bots can also play by themselves there).
create or replace function public.ms_dev_skip(p_profile uuid) returns jsonb
language plpgsql as $$
declare gid uuid;
begin
  if not public.ms_is_staff_dev(p_profile) then return jsonb_build_object('error', 'Chỉ admin/dev.'); end if;
  gid := public.ms_active();
  if gid is null then return jsonb_build_object('error', 'Chưa có ván chơi.'); end if;
  update public.ms_games set status = 'running', phase_ends_at = now() - interval '1 second' where id = gid and status in ('running','paused');
  perform public.ms_advance(gid);
  update public.ms_games set status = 'running', phase_ends_at = now() + interval '1 hour' where id = gid and status = 'paused';   -- a skipped, unanswered phase would pause the game; a test game just continues
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.ms_dev_skip(uuid) from public, anon, authenticated;
grant execute on function public.ms_dev_skip(uuid) to service_role;
-- VERIFY (read-only):   select proname from pg_proc where proname = 'ms_dev_skip';   -- 1 row
