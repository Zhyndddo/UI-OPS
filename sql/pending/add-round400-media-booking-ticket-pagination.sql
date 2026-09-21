-- Round 400 — real server-side pagination for the Media Booking ticket
-- list (app/tickets/media-booking/page.js), the last page in the
-- confirmed pagination rollout that still did a full-table fetch on every
-- visit. Flagged at the end of Round 399 as needing a small Postgres
-- function rather than a plain `.range()` swap: this list's sort ("release
-- date, farthest out first") and its search both key off the release
-- JOINED via ticket.data->>'releaseId', not a column on tickets itself —
-- PostgREST can't `.order()`/`.or()` filter by an embedded resource's
-- column, so the sort/search/count all have to happen inside a real query,
-- same reason Booking Board needed booking_board_page() (see
-- add-round303-booking-board-pagination.sql).
--
-- This one is much simpler than that one — no "is it done" business logic
-- to port, just a filtered/sorted/paginated id lookup — but it's still new
-- SQL with real ORDER BY semantics I have no way to run against your
-- actual data. Before trusting it:
--   1. Run on staging first if you can.
--   2. Open /tickets/media-booking after deploying the matching app code
--      and confirm: the executor view's status tabs still show the right
--      tickets, "farthest-out release date first" ordering still looks
--      right, and the requester view still shows REFUND tickets pulled to
--      the top.
--   3. Try a search term you know should match (by title, artist, label,
--      DID, requester name, or a word from a ticket's note) and confirm it
--      still finds the ticket.
-- Idempotent: CREATE OR REPLACE, safe to re-run.
--
-- Search note: the old client-side matchesQuery() (lib/SearchBox.js)
-- JSON.stringify-matched literally every field on the ticket AND the
-- joined release. This function narrows that to the fields someone would
-- actually type a booking-ticket search against — release title/artist/
-- label/DID, requester name, and the ticket's note — same "narrow to what
-- matters" tradeoff every other pagination-rollout conversion made
-- (see server-side-pagination-pitch.md). A search hit on some other
-- data.* field (e.g. a raw package total) won't match anymore.

create or replace function media_booking_ticket_page(
  p_tab_id uuid,
  p_status text,        -- executor view: the active status tab. Ignored (all statuses) when p_is_executor is false.
  p_is_executor boolean,
  p_search text,
  p_page int,
  p_page_size int
) returns jsonb language plpgsql stable as $$
declare
  v_offset int := greatest(0, (coalesce(p_page, 1) - 1) * coalesce(p_page_size, 50));
  v_limit int := coalesce(p_page_size, 50);
begin
  return (
    with base as (
      select
        t.id,
        t.status,
        r.release_date
      from tickets t
      left join releases r on r.did = (t.data ->> 'releaseId')
      where t.tab_id = p_tab_id
        and t.deleted_at is null
        and (p_is_executor is not true or p_status is null or p_status = '' or t.status = p_status)
        and (
          p_search is null or p_search = '' or
          r.title ilike '%' || p_search || '%' or
          r.main_artist ilike '%' || p_search || '%' or
          r.label ilike '%' || p_search || '%' or
          r.did ilike '%' || p_search || '%' or
          t.requester_name ilike '%' || p_search || '%' or
          (t.data ->> 'note') ilike '%' || p_search || '%'
        )
    ),
    counted as (
      select count(*) as total from base
    ),
    ordered as (
      select id
      from base
      order by
        -- Requester view only ("not executor"): REFUND tickets pulled to
        -- the top, same as tickets.filter(...).sort(byReleaseDate).sort()
        -- pulling REFUND first via two stable sorts — see the JS's own
        -- comment on why a second stable sort works this way. Executor
        -- view already filtered to one status, so this never reorders it.
        case when p_is_executor is not true and status = 'REFUND' then 0 else 1 end asc,
        release_date desc nulls last,
        id desc
      limit v_limit offset v_offset
    )
    select jsonb_build_object(
      'ticket_ids', coalesce((select jsonb_agg(id) from ordered), '[]'::jsonb),
      'total', (select total from counted)
    )
  );
end;
$$;

-- Supporting indexes — the join + search above run per candidate row.
create index if not exists idx_tickets_tab_deleted_status on tickets(tab_id, deleted_at, status);
create index if not exists idx_releases_did on releases(did);
