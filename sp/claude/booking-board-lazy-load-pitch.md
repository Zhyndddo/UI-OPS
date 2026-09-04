# Pitch: split-loading for Booking Board + New Release Setup

**Status: checks complete (2026-08-17). Piece (a) — descoped, see audit below, but its
sequential-fetch inefficiency (a DIFFERENT issue than the audit checked for) was found and
fixed as Round 151. Piece (b) — checks passed the code-side audit; still needs a live-data
trigger diff-test before any read path cuts over. Not yet built.**

## The problem

Both `app/booking/page.js` (Booking Board) and `app/releases/[id]/page.js` (release detail,
which is what New Release Setup / "tổng hợp" drills into) load everything on mount, regardless
of what the visitor actually looks at:

- Booking Board's `load()` pulls every release, every `media_booking_entries` row (already once
  silently truncated past Supabase's 1000-row cap — fixed in Round 142, see DATA_FIXES.md), every
  package/line, dot2 targets, and channel statuses, in one shot. Round 150 has since parallelized
  these fetches and pruned every `select("*")` down to real column lists.
- The release detail page's mount-time `useEffect` cluster fetches every gate/tab's tickets at
  once (Pitching, Pitching Info, Artist Profile, Media Booking, every generic gate type) even
  though only one tab is visible at a time. Round 151 has since batched the 5 separate
  `ticket_tabs` lookups into 1 and parallelized the 6 ticket-existence fetches that follow —
  see below.
- The Booking Board's "All" column has no materialized total anywhere — it's computed in the
  browser every render by filtering the full in-memory `entries`/`packages` arrays. Still open.

## Audit results (2026-08-17) — the two checks that had to run before building anything

### Check 1 (for b): every write path to `media_booking_entries` — PASSES

All write paths are in-app, in `app/booking/page.js`: `addEntry`, `addEntries`, `cycleStatus`,
`cycleStatusAll`, `updateEntry`, `deleteEntry`, `saveAdsQuantity` (update + insert branches) — 8
total, plus `scripts/import-booking.js`'s update/insert. No app-level release-hard-delete path
exists. A DB trigger would see every one of these. Still unverified: DB-level FK cascade rules
(delete cascades) — lives in the live schema, not visible from this session; confirm before
build.

### Check 2 (for a): release detail page tab-by-tab side effect audit — DESCOPES original (a)

Used an Explore agent to classify all 17 `useEffect`s in `app/releases/[id]/page.js`.

**Finding 1 — most of "split loading per tab" is already how the page behaves.** Tabs render via
`{tab === "url" && <UrlTab/>}`-style conditional JSX — React already unmounts inactive tabs and
refetches on revisit. URL, Streaming/Milestone, Copyrights, and Overview's own dropdown fetches
already only run on-visit. 9 of 17 effects fall into this "already fine" bucket.

**Finding 2 — the literal "Pitching auto-creates a ticket on mount" claim is refuted, but a
related risk is real.** Ticket creation only fires from `saveTab()` on explicit Save click, and
already checks for an existing ticket first (idempotent) — not mount-tied. BUT nearly all
ticket-creation gate UI (Pitching, Artist Profile, generic gates, Sony Publish, Publishing) lives
on the **Overview** tab (the default landing tab), which needs the ticket-existence maps from the
one big non-tab-scoped mount effect almost every session anyway. Deferring that effect to
"on tab visit" wouldn't save much for the common case and risks a duplicate-ticket bug if
`saveTab()` becomes reachable before the fetch resolves.

**Verdict: piece (a) as originally scoped (defer the fetch to whichever tab the user visits) is
not worth building** — the data is needed by the default tab almost always. Not recommending
further work on THIS specific angle.

### Round 151 — a different issue the audit didn't check, found afterward and fixed

The side-effect audit above answered "is it safe to DEFER this fetch" — it didn't check "is this
fetch efficiently SHAPED." Turned out it wasn't: the same "sequential round trips where nothing
requires the ordering" pattern Round 150 fixed on Booking Board/New Release Setup was also present
here. The mount effect looked up 4 ticket-tab ids one at a time (each immediately followed by that
type's ticket fetch) before even reaching the already-batched gate-types fetch — up to ~10
sequential round trips. Round 151 (see DATA_FIXES.md) combined all 5 tab-key lookups (4 fixed +
gate-types batch, which already includes "publishing") into ONE query, then fired all 6
ticket-existence fetches concurrently via `Promise.all`. Same data, same Publishing special-case
(matched by `data.id` not `data.did`), same "no tab → no tickets" behavior — just restructured
from serial to parallel.

**Net: as of Round 151, this page is about as fast as it can get without the riskier Overview
restructure Finding 2 argues against.** If it still feels heavy after this, the next honest lever
isn't on this page anymore — it's Booking Board's "All" column (piece b below).

## What's actually still open

**(b) alone — Booking Board's "All" column materialization.** Check 1 passed the code-side audit.
Still missing before any read path can switch to a materialized total:

1. Build the trigger (schema + function, likely a per-`(release_id, category, brand)` aggregate
   row maintained on every INSERT/UPDATE/DELETE to `media_booking_entries`).
2. Run it against a full copy of real production data.
3. Diff its output against what the app currently computes client-side for "All," across every
   release/category/brand combo — including the known special cases (Ads' mushed-metric handling,
   the YouTube Ads Có Trong Net lock, TikTok Channel's brand grouping).
4. Only cut the Booking Board's read path over once that diff is clean.

Steps 2-4 need a live Supabase instance this session doesn't have — SQL can be drafted and handed
off, but the diff-test has to run on the user's side before go-live, same pattern as every other
SQL handoff on this project.

_Logged 2026-08-14. Checks completed and piece (a) descoped 2026-08-17; Round 151 fixed a
different, real inefficiency the checks surfaced along the way. See DATA_FIXES.md Rounds 150-151
for the concrete code changes. This doc is now only about the still-open piece (b)._
