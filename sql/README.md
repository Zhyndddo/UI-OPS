# SQL migrations

This session has no live Supabase/database credentials, so every migration
here is handed off for you to run manually — nothing in this folder has
ever been executed by the assistant.

- **`pending/`** — written, not yet confirmed run against production. Run
  these against `ui-ops` prod (and against staging first, if you're using
  the staging setup from `preview-setup.md`) before the round's code that
  depends on them goes live — see `deploy-safety-runbook.md` for why this
  order matters.
- **`applied/`** — already run against production, per your own
  confirmation. Kept for history/audit, not because anything still needs
  them — running one again against a database that already has its
  columns/tables is harmless (every migration uses `if not exists` /
  equivalent guards) if you're ever rebuilding a fresh database from
  scratch (e.g. the staging setup) and want to be sure you're caught up.
- **`reference/`** — not a migration at all. `prod_schema_clean.sql` is a
  point-in-time dump of the full production schema, used for research
  when a round needs to know a table's real columns/constraints. Don't
  run it against anything.

**Naming convention** (unchanged from before this reorg): flat files,
`add-round<N>-<short-kebab-slug>.sql`. No CHECK constraints on short-enum
text columns — validated in the app layer, matching this schema's
existing convention.

**When you've run a `pending/` file:** just say so and it'll get moved to
`applied/` in the next round's delivery — or move it yourself, it's a
plain file move, nothing references the path from code.

_Reorganized Round 223 — before this, all of these sat loose in the repo
root (9 round migrations + 2 schema dumps, one of which — `prod_full.sql`
— was empty dead weight, deleted in this same round)._
