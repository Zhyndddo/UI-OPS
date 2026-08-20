# One-Ticket-Per-Key Rule — Design Spec (decided 2026-08-20, piloted Round 167)

Status: **piloted on Artist Profile + Phụ Lục Truyền Thông baseline
(Round 167 / 2026-08-20). Not yet rolled out to the other 13 code-gate
types.**

## The rule (as agreed)

1. **Identity key** stays whatever it already is per ticket type — no
   change to existing keys. New/currently-ungoverned types need a key
   assigned explicitly (see "Needs a key assigned" below) rather than
   inheriting one implicitly.
2. **Strength — 3 tiers, no more, no fewer:**
   - **DB** — a real Postgres trigger/constraint. No exceptions to this
     tier's list without a deliberate schema change.
   - **Code gate** — enforced in application code before insert. This is
     the default tier for anything that should be "1 per key."
   - **No gate** — unlimited tickets against the same key, by design.
3. **Behavior for code-gated types:**
   - The FIRST ticket for a given key is created automatically by that
     type's related tick/gate on the release detail page (or New Release
     create form) — same as today.
   - Any EXTRA ticket for a key that already has one must be created
     through the ticket type's own list page ("+ New Ticket"), never by
     re-triggering the release-page gate.
   - Every code-gated type's ticket must carry a dedicated field holding
     its identity key value in `data` (most already do — `data.releaseId`
     for DID-keyed types).
   - **On Save**, the check runs live against the database (not stale
     local state), batched across every ticked item at once. Anything
     that turns out to already have a ticket: (a) is NOT created again,
     (b) is reverted back to unticked so the form reflects reality, (c)
     is named in a warning-only popup — **no "create anyway" bypass**.
     Everything else in that same Save still goes through normally; a
     duplicate hit on one item never blocks the rest.
   - Booking (Media Booking) is explicitly excluded from this — stays on
     the DB tier, untouched, because of its complex real-world booking
     flow (artist feedback reopens, resend cycles, etc.) where a real hard
     constraint is genuinely the right call.
4. **Ungated types must be an explicit list**, not implicit-by-omission —
   so they're periodically reviewable rather than silently "whatever
   nobody set a flag on."

## Round 167 — what actually got built (the pilot)

- **`lib/duplicateTicketGuard.js`** (new) — `findDuplicateTicketKeys(supabase, tabId, candidates)`.
  `candidates` is `[{ label, filters: { dataKey: value, ... } }]`; runs one
  live query per candidate (`tickets` table, matching `tab_id` +
  `deleted_at is null` + each filter as `data->>key = value`), returns
  whichever candidates already have a match. One query per candidate on
  purpose — candidate lists here are always small (a handful of artists
  per release at most), not worth hand-building a dynamic OR filter for.
- **`lib/DuplicateTicketWarning.js`** (new) — the ONE warning popup shape
  for this rule across the whole app. Same inline-style modal pattern
  `lib/CopyrightRightsPopup.js` already uses (fixed overlay + centered
  panel, `var(--bg)`/`var(--border-strong)`). Takes `items` (plain string
  labels), `title`, `note`. Deliberately has only one button (OK/dismiss)
  — no bypass, per explicit instruction.
- **Artist Profile — the pilot.** `app/releases/[id]/page.js`'s
  `saveTab()` Artist Profile Verify block now re-checks live, right
  before creating each selected artist's ticket, instead of trusting only
  `artistProfileTicketByArtist` (a snapshot from page load that goes
  stale the moment a second tab/session creates that same artist's ticket
  in the meantime — that race is the actual gap this closes). Any
  duplicate found: named in a new `artistProfileDuplicateWarning` state
  → renders `DuplicateTicketWarning`; removed from
  `artistProfileVerifySelected` (unticked); NOT inserted. Every
  non-duplicate artist in the same Save still gets created normally.
- **Phụ Lục Truyền Thông — baseline check added**, closing the one real
  gap in the code-gate tier (it previously had no active existence check
  at all, just happened to only fire once because of how
  `wasPipelineStage` works). `app/pick-package/[token]/page.js` now calls
  `findDuplicateTicketKeys` (keyed on `releaseId` = release UUID, same key
  it always used) before inserting. **No warning popup here** — this page
  runs from the artist-facing magic link, nobody from AR/OPS is present
  to see or dismiss one, so a silent skip is the correct equivalent of
  "warn, no bypass" when there's no one to warn.

## Current inventory (updated after Round 167)

### DB tier — hard-enforced, no exception
| Type | Key | Enforcement |
|---|---|---|
| Media Booking | release (did/id) | `trg_prevent_duplicate_media_booking` (Postgres trigger) |

### Code-gate tier — app-level check before insert
| Type | Key | Live re-check + warning popup (Round 167 shape)? |
|---|---|---|
| Artist Profile | (release, artist) pair | **Yes — done, the pilot.** |
| Phụ Lục Truyền Thông (phu_luc) | release UUID (`id`) | **Baseline check added — no popup (non-interactive flow), see above.** |
| Pitching | release DID | Not yet — still old local-state-only idempotency. |
| Publishing | release UUID (`id`) | Not yet. |
| Sony Publish | release DID | Not yet. |
| Split Share | release DID | Not yet. |
| Phụ Lục MG | release DID | Not yet. |
| Phụ Lục Publishing | release DID | Not yet. |
| Hợp Đồng Youtube | release DID | Not yet. |
| Hợp Đồng Publishing | release DID | Not yet. |
| Hợp Đồng Nhạc Số | release DID | Not yet. |
| Co Trong Net YouTube | release DID | Not yet. |
| Pre-order Itunes | release DID | Not yet. |
| Priority Sync Lyric | release DID | Not yet. |
| MV Spotify | release DID | Not yet. |
| Discovery Mode Spotify | release DID | Not yet. |

`oneTicketPerRelease: true` in `lib/ticketConfigs.js` (the 12 generic-loop
types above minus Artist Profile/phu_luc) still only filters the manual
"+ New Ticket" ReleasePicker's autocomplete — unchanged this round, still
not itself a real guard. Decision on whether to repurpose it is still
open (see below).

### No-gate tier — unlimited by design
| Type | Why unlimited |
|---|---|
| Phái Sinh | many songs per release |
| Manual Claim | many claims per release |
| Stream Update | many metric updates |
| Khác | general/misc |
| Youtube Ads | many ad requests |
| Booking Not In Package | many add-on bookings |
| Report Conflict | many conflicts per release |

## Open implementation questions (still not decided)

- Whether the manual "+ New Ticket" pages also need a live duplicate
  check + warning on submit, not just the release-detail gate flow —
  scoped OUT of Round 167 for Artist Profile specifically because its
  manual form (post-Round-166 rebuild) has no release context to key off
  of for most of its 7 request types (only the old release-gate flow is
  release-scoped). Needs its own answer before this extends to manual
  creation anywhere.
- Whether `oneTicketPerRelease` gets renamed/repurposed into a real
  `duplicateRule: { key, level }` config shape, or left as-is alongside
  the new live-check pattern.
- Where the "ungated types" list should live in code (not just this doc)
  so it's actually reviewable — e.g. surfaced on the Config page.

## Next step

Roll the Round 167 pattern (`findDuplicateTicketKeys` +
`DuplicateTicketWarning`, live re-check batched on Save, revert-and-warn,
rest of Save proceeds) out to the remaining 13 code-gate types — Pitching
and Publishing first (both bespoke, closest in shape to Artist Profile),
then the 12-type generic gate loop in `saveTab()` (`GATE_TICKET_TYPES`)
as one batched pass since they already share one code path.
