#!/usr/bin/env node
// One-time backfill — imports historical Media Booking data from the two
// "BOOKING & REPORT 01" / "BOOKING - INT MEDIA SUPPORT" legacy sheets into
// v2's real Media Booking tables. Both sheets share an IDENTICAL header
// layout (verified column-by-column against the actual uploaded workbook —
// an earlier draft of the request described the ranges differently per
// sheet, but they're the same), so one column map covers both.
//
// MATCHING: same convention as import-ops-tracking.js — column B
// ('✍️DID') is the 10-character legacy DID, matched against
// releases.legacy_id. Rows with no match are skipped (logged), not
// errored — import-brief.js must have run first for a match to exist at
// all, and not every booking-sheet row necessarily has a v2 release yet.
//
// TWO independent things get imported per matched row:
//
//   1. REQUEST quantities (columns R, U, V, W, X, Y, Z, AC, AD, AE, AF, AG,
//      AH) -> one media_booking_packages row per release (name "LEGACY
//      BOOKING IMPORT"), with one media_booking_package_lines row per
//      non-empty quantity cell. Columns S/T (between R and U) are a
//      status/meta pair ("✍️REQUEST" / "🔒STATUS on quantity"), not a
//      brand — deliberately skipped. AA/AB are blank spacer columns in the
//      sheet.
//
//   2. RESULT links (columns AV through BE — the 10 columns that actually
//      hold "Label: https://url" text; BF/BG/BH past them are a WIP status
//      column for the 3 Ads brands, not URLs, so they're excluded here) ->
//      one media_booking_entries row per "Label: https://url" line inside
//      each cell (newline-separated; the label prefix is optional — a bare
//      URL with no leading "Label: " is also handled). Platform is
//      guessed from the URL's own domain (tiktok.com/facebook.com/
//      youtube.com/instagram.com), not the column, since a few cells mix
//      domains.
//
// Both halves are safely re-runnable: a release that already has a
// "LEGACY BOOKING IMPORT" package is skipped for the quantity half, and an
// entry is only inserted if an identical (release, category, channel,
// link) row doesn't already exist for the URL half.
//
// Defaults to a DRY RUN — pass --confirm to actually write anything.
// Strongly recommended: run scripts/backup.js first.
//
//   npm install xlsx --no-save
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-booking.js data/booking-import.xlsx
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-booking.js data/booking-import.xlsx --confirm

const { createClient } = require("@supabase/supabase-js");
const XLSX = require("xlsx");

const SHEET_NAMES = ["BOOKING & REPORT 01", "BOOKING - INT MEDIA SUPPORT"];
const HEADER_ROW = 14;
const FIRST_DATA_ROW = 15;
const DID_COL = 1; // column B, 0-indexed

const IMPORT_PACKAGE_NAME = "LEGACY BOOKING IMPORT";

// col index (0-based) -> [expected header substring, category name, brand,
// platform-for-Ads-only]. category/brand match the live vocabulary used by
// the Package Builder (BRANDS/COMMUNITY_BRANDS/TIKTOK_GROUPS in
// app/tickets/media-booking/page.js) wherever a clean match exists; "EXT
// TIKTOK" has no single matching Partner sub-brand in the live picker
// (that sheet mushes all 4 into one total), so it's imported as a
// standalone brand label rather than force-matched to one of the four.
const REQUEST_COLUMNS = {
  17: ["EXT TIKTOK", "TikTok Channel", "EXT TIKTOK", null],
  20: ["TIKTOK BOLERO", "TikTok Channel", "TIKTOK BOLERO / MT", null],
  21: ["TIKTOK VPOP", "TikTok Channel", "TIKTOK VPOP", null],
  22: ["TIKTOK INDIE", "TikTok Channel", "TIKTOK INDIE", null],
  23: ["CAPCUT", "TikTok Channel", "CAPCUT", null],
  24: ["SOCIAL ENVI", "Social", "ENVI", null],
  25: ["SOCIAL VIEENT", "Social", "VIEENT", null],
  28: ["PAGE BOLERO", "Community", "PAGE BOLERO / MT", null],
  29: ["PAGE", "Community", "PAGE VPOP", null],
  30: ["PAGE INDIE", "Community", "PAGE INDIE", null],
  31: ["FB POST ADS", "Ads", "", "FB POST ADS"],
  32: ["FB VIDEO ADS", "Ads", "", "FB VIDEO ADS"],
  33: ["YOUTUBE ADS", "Ads", "", "YOUTUBE ADS"],
};

// col index (0-based) -> [expected header substring, category name, channel_name, channel_type]
const RESULT_COLUMNS = {
  47: ["EXT Tiktok", "TikTok Channel", "EXT TIKTOK", "Partner"],
  48: ["TIKTOK BOLERO", "TikTok Channel", "TIKTOK BOLERO / MT", "Direct"],
  49: ["TIKTOK VPOP", "TikTok Channel", "TIKTOK VPOP", "Direct"],
  50: ["TIKTOK INDIE", "TikTok Channel", "TIKTOK INDIE", "Direct"],
  51: ["CAPCUT", "TikTok Channel", "CAPCUT", "Direct"],
  52: ["SOCIAL ENVI", "Social", "ENVI", "Direct"],
  53: ["SOCIAL VIEENT", "Social", "VIEENT", "Direct"],
  54: ["PAGE BOLERO", "Community", "PAGE BOLERO / MT", "Direct"],
  55: ["PAGE", "Community", "PAGE VPOP", "Direct"],
  56: ["PAGE INDIE", "Community", "PAGE INDIE", "Direct"],
};

function checkHeaders(headerRow, columns) {
  const problems = [];
  for (const [idxStr, [expect]] of Object.entries(columns)) {
    const idx = Number(idxStr);
    const actual = String(headerRow[idx] || "").trim();
    if (!actual.toUpperCase().includes(expect.toUpperCase().split(" ")[0])) {
      problems.push(`col idx ${idx}: expected something containing "${expect}", found "${actual}"`);
    }
  }
  return problems;
}

function guessPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes("tiktok.com")) return "TikTok";
  if (u.includes("facebook.com") || u.includes("fb.com") || u.includes("fb.watch")) return "Facebook";
  if (u.includes("instagram.com")) return "Instagram";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube";
  return "Facebook"; // fallback — Social/Community brands here are overwhelmingly Facebook
}

// Splits a cell's multi-line "Label: https://url" content into
// {label, url} pairs — a bare URL with no leading label is also accepted
// (label falls back to null). Lines that don't contain a URL at all
// (status text like "ĐÃ XONG") produce nothing, which is what lets
// RESULT_COLUMNS's range safely include a status-text column if one ever
// sneaks in — it just yields zero entries instead of garbage.
function parseLinkLines(cellValue) {
  if (!cellValue) return [];
  const text = String(cellValue);
  const out = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const urlMatch = line.match(/https?:\/\/\S+/i);
    if (!urlMatch) continue;
    const url = urlMatch[0].replace(/[),.]+$/, ""); // trim trailing punctuation a human might have left
    const before = line.slice(0, urlMatch.index).replace(/:\s*$/, "").trim();
    out.push({ label: before || null, url });
  }
  return out;
}

function extractRows(sheet, label) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const headerRow = rows[HEADER_ROW - 1];
  if (!headerRow) throw new Error(`${label}: expected a header row at row ${HEADER_ROW}, sheet only has ${rows.length} rows.`);
  const problems = [...checkHeaders(headerRow, REQUEST_COLUMNS), ...checkHeaders(headerRow, RESULT_COLUMNS)];
  if (problems.length > 0) {
    throw new Error(`${label}: header check failed:\n` + problems.map((p) => `  - ${p}`).join("\n"));
  }
  return rows.slice(FIRST_DATA_ROW - 1).filter((r) => r && r.some((c) => c !== null && c !== ""));
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const filePath = process.argv[2];
  if (!filePath || filePath === "--confirm") {
    console.error("Usage: node scripts/import-booking.js <path-to-xlsx> [--confirm]");
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const { data: cats, error: catErr } = await supabase.from("package_categories").select("id, name");
  if (catErr) { console.error(catErr.message); process.exit(1); }
  const categoryIdByName = {};
  (cats || []).forEach((c) => (categoryIdByName[c.name] = c.id));
  for (const name of ["Social", "Community", "Ads", "TikTok Channel"]) {
    if (!categoryIdByName[name]) {
      console.error(`Missing expected package_categories row "${name}" — is this the right DB?`);
      process.exit(1);
    }
  }

  const wb = XLSX.readFile(filePath, { cellDates: true });

  let allRows = [];
  for (const sheetName of SHEET_NAMES) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      console.log(`No "${sheetName}" sheet found — skipping.`);
      continue;
    }
    const rows = extractRows(sheet, sheetName);
    allRows.push(...rows.map((r) => ({ row: r, source: sheetName })));
  }

  console.log(`${confirm ? "IMPORTING" : "DRY RUN —"} ${allRows.length} rows found across both sheets.\n`);

  let releasesTouched = 0, releasesSkippedNoMatch = 0, releasesSkippedNoData = 0, releasesSkippedAlreadyImported = 0, failed = 0;
  let linesInserted = 0, entriesInserted = 0, entriesSkippedExisting = 0;

  for (const { row, source } of allRows) {
    const did = row[DID_COL] ? String(row[DID_COL]).trim() : null;
    if (!did) continue;

    // Gather the quantity lines and the URL lines for this row up front —
    // if both are empty there's nothing to do, no need to even look up
    // the release.
    const qtyLines = [];
    for (const [idxStr, [, categoryName, brand, adsPlatform]] of Object.entries(REQUEST_COLUMNS)) {
      const raw = row[Number(idxStr)];
      const qty = raw === null || raw === undefined || raw === "" ? null : Number(raw);
      if (qty == null || Number.isNaN(qty) || qty === 0) continue;
      qtyLines.push({ categoryId: categoryIdByName[categoryName], brand, platform: adsPlatform, quantity: qty });
    }
    const urlLines = [];
    for (const [idxStr, [, categoryName, channelName, channelType]] of Object.entries(RESULT_COLUMNS)) {
      const raw = row[Number(idxStr)];
      for (const { label, url } of parseLinkLines(raw)) {
        urlLines.push({ categoryId: categoryIdByName[categoryName], channelName, channelType, platform: guessPlatform(url), url, label });
      }
    }
    if (qtyLines.length === 0 && urlLines.length === 0) { releasesSkippedNoData++; continue; }

    const { data: existing, error: lookupErr } = await supabase.from("releases").select("id, did").eq("legacy_id", did).maybeSingle();
    if (lookupErr) {
      console.error(`[${source}] ${did}: lookup FAILED — ${lookupErr.message}`);
      failed++;
      continue;
    }
    if (!existing) {
      console.log(`[${source}] ${did}: no matching release — skipping.`);
      releasesSkippedNoMatch++;
      continue;
    }

    console.log(`[${source}] ${did} -> ${existing.did}: ${qtyLines.length} quantity line(s), ${urlLines.length} URL(s).`);
    releasesTouched++;
    if (!confirm) continue;

    // Half 1 — request quantities into one "LEGACY BOOKING IMPORT" package
    // per release. Skip entirely if that package already exists (re-run
    // safety) rather than trying to diff/merge line-by-line.
    if (qtyLines.length > 0) {
      const { data: existingPkg, error: pkgLookupErr } = await supabase
        .from("media_booking_packages")
        .select("id")
        .eq("release_id", existing.id)
        .eq("name", IMPORT_PACKAGE_NAME)
        .maybeSingle();
      if (pkgLookupErr) {
        console.error(`  -> package lookup FAILED: ${pkgLookupErr.message}`);
        failed++;
      } else if (existingPkg) {
        releasesSkippedAlreadyImported++;
      } else {
        const { data: pkg, error: pkgErr } = await supabase
          .from("media_booking_packages")
          .insert({ release_id: existing.id, name: IMPORT_PACKAGE_NAME, status: "sent", sort_order: 0 })
          .select()
          .single();
        if (pkgErr) {
          console.error(`  -> package insert FAILED: ${pkgErr.message}`);
          failed++;
        } else {
          const rows = qtyLines.map((l, i) => ({
            package_id: pkg.id,
            category_id: l.categoryId,
            brand: l.brand,
            platform: l.platform,
            quantity: l.quantity,
            sort_order: i,
          }));
          const { error: linesErr } = await supabase.from("media_booking_package_lines").insert(rows);
          if (linesErr) {
            console.error(`  -> lines insert FAILED: ${linesErr.message}`);
            failed++;
          } else {
            linesInserted += rows.length;
          }
        }
      }
    }

    // Half 2 — result URLs into media_booking_entries, one row per URL,
    // deduped against anything already there for the same (release,
    // category, channel, link).
    for (const l of urlLines) {
      const { data: dupe, error: dupeErr } = await supabase
        .from("media_booking_entries")
        .select("id")
        .eq("release_id", existing.id)
        .eq("category_id", l.categoryId)
        .eq("channel_name", l.channelName)
        .eq("link", l.url)
        .maybeSingle();
      if (dupeErr) {
        console.error(`  -> entry dupe-check FAILED: ${dupeErr.message}`);
        failed++;
        continue;
      }
      if (dupe) { entriesSkippedExisting++; continue; }

      const { error: entryErr } = await supabase.from("media_booking_entries").insert({
        release_id: existing.id,
        booking_round: "INT",
        platform: l.platform,
        channel_type: l.channelType,
        status: "Done",
        category_id: l.categoryId,
        channel_name: l.channelName,
        link: l.url,
        note: l.label && l.label.toUpperCase() !== l.channelName.toUpperCase() ? `Imported label: ${l.label}` : null,
      });
      if (entryErr) {
        console.error(`  -> entry insert FAILED: ${entryErr.message}`);
        failed++;
      } else {
        entriesInserted++;
      }
    }
  }

  console.log(
    `\n${confirm ? "Done." : "Dry run complete — nothing written."} ` +
      `Releases touched: ${releasesTouched}, no match: ${releasesSkippedNoMatch}, empty rows: ${releasesSkippedNoData}, ` +
      `already imported (package): ${releasesSkippedAlreadyImported}, failed: ${failed}.\n` +
      `Package lines inserted: ${linesInserted}. Entries inserted: ${entriesInserted}, already existed: ${entriesSkippedExisting}.`
  );
  if (!confirm) console.log("Re-run with --confirm to actually write these updates.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
