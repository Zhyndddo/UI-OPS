#!/usr/bin/env node
// One-time backfill — Round 175, per explicit request ("just this one
// time back fill for today use").
//
// Round 174 added milestone_chart_entries.sort_order (nullable). It's
// meant to drive the Milestone Workstation's daily carry-forward
// pre-fill (see app/workstation/milestone/page.js's findPriorRows) so a
// fresh day's popup inherits yesterday's row order instead of whatever
// order the DB happens to return rows in. sort_order only ever gets SET
// when a chart's rows are saved from the popup (see saveRows), so every
// row that predates round 174 still reads sort_order = null right now —
// including today's and yesterday's rows, which is exactly what the
// carry-forward feature needs a real order for immediately.
//
// This script is a ONE-TIME fill, not a schema change (that's already
// done via add-round174-milestone-sort-order.sql) and not something that
// needs to run again later — once every chart has been saved at least
// once from the popup, saveRows keeps sort_order current on its own.
//
// There is no pre-existing "manual order" to preserve (the reorder
// button is brand new in round 174), so the only meaningful "current
// order" to backfill from is each row's insertion order — id ascending,
// within its own (chart, platform, entry_date) group. That matches
// whatever order the rows already displayed in before this feature
// existed.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-round174-sort-order.js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-round174-sort-order.js --confirm
//
// Dry-run (no --confirm) prints exactly what would be written and
// touches nothing. Safe to re-run: any row that already has a
// non-null sort_order is left alone, so a second run only fills in
// whatever's still blank (e.g. after new rows get added before their
// first popup save).

const { createClient } = require("@supabase/supabase-js");

const CONFIRM = process.argv.includes("--confirm");

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("milestone_chart_entries")
    .select("id, chart, platform, entry_date, sort_order")
    .order("id", { ascending: true });
  if (error) {
    console.error("Failed to load milestone_chart_entries:", error.message);
    process.exit(1);
  }

  // Group by (chart, platform, entry_date) — the same grouping
  // ChartEntryPopup edits as one unit — and only touch rows that are
  // still null, in id order within each group.
  const groups = new Map();
  for (const row of data) {
    if (row.sort_order != null) continue; // already set, leave it
    const key = `${row.chart}␟${row.platform}␟${row.entry_date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const updates = [];
  for (const rows of groups.values()) {
    rows.forEach((row, i) => updates.push({ id: row.id, sort_order: i }));
  }

  console.log(`${data.length} total rows, ${updates.length} need a sort_order backfilled across ${groups.size} chart/platform/date groups.`);

  if (updates.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (!CONFIRM) {
    console.log("Dry run — first 10 updates that would be written:");
    updates.slice(0, 10).forEach((u) => console.log(`  id ${u.id} -> sort_order ${u.sort_order}`));
    console.log("Re-run with --confirm to write these.");
    return;
  }

  let written = 0;
  for (const u of updates) {
    const { error: updErr } = await supabase.from("milestone_chart_entries").update({ sort_order: u.sort_order }).eq("id", u.id);
    if (updErr) {
      console.error(`Failed on id ${u.id}:`, updErr.message);
      continue;
    }
    written++;
    if (written % 200 === 0) console.log(`...${written}/${updates.length}`);
  }
  console.log(`Done. Wrote sort_order on ${written}/${updates.length} rows.`);
}

main();
