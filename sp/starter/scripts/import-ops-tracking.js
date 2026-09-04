#!/usr/bin/env node
// One-time backfill — fills in the OPS-side fields (CANVA/Lyric/Artist
// Pick from "NEW RELEASE", DSP check/Tag Confirm/Smartlink/Sound checks
// from "NR CONFIRM") for releases already created by import-brief.js.
//
// Every field this writes already exists as a `releases` column and is
// already wired into the Pre-release and Re-Check workstations — this
// script doesn't add anything new, it just backfills historical data for
// legacy releases so those workstations aren't starting from a blank
// slate.
//
// MATCHING: both sheets use the same 10-character DID code as
// import-brief.js's `legacy_id` (the base DID before the row-position
// suffix gets appended), so a row here matches a release by
// `releases.legacy_id = <this row's DID column>`. That means
// import-brief.js must be run first — this script skips (not errors) any
// DID it can't find a matching release for, since some rows in
// OPS_TRACKING may be releases outside this particular BRIEF import.
//
// Like import-brief.js, column matching is by FIXED INDEX with a header
// sanity check — re-index the maps below if the sheet's column order
// ever changes.
//
// Defaults to a DRY RUN — pass --confirm to actually write anything.
// Strongly recommended: run scripts/backup.js first.
//
//   npm install xlsx --no-save
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-ops-tracking.js data/ops-tracking-import.xlsx
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-ops-tracking.js data/ops-tracking-import.xlsx --confirm

const { createClient } = require("@supabase/supabase-js");
const XLSX = require("xlsx");

const DSP_CHECK_FIELDS = ["confirm_spotify_correct", "confirm_apple_correct", "confirm_zing_correct", "confirm_nct_correct", "confirm_fb_correct", "confirm_ytb_correct"];

// "NEW RELEASE" sheet — header row 3 (1-indexed), data from row 4.
const NEW_RELEASE_HEADER_ROW = 3;
const NEW_RELEASE_FIRST_DATA_ROW = 4;
const NEW_RELEASE_COLUMNS = {
  13: ["STATUS", "canva_status", "text"],
  14: ["NOTE", "canva_mv_status", "text"],
  15: ["Artist Pick", "artist_pick_status", "text"],
  17: ["STATUS", "musixmatch_status", "text"],
  18: ["NOTE", "musixmatch_link", "text"],
  19: ["", "nct_lyric", "text_blank_header"], // "Lyric NCT" is the row-0 group header; row-2 sub-header is blank
  20: ["DID", "__did__", "did"],
};

// "NR CONFIRM" sheet — header row 4 (1-indexed), data from row 5.
const NR_CONFIRM_HEADER_ROW = 4;
const NR_CONFIRM_FIRST_DATA_ROW = 5;
const NR_CONFIRM_COLUMNS = {
  3: ["LBM URL", "link_lbm", "text"],
  4: ["CHECK DSP", "__dsp_check__", "bool"],
  6: ["TAG CONFIRM", "confirm_tag", "bool"],
  7: ["UPDATE SMARTLINK", "confirm_smartlink_updated", "bool"],
  9: ["Check Instagram sound", "confirm_insta_sound", "bool"],
  10: ["Check đủ Lyrics", "confirm_lyrics_canva_check", "bool"],
  11: ["TikTok", "confirm_tiktok_sound_updated", "bool"],
  14: ["DID", "__did__", "did"],
  19: ["GÓI TRUYỀN THÔNG", "project_type", "text"],
};

function toBool(v) {
  if (typeof v === "boolean") return v;
  const s = String(v || "").trim().toLowerCase();
  return s === "true" || s === "yes" || s === "1" || s === "đã có" || s === "x";
}

// OPS_TRACKING's "GÓI TRUYỀN THÔNG" values carry legacy prefixes v2
// doesn't use ("New Release - ", sometimes "SONY - New Release - ") —
// v2's project_type is just the bare contract type ("Chỉ Phát Hành",
// "Độc Quyền 5 năm", ...), matching contract_type_packages in
// schema.sql. Importing the raw value verbatim double-prefixes it when
// the dashboard displays release_category + " - " + project_type (since
// release_category is ALSO "New Release" by default). Strip it here so
// it doesn't need a separate repair pass on every future import. A bare
// leftover "NEW RELEASE" (the sheet's placeholder for "not really
// resolved yet") maps to v2's actual default pipeline stage.
function normalizeProjectType(raw) {
  if (raw == null) return raw;
  let s = String(raw).trim();
  s = s.replace(/^(SONY\s*-\s*)?New Release\s*-\s*/i, "");
  s = s.trim();
  if (!s || s.toUpperCase() === "NEW RELEASE") return "BRIEF & DATA";
  return s;
}

function checkHeaders(headerRow, columns) {
  const problems = [];
  for (const [idx, [expect, , kind]] of Object.entries(columns)) {
    if (kind === "text_blank_header") continue; // known blank sub-header, skip check
    const actual = String(headerRow[idx] || "");
    const needle = expect.toLowerCase().split(" ")[0].toLowerCase();
    if (needle && !actual.toLowerCase().includes(needle)) {
      problems.push(`col ${idx}: expected something containing "${expect}", found "${actual}"`);
    }
  }
  return problems;
}

function extractRows(sheet, headerRowNum, firstDataRowNum, columns, label) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const headerRow = rows[headerRowNum - 1];
  if (!headerRow) throw new Error(`${label}: expected a header row at row ${headerRowNum}, sheet only has ${rows.length} rows.`);
  const problems = checkHeaders(headerRow, columns);
  if (problems.length > 0) {
    throw new Error(`${label}: header check failed:\n` + problems.map((p) => `  - ${p}`).join("\n"));
  }
  return rows.slice(firstDataRowNum - 1).filter((r) => r && r.some((c) => c !== null && c !== ""));
}

function buildPatch(row, columns) {
  const patch = {};
  let did = null;
  let dspCheck = false;
  for (const [idxStr, [, field, kind]] of Object.entries(columns)) {
    const idx = Number(idxStr);
    const raw = row[idx];
    if (kind === "did") did = raw ? String(raw).trim() : null;
    else if (kind === "text" || kind === "text_blank_header") {
      if (raw != null && String(raw).trim() !== "") patch[field] = String(raw).trim();
    } else if (kind === "bool") {
      if (field === "__dsp_check__") dspCheck = toBool(raw);
      else patch[field] = toBool(raw);
    }
  }
  if (dspCheck) DSP_CHECK_FIELDS.forEach((f) => (patch[f] = true));
  if (patch.project_type != null) patch.project_type = normalizeProjectType(patch.project_type);
  return { did, patch };
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const filePath = process.argv[2];
  if (!filePath || filePath === "--confirm") {
    console.error("Usage: node scripts/import-ops-tracking.js <path-to-xlsx> [--confirm]");
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const wb = XLSX.readFile(filePath, { cellDates: true });

  let allRows = [];
  const nrSheet = wb.Sheets["NEW RELEASE"];
  if (nrSheet) {
    const rows = extractRows(nrSheet, NEW_RELEASE_HEADER_ROW, NEW_RELEASE_FIRST_DATA_ROW, NEW_RELEASE_COLUMNS, "NEW RELEASE");
    allRows.push(...rows.map((r) => ({ ...buildPatch(r, NEW_RELEASE_COLUMNS), source: "NEW RELEASE" })));
  } else {
    console.log('No "NEW RELEASE" sheet found — skipping that half.');
  }
  const confirmSheet = wb.Sheets["NR CONFIRM"];
  if (confirmSheet) {
    const rows = extractRows(confirmSheet, NR_CONFIRM_HEADER_ROW, NR_CONFIRM_FIRST_DATA_ROW, NR_CONFIRM_COLUMNS, "NR CONFIRM");
    allRows.push(...rows.map((r) => ({ ...buildPatch(r, NR_CONFIRM_COLUMNS), source: "NR CONFIRM" })));
  } else {
    console.log('No "NR CONFIRM" sheet found — skipping that half.');
  }

  console.log(`${confirm ? "IMPORTING" : "DRY RUN —"} ${allRows.length} rows found across both sheets.\n`);

  let updated = 0, notFound = 0, empty = 0, failed = 0;

  for (const { did, patch, source } of allRows) {
    if (!did) { empty++; continue; }
    if (Object.keys(patch).length === 0) { empty++; continue; }

    const { data: existing, error: lookupErr } = await supabase.from("releases").select("id, did").eq("legacy_id", did).maybeSingle();
    if (lookupErr) {
      console.error(`[${source}] ${did}: lookup FAILED — ${lookupErr.message}`);
      failed++;
      continue;
    }
    if (!existing) {
      console.log(`[${source}] ${did}: no matching release (not imported from BRIEF, or different DID) — skipping.`);
      notFound++;
      continue;
    }

    console.log(`[${source}] ${did} -> ${existing.did}: ${JSON.stringify(patch)}`);
    if (!confirm) continue;

    const { error: updateErr } = await supabase.from("releases").update(patch).eq("id", existing.id);
    if (updateErr) {
      console.error(`  -> FAILED: ${updateErr.message}`);
      failed++;
      continue;
    }
    updated++;
  }

  console.log(`\n${confirm ? "Done." : "Dry run complete — nothing written."} Updated: ${updated}, No match: ${notFound}, Empty rows skipped: ${empty}, Failed: ${failed}.`);
  if (!confirm) console.log("Re-run with --confirm to actually write these updates.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
