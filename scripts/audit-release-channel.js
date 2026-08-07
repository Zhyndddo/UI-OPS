#!/usr/bin/env node
// Read-only diagnostic for the New Release dashboard's "Channel" column
// (releases.requester_segment) — reported symptom: "the import have it,
// but the data on the app is not showing it."
//
// ROOT CAUSE: app/releases/page.js renders Channel as a controlled
// <select> with exactly two options, "VIEENT" and "ENVI" (see the
// CHANNELS constant there). If requester_segment holds anything else —
// different casing, extra whitespace despite the import's own .trim(),
// a totally different word from the source sheet ("Cả 2", "Both", a typo,
// etc.) — the <select> has no matching <option>, so the browser shows it
// blank. The value is genuinely sitting in the database (the import did
// write it), it's just invisible in that dropdown. Same blind spot hits
// the "By Media Channel" stat tiles above the table, which also only
// count rows whose requester_segment is exactly "VIEENT" or "ENVI".
//
// This script never writes anything — no --confirm flag, nothing to
// confirm. It only reads releases.requester_segment and reports which
// values don't match the two the UI recognizes.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/audit-release-channel.js

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Must stay in sync with CHANNELS in app/releases/page.js.
const KNOWN_CHANNELS = ["VIEENT", "ENVI"];

async function main() {
  const { data: releases, error } = await supabase
    .from("releases")
    .select("id, did, title, main_artist, requester_segment");
  if (error) {
    console.error("Failed to read releases: " + error.message);
    process.exit(1);
  }

  const counts = {}; // value (or "(blank)") -> count
  (releases || []).forEach((r) => {
    const v = r.requester_segment && r.requester_segment.trim() !== "" ? r.requester_segment : "(blank)";
    counts[v] = (counts[v] || 0) + 1;
  });

  console.log(`=== Channel value breakdown across ${releases.length} release(s) ===\n`);
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([value, count]) => {
      const recognized = value === "(blank)" || KNOWN_CHANNELS.includes(value);
      console.log(`  ${count.toString().padStart(5)}  "${value}"${recognized ? "" : "  <-- NOT recognized by the dashboard's dropdown, shows as blank there"}`);
    });

  const unrecognized = (releases || []).filter(
    (r) => r.requester_segment && r.requester_segment.trim() !== "" && !KNOWN_CHANNELS.includes(r.requester_segment)
  );
  console.log(`\nReleases with a Channel value the dashboard can't display: ${unrecognized.length}`);
  if (unrecognized.length > 0) {
    console.log("\nSample of up to 30 (DID, title, artist, raw requester_segment):");
    unrecognized.slice(0, 30).forEach((r) => {
      console.log(`  - ${r.did || "(no DID)"} — "${r.title}" — ${r.main_artist} — requester_segment="${r.requester_segment}"`);
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
