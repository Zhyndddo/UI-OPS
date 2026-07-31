#!/usr/bin/env node
// One-time cleanup — a tester left duplicate Media Booking tickets for the
// same release sitting in the DB (multiple non-deleted `tickets` rows with
// the same tab_id=media_booking and the same data.releaseId). Going
// forward this is blocked at the DB level (see
// add-media-booking-dedup.sql's trg_prevent_duplicate_media_booking
// trigger), but that trigger only stops NEW duplicates — it doesn't touch
// what's already there. This script does that part.
//
// Rule: keep the OLDEST ticket per (releaseId) group (by created_at —
// whichever was created first is treated as the "real" one), soft-delete
// every other ticket in that group by setting deleted_at/deleted_by, same
// as the app's own delete path. Nothing is hard-deleted, so this is fully
// reversible by clearing deleted_at back to null if a keep/delete choice
// was wrong.
//
// Run add-media-booking-dedup.sql BEFORE (or after, order doesn't matter
// for this specific pairing) — that trigger and this script solve two
// different halves of the same problem: it stops new dupes, this clears
// out old ones.
//
// Defaults to a DRY RUN — pass --confirm to actually write anything.
// Strongly recommended: run scripts/backup.js first.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/cleanup-duplicate-media-booking.js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/cleanup-duplicate-media-booking.js --confirm

const { createClient } = require("@supabase/supabase-js");

async function main() {
  const confirm = process.argv.includes("--confirm");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id").eq("key", "media_booking").single();
  if (tabErr || !tab) {
    console.error(`Couldn't find the Media Booking ticket type: ${tabErr?.message || "not found"}`);
    process.exit(1);
  }

  const { data: tickets, error } = await supabase
    .from("tickets")
    .select("id, data, created_at")
    .eq("tab_id", tab.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.error(`Fetch failed: ${error.message}`);
    process.exit(1);
  }

  const groups = new Map(); // releaseId -> [tickets], oldest first (already sorted)
  for (const t of tickets || []) {
    const relId = t.data?.releaseId;
    if (!relId) continue; // no releaseId to group by — leave it alone, not this script's problem
    if (!groups.has(relId)) groups.set(relId, []);
    groups.get(relId).push(t);
  }

  const dupeGroups = [...groups.entries()].filter(([, ts]) => ts.length > 1);
  const toDelete = dupeGroups.flatMap(([, ts]) => ts.slice(1)); // keep index 0 (oldest), delete the rest

  console.log(`${confirm ? "CLEANING UP" : "DRY RUN —"} ${tickets.length} non-deleted Media Booking tickets checked; ${dupeGroups.length} releases have duplicates; ${toDelete.length} tickets to soft-delete.\n`);

  let deleted = 0, failed = 0;

  for (const [relId, ts] of dupeGroups) {
    console.log(`Release ${relId}: ${ts.length} tickets — keeping ${ts[0].id} (created ${ts[0].created_at}), deleting ${ts.length - 1} newer duplicate(s).`);
    for (const t of ts.slice(1)) {
      console.log(`  -> soft-deleting ${t.id} (created ${t.created_at})`);
      if (!confirm) continue;
      const { error: delErr } = await supabase
        .from("tickets")
        .update({ deleted_at: new Date().toISOString(), deleted_by: "cleanup-duplicate-media-booking.js" })
        .eq("id", t.id);
      if (delErr) {
        console.error(`     FAILED: ${delErr.message}`);
        failed++;
        continue;
      }
      deleted++;
    }
  }

  console.log(`\n${confirm ? "Done." : "Dry run complete — nothing written."} Soft-deleted: ${deleted}, Failed: ${failed}.`);
  if (!confirm) console.log("Re-run with --confirm to actually write these updates.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
