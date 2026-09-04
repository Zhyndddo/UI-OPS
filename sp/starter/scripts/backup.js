#!/usr/bin/env node
// Full data backup — dumps every application table straight from Supabase
// into a single timestamped JSON file. Meant to be run on a schedule by
// .github/workflows/backup.yml, which commits the result to a dedicated
// `data-backups` branch (never `main`, so a backup commit never triggers
// a Vercel deploy). Can also be run by hand for an on-demand snapshot:
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup.js [outDir]
//
// Needs the SERVICE ROLE key (not the anon key) — that's what lets this
// read every row in every table regardless of RLS policies. Treat it like
// a database password: only ever pass it in via environment variables /
// GitHub Actions secrets, never commit it, never hand it to client code.

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Keep this list in sync with schema.sql's `create table` statements.
// Backing up everything (including small config/lookup tables) is
// deliberate — the whole point of a full backup is not having to
// remember what mattered later.
const TABLES = [
  "profiles",
  "app_settings",
  "lookup_options",
  "entity_field_groups",
  "entity_fields",
  "releases",
  "workstation_assignments",
  "design_platforms",
  "design_types",
  "design_sizes",
  "contract_type_packages",
  "global_settings",
  "release_package_items",
  "package_categories",
  "media_booking_package_categories",
  "media_booking_packages",
  "media_booking_package_lines",
  "booking_channels",
  "media_booking_content_entries",
  "media_booking_dot2_targets",
  "media_booking_entries",
  "labels",
  "artists",
  "magic_links",
  "ticket_tabs",
  "tickets",
  "release_dsp_links",
  "dsp_metrics_snapshots",
  "release_stream_metrics",
  "milestone_chart_entries",
  "audit_log",
  "notification_settings",
  "notifications",
];

const PAGE_SIZE = 1000;

async function dumpTable(supabase, table) {
  let rows = [];
  let from = 0;
  // Paginated so this doesn't fall over once any table passes Supabase's
  // default 1000-row response cap.
  for (;;) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows = rows.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // BACKUP_STAMP lets the workflow pin the date it started with, so a run
  // that crosses midnight UTC still lands in the file its schedule meant.
  const stamp = process.env.BACKUP_STAMP || new Date().toISOString().slice(0, 10);
  const outDir = process.argv[2] || path.join("backups", "daily");
  fs.mkdirSync(outDir, { recursive: true });

  const dump = { stamp, generated_at: new Date().toISOString(), tables: {} };
  let totalRows = 0;
  console.log(`Backing up ${TABLES.length} tables…`);
  for (const table of TABLES) {
    process.stdout.write(`  ${table}... `);
    const rows = await dumpTable(supabase, table);
    dump.tables[table] = rows;
    totalRows += rows.length;
    console.log(`${rows.length} rows`);
  }

  const outPath = path.join(outDir, `${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(dump));
  const sizeMb = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(2);
  console.log(`\nWrote ${outPath} — ${totalRows} rows across ${TABLES.length} tables (${sizeMb} MB).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
