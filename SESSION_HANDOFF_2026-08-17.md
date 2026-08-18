# Session handoff — load-reduction work, 2026-08-17

Written because this sandbox has reset mid-session before (twice, earlier in this
project) and lost in-progress work. If a future session goes blank, re-upload the
LATEST zip delivered in this conversation (as of writing: `starter_round151.zip`)
and this file, and everything below still applies.

## What shipped today (Round 150 + Round 151)

**Round 150 — Booking Board + general load-reduction pass, 4 pieces:**

1. `lib/notDoneCounts.js` — `getNotDoneCount` now has a 20s cache + in-flight
   de-duplication, keyed per `(kind, typeKey, profile.id)`. Fixes the TypeSwitcher
   fan-out (~50 pages, 8-15 queries per navigation) transparently — no call site
   changed.
2. `app/report/page.js` — was `select("*")` on `releases` with NO `fetchAllRows`
   pagination (real correctness bug: silently truncates past 1000 rows, same class
   as the Round 59/60 bug). Fixed with `fetchAllRows` + pruned to ~28 actually-used
   columns.
3. `app/booking/page.js` + `app/workstation/upload/page.js` — both `load()`
   functions ran several independent Supabase queries SEQUENTIALLY (one `await`
   after another) despite none depending on each other. Switched both to
   `Promise.all`. Booking Board: 8 queries → concurrent. Upload workstation (New
   Release Setup): 3 queries → concurrent.
4. `app/booking/page.js` — pruned 3 remaining `select("*")` calls
   (`media_booking_entries`, `booking_channels`, `media_booking_channel_status`) to
   real column lists, verified by an exhaustive agent-assisted grep of every field
   actually read in the file.

**Round 151 — release detail page (`app/releases/[id]/page.js`):**

The mount effect looked up 4 fixed ticket-tab ids (pitching, pitching_info,
artist_profile, media_booking) ONE AT A TIME, each immediately followed by that
type's ticket fetch, before even reaching the already-batched gate-types fetch —
up to ~10 sequential round trips. Combined all 5 tab-key lookups into ONE query,
then fired all 6 ticket-existence fetches concurrently via `Promise.all`. Same
data, same Publishing special-case, same "no tab → no tickets" behavior.

Both rounds verified via `tsc --jsx react --allowJs --checkJs false --skipLibCheck
--noEmit` on every touched file — zero errors each time. Note this config does NOT
type-check Supabase column names against your live schema — only a real load test
catches a schema mismatch.

## The two open questions this session answered

**"Is the release detail / New Release Setup page as fast as it can get?"**
Answer: not before Round 151 (there was real sequential-fetch waste), yes after it
— for what's safe to change. A companion audit (see below) found that further
restructuring (deferring the ticket-existence fetch to "only when a specific tab
is visited") is NOT recommended: nearly all ticket-creation UI lives on the
Overview tab (the default landing tab), so deferring that fetch wouldn't save much
in the common case and risks a duplicate-ticket bug if Save becomes clickable
before the fetch resolves.

**"Is Booking Board as fast as it can get?"** Answer: not yet — four real fixes
shipped today (caching, parallelization, column pruning), but the underlying
architecture still computes the "All" column client-side from every
`media_booking_entries` row, every render. The deeper fix (a Postgres trigger
maintaining a materialized per-release/category/brand total) is scoped but NOT
built — see below.

## What's still open — the ONE remaining real lever

**Booking Board's "All" column materialization.** Full writeup lives in the
Claude Project doc `claude/booking-board-lazy-load-pitch.md` (this session's
Projects tool, not a file in this zip) — read that first if resuming this work.
Summary:

- Write-path audit (prerequisite check) is DONE and PASSED: all 8 write paths to
  `media_booking_entries` are in-app (`addEntry`, `addEntries`, `cycleStatus`,
  `cycleStatusAll`, `updateEntry`, `deleteEntry`, `saveAdsQuantity` ×2 branches),
  plus one import script. A DB trigger would catch all of them. Still unverified:
  DB-level FK cascade rules (needs live schema access this session doesn't have).
- Release detail page tab-loading audit (the other original pitch idea) is DONE
  and DESCOPED — most of it turned out to already work via React's conditional
  tab rendering; the one non-lazy piece got fixed differently, as Round 151.
- NOT done: building the actual trigger SQL, running it against a real data copy,
  diffing its output against what the app currently shows for "All" (including
  special cases: Ads' mushed-metric handling, YouTube Ads Có Trong Net lock,
  TikTok Channel's brand grouping), and cutting the read path over. This needs
  live Supabase access this session doesn't have — SQL can be drafted next, but
  the diff-test and go-live have to run on your side.

If you come back to this project and want to keep going: either ask for the
trigger SQL to be drafted (next concrete step), or if Booking Board already feels
fast enough after today's 4 fixes, this can stay parked — it was already flagged
"not started" for a long time before today's session picked it back up.

## Sandbox reset note (recurring issue on this project)

This cloud sandbox has reset its filesystem state mid-session multiple times
across this project's history, losing in-progress local edits (though never
anything already delivered as a zip or written to the Project). Established
mitigation: if a session seems to have lost recent work, verify with something
like `grep "Round 151" DATA_FIXES.md` before trusting local state, and if it's
gone, re-upload the last delivered zip rather than let anyone guess-reconstruct
lost work from memory.
