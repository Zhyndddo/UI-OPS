-- Round 280 — new ticket type "Bổ Sung DATA" (bo_sung_data).
--
-- Requester: OPS. Executor: AR. Deliberately just 2 statuses — this ticket
-- has no manual status workflow at all; PENDING -> COMPLETE is set
-- automatically by the app (app/tickets/bo-sung-data/page.js) the moment
-- every one of the release's 6 Metadata Checklist fields (see
-- lib/metadataChecklist.js — the SAME columns/values the release detail
-- page's own Metadata Checklist reads/writes) is resolved: the 4 required
-- ones (Audio/Artwork/Lyric/Metadata) at "true", the other 2 (Working
-- Files/MV) at either "true" or "false" (not "update"/blank). No REFUND/
-- CANCELED/PROCESS in between — there's nothing manual to advance through.
--
-- Idempotent: safe to run more than once.
insert into ticket_tabs (key, label, segment, status_options, default_status, sort_order, executor_team)
values ('bo_sung_data', 'Bổ Sung DATA', 'OPS', array['PENDING', 'COMPLETE'], 'PENDING', 0, 'AR')
on conflict (key) do nothing;
