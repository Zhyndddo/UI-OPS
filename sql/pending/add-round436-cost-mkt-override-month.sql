-- Round 436 -- Cost Marketing workstation: "This Month" counter + manual
-- month override.
--
-- Adds ONE new column to the existing per-(release, funded_by,
-- channel_kind, brand) cost row table, workstation_cost_mkt_entries
-- (created by Round 315's migration -- this does not touch any other
-- table, and does not touch releases.release_date).
--
-- override_month: nullable timestamptz. NULL means "no override -- this
-- row's 'this month' status is decided by the release's own release_date,
-- same as everywhere else in the app." Non-null means "someone manually
-- ticked the Is_thismonth switch for this row" -- the app sets it to
-- now() (client-side, at tick time) and uses ITS month/year in place of
-- release_date's when deciding whether this row counts toward the
-- workstation's "This Month" counter. Unticking clears it back to NULL.
--
-- Deliberately NOT a boolean: a plain "is this month" flag would silently
-- keep counting a row as "this month" forever after being ticked once,
-- across every future month, unless something remembered to clear it.
-- Storing the actual timestamp means next month, that same value's month
-- no longer matches the current month, so the override naturally stops
-- counting on its own without any cleanup job -- ticking it again re-arms
-- it for the new month.

alter table workstation_cost_mkt_entries
  add column if not exists override_month timestamptz;

comment on column workstation_cost_mkt_entries.override_month is
  'Round 436 -- manually set via the Is_thismonth switch on the Cost Marketing workstation. When set, its month/year (not release_date''s) decides whether this row counts toward that workstation''s "This Month" counter. NULL = no override, falls back to release_date.';
