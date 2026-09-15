#!/usr/bin/env bash
# Runs sql/pending/add-round324b-catalog-product-tags.sql directly against
# Supabase via psql, bypassing the SQL editor's size limit (the file is
# ~1.5MB — too big to paste into the browser editor, but psql has no such
# limit).
#
# Usage:
#   1. Get your DB connection string from Supabase: Project Settings ->
#      Database -> Connection string -> "URI". Use the DIRECT connection
#      (port 5432), not the pooled one (port 6543/pgbouncer) — a large
#      multi-statement file like this is safer over a direct connection.
#   2. Run:
#        DATABASE_URL='postgresql://postgres:[YOUR-PASSWORD]@[YOUR-HOST]:5432/postgres' ./run-round324b.sh
#      (or export DATABASE_URL first, then just run ./run-round324b.sh)
#
# Requires psql (postgresql-client) installed locally:
#   macOS:   brew install libpq && brew link --force libpq
#   Ubuntu:  sudo apt-get install postgresql-client
#   Windows: install via https://www.postgresql.org/download/windows/ or WSL
#
# Safe to re-run — every UPDATE in the file is COALESCE/NOT-EXISTS guarded
# (see the file's own header comment), so running it twice does nothing
# extra the second time.

set -euo pipefail

SQL_FILE="$(dirname "$0")/sql/pending/add-round324b-catalog-product-tags.sql"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: set DATABASE_URL first, e.g.:" >&2
  echo "  export DATABASE_URL='postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres'" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found. Install postgresql-client (see script header) and try again." >&2
  exit 1
fi

if [ ! -f "$SQL_FILE" ]; then
  echo "ERROR: $SQL_FILE not found — run this script from inside the repo (or leave it there)." >&2
  exit 1
fi

echo "Running $SQL_FILE against \$DATABASE_URL ..."
echo "(9 chunks, ~24.7k UPCs total — each UPDATE line printed below is one chunk's row count)"
echo

# -v ON_ERROR_STOP=1: if any chunk errors, stop immediately rather than
# silently continuing past it — since each chunk is its own independent,
# idempotent statement, you can safely re-run this whole script after
# fixing whatever caused the error; already-applied chunks are no-ops the
# second time.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --echo-errors -f "$SQL_FILE"

echo
echo "Done."
