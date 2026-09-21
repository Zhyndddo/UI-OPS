-- Round 397 item 3 — "re-check publishing ticket and phụ lục publishing if
-- they get intertwined."
--
-- READ-ONLY. Not a migration — nothing here writes anything, safe to run
-- as-is in the Supabase SQL Editor. Not moved to sql/pending or sql/applied
-- since there's no schema change to track.
--
-- Context found in the codebase (see app/releases/[id]/page.js and
-- lib/labelHopTacStatus.js): there are THREE separate "Publishing"-shaped
-- systems that share vocabulary but are different data:
--   1. Hợp Đồng Publishing — a per-LABEL contract, tracked on
--      labels.hop_tac_status->'Publishing' (done/pending/none). Lives on
--      the Label List page.
--   2. "Publishing" ticket (gate_publishing / ticket type "publishing") —
--      a per-RELEASE ticket, matched by tickets.data->>'releaseId' ===
--      the release's real UUID (releases.id) — NOT its DID, unlike every
--      other gate-linked ticket type in the app.
--   3. Phụ Lục Publishing (gate_phu_luc_publishing / ticket type
--      "phu_luc_publishing") — a per-RELEASE addendum, matched by DID like
--      normal. Force-locked to "No" in the release detail page's UI the
--      moment #1 (the release's label's Hợp Đồng Publishing) is done.
--
-- DATA_FIXES.md's own history shows systems #2 and #3 were genuinely
-- conflated once before (Round 71, corrected in Round 72), so the concern
-- is a reasonable one to keep re-checking.
--
-- The live code risk found this round: app/releases/[id]/page.js has a
-- useEffect that runs every time the release detail page loads (not just
-- on an explicit user action):
--
--   const publishingHdLocked = publishingHdDone(labelRow);
--   useEffect(() => {
--     if (publishingHdLocked && form.gate_phu_luc_publishing !== "false") {
--       update("gate_phu_luc_publishing", "false");
--     }
--   }, [publishingHdLocked]);
--
-- This only touches in-memory form state, but if the release is then
-- Saved for ANY reason (even an unrelated field edit) while a label's Hợp
-- Đồng Publishing is done, gate_phu_luc_publishing gets persisted back to
-- "false" — even for a release whose Phụ Lục Publishing was requested
-- (ticket already exists) BEFORE the label's contract was ever signed.
-- That flag is read downstream by app/tickets/phai-sinh/page.js to decide
-- whether a release's derivative-works ticket should show a "Publishing"
-- scope tag — so a retroactive label-level contract could silently make a
-- real, already-sent Phụ Lục Publishing request disappear from that view.
--
-- The two queries below don't change anything — they just surface how much
-- of this may have already happened, so you can decide whether it's worth
-- a follow-up fix (e.g. only auto-locking NEW releases under that label,
-- or excluding releases that already have a phu_luc_publishing ticket).

-- ============================================================
-- Query 1 — releases where this is most likely to have already fired:
-- label's Hợp Đồng Publishing is done, AND a real Phụ Lục Publishing
-- ticket already exists for the release (proof the request was real and
-- predates, or is independent of, the label-level contract), but the
-- release's own gate_phu_luc_publishing flag currently reads "false".
-- Any row here is worth opening in the release detail page to confirm
-- whether "No" is actually correct or was silently overwritten.
-- ============================================================
select
  r.id as release_id,
  r.did,
  r.title,
  r.main_artist,
  r.label,
  r.gate_phu_luc_publishing as current_flag_value,
  t.id as phu_luc_publishing_ticket_id,
  t.status as ticket_status,
  t.created_at as ticket_created_at
from releases r
join labels l on l.label_name = r.label
join tickets t
  on t.data ->> 'releaseId' = r.did
  and t.deleted_at is null
  and t.tab_id = (select id from ticket_tabs where key = 'phu_luc_publishing')
where l.hop_tac_status -> 'Publishing' ->> 'done' = 'true'
  and coalesce(r.gate_phu_luc_publishing, 'false') = 'false'
order by t.created_at asc;

-- ============================================================
-- Query 2 — broader context: every release under a label whose Hợp Đồng
-- Publishing is done, showing its current gate flag and whether a
-- Phụ Lục Publishing ticket exists at all, plus (for comparison) whether
-- a separate standalone "Publishing" ticket (system #2 above, matched by
-- release UUID not DID) exists too — useful to eyeball whether the two
-- ticket types are staying properly independent per release.
-- ============================================================
select
  r.id as release_id,
  r.did,
  r.title,
  r.label,
  r.gate_phu_luc_publishing as phu_luc_publishing_flag,
  (
    select count(*) from tickets t
    where t.data ->> 'releaseId' = r.did
      and t.deleted_at is null
      and t.tab_id = (select id from ticket_tabs where key = 'phu_luc_publishing')
  ) as phu_luc_publishing_ticket_count,
  (
    select count(*) from tickets t
    where t.data ->> 'releaseId' = r.id::text
      and t.deleted_at is null
      and t.tab_id = (select id from ticket_tabs where key = 'publishing')
  ) as standalone_publishing_ticket_count
from releases r
join labels l on l.label_name = r.label
where l.hop_tac_status -> 'Publishing' ->> 'done' = 'true'
order by r.label, r.release_date desc;
