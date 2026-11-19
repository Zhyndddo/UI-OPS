-- Round 656 — a person's SECOND team (profiles.segment2, Round 607) now also receives that team's notifications.
-- Run AFTER add-round607-second-team.sql (needs profiles.segment2). Safe to rerun.
-- Same function as Round 469 (team + opted-in devs), only the team match changed.
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
     or segment2 = p_team
     or (role = 'dev' and notify_all_teams);
end;
$$;

-- VERIFY (as many rows as people in the team + people with that team as second team):
-- select count(*) from profiles where segment = 'Design' or segment2 = 'Design';
-- UNDO: re-run the fanout_notification block from add-round469-notify-assignment-and-backlog.sql
