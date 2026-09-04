#!/usr/bin/env node
// Read-only diagnostic for the Booking Board's two symptoms reported
// after the historical booking data import:
//   1. A release's Result-cell dot shows green ("done") for a Hạng Mục,
//      but none of that Hạng Mục's individual brand/subchannel COLUMNS
//      show any progress.
//   2. Large stretches of releases show grey/empty across every column.
//
// This never writes anything — no --confirm flag, nothing to confirm.
// It only reads media_booking_entries, media_booking_packages(_lines),
// package_categories, and releases, and reports mismatches.
//
// WHY #1 HAPPENS: the Result-cell dot (ResultCell in app/booking/page.js)
// counts EVERY entry in a category regardless of its brand — booked =
// any package-line quantity for that category (brand-agnostic), added =
// count of ALL entries for that category, no brand filter at all. The
// individual per-brand/subchannel COLUMNS, by contrast, only count an
// entry if its channel_name (brand) EXACTLY matches one of the columns
// currently being shown — a case difference, extra/missing space, or a
// legacy brand spelling from the imported data is enough to make an
// entry invisible in every column while still counting toward the dot.
// This script finds exactly those orphaned entries: rows whose
// channel_name doesn't exactly match any brand the Booking Board
// actually renders columns for, per category.
//
// WHY #2 HAPPENS: a release's whole row goes grey when
// packageByRelease[release.id] doesn't resolve — which only happens when
// there's no media_booking_packages row whose `name` exactly equals that
// release's `project_type`. If the import created package rows with a
// slightly different name (or didn't create one at all for some
// releases), every category on that release shows grey regardless of
// how many links were actually added. This script flags every release
// that has a project_type set but no matching package row.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/audit-booking-board.js
//     -> prints the two mismatch summaries above, across every release.
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/audit-booking-board.js <DID>
//     -> instead prints a full dump for ONE release by DID: its
//        project_type, whether a matching package (+ lines) exists, and
//        every media_booking_entries row tied to it — enough to see
//        exactly why that release's row looks the way it does.

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const didArg = process.argv.slice(2).find((a) => !a.startsWith("--") && a.trim() !== "");

// Must stay in sync with app/booking/page.js / app/tickets/media-booking/page.js's
// own brand constants — see those files' own "MUST stay in sync" comments.
const KNOWN_BRANDS_BY_CATEGORY = {
  "Social": ["VIEENT", "ENVI"],
  "Community": ["PAGE BOLERO / MT", "PAGE VPOP", "PAGE INDIE"],
  "Ads": ["Facebook Ads", "YouTube Ads", "TikTok Ads", "Spotify Ads"],
  "TikTok Channel": [
    "TIKTOK BOLERO / MT", "TIKTOK VPOP", "TIKTOK INDIE", "CAPCUT",
    "EXT TIKTOK - BK MUSIC", "EXT TIKTOK - DUCTH", "EXT TIKTOK - BK GROUP", "EXT TIKTOK - CTV MẪU",
  ],
};

async function main() {
  const { data: categories } = await supabase.from("package_categories").select("id, name");
  const categoryNameById = {};
  (categories || []).forEach((c) => (categoryNameById[c.id] = c.name));

  if (didArg) {
    await auditOneRelease(didArg, categoryNameById);
    return;
  }

  console.log("=== Booking Board audit (all releases) ===\n");

  // --- Mismatch #1: entries whose channel_name doesn't match any known
  // brand for its category — invisible in every column, but still counted
  // by the Result-cell dot.
  const { data: entries } = await supabase.from("media_booking_entries").select("id, release_id, category_id, channel_name, platform, link");
  const orphaned = (entries || []).filter((e) => {
    const catName = categoryNameById[e.category_id];
    if (!catName) return true; // no category at all — always orphaned
    const known = KNOWN_BRANDS_BY_CATEGORY[catName];
    if (!known) return false; // category has no fixed brand list (shouldn't happen) — skip
    return !known.includes(e.channel_name || "");
  });

  console.log(`Entries with no category_id at all: ${(entries || []).filter((e) => !e.category_id).length}`);
  console.log(`Entries whose channel_name doesn't match any known brand for its category: ${orphaned.length - (entries || []).filter((e) => !e.category_id).length}`);
  if (orphaned.length > 0) {
    console.log("\nSample of up to 20 orphaned entries (release_id, category, channel_name, platform, link):");
    orphaned.slice(0, 20).forEach((e) => {
      console.log(`  - release_id=${e.release_id} category=${categoryNameById[e.category_id] || "(none)"} channel_name="${e.channel_name}" platform="${e.platform}" link=${e.link}`);
    });
  }

  // --- Mismatch #2: releases with a project_type but no matching package
  // row — makes the whole row grey regardless of entries.
  const { data: releases } = await supabase.from("releases").select("id, did, title, project_type");
  const { data: packages } = await supabase.from("media_booking_packages").select("release_id, name");
  const packageKeySet = new Set((packages || []).map((p) => `${p.release_id}|${p.name}`));

  const unmatchedReleases = (releases || []).filter((r) => r.project_type && !packageKeySet.has(`${r.id}|${r.project_type}`));
  console.log(`\nReleases with a project_type set but no matching media_booking_packages row (whole row shows grey): ${unmatchedReleases.length}`);
  if (unmatchedReleases.length > 0) {
    console.log("\nSample of up to 20 (DID, title, project_type):");
    unmatchedReleases.slice(0, 20).forEach((r) => {
      console.log(`  - ${r.did || "(no DID)"} — "${r.title}" — project_type="${r.project_type}"`);
    });
  }

  console.log("\nTo dig into one specific release, re-run with its DID:");
  console.log("  node scripts/audit-booking-board.js <DID>");
}

async function auditOneRelease(did, categoryNameById) {
  const { data: release, error } = await supabase.from("releases").select("id, did, title, main_artist, project_type, package_locked").eq("did", did).maybeSingle();
  if (error || !release) {
    console.error(`No release found with DID "${did}". ${error?.message || ""}`);
    process.exit(1);
  }
  console.log(`=== ${release.title} (${release.main_artist}) — ${release.did} ===`);
  console.log(`project_type: ${release.project_type || "(none)"}`);
  console.log(`package_locked: ${release.package_locked}`);

  const { data: pkgs } = await supabase
    .from("media_booking_packages")
    .select("id, name, media_booking_package_lines(category_id, brand, quantity)")
    .eq("release_id", release.id);
  console.log(`\nmedia_booking_packages rows for this release: ${(pkgs || []).length}`);
  (pkgs || []).forEach((p) => {
    const matches = p.name === release.project_type;
    console.log(`  - package "${p.name}"${matches ? " (MATCHES project_type — this is the one the Board uses)" : " (does NOT match project_type — Board ignores this one)"}`);
    (p.media_booking_package_lines || []).forEach((l) => {
      console.log(`      line: category=${categoryNameById[l.category_id] || l.category_id} brand="${l.brand}" quantity=${l.quantity}`);
    });
  });
  if ((pkgs || []).every((p) => p.name !== release.project_type)) {
    console.log(`  -> NO package row matches project_type "${release.project_type}" — every category will show grey ("not booked at all") on the Board regardless of entries below.`);
  }

  const { data: entries } = await supabase.from("media_booking_entries").select("*").eq("release_id", release.id);
  console.log(`\nmedia_booking_entries rows for this release: ${(entries || []).length}`);
  (entries || []).forEach((e) => {
    const catName = categoryNameById[e.category_id] || "(no category)";
    console.log(`  - round=${e.booking_round} category=${catName} channel_name="${e.channel_name}" platform="${e.platform}" subchannel_type="${e.subchannel_type || ""}" status=${e.status} link=${e.link}`);
  });
  if ((entries || []).length === 0) {
    console.log("  -> no entries at all for this release — matches the fully-grey/empty appearance if that's what you're seeing.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
