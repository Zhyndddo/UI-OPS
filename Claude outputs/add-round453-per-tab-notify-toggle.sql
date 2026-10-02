-- Round 453 followup — per-ticket-tab toggle for "notify team on new
-- ticket". Today trg_notify_on_ticket_insert (notify_on_ticket_insert())
-- fires unconditionally for EVERY ticket insert across EVERY tab, the
-- instant notification_settings.enabled is on — one global switch, no way
-- to mute a specific noisy/high-volume ticket type (e.g. one that gets a
-- lot of auto- or bulk-created rows) without turning notifications off for
-- every tab at once. This adds a per-tab on/off, defaulting to the exact
-- current behavior (true = notify, same as today) so nothing changes for
-- any tab until someone explicitly flips it off in Config → Notifications.
--
-- Deliberately scoped to notify_on_ticket_insert only (the "new ticket
-- needs a PIC" fanout to the whole executor team) — that's the one
-- generating one notification per ROW, which is what "too much row and
-- trigger" was about. notify_on_ticket_complete (completion pings back to
-- the requester) is unaffected; revisit separately if it turns out to need
-- the same treatment.
--
-- Safe to run once; safe to re-run (IF NOT EXISTS guard on the column,
-- CREATE OR REPLACE on the function — the trigger itself stays attached,
-- nothing needs re-creating there).

ALTER TABLE ticket_tabs
  ADD COLUMN IF NOT EXISTS notify_on_insert boolean DEFAULT true NOT NULL;

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
begin
  select enabled into settings_enabled from notification_settings where id = 1;
  if not coalesce(settings_enabled, false) then
    return new;
  end if;

  select label, executor_team, key, notify_on_insert into tab_label, tab_team, tab_key, tab_notify from ticket_tabs where id = new.tab_id;
  if tab_team is null then
    return new;
  end if;

  -- The new per-tab mute. coalesce defaults a null (shouldn't happen, the
  -- column is NOT NULL, but belt-and-suspenders) to true so a tab never
  -- silently goes mute from a missing value.
  if not coalesce(tab_notify, true) then
    return new;
  end if;

  product_title := case tab_key
    when 'phai_sinh' then new.data ->> 'tenBai'
    when 'manual_claim' then new.data ->> 'tenBai'
    when 'report_conflict' then new.data ->> 'assetTitle'
    when 'artist_profile' then new.data ->> 'artistName'
    when 'khac' then new.data ->> 'request'
    when 'design' then new.data ->> 'project'
    else null
  end;

  if product_title is null and tab_key = 'phu_luc' and new.data ->> 'releaseId' is not null then
    begin
      select title into product_title from releases where id = (new.data ->> 'releaseId')::uuid;
    exception when others then
      product_title := null;
    end;
  elsif product_title is null then
    select title into product_title from releases where did = new.data ->> 'releaseId';
  end if;

  perform fanout_notification(
    tab_team,
    'new_ticket',
    'New ' || tab_label || ' ticket' || case when product_title is not null then ' — ' || product_title else '' end,
    coalesce(new.requester_name, new.requester_segment, 'A new ticket') || ' needs a PIC.',
    '/tickets/' || replace(tab_key, '_', '-'),
    new.id
  );
  return new;
end;
$$;
