# Pitch: additional load-reduction opportunities (beyond the Booking Board pitch)

**Status: items 1 and 3 — IMPLEMENTED (Round 150). Items 2, 4, 5 — flagged, not started.**

This is a companion to `booking-board-lazy-load-pitch.md`. That doc covers Booking
Board's load() and the release detail page's mount-time fetch cluster. This doc
covers what else was found surveying the rest of the app for the same "fetch more
than the page needs, every time" pattern.

## 1. `TypeSwitcher` + `getNotDoneCount` — the N+1 fan-out (highest traffic surface)

`lib/TypeSwitcher.js` sits at the top of ~50 ticket/workstation pages. On every
mount it loops over every sibling tab type for the user's team and fires one
`getNotDoneCount(kind, key, profile)` call per type, just to paint the little
outstanding-count badge next to each tab. That's 8-15 round trips on almost every
navigation in the app, before the page's own data even starts loading.

Two of those per-type calls are especially expensive: `workstationNotDoneCount`'s
`confirm` and `pre_release` branches (`lib/notDoneCounts.js`) each do a full
`fetchAllRows` over the entire `releases` table — not filtered, not paginated to
the UI, just pulled whole to compute one number client-side.

**Fix implemented (Round 150):** wrapped `getNotDoneCount` in `lib/notDoneCounts.js`
with a module-level cache — 20s TTL per `(kind, typeKey, profile.id)` key, plus
in-flight de-duplication so concurrent callers asking for the same count within the
same tick share one request instead of firing separate ones. This is transparent to
every call site (`TypeSwitcher`, `app/workstation/page.js`, `app/tickets/page.js`)
— none of them needed to change. Net effect: the same count is now fetched at most
once per 20 seconds app-wide, instead of once per mount per component. Doesn't
reduce the cost of a single `confirm`/`pre_release` fetch, but collapses how often
that cost is paid.

**Not done yet, future step if this needs to go further:** replace the two
full-table `fetchAllRows` calls with a real server-side count — a Postgres view or
RPC that computes "not done" server-side so the client only pulls one integer
instead of every release row. Needs the same trigger-audit caution called out in
the Booking Board pitch (confirm every write path to `releases` would be reflected
correctly before relying on a materialized count). Still the honest next lever if
this needs to go further — see priority order below.

## 2. Index/picker pages duplicate the same fan-out

`app/workstation/page.js` and `app/tickets/page.js` (the card-picker landing pages)
independently re-run the same per-type `Promise.all` fan-out via `getNotDoneCount`
when the picker itself loads — so the cost is paid once on the picker, then again
on whatever type page gets clicked into. The Round 150 cache above already
collapses this in practice (the picker's fetch primes the cache, so the type page's
own `TypeSwitcher` mount usually hits the cache instead of refetching) — no
separate code change needed here.

## 3. `app/report/page.js` — unpaginated full-table select — FIXED (Round 150)

Was a bare `.select("*")` on `releases` with no `fetchAllRows` pagination and no
column pruning. Two issues bundled together:

- **Correctness:** without pagination this was subject to PostgREST's default
  1000-row cap, same bug class as the original Round 59/60 fix — once `releases`
  passed 1000 rows this page was very likely already silently dropping data.
- **Performance:** even once paginated correctly, `select("*")` pulled every column
  when the report only needs a handful.

**Fixed as Round 150's own item 3** (bundled into the same round as item 1's
caching layer, not a separate round): `app/report/page.js` now wraps the query in
`fetchAllRows` (no more silent 1000-row cap) and prunes the column list down to
`REPORT_RELEASE_FIELDS` — exactly the columns this page's charts and
`isReleaseDone()` actually read, verified by grepping every `r.<field>` use in the
file, instead of pulling every column on the table. See that file's own Round 150
comment for the full field list.

## 4. `getNotDoneCount`'s pitching/phai_sinh branches

Both do extra nested round trips inside an already-expensive per-type call
(`pitching` fetches tickets, then a second query for matching releases;
`phai_sinh` fetches tickets, then conditionally a second query for batch items).
Low priority on their own — folds naturally into whatever replaces the fan-out in
a future round (see item 1's "future step").

## 5. `app/labels/page.js`'s `syncLatestActivityYears`

Full-table `fetchAllRows` over `releases`, but throttled to once per 6 hours via
localStorage. Low impact, not worth touching right now.

## Priority order for future rounds

1. ~~TypeSwitcher/notDoneCounts fan-out~~ — done, Round 150 (caching layer).
2. ~~`app/report/page.js` unpaginated select~~ — done, Round 150 (same round as
   item 1, bundled in).
3. **Server-side "not done" counts** (real fix for item 1's remaining full-table
   cost on `confirm`/`pre_release`) — the next honest lever if load still feels
   heavy. Needs a live Supabase instance to build/verify against (a Postgres
   view or RPC, audited against every write path to `releases` first) — can be
   drafted as SQL this session, but has to be tested/verified on the user's side.
   Worth bundling with the Booking Board pitch's trigger work (see companion doc,
   piece b) since both need the same "audit every write path" groundwork first.
4. Items 4 and 5 — low priority, address opportunistically.

_Logged 2026-08-17. Reconciled against actual code state 2026-08-18 — item 3
turned out to already be fixed (it was Round 150's own item 3, just not marked
done here yet). Companion to `booking-board-lazy-load-pitch.md`._
