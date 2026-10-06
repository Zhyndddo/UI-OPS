-- Round 468 — stop dev accounts auto-receiving EVERY team's notifications.
--
-- Why: fanout_notification() inserted a row for every profile where
-- `segment = p_team OR role = 'dev'`, so each of the 4 dev accounts caught
-- every team's traffic. From the 2026-10-01 backup: 21,717 notification rows,
-- 92% unread, and those 4 dev accounts alone held ~47% of all rows (more than
-- any real team member). Average fan-out was ~6.9 recipients per event.
--
-- What this does:
--   1. profiles.notify_all_teams boolean, default FALSE.
--   2. fanout_notification() now sends to the target team, plus a dev ONLY if
--      that dev has opted in (notify_all_teams = true).
--
-- Devs opt in themselves: the bell panel shows a "Receive every team's
-- notifications" checkbox to dev accounts (Round 468 app code). Nothing else
-- about who-gets-what changes — team members are matched exactly as before.
--
-- Order: safe either way. The app hides the checkbox until this column
-- exists, and this function does not depend on any app code.
--
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE, same signature).
-- No rows are deleted or changed in `notifications` by this file.

-- ---------------------------------------------------------------------------
-- STEP 1 — the opt-in flag (default: off for everyone, devs included)
-- ---------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notify_all_teams boolean DEFAULT false NOT NULL;

-- ---------------------------------------------------------------------------
-- STEP 2 — the fan-out. Same signature as before, so every caller (the insert/
-- complete triggers and the app's supabase.rpc("fanout_notification") calls
-- in releases, phai-sinh, manual-claim, pick-package, TicketListPage) keeps
-- working unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fanout_notification(
  p_team text, p_type text, p_title text, p_body text, p_link text, p_ticket_id uuid
) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  if p_team is null then
    return;
  end if;
  insert into notifications (profile_id, type, title, body, link, ticket_id)
  select id, p_type, p_title, p_body, p_link, p_ticket_id
  from profiles
  where segment = p_team
     or (role = 'dev' and notify_all_teams);
end;
$$;

-- ---------------------------------------------------------------------------
-- STEP 3 (optional) — keep specific devs on "see everything" right now.
-- Leave commented out unless someone really wants the old behaviour; they can
-- also just tick the checkbox in their own bell panel later.
-- ---------------------------------------------------------------------------
-- update profiles set notify_all_teams = true
-- where role = 'dev' and email in ('someone@example.com');

-- ---------------------------------------------------------------------------
-- STEP 4 (optional) — clear the existing backlog for devs who are NOT opted
-- in. Marks their unread rows as read (does NOT delete anything), so the bell
-- badge starts clean. Run only after STEP 2, and only if wanted.
-- ---------------------------------------------------------------------------
-- update notifications n
-- set read_at = now()
-- from profiles p
-- where n.profile_id = p.id
--   and p.role = 'dev'
--   and not p.notify_all_teams
--   and n.read_at is null;

-- ---------------------------------------------------------------------------
-- CHECK — read-only. After STEP 1, shows each dev and their flag; every dev
-- should read false until they (or STEP 3) turn it on.
-- ---------------------------------------------------------------------------
select name, email, role, notify_all_teams
from profiles
where role = 'dev'
order by name;
