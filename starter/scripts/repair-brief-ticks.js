#!/usr/bin/env node
// Repair pass — for releases already created by import-brief.js, re-reads
// the same BRIEF sheet and re-applies ONLY the checklist/tick fields
// (Metadata Checklist + Other Checklist + Single/Album/EP), leaving
// everything else on the release untouched. Written because a first
// import run put every checklist tick as false regardless of what the
// sheet said "Đã có" for — this fixes already-imported rows without
// re-running the full import (which would try to create duplicate
// releases and get skipped by the legacy_id check anyway).
//
// Matches existing releases by legacy_id, same as import-ops-tracking.js.
// A DID with no matching release is skipped (not an error) — same reason
// as import-ops-tracking.js: it just means that row wasn't part of what
// got imported.
//
// Defaults to a DRY RUN — pass --confirm to actually write anything.
// Strongly recommended: run scripts/backup.js first.
//
//   npm install xlsx --no-save
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/repair-brief-ticks.js data/brief-import.xlsx
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/repair-brief-ticks.js data/brief-import.xlsx --confirm

const { createClient } = require("@supabase/supabase-js");
const XLSX = require("xlsx");

const HEADER_ROW = 4;
const FIRST_DATA_ROW = 5;

// Only the tick/checklist columns + Single/Album/EP + the DID column
// needed to match. Deliberately a subset of import-brief.js's COLUMNS —
// nothing here touches title/artist/links/dates/etc.
const COLUMNS = {
  15: ["Audio", "meta_audio", "tick"],
  16: ["Artwork", "meta_artwork", "tick"],
  17: ["Working Files", "meta_working_files", "tick"],
  18: ["Lyric", "meta_lyric", "tick"],
  19: ["MV", "meta_mv", "tick"],
  20: ["Metadata", "meta_doc", "tick"],
  21: ["DID", "__did__", "did"],
  40: ["REQUESTED PL", "phu_luc_requested", "tick"],
  41: ["SIngle/Album/EP", "single_album_ep", "single_album_ep"],
  58: ["SONY PUBLISH", "sony_publish", "tick"],
  59: ["Is_publish", "is_publish", "tick"],
  60: ["Split Share", "has_splitshare", "tick"],
};

function isDaCo(v) {
  return String(v || "").trim() === "Đã có";
}

// The 6 Metadata Checklist fields moved from boolean to tri-state text
// ("false"/"true"/"update") columns — this repair pass only ever has a
// definite Yes/No from the sheet, so it writes "true"/"false" strings for
// those, while the remaining tick fields here (SONY PUBLISH, Is_publish,
// Split Share, REQUESTED PL) keep writing real JS booleans.
const META_TICK_FIELDS = new Set(["meta_audio", "meta_artwork", "meta_working_files", "meta_lyric", "meta_mv", "meta_doc"]);

function checkHeaders(headerRow) {
  const problems = [];
  for (const [idx, [expect, , kind]] of Object.entries(COLUMNS)) {
    if (kind === "did" && !expect) continue;
    const actual = String(headerRow[idx] || "");
    const needle = expect.toLowerCase().split(" ")[0].toLowerCase();
    if (needle && !actual.toLowerCase().includes(needle)) {
      problems.push(`col ${idx}: expected something containing "${expect}", found "${actual}"`);
    }
  }
  return problems;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const filePath = process.argv[2];
  if (!filePath || filePath === "--confirm") {
    console.error("Usage: node scripts/repair-brief-ticks.js <path-to-xlsx> [--confirm]");
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
  const sheet = wb.Sheets["BRIEF"];
  if (!sheet) {
    console.error(`No "BRIEF" sheet found in ${filePath}.`);
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const headerRow = rows[HEADER_ROW - 1];
  const headerProblems = checkHeaders(headerRow);
  if (headerProblems.length > 0) {
    console.error("Header check failed:");
    headerProblems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }

  const dataRows = rows.slice(FIRST_DATA_ROW - 1).filter((r) => r && r.some((c) => c !== null && c !== ""));
  console.log(`${confirm ? "REPAIRING" : "DRY RUN —"} checking ${dataRows.length} sheet rows against already-imported releases.\n`);

  // Diagnostic, read-only, runs regardless of --confirm: how many releases
  // actually have legacy_id set at all? If this is 0 (or far below the
  // release count), every lookup below is guaranteed to miss — that's the
  // thing to know before puzzling over individual DIDs.
  const { count: totalCount } = await supabase.from("releases").select("id", { count: "exact", head: true });
  const { count: withLegacyCount } = await supabase.from("releases").select("id", { count: "exact", head: true }).not("legacy_id", "is", null);
  console.log(`Diagnostic: ${withLegacyCount ?? "?"} of ${totalCount ?? "?"} releases in the database have legacy_id set at all.\n`);

  let updated = 0, notFound = 0, failed = 0, skippedNoDid = 0;
  const sampleMisses = [];

  for (const row of dataRows) {
    let did = null;
    const patch = {};
    for (const [idxStr, [, field, kind]] of Object.entries(COLUMNS)) {
      const idx = Number(idxStr);
      const raw = row[idx];
      if (kind === "did") did = raw ? String(raw).trim() : null;
      else if (kind === "tick") patch[field] = META_TICK_FIELDS.has(field) ? (isDaCo(raw) ? "true" : "false") : isDaCo(raw);
      else if (kind === "single_album_ep") patch[field] = ["Single", "EP", "Album"].includes(raw) ? raw : "Single";
    }
    if (!did) { skippedNoDid++; continue; }

    const { data: existing, error: lookupErr } = await supabase.from("releases").select("id, did, title").eq("legacy_id", did).maybeSingle();
    if (lookupErr) {
      console.error(`${did}: lookup FAILED — ${lookupErr.message}`);
      failed++;
      continue;
    }
    if (!existing) {
      notFound++;
      if (sampleMisses.length < 15) sampleMisses.push(did);
      continue;
    }

    console.log(`${did} -> ${existing.did} ("${existing.title}"): ${JSON.stringify(patch)}`);
    if (!confirm) continue;

    const { error: updateErr } = await supabase.from("releases").update(patch).eq("id", existing.id);
    if (updateErr) {
      console.error(`  -> FAILED: ${updateErr.message}`);
      failed++;
      continue;
    }
    updated++;
  }

  console.log(`\n${confirm ? "Done." : "Dry run complete — nothing written."} Updated: ${updated}, No matching release: ${notFound}, No DID in row: ${skippedNoDid}, Failed: ${failed}.`);
  if (sampleMisses.length > 0) {
    console.log(`\nSample of DIDs from the sheet that found no matching release (first ${sampleMisses.length}):`);
    sampleMisses.forEach((d) => console.log(`  "${d}" (length ${d.length})`));
  }
  if (!confirm) console.log("Re-run with --confirm to actually write these updates.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
