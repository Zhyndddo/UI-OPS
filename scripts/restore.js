#!/usr/bin/env node
// Restores a backup JSON (produced by scripts/backup.js) back into
// Supabase. Defaults to a DRY RUN that only prints what it would do —
// pass --confirm to actually write anything.
//
// Two write modes:
//   upsert (default) — matches each row by its `id` primary key, inserts
//     rows that don't exist yet, and overwrites rows that do. Doesn't
//     touch rows that exist in the DB but aren't in the backup.
//   --wipe — deletes every existing row in a table first, then inserts
//     the backup's rows. This is the one that gives you a true
//     point-in-time revert, but it also throws away anything created
//     after the backup was taken. Use --table to scope it to just the
//     table(s) you actually need reverted — don't --wipe the whole
//     database unless that's really the intent.
//
// Usage:
//   node scripts/restore.js backups/daily/2026-07-29.json --confirm
//   node scripts/restore.js backups/daily/2026-07-29.json --table=releases --wipe --confirm
//   node scripts/restore.js backups/daily/2026-07-29.json --table=releases --table=tickets --confirm
//
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment, same
// as backup.js.

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

function parseArgs(argv) {
  const args = { file: null, confirm: false, wipe: false, tables: [] };
  for (const a of argv) {
    if (a === "--confirm") args.confirm = true;
    else if (a === "--wipe") args.wipe = true;
    else if (a.startsWith("--table=")) args.tables.push(a.slice("--table=".length));
    else if (!a.startsWith("--")) args.file = a;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error("Usage: node scripts/restore.js <backup.json> [--table=name ...] [--wipe] [--confirm]");
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const dump = JSON.parse(fs.readFileSync(args.file, "utf8"));
  const tableNames = args.tables.length > 0 ? args.tables : Object.keys(dump.tables);

  console.log(`Backup stamp: ${dump.stamp} (generated ${dump.generated_at})`);
  console.log(args.confirm ? "LIVE RUN — writing to the database." : "DRY RUN — pass --confirm to actually write.");
  console.log(args.wipe ? "Mode: WIPE + reinsert (deletes existing rows first)." : "Mode: upsert (matches by id, leaves other rows alone).");
  console.log("");

  for (const table of tableNames) {
    const rows = dump.tables[table];
    if (!rows) {
      console.log(`${table}: not in this backup, skipping.`);
      continue;
    }
    console.log(`${table}: ${rows.length} rows`);
    if (!args.confirm) continue;

    if (args.wipe) {
      // Every table in TABLES (scripts/backup.js) has an `id` primary key.
      const { error: delErr } = await supabase.from(table).delete().not("id", "is", null);
      if (delErr) throw new Error(`${table} wipe failed: ${delErr.message}`);
    }
    if (rows.length === 0) continue;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase.from(table).upsert(chunk, { onConflict: "id" });
      if (error) throw new Error(`${table} upsert failed at row ${i}: ${error.message}`);
    }
  }

  console.log(args.confirm ? "\nDone." : "\nDry run complete — re-run with --confirm to actually write.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
