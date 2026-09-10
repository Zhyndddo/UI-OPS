# Round 281 — audit logging, requester attribution, workstation auto-assign

## Why

Investigated why Media Booking tickets were reverting to REQUESTED. Found 4
legitimate UI-driven paths (Send/Resend Package Ticket, INT Package's forced
reopen, the plain status dropdown on the ticket list, admin's Reset to
DEALING) — no bug, but also no way to tell WHO triggered any of them, only
WHEN (`status_log` is timestamp-only). Decided to fix this properly rather
than patch around it.

## What shipped this round

1. **`audit_log` wired up** — the table already existed in the schema
   (`actor, action, entity, entity_id, field, before_val, after_val,
   created_at`, plus a lookup index on `created_at/actor/entity`) but
   nothing ever wrote to it. `lib/auditLog.js` is the write helper
   (`logAudit`, `logTicketStatusChange`, `logTicketCreate`,
   `logTicketDelete`, `logPicReassign`, `logDeadlineChange`). `actor` is
   always a `profiles.id` (uuid as text), never a display name, so entries
   stay valid across renames and are joinable back to `profiles`.

2. **`tickets.requester_profile_id`** (new, additive — old free-text
   `requester_segment`/`requester_name` untouched, same pattern Round 279
   used for `pic_profile_ids`). Auto-populated with the creating profile's
   id at every ticket-creation call site wired this round; a page that
   still lets a human type/pick a different requester manually keeps doing
   so unchanged — the auto-derived id is a default, not a replacement for
   an explicit override.

3. **`releases.created_by_profile_id`** (new) — records who submitted New
   Release Setup. Threaded through as `requester_profile_id` on every
   ticket auto-created for that release afterward (both the creation-time
   cascade in `app/new-release/page.js` and the later ones in
   `app/releases/[id]/page.js`), so "the requester" for an auto-ticket
   system is the person who actually created the product, per explicit
   request.

4. **`tickets.deleted_by`** — column already existed (text), never written.
   Now set to the acting profile's id wherever a ticket gets soft-deleted,
   alongside a `logTicketDelete` audit row.

5. **Workstation auto-assign** (`lib/workstationHelpers.js`'s
   `resolveAutoAssignee`/`autoAssignUnassigned`) — a workstation row with no
   PIC auto-assigns to that segment's team lead; if the segment has zero or
   more than one `role='teamlead'` profile (ambiguous — no single owner),
   falls back to an admin on the same segment (alphabetically first if
   more than one). Writes a REAL `workstation_assignments` row (not just a
   display fallback — see the pre-existing `PicDefaultsSection` in
   `app/config/page.js`, which only ever affected what rendered, never
   what `task-table` counted as someone's work) so it actually becomes a
   tracked task for that person and shows up on Task Table, which is the
   "push them to assign" part of the ask. Logged as `auto_assign` with
   `actor: null` — the one legitimate system-initiated (no click behind
   it) audit entry in the app as of this round.

6. **Task Table requester column** — `app/task-table/page.js` now also
   attributes each ticket to its `requester_profile_id` (not just PIC/
   executor), in a separate section, since the requester team is
   responsible for checking their own tickets got done. Tickets with no
   `requester_profile_id` (everything created before this round, or any
   ticket-type page not yet wired) simply don't show up in that section —
   nothing breaks, it's additive.

7. **PIC reassignment + deadline-change logging** — every place a ticket's
   `pic_profile_id`/`pic_profile_ids` or `deadline` changes now also writes
   an audit row (`logPicReassign`/`logDeadlineChange`).

## Scope: Round 281 vs. Round 282

Round 281 wired the **shared components most ticket types already go
through** (`lib/TicketListPage.js`, `lib/PhuLucStyleTicketList.js`,
`lib/batchPhaiSinhStatus.js`, `lib/NewTicketPage.js`,
`lib/NewArtistProfileTicketPopup.js`) plus the **specific bespoke pages
already investigated that session** (`app/tickets/media-booking/page.js` +
its `new/page.js`, `app/releases/[id]/page.js`'s `sendPackageTicket`/
`sendIntPackage`/`resetToDealing`, `app/tickets/bo-sung-data/page.js` + its
`new/page.js`), plus `app/new-release/page.js`, the 3 wired workstation
pages (`upload`/`confirm`/`pre-release`), and `app/task-table/page.js`.

**Round 282 finished the rest** — every remaining bespoke ticket-type list
and creation page now logs status changes (with reopen/complete
auto-classified), PIC/executor reassignment, deadline changes, soft-delete
(+ `deleted_by`), and creation (+ `requester_profile_id`) wherever those
writes exist:

- `artist-profile`, `pitching-info` — status/PIC (creation already went
  through `lib/NewArtistProfileTicketPopup.js` in Round 281).
  `app/tickets/pitching/page.js` confirmed genuinely read-only by design
  (Round 79) — nothing to wire, status is computed and displayed only.
- The Data Request cluster — `co-trong-net-youtube`, `discovery-mode-
  spotify`, `report-conflict` (full list+create wiring), plus `mv-spotify`,
  `pre-order-itunes`, `priority-sync-lyric`, `sony-publish`, `split-share`
  (list-side only — their creation already went through the shared
  `lib/NewTicketPage.js` in Round 281).
- `design` — the most complex bespoke type: status, PIC, deadline, and the
  bundled `confirmProcessModal` patch (status+PIC+deadline in one write) all
  wired; `confirmUrgent`'s `data.urgentConfirmed` flag (not a status/PIC/
  deadline field) logged via `logAudit` directly with `action:
  "confirm_urgent"`.
- `manual-claim`, `newrelease-upload`, `publishing` — status/PIC (+
  creation for the latter two, which are bespoke forms).
- `phai-sinh` (list + creation, both the batch and single-song insert
  paths) and `batch-phai-sinh/[id]` (the batch detail page) — including
  fixing `batchPhaiSinhStatus.js`'s `recomputeBatchStatus(batchTicketId,
  actor)` caller, which Round 281 updated but never passed `actor` through;
  it now passes the viewing profile. Per-item `phai_sinh_batch_items`
  status/PIC/deadline changes log with `entity: "phai_sinh_batch_item"`
  (a different table from `tickets`) via `logAudit` directly.
- `phu-luc` (the real Phụ Lục Truyền Thông implementation — not to be
  confused with `phu-luc-mg`/`phu-luc-publishing`/`phu-luc-truyen-thong`,
  which already went through the shared `PhuLucStyleTicketList`/
  `TicketListPage` components in Round 281) — status/PIC/creation, plus its
  manual Mã PL override (`canEditPhuLucMaPL`-gated) logged as `action:
  "edit", field: "ma_pl"`.
- `app/workstation/pitching/page.js` — turned out to have real writes of
  its own (per-platform PIC columns and per-platform status columns on
  `releases`, plus a derived ticket-status recompute) — wired via `logAudit`
  (entity `"release"`) and `logTicketStatusChange`.
- Confirmed display/data-entry-only, nothing to wire: `app/workstation/
  stream/page.js`, `app/workstation/milestone/page.js`, `app/workstation/
  package-price/page.js` (placeholder, not built yet), `app/booking/page.js`
  (the real Booking Board route — no PIC field, no ticket-status write
  anywhere in it, only its own domain fields).

**Still not wired, deliberately out of scope** (flagged Round 281,
unchanged): Config-level changes (pricing, platforms, role/segment
assignment), release-level package/payment-status field history, and no
audit-log viewer UI yet (write-path only, query `audit_log` directly via
Supabase for now — `idx_audit_log_lookup` covers `created_at/actor/entity`
filtering).

## Other gaps identified but deliberately deferred

Surfaced during research, NOT built this round (flagged to the user,
explicitly out of scope for now — separate, larger domains):

- Config-level changes (Lookup Options, Package Terms, Media Booking
  Pricing, Platforms, PIC Defaults, role/segment assignment on `profiles`
  itself) have zero audit trail. Arguably higher-risk than ticket-level
  changes (privilege escalation, pricing) — worth its own round.
- Package/pricing lock and payment-status changes on `releases`
  (`package_locked`, `package_payment_status`, `package_total_value`) —
  high-stakes financial fields, no change history.
- No audit-log VIEWER UI was built this round — this round is write-path
  only. Rows are queryable directly in Supabase for now
  (`idx_audit_log_lookup` covers `created_at/actor/entity` filtering). A
  read-only "Activity Log" page/section is a natural next step once the
  write side has run for a while and it's clear what filtering people
  actually want.
- `lib/TicketListPage.js`'s existing ad hoc `data.__requesterEditedBy/
  __requesterEditedAt/__requesterEditedField` stamps (a requester editing
  their own ticket post-creation) are a bespoke precursor to exactly what
  `audit_log` now formalizes — left as-is this round (it also drives a
  `fanout_notification`, not just recordkeeping), but a candidate to fold
  into `logAudit` directly in a later cleanup pass.

## Round 283 — daily digest date filter, Phái Sinh requester column, and an important FK-ambiguity fix

1. **Daily digest "Missing Data" section** now scoped to a rolling 2-month
   window (last month + this month, by `release_date`) instead of every
   release ever missing a checklist item regardless of age — per explicit
   request ("no old song, just new song this month and last month"). See
   `app/api/cron/daily-digest/route.js`'s `missingDataMonthWindow()`. Uses
   UTC calendar dates, matching this route's existing convention
   (`todayUTC()`) — not the GMT+7 `localDateStr` the client pages use,
   since this runs server-side with no "local" timezone of its own.

2. **Phái Sinh now shows a Requester column** (both desktop table and
   mobile card layout), resolved from `requester_profile_id` via an
   explicit `requesterProfile:profiles!tickets_requester_profile_id_fkey(name)`
   embed, falling back to the legacy `requester_name`/`requester_segment`
   free text for tickets created before that column existed. Requester
   counting toward the requester's own Task Table entry needed no separate
   work — Round 282 already populates `requester_profile_id` on every new
   Phái Sinh ticket, and Task Table's requester section reads that column
   generically across every ticket type.

3. **Important fix — a real breakage Round 281's migration would otherwise
   have caused**: `tickets` already had exactly one FK to `profiles`
   (`tickets_pic_profile_id_fkey`), so 16 call sites across the app
   (mostly bespoke ticket-type list pages, plus `lib/TicketListPage.js`)
   used the implicit `.select("*, profiles(name)")` embed, which only
   works when Supabase/PostgREST can infer a single unambiguous
   relationship. Adding `requester_profile_id` as a *second* FK to
   `profiles` breaks that inference — PostgREST refuses with "more than
   one relationship was found" **at query time**, which `next build`
   cannot catch since it never talks to the live DB. Found and fixed
   before the Round 281 SQL has been run anywhere: every affected call
   site now uses the explicit form
   (`profiles!tickets_pic_profile_id_fkey(name)`). Flagged in the
   migration file itself (`sql/pending/add-round281-...sql`) as well, in
   case the SQL and app code ever get applied out of order.

## Still outstanding

Three earlier migrations (Round 279 `pic_profile_ids`, Round 280 Bổ Sung
DATA ticket type + snooze) plus everything before Round 274 the user hadn't
confirmed — check `sql/pending/` for the full unrun list. This round adds
`add-round281-audit-log-requester-and-autoassign.sql` to that pile.
