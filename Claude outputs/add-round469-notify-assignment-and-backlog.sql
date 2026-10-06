-- Round 469 — make a new task actually reach the right person.
--
-- Findings behind this file (see claude/notification-attention-plan.md):
--   * Only two triggers on `tickets` ever notified anyone: AFTER INSERT (new
--     ticket -> whole executor team) and AFTER UPDATE (complete -> requester).
--     NOTHING fired when a person was tagged as PIC on an existing ticket, so
--     the person actually given the work (usually after the ticket was created)
--     never heard about it.
--   * A new ticket pinged the whole team (+ every dev), so everyone assumed
--     someone else had it, and 92% of 21k rows are unread.
--
-- What this does:
--   1. Includes Round 468's dev opt-in (profiles.notify_all_teams + fanout),
--      so THIS file is enough on its own. Running 468 as well is harmless.
--   2. Includes Round 453's per-tab mute column (notify_on_insert), same reason.
--   3. NEW trigger: tagging someone as PIC on an existing ticket notifies
--      exactly the people ADDED ("You were assigned ...", type ticket_assigned).
--   4. New ticket: if PICs are already tagged, only they are notified; with no
--      PIC yet, the executor team is notified as before ("needs a PIC").
--      The per-tab mute only silences that team broadcast, never an assignment.
--   5. Partial index so "how many unread do I have?" is a fast exact count.
--   6. One-off backlog reset: marks old unread rows as READ (nothing deleted).
--
-- Safe to re-run: IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS.
-- No live data is deleted. Run the whole file in order.

-- ---------------------------------------------------------------------------
-- STEP 1 — columns this depends on (idempotent supersets of Rounds 453 + 468)
-- ---------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notify_all_teams boolean DEFAULT false NOT NULL;

ALTER TABLE ticket_tabs
  ADD COLUMN IF NOT EXISTS notify_on_insert boolean DEFAULT true NOT NULL;

-- ---------------------------------------------------------------------------
-- STEP 2 — team fan-out (same as Round 468: team + only opted-in devs)
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
-- STEP 3 — targeted fan-out: exactly these profiles (+ opted-in devs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_profiles(
  p_profile_ids uuid[], p_type text, p_title text, p_body text, p_link text, p_ticket_id uuid
) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  if p_profile_ids is null or cardinality(p_profile_ids) = 0 then
    return;
  end if;
  insert into notifications (profile_id, type, title, body, link, ticket_id)
  select p.id, p_type, p_title, p_body, p_link, p_ticket_id
  from profiles p
  where p.id = any(p_profile_ids)
     or (p.role = 'dev' and p.notify_all_teams);
end;
$$;

-- ---------------------------------------------------------------------------
-- STEP 4 — product title shown in the notification (shared by both triggers;
-- same per-tab lookups the insert trigger already used)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ticket_notify_title(p_tab_key text, p_data jsonb) RETURNS text
    LANGUAGE plpgsql
    AS $$
declare
  product_title text;
begin
  product_title := case p_tab_key
    when 'phai_sinh' then p_data ->> 'tenBai'
    when 'manual_claim' then p_data ->> 'tenBai'
    when 'report_conflict' then p_data ->> 'assetTitle'
    when 'artist_profile' then p_data ->> 'artistName'
    when 'khac' then p_data ->> 'request'
    when 'design' then p_data ->> 'project'
    else null
  end;

  if product_title is null and p_tab_key = 'phu_luc' and p_data ->> 'releaseId' is not null then
    begin
      select title into product_title from releases where id = (p_data ->> 'releaseId')::uuid;
    exception when others then
      product_title := null;
    end;
  elsif product_title is null then
    select title into product_title from releases where did = p_data ->> 'releaseId';
  end if;

  return product_title;
end;
$$;

-- ---------------------------------------------------------------------------
-- STEP 5 — NEW TICKET: tagged PICs get it; with no PIC yet, the team does
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_ticket_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  settings_enabled boolean;
  tab_label text;
  tab_team text;
  tab_key text;
  tab_notify boolean;
  product_title text;
  all_pics uuid[];
  notify_pics uuid[];
  title_suffix text;
begin
  select enabled into settings_enabled from notification_settings where id = 1;
  if not coalesce(settings_enabled, false) then
    return new;
  end if;

  select label, executor_team, key, notify_on_insert into tab_label, tab_team, tab_key, tab_notify from ticket_tabs where id = new.tab_id;

  product_title := public.ticket_notify_title(tab_key, new.data);
  title_suffix := case when product_title is not null then ' — ' || product_title else '' end;

  all_pics := case
    when coalesce(cardinality(new.pic_profile_ids), 0) > 0 then new.pic_profile_ids
    when new.pic_profile_id is not null then array[new.pic_profile_id]
    else '{}'::uuid[]
  end;

  if cardinality(all_pics) > 0 then
    -- Someone is already on it: tell THEM (not the requester, if they tagged
    -- themselves). Not affected by the per-tab team mute.
    notify_pics := array_remove(all_pics, new.requester_profile_id);
    perform public.notify_profiles(
      notify_pics,
      'ticket_assigned',
      'New ' || tab_label || ' ticket for you' || title_suffix,
      coalesce(new.requester_name, new.requester_segment, 'Someone') || ' assigned this to you.',
      '/tickets/' || replace(tab_key, '_', '-'),
      new.id
    );
    return new;
  end if;

  -- No PIC yet: broadcast to the executor team, unless the tab is muted.
  if tab_team is null then
    return new;
  end if;
  if not coalesce(tab_notify, true) then
    return new;
  end if;

  perform fanout_notification(
    tab_team,
    'new_ticket',
    'New ' || tab_label || ' ticket' || title_suffix,
    coalesce(new.requester_name, new.requester_segment, 'A new ticket') || ' needs a PIC.',
    '/tickets/' || replace(tab_key, '_', '-'),
    new.id
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- STEP 6 — NEW: someone was tagged as PIC on an existing ticket
-- Notifies only the people ADDED (not those already on it, not removals).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_ticket_pic_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  settings_enabled boolean;
  old_ids uuid[];
  new_ids uuid[];
  added uuid[];
  tab_label text;
  tab_key text;
  product_title text;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  select enabled into settings_enabled from notification_settings where id = 1;
  if not coalesce(settings_enabled, false) then
    return new;
  end if;

  old_ids := case
    when coalesce(cardinality(old.pic_profile_ids), 0) > 0 then old.pic_profile_ids
    when old.pic_profile_id is not null then array[old.pic_profile_id]
    else '{}'::uuid[]
  end;
  new_ids := case
    when coalesce(cardinality(new.pic_profile_ids), 0) > 0 then new.pic_profile_ids
    when new.pic_profile_id is not null then array[new.pic_profile_id]
    else '{}'::uuid[]
  end;

  select coalesce(array_agg(x), '{}'::uuid[]) into added
  from unnest(new_ids) as x
  where not (x = any(old_ids));

  if cardinality(added) = 0 then
    return new;
  end if;

  select label, key into tab_label, tab_key from ticket_tabs where id = new.tab_id;
  product_title := public.ticket_notify_title(tab_key, new.data);

  perform public.notify_profiles(
    added,
    'ticket_assigned',
    'You were assigned a ' || tab_label || ' ticket' || case when product_title is not null then ' — ' || product_title else '' end,
    coalesce(new.requester_name, new.requester_segment, 'Someone') || ' — open it to start.',
    '/tickets/' || replace(tab_key, '_', '-'),
    new.id
  );
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_ticket_pic_change ON tickets;
CREATE TRIGGER trg_notify_on_ticket_pic_change
  AFTER UPDATE OF pic_profile_id, pic_profile_ids ON tickets
  FOR EACH ROW
  WHEN (old.pic_profile_id IS DISTINCT FROM new.pic_profile_id
        OR old.pic_profile_ids IS DISTINCT FROM new.pic_profile_ids)
  EXECUTE FUNCTION public.notify_on_ticket_pic_change();

-- ---------------------------------------------------------------------------
-- STEP 7 — fast exact unread count for the bell badge
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (profile_id)
  WHERE read_at IS NULL;

-- ---------------------------------------------------------------------------
-- STEP 8 — backlog reset (one-off). Marks old unread rows as READ for
-- everyone; nothing is deleted and anything newer than the cutoff is kept so
-- people don't lose today's real items. Change the interval if you want a
-- different cutoff (e.g. '0 days' = everything currently unread).
-- ---------------------------------------------------------------------------
update notifications
set read_at = now()
where read_at is null
  and created_at < now() - interval '1 day';

-- ---------------------------------------------------------------------------
-- CHECK — read-only. Unread rows left per person (should now be small).
-- ---------------------------------------------------------------------------
select p.name, p.segment, p.role, count(*) as unread
from notifications n
join profiles p on p.id = n.profile_id
where n.read_at is null
group by p.name, p.segment, p.role
order by unread desc
limit 20;
