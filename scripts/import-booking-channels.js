#!/usr/bin/env node
// One-time import: the real "LIST KÊNH VIEENT & ENVI" channel reference
// sheet (146 rows exported from Ver2.0 UI.xlsx, "Trang tính2" tab) into
// the existing `booking_channels` table — see schema.sql, which already
// had this table seeded with just VIEENT/ENVI's own 9 official channels
// and a comment saying it should "match the real LIST KÊNH VIEENT & ENVI
// sheet exactly." This is that sheet, in full: every Facebook/Instagram/
// TikTok/YouTube/Thread community/curator page VIEENT works with, across
// the VIEENT, ENVI, INDIE, VPOP and Capcut brand groupings, with follower
// counts and links.
//
// Run this AFTER add-booking-channels-reference-fields.sql (adds the
// brand/url/follower_count/note columns this script writes into — see
// DATA_FIXES.md).
//
// Field mapping from data/booking-channels-import.json (raw export of the
// spreadsheet) to booking_channels columns:
//   name            -> name (the channel/page's own display name)
//   platform        -> platform, normalized to the app's existing vocabulary
//                      (Facebook/Instagram/TikTok/YouTube/Thread — see
//                      PLATFORM_MAP below). The sheet's "Capcut" platform
//                      rows are all actual tiktok.com links (Capcut-style
//                      edit accounts), so they map to platform "TikTok"
//                      too — the "Capcut" label is preserved in `note`
//                      instead of inventing a 6th platform the rest of the
//                      app (BOOKING_PLATFORMS, PLATFORM_COLUMNS) doesn't
//                      know about.
//   brand           -> brand, kept as the sheet's own raw grouping
//                      (VIEENT / ENVI - MIỀN TÂY/BOLERO / INDIE / VPOP /
//                      capcut) rather than forced into the Booking Board's
//                      "PAGE VPOP"/"TIKTOK VPOP"-style column brand names —
//                      those are derived from this at read time (see
//                      channelMatchesColumn in app/booking/page.js) via a
//                      soft token match, not stored pre-mapped, so this
//                      table stays a faithful copy of the source sheet.
//   follower_count  -> follower_count (integer; sheet has some blanks —
//                      left null, not 0, since 0 followers and "not
//                      tracked yet" mean different things)
//   url             -> url
//   type            -> note (the sheet's loose tag, e.g. "Key news/tổng
//                      hợp", "Key lyrics" — descriptive only, not used by
//                      any picker logic)
//   channel_type    -> always "Direct". EARLIER VERSION of this script
//                      guessed "Direct" only for VIEENT's/ENVI's own named
//                      pages and "Partner" for everything else (assuming
//                      channel_type tracked page ownership) — wrong: every
//                      channel on this reference sheet, including the
//                      community/curator pages, is one VIEENT deals with
//                      directly (no third-party agency in between), which
//                      is what channel_type actually distinguishes (see
//                      media_booking_entries.channel_type's comment in
//                      schema.sql: "'Direct' = VIEENT runs it themselves,
//                      no third-party contract; 'Partner' = an outside
//                      vendor/channel is involved"). If a channel here
//                      ever needs to be Partner instead, change it by hand
//                      from /booking-channels.
//
// One row (brand: "capcut", everything else blank — a stray spacer row in
// the source sheet) has no name and is skipped; nothing else to create a
// channel from.
//
// Idempotent via the table's existing unique(name, platform, channel_type)
// constraint — skips any row that would collide with one already there
// (including the 9 original seed rows) rather than erroring the whole run.
//
// Dry-run by default; pass --confirm to actually write.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-booking-channels.js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-booking-channels.js --confirm

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const confirm = process.argv.includes("--confirm");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const FILE = path.join(__dirname, "..", "data", "booking-channels-import.json");

// The app's existing platform vocabulary (BOOKING_PLATFORMS in
// app/booking-channels/page.js, PLATFORM_COLUMNS in app/booking/page.js).
const PLATFORM_MAP = {
  "facebook": "Facebook",
  "ins": "Instagram",
  "instagram": "Instagram",
  "thread": "Thread",
  "tiktok": "TikTok",
  "youtube": "YouTube",
  "capcut": "TikTok", // see file header comment — Capcut rows are tiktok.com links
};

function normPlatform(raw) {
  if (!raw) return null;
  return PLATFORM_MAP[String(raw).trim().toLowerCase()] || null;
}

function inferChannelType(name) {
  // See the file header comment — every channel on this sheet is Direct.
  return "Direct";
}

async function main() {
  const rows = JSON.parse(fs.readFileSync(FILE, "utf8"));
  if (rows.length === 0) {
    console.log("No rows found in " + FILE);
    return;
  }

  const { data: existing } = await supabase.from("booking_channels").select("name, platform, channel_type");
  const existingKeys = new Set((existing || []).map((c) => `${c.name.toLowerCase()}|${c.platform}|${c.channel_type}`));

  let toInsert = 0, skippedNoName = 0, skippedBadPlatform = 0, skippedDuplicate = 0;
  const payload = [];

  for (const row of rows) {
    if (!row.name) {
      skippedNoName++;
      continue;
    }
    const platform = normPlatform(row.platform);
    if (!platform) {
      console.log(`SKIP — "${row.name}": unrecognized platform "${row.platform}".`);
      skippedBadPlatform++;
      continue;
    }
    const channelType = inferChannelType(row.name);
    const key = `${row.name.toLowerCase()}|${platform}|${channelType}`;
    if (existingKeys.has(key)) {
      skippedDuplicate++;
      continue;
    }
    existingKeys.add(key); // guard against dupes within the sheet itself too
    toInsert++;
    payload.push({
      name: row.name,
      platform,
      channel_type: channelType,
      brand: row.brand || null,
      url: row.url || null,
      follower_count: typeof row.follower_count === "number" ? Math.round(row.follower_count) : null,
      note: row.type || null,
      sort_order: 100, // after the hand-curated 0/1 sort_order seed rows — reorder later from /booking-channels if it matters
    });
  }

  console.log(`${payload.length} row(s) to insert. Skipped: ${skippedNoName} (no name), ${skippedBadPlatform} (bad platform), ${skippedDuplicate} (already exist).`);

  if (!confirm) {
    console.log("Dry run — re-run with --confirm to actually insert.");
    return;
  }

  // Insert in chunks — Supabase's insert has no hard row cap this small,
  // but chunking keeps any single failure's error message readable.
  const CHUNK = 50;
  let inserted = 0;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);
    const { error } = await supabase.from("booking_channels").insert(chunk);
    if (error) {
      console.error(`FAILED on chunk starting at row ${i}: ${error.message}`);
      process.exit(1);
    }
    inserted += chunk.length;
    console.log(`Inserted ${inserted}/${payload.length}...`);
  }

  console.log(`Done. Inserted ${inserted} channel(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
