#!/usr/bin/env node
// One-time repair — import-brief.js's --confirm run(s) somehow left
// legacy_id null on every imported release, even though the exact same
// value made it into `did` (confirmed: did came out as
// "TTBL160726-0319" — a correct 10-char base + row-position suffix — but
// legacy_id sat null). Since the base is still recoverable straight out
// of `did` (it's everything before the final "-NNNN"), this backfills
// legacy_id directly from already-correct data instead of re-parsing the
// BRIEF sheet or needing to figure out why the first write dropped it.
//
// Only touches releases whose DID matches the BRIEF-import shape exactly
// — a single dash, a 10-character base, a 4-digit suffix
// (`^(.{10})-\d{4}$`). Organically-created releases use a different DID
// shape (initials + date + seq, two dashes, longer base — see
// set_release_did() in schema.sql) and won't match this pattern, so this
// is safe to run without accidentally tagging non-imported releases.
// Only touches rows where legacy_id is currently null — never overwrites
// an existing value.
//
// Defaults to a DRY RUN — pass --confirm to actually write anything.
// Strongly recommended: run scripts/backup.js first (though this is a
// low-risk, easily-reversible write — legacy_id isn't read by anything
// except the other import/repair scripts' matching logic).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-legacy-id.js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-legacy-id.js --confirm

const { createClient } = require("@supabase/supabase-js");

const BRIEF_DID_RE = /^(.{10})-\d{4}$/;

async function main() {
  const confirm = process.argv.includes("--confirm");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const { data: releases, error } = await supabase
    .from("releases")
    .select("id, did, title, legacy_id")
    .is("legacy_id", null);
  if (error) {
    console.error(`Fetch failed: ${error.message}`);
    process.exit(1);
  }

  const candidates = (releases || []).filter((r) => r.did && BRIEF_DID_RE.test(r.did));
  console.log(`${confirm ? "REPAIRING" : "DRY RUN —"} ${releases.length} releases have no legacy_id; ${candidates.length} of those have a DID matching the BRIEF-import shape.\n`);

  let updated = 0, failed = 0;

  for (const r of candidates) {
    const base = r.did.match(BRIEF_DID_RE)[1];
    console.log(`${r.did} ("${r.title}") -> legacy_id = "${base}"`);
    if (!confirm) continue;

    const { error: updateErr } = await supabase.from("releases").update({ legacy_id: base }).eq("id", r.id);
    if (updateErr) {
      console.error(`  -> FAILED: ${updateErr.message}`);
      failed++;
      continue;
    }
    updated++;
  }

  console.log(`\n${confirm ? "Done." : "Dry run complete — nothing written."} Updated: ${updated}, Failed: ${failed}, Not BRIEF-shaped (left alone): ${releases.length - candidates.length}.`);
  if (!confirm) console.log("Re-run with --confirm to actually write these updates. Once this lands, re-run repair-brief-ticks.js and import-ops-tracking.js — they should start matching.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
