#!/usr/bin/env node
// One-time correction for tickets already inserted by
// scripts/import-design-tickets.js BEFORE profiles for Như/Amy/Thư/Bảo
// (or anyone else) existed — those rows have `executor` set as free text
// but `pic_profile_id` left null, since there was nothing to match
// against at import time. Re-running import-design-tickets.js won't fix
// them (its legacy_id idempotency check skips rows that already exist);
// this script updates already-inserted rows directly instead.
//
// Only touches tickets on the "design" tab where pic_profile_id is
// currently null and executor is set. Matches executor against
// profiles.name on an EXACT (case-insensitive, trimmed) basis — same
// rule as the import script — and only when exactly one profile has that
// name. Ambiguous (multiple profiles, same name) or no-match rows are
// skipped and reported, never guessed.
//
// Safe to run repeatedly — once a ticket's pic_profile_id is set, it's
// no longer selected on a later run.
//
// Dry-run by default; pass --confirm to actually write.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-design-executor-profile.js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-design-executor-profile.js --confirm

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
  const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id").eq("key", "design").single();
  if (tabErr || !tab) {
    console.error("Couldn't find the 'design' ticket tab — has schema.sql been deployed? " + (tabErr?.message || ""));
    process.exit(1);
  }

  const { data: profiles, error: profErr } = await supabase.from("profiles").select("id, name");
  if (profErr) {
    console.error("Failed to read profiles: " + profErr.message);
    process.exit(1);
  }
  const nameCounts = new Map();
  const idByName = new Map();
  for (const p of profiles || []) {
    if (!p.name) continue;
    const key = p.name.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
    idByName.set(key, p.id);
  }

  const { data: rows, error: fetchErr } = await supabase
    .from("tickets")
    .select("id, executor")
    .eq("tab_id", tab.id)
    .is("pic_profile_id", null)
    .not("executor", "is", null);
  if (fetchErr) {
    console.error("Failed to read tickets: " + fetchErr.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("Nothing to backfill — no design tickets with an unlinked executor.");
    return;
  }

  const toUpdate = [];
  const skipped = [];
  for (const row of rows) {
    const key = (row.executor || "").trim().toLowerCase();
    if (!key) continue;
    if (nameCounts.get(key) === 1) {
      toUpdate.push({ id: row.id, executor: row.executor, pic_profile_id: idByName.get(key) });
    } else {
      skipped.push({ id: row.id, executor: row.executor, reason: nameCounts.get(key) > 1 ? "ambiguous (multiple profiles with this name)" : "no matching profile" });
    }
  }

  console.log(`${rows.length} ticket(s) with an unlinked executor. ${toUpdate.length} can be matched now, ${skipped.length} skipped.`);
  if (skipped.length > 0) {
    const byExecutor = {};
    for (const s of skipped) byExecutor[s.executor] = (byExecutor[s.executor] || 0) + 1;
    console.log("Skipped, by executor value:");
    for (const [name, count] of Object.entries(byExecutor)) console.log(`  - "${name}": ${count} ticket(s)`);
  }

  if (!confirm) {
    console.log("Dry run — re-run with --confirm to actually update.");
    return;
  }

  let updated = 0;
  for (const row of toUpdate) {
    const { error } = await supabase.from("tickets").update({ pic_profile_id: row.pic_profile_id }).eq("id", row.id);
    if (error) {
      console.error(`  FAILED on ticket ${row.id}: ${error.message}`);
      continue;
    }
    updated++;
  }
  console.log(`Done. Updated ${updated}/${toUpdate.length} ticket(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
