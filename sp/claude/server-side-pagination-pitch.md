# Pitch: real server-side pagination (+ Postgres estimated counts)

**Status: not started — still exploring alternatives before committing to an
approach. Nothing below is decided; this doc is notes so we don't re-litigate
the same tradeoffs from scratch next time.**

## The finding

`lib/usePagination.js` (used by ~25 pages, plus `lib/TicketListPage.js` — the
shared generic engine behind 7 more ticket types, so effectively ~32 pages) is
**100% client-side**. It's a `.slice()` over an array that's already fully sitting
in memory — it does nothing to reduce what gets fetched from Supabase. Every one
of these pages pulls its ENTIRE row set (every ticket of that type, every release,
whatever) on every visit, over the network, then throws away all but the current
page's ~50 rows when rendering. Page size only ever controlled how much got
*rendered into the DOM* — never how much got *fetched*. This is true even after
Round 150's column-pruning work (which cut how many columns are pulled per row,
but not how many rows).

Concretely: `lib/TicketListPage.js`'s `load()` does a bare
`supabase.from("tickets").select("*, profiles(name)").eq("tab_id", ...).is("deleted_at", null)`
— no `.range()`, no row cap awareness — for every one of the 7 ticket types routed
through it (Hợp Đồng Publishing/Nhạc Số/Youtube, Stream Update, Khác, Youtube Ads,
Booking Không Trong Package). The other ~25 bespoke pages each do their own
equivalent full-table (or full-filtered-table) fetch.

## What "real" server-side pagination means, and the Postgres piece specifically

Two Supabase/PostgREST features do exactly what was asked for:

- **`.range(from, to)`** on a query — makes Postgres do `LIMIT`/`OFFSET` itself, so
  only the current page's rows ever leave the database. This is the actual fetch
  reduction; `usePagination`'s `.slice()` today happens AFTER the full fetch, which
  is why it doesn't help.
- **`{ count: "estimated" }`** (or `"planned"`) as a query option — instead of a
  real `COUNT(*)` (which Postgres has to actually scan for, expensive on a big
  filtered table), this reads `pg_class.reltuples`, a statistic Postgres already
  maintains for its own query planner. Near-instant regardless of table size, at
  the cost of being an approximation (can drift slightly from the true count
  between `ANALYZE` runs — fine for "page 4 of ~230", not fine anywhere the exact
  number matters). `{ count: "exact" }` is the precise version, still real
  cost but far cheaper than pulling every row's full data just to `.length` it
  client-side.

This is exactly the "pseudo count from Postgres" mechanism — `reltuples`-based
estimated counts are the standard way to show a total/page-count on a large table
without paying for an exact scan every time.

## Why this isn't a mechanical find-and-replace

If it were just "add `.range()` to each query," this would already be done. The
real complexity: every one of these pages layers **search** (`SearchBox`/
`matchesQuery`), **status-tab filters**, and often **sort** (`useSortableRows`) on
top of the SAME full in-memory array `usePagination` slices from. All three
currently work by filtering/sorting the complete client-side dataset. Once the
fetch itself is paginated, none of that data is complete anymore — searching or
switching a status tab would silently only affect whatever's on the current page,
which reads as broken, not faster.

So a real fix has to convert, together, per page:
1. The fetch itself → `.range()` (or a cursor — see below) + a page-total.
2. Search → a server-side filter (`.ilike()` / `.or()` across the relevant
   columns) fired on debounce, replacing `matchesQuery`'s client-side scan.
3. Status-tab filters → a `.eq("status", ...)` on the query, not a client
   `.filter()`.
4. Sort → `.order()` on the query, replacing `useSortableRows`'s client sort.
5. **Any on-page stat that currently reads the full array** — e.g.
   `TicketListPage`'s per-status counts feeding its tab badges, `StatusCounter`'s
   done/notDone/cancel totals on workstation pages — needs its own small
   `{ count: "exact" | "estimated", head: true }` query per bucket, since the full
   row set to count from client-side no longer exists in memory. This is the same
   underlying idea as the still-open "server-side not-done counts" item in
   `load-reduction-additional-ideas.md` — this pitch and that one converge on the
   same technique, just applied per-page instead of just for TypeSwitcher's tab
   badges.

None of this is high-risk in the way the Booking Board "All" column trigger is (no
live-data diff-testing required, no DB triggers to get right) — it's all
ordinary parameterized Supabase queries, buildable and testable against the same
codebase this session already has. It's just genuinely more code per page than a
one-line `.range()` swap, because of points 2-5 above.

## The UX tradeoff: today's "everything instant" feel goes away

Worth being blunt about this one, since it's easy to undersell. Right now every
interaction after initial load — search, sort, status-tab switch, page through,
"show done" toggle — is a client-side array operation: zero network, zero loading
state, because the whole dataset is already in memory. Real server-side
pagination turns every one of those into a network round trip. Individually fast,
but it's a qualitatively different feel: one wait up front today, vs. many small
waits scattered through normal use once this ships.

It also introduces a new failure mode that can't happen today: row list and
on-screen counts (StatusCounter, tab badges) currently come from the SAME
in-memory array, so they can never disagree. Once they're separate queries, they
can drift apart after a mutation until the count query re-fetches (fixable with
optimistic local adjustment, but it's a new class of bug that doesn't exist now).

## Cursor vs. offset — and why "page-number picking" and "cursor-based" are in tension

Researched how YouTube/Facebook actually do their "load more" — both are publicly
documented (not just industry folklore):

- **YouTube Data API** paginates via `nextPageToken`/`prevPageToken` — opaque
  cursor tokens, not page numbers. ([docs](https://developers.google.com/youtube/v3/guides/implementation/pagination))
- **Facebook's Relay** (their own GraphQL client, open-sourced, used across
  Facebook/Instagram) publishes the **Cursor Connections Specification** — a
  public spec for exactly this pattern. ([spec](https://relay.dev/graphql/connections.htm))

Both anchor to a cursor (e.g. "the next 20 after this row's timestamp/id"), not an
offset ("skip 50, take 50"). That's paired with an **Intersection Observer**
sentinel element that auto-triggers the next fetch as you scroll near the bottom,
instead of manual page-number clicks.

**Why this matters for this app specifically:** cursor pagination is inherently
sequential — getting page 4 requires the cursor page 3 handed you, so there's no
cheap way to jump straight to an arbitrary page N (this is exactly why neither
YouTube's nor Facebook's pattern supports it — only next/previous). Offset
pagination (`.range()`) CAN jump to any page directly (`OFFSET = (page-1) *
pageSize` is just math), but is NOT stable if a row gets inserted/deleted or a
sort-column value changes while someone's mid-browse — pages can shift by one
(skip or duplicate a row). Cursor pagination doesn't have that instability, but
gives up direct page-N jump in exchange.

**Explicitly asked about combining "cursor-based" + "click any page number
directly" — these don't combine cleanly.** Three real options, none of them
"the same idea with different plumbing":

- **A — Stay cursor-based, Next/Previous only (no arbitrary jump).** Fully
  stable, matches what YouTube/Facebook actually ship. Real UX departure from
  this app's existing `Pagination` component (used on every one of the ~32
  pages), which lets you click straight to a specific page number.
- **B — Offset-based (`.range()`) with real page-number jump, `{count:
  "estimated"}` for the total.** This is what "page pick" as literally asked for
  actually requires. Reuses the existing `Pagination` UI unchanged everywhere.
  Reintroduces the row-shift-under-concurrent-edit risk — but for THIS app
  (internal ops tool, not a high-churn public feed) that's a real but probably
  infrequent nuisance, not a constant problem, and is reducible by sorting on an
  immutable/append-only column (row creation order/id) rather than one that gets
  hand-edited often (e.g. `release_date`, which does get backdated/corrected).
- **C — Hybrid** (precompute cursor checkpoints every N rows so jump-to-page-N
  can fake itself on top of cursors, refreshed periodically). Real systems do
  this occasionally; more moving parts than this team's scale likely justifies.

No direction chosen yet — still exploring other alternatives (lighter-weight
options below) before deciding whether full pagination (in any of A/B/C's forms)
is even the right lever to pull first.

## Lighter-weight alternatives considered (none of these have A/B/C's tradeoffs)

Discussed as a spectrum before committing to full pagination — each targets a
different specific symptom, and none of them touch search/sort/count/bulk-action
behavior at all, so none carry the risks above:

1. **Finish column pruning** — several pages still `select("*")`; trimming to
   real column lists (like Round 150 already did for report/booking/upload) cuts
   payload size and parse cost with zero behavior change. Purely mechanical.
2. **Cache the list fetch** — same short-TTL + in-flight-dedup technique Round
   150 used for `getNotDoneCount`, applied to list pages themselves. Doesn't help
   the very first load, but this is a tool where people bounce constantly between
   a list and a detail page and back — makes repeat visits within the TTL window
   free. Zero behavior change.
3. **Virtualized rendering** — if the actual complaint is scroll/render
   jankiness once data's already loaded (not fetch time), a virtualized list
   (only mounts rows in the current viewport) fixes that without touching
   fetching, search, sort, or counts at all. Doesn't reduce network time.
4. **"Load more" (cursor-based, no page numbers)** — same as option A above,
   listed here too since it's the smallest behavioral departure among the
   options that actually reduce fetch size.

## Suggested phased rollout, if/when full pagination is chosen

1. **`lib/TicketListPage.js`** — one file, fixes 7 ticket types at once. Best
   ratio of effort to impact; also the cleanest template for the pattern
   (search/status-filter/sort/counts all funnel through this one component
   already, so there's exactly one place to change each).
2. **The other ~18 bespoke ticket-list pages** (`app/tickets/*/page.js` not routed
   through TicketListPage) — same pattern, applied file by file, since each has
   its own bespoke column set/filters already (that's WHY they're bespoke, not
   generic) — not mechanically reducible to a shared fix the way item 1 is.
3. **Workstations** (`upload`, `pitching`, `confirm`, `pre_release`) and
   **Booking Board** — same pattern, but these already have more going on
   per-row (gate tickets, highlight rules, assignment PICs) so search/sort/count
   conversion needs more care per field.
4. **`/releases` (New Release dashboard)** and **`/artists`** — same pattern,
   lowest urgency since Round 150/151 already addressed the worst of their
   load-time complaints from a different angle (parallelized fetches, column
   pruning) — this would be an additional, smaller win on top of that.

Each phase is independently shippable and independently useful — no reason to
block phase 2 on phase 1 finishing, or wait for all 4 before delivering value.

## Open questions before starting (whichever direction gets picked)

- **A vs B vs C vs a lighter-weight alternative** — not decided yet.
- **Page size / UX**: should page size stay user-adjustable (`PAGE_SIZE_OPTIONS`
  = 20/50/100, as today)?
- **Estimated vs exact count** (if B): fine everywhere, or does any specific page
  need the real number (e.g. because someone reports off of "X tickets" shown on
  screen)?
- **Search scope**: today's client `matchesQuery` typically matches several
  fields loosely (title/artist/DID/etc.) — worth confirming the equivalent
  server-side `.or()`/`.ilike()` column list per page matches what people
  actually expect to be searchable, rather than assuming it 1:1 from the current
  client behavior.

_Logged 2026-08-18, in response to "can we do load per page, with the count
generated by Postgres." Companion to `booking-board-lazy-load-pitch.md` and
`load-reduction-additional-ideas.md` — this is the 3rd, largest lever of the
three. Still in the exploration/notes phase, nothing decided — see Status line
at top._
