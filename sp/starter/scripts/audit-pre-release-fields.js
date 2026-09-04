#!/usr/bin/env node
// Read-only diagnostic for the Pre-release workstation — reported symptom:
// "the CANVA group has no data", same bug class as the New Release
// dashboard's Channel column (see audit-release-channel.js).
//
// app/workstation/pre-release/page.js renders 6 columns (CANVA, MV,
// Artist Pick, Musixmatch Status, NCT Lyric, Zing Lyric) as fixed
// single-choice <select> pickers. import-ops-tracking.js writes whatever
// free text was in the source sheet's STATUS/NOTE/Artist Pick columns
// straight into these fields, with no mapping onto the fixed option
// lists — so a value that doesn't exactly match one of them renders
// blank in the picker even though it's genuinely in the database.
//
// This script never writes anything — no --confirm flag, nothing to
// confirm. It only reads releases and reports, per field, every value
// that isn't one of that field's picker options.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/audit-pre-release-fields.js

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Must stay in sync with app/workstation/pre-release/page.js's own
// CANVA_OPTS / MV_OPTS / PICK_OPTS / MUSIXMATCH_STATUS_OPTS constants.
const FIELDS = [
  { column: "canva_mv_status", label: "CANVA", opts: ["Done", "CUT", "No Vid"] },
  { column: "canva_status", label: "MV", opts: ["LYRIC", "Đã có", "Chưa có", "Không có"] },
  { column: "artist_pick_status", label: "Artist Pick", opts: ["Done", "Uneditible", "Skip"] },
  { column: "musixmatch_status", label: "Musixmatch Status", opts: ["Catalog", "Added", "Sync"] },
  { column: "nct_lyric", label: "NCT Lyric", opts: ["Done", "Uneditible", "Skip"] },
  { column: "zing_lyric", label: "Zing Lyric", opts: ["Done", "Uneditible", "Skip"] },
];

async function main() {
  const columns = FIELDS.map((f) => f.column);
  const { data: releases, error } = await supabase
    .from("releases")
    .select(`id, did, title, main_artist, ${columns.join(", ")}`);
  if (error) {
    console.error("Failed to read releases: " + error.message);
    process.exit(1);
  }

  console.log(`=== Pre-release picker field audit across ${releases.length} release(s) ===`);

  let totalUnrecognized = 0;
  FIELDS.forEach((f) => {
    const affected = (releases || []).filter((r) => r[f.column] && !f.opts.includes(r[f.column]));
    totalUnrecognized += affected.length;
    console.log(`\n--- ${f.label} (${f.column}) — known options: ${f.opts.join(", ")} ---`);
    console.log(`Releases with an unrecognized value (renders blank in the picker): ${affected.length}`);
    if (affected.length > 0) {
      console.log("Sample of up to 15 (DID, title, artist, raw value):");
      affected.slice(0, 15).forEach((r) => {
        console.log(`  - ${r.did || "(no DID)"} — "${r.title}" — ${r.main_artist} — ${f.column}="${r[f.column]}"`);
      });
    }
  });

  console.log(`\nTotal unrecognized values across all 6 fields: ${totalUnrecognized}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
