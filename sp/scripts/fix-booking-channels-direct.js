#!/usr/bin/env node
// One-time correction for scripts/import-booking-channels.js's original
// mistake: it guessed channel_type "Direct" only for VIEENT's/ENVI's own
// named pages and "Partner" for every other imported channel, assuming
// channel_type tracked page ownership. Wrong — every channel on the
// reference sheet is one VIEENT deals with directly (no third-party
// agency), so channel_type should be "Direct" across the board. The
// import script itself is already fixed (see its file header); this
// script corrects rows that were already written to the database with
// the old, wrong logic.
//
// Only touches rows this import created — identified by `brand IS NOT
// NULL` (only import-booking-channels.js ever sets that column; the 9
// original hand-seeded rows and anything added by hand from
// /booking-channels have brand = null, and are left alone here).
//
// Since channel_type is part of the table's unique(name, platform,
// channel_type) constraint, flipping Partner -> Direct on a row could in
// theory collide with an existing Direct row that already has the same
// (name, platform) — practically shouldn't happen for this batch (every
// imported name is distinct per platform), but this script checks for it
// per row and skips + reports instead of erroring the whole run.
//
// Dry-run by default; pass --confirm to actually write.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/fix-booking-channels-direct.js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/fix-booking-channels-direct.js --confirm

const { createClient } = require("@supabase/supabase-js");

const confirm = process.argv.includes("--confirm");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: rows, error: fetchErr } = await supabase
    .from("booking_channels")
    .select("id, name, platform, channel_type, brand")
    .not("brand", "is", null)
    .neq("channel_type", "Direct");

  if (fetchErr) {
    console.error("Failed to read booking_channels: " + fetchErr.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("Nothing to fix — every imported row (brand IS NOT NULL) is already channel_type = 'Direct'.");
    return;
  }

  console.log(`${rows.length} imported row(s) currently set to a non-Direct channel_type.`);

  // Pre-check for the unique(name, platform, channel_type) collision case
  // described in the header — fetch every existing Direct row once and
  // compare, rather than firing an update per row and hoping.
  const { data: directRows } = await supabase.from("booking_channels").select("name, platform").eq("channel_type", "Direct");
  const directKeys = new Set((directRows || []).map((r) => `${r.name.toLowerCase()}|${r.platform}`));

  const toFix = [];
  const skipped = [];
  for (const row of rows) {
    const key = `${row.name.toLowerCase()}|${row.platform}`;
    if (directKeys.has(key)) {
      skipped.push(row);
    } else {
      toFix.push(row);
      directKeys.add(key); // guard against two rows in this same batch colliding with each other
    }
  }

  if (skipped.length > 0) {
    console.log(`\nSkipping ${skipped.length} row(s) that would collide with an existing Direct row of the same name+platform — needs a manual look:`);
    skipped.forEach((r) => console.log(`  - "${r.name}" (${r.platform}), id=${r.id}`));
  }

  console.log(`\n${toFix.length} row(s) to update to channel_type = 'Direct'.`);

  if (!confirm) {
    console.log("Dry run — re-run with --confirm to actually update.");
    return;
  }

  let updated = 0;
  for (const row of toFix) {
    const { error } = await supabase.from("booking_channels").update({ channel_type: "Direct" }).eq("id", row.id);
    if (error) {
      console.error(`  FAILED on "${row.name}" (${row.platform}): ${error.message}`);
      continue;
    }
    updated++;
  }

  console.log(`Done. Updated ${updated}/${toFix.length} row(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
