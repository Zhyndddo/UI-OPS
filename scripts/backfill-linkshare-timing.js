#!/usr/bin/env node
// One-time data fix — the "for the data" half of item 5. Fills in
// linkshare_tiktok_timing / linkshare_facebook_timing for existing
// releases that don't have a value yet, using the same default logic the
// New Release create form now applies live (see
// lib/releaseNotes.js's defaultLinkshareFacebookTiming /
// defaultLinkshareTiktokTiming):
//   - Facebook: "Ngày deliver+4" if the release was created at least 4
//     days before its Release Date, otherwise "Cùng ngày"
//   - Tiktok: always defaults to "Ngày release+7"
//
// Never overwrites a value that's already set — manual picks (live or
// from before this feature existed) are left exactly as they are. Safe
// to re-run; anything already filled in is skipped.
//
// Defaults to a DRY RUN — pass --confirm to actually write anything.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-linkshare-timing.js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-linkshare-timing.js --confirm

const { createClient } = require("@supabase/supabase-js");

// Duplicated (not require()'d) from lib/releaseNotes.js on purpose — that
// file is a "use client" React module; this keeps the script dependency-
// free and Node-only. Keep the two in sync if the rule ever changes.
const LINKSHARE_TIKTOK_OPTIONS = ["Cùng Ngày", "Ngày release+4", "Ngày release+7"];
const LINKSHARE_FACEBOOK_OPTIONS = ["Cùng ngày", "Ngày deliver+4"];

function defaultFacebookTiming(createdAt, releaseDate) {
  if (!createdAt || !releaseDate) return LINKSHARE_FACEBOOK_OPTIONS[0];
  const created = new Date(createdAt);
  const createdDateOnly = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate()));
  const release = new Date(`${releaseDate}T00:00:00Z`);
  const cutoff = new Date(release);
  cutoff.setUTCDate(cutoff.getUTCDate() - 4);
  return createdDateOnly.getTime() <= cutoff.getTime() ? LINKSHARE_FACEBOOK_OPTIONS[1] : LINKSHARE_FACEBOOK_OPTIONS[0];
}
function defaultTiktokTiming() {
  return LINKSHARE_TIKTOK_OPTIONS[2];
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: releases, error } = await supabase
    .from("releases")
    .select("id, did, created_at, release_date, linkshare_tiktok_timing, linkshare_facebook_timing")
    .or("linkshare_tiktok_timing.is.null,linkshare_facebook_timing.is.null");
  if (error) throw new Error(error.message);

  console.log(`Found ${releases.length} release(s) missing at least one Linkshare timing value.`);
  console.log(confirm ? "LIVE RUN — writing to the database.\n" : "DRY RUN — pass --confirm to actually write.\n");

  let fixed = 0;
  for (const r of releases) {
    const patch = {};
    if (!r.linkshare_tiktok_timing) patch.linkshare_tiktok_timing = defaultTiktokTiming();
    if (!r.linkshare_facebook_timing) patch.linkshare_facebook_timing = defaultFacebookTiming(r.created_at, r.release_date);

    console.log(`${r.did}${patch.linkshare_tiktok_timing ? `  tiktok -> ${patch.linkshare_tiktok_timing}` : ""}${patch.linkshare_facebook_timing ? `  facebook -> ${patch.linkshare_facebook_timing}` : ""}`);
    if (!confirm) { fixed++; continue; }

    const { error: updErr } = await supabase.from("releases").update(patch).eq("id", r.id);
    if (updErr) { console.error(`  update failed: ${updErr.message}`); continue; }
    fixed++;
  }

  console.log(`\n${confirm ? "Fixed" : "Would fix"} ${fixed} of ${releases.length} release(s).`);
  if (!confirm) console.log("Re-run with --confirm to actually write.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
