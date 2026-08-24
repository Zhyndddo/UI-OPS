-- Round 174 — Milestone Workstation's Input popup gets a manual re-order
-- button per row, per explicit request. The order needs to survive a
-- reload/reopen (not just last while the popup's open), so it's a real
-- persisted column rather than client-only state — per explicit
-- confirmation, this is ONLY for the Input popup's own row order; Report
-- and Log intentionally do NOT sort by it (they group/filter by criteria
-- — status, highlight thresholds — not manual position, so this column
-- has no effect there).
--
-- Nullable, no backfill needed: every existing row reads as "no manual
-- order set" (sort_order is null), which the app treats as "goes after
-- anything that DOES have an order" — see app/workstation/milestone/
-- page.js's sortByOrder helper. Saving any chart's rows from the popup
-- (even without touching the reorder buttons) now always writes each
-- row's current position, so rows naturally pick up a real value the
-- next time they're touched.

alter table milestone_chart_entries add column if not exists sort_order integer;
