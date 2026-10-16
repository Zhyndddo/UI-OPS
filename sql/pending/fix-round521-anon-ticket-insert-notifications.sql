-- Round 521 — artist (logged-out) can't create tickets: the notification
-- trigger runs with the artist's permissions and dies on
--   "permission denied for table notifications"
-- which rolls back the WHOLE ticket insert (and the app never checks).
-- That's why a real artist's package pick left no Phụ Lục ticket
-- (TMNX-20102026-0163), while staff picks always got one.
--
-- Fix: the notification functions run as their owner (SECURITY DEFINER) so
-- the notification rows are written no matter who triggered the ticket.
-- We do NOT grant anon INSERT on notifications (that would let anyone write
-- arbitrary notifications straight into the table).
--
-- Safe to re-run. STEP 1 shows the state, STEP 2 applies, STEP 3 re-runs the
-- same test that failed — inside a transaction that is rolled back.

-- ───────── STEP 1: current state ─────────
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('fanout_notification','notify_profiles','notify_on_ticket_insert',
                    'notify_on_ticket_complete','notify_on_ticket_pic_change')
order by 1;

-- ───────── STEP 2: apply ─────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('fanout_notification','notify_profiles','notify_on_ticket_insert',
                        'notify_on_ticket_complete','notify_on_ticket_pic_change')
  loop
    execute format('alter function %s security definer set search_path = public', r.sig);
    -- notify_profiles is only ever called from the trigger functions above
    -- (never from the app), so nobody needs to call it directly.
    -- fanout_notification stays callable: the app calls it via rpc().
    if r.proname = 'notify_profiles' then
      execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    end if;
  end loop;
end $$;

-- ───────── STEP 3: re-run the failing test (rolled back, nothing kept) ─────────
-- Expect: it now succeeds (INSERT 0 1), no "permission denied".
begin;
set local role anon;
insert into tickets (tab_id, data)
select id, '{"releaseId":"00000000-0000-0000-0000-000000000000","test":true}'::jsonb
from ticket_tabs where key = 'phu_luc';
rollback;

-- ───────── STEP 4: confirm the functions are now definer ─────────
select proname, prosecdef as security_definer
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('fanout_notification','notify_profiles','notify_on_ticket_insert',
                  'notify_on_ticket_complete','notify_on_ticket_pic_change')
order by 1;

-- ───────── UNDO (only if needed) ─────────
-- do $$ declare r record; begin
--   for r in select p.oid::regprocedure as sig from pg_proc p
--            where p.pronamespace='public'::regnamespace
--              and p.proname in ('fanout_notification','notify_profiles','notify_on_ticket_insert',
--                                'notify_on_ticket_complete','notify_on_ticket_pic_change')
--   loop execute format('alter function %s security invoker reset search_path', r.sig); end loop;
-- end $$;
-- grant execute on function public.notify_profiles(uuid[],text,text,text,text,uuid) to public, anon, authenticated;
