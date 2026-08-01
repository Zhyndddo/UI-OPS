#!/usr/bin/env node
// One-time import — item 3 (Manual Booking / BRIEF sheet import) from the
// July round's data-fix request, section (a): pulls the BRIEF sheet out
// of VIEENT PROJECT MANAGEMENT 2026.xlsx and creates one `releases` row
// per data row, using the column = field mapping the team gave.
//
// Reads the .xlsx file directly (needs the `xlsx` package — see the
// workflow/README for the one-line install). Column matching is by FIXED
// INDEX, not by header text — the sheet's real headers are things like
// "✍️ Feature Artist" / "🔒DID" (emoji + inconsistent spacing), which is
// too fragile to string-match reliably. Because of that, this script
// checks a handful of expected header substrings at their expected
// column index before doing anything, and aborts loudly if the sheet's
// column order has changed since this was written — re-index the
// COLUMNS map below if that happens rather than trying to "fix" the sheet.
//
// DID: the sheet's DID column only has the first 10 characters of a v2
// DID (no numeric suffix). Per the confirmed rule: the last 4 digits are
// the row's position in the sheet, counting top-down from 1 — so row 1's
// DID becomes `${first10}-0001`, row 2's `${first10}-0002`, and so on,
// counting every data row in the sheet (not just ones that import
// cleanly), so re-running after fixing a bad row keeps the same numbers.
// The original 10-char value is kept in `legacy_id` (unique) so a re-run
// skips rows already imported instead of creating duplicates.
//
// "Đã có" columns (Audio/Artwork/.../SONY PUBLISH/Is_publish/Split Share)
// become plain boolean ticks. Priority Pitching is handled specially: a
// "Đã có" tick also creates a Pitching ticket with priority=true, mirroring
// what actually happens live when someone ticks Priority Pitching on a
// new release (not just a flag on the release row with no ticket behind it).
//
// NOT handled by this script (flagged, not silently dropped):
//   - Tracklist (EP/Album) — the sheet has no per-track breakdown, so
//     single_album_ep imports correctly but the Tracklist stays empty;
//     add tracks by hand afterwards via the release detail page.
//   - Booking Đợt 1 / Đợt 2 "package detail" — no package simulator
//     exists, so the sheet's free text lands verbatim in
//     legacy_booking_dot1_raw / legacy_booking_dot2_raw, not as real
//     media_booking_entries rows.
//   - Mã Phụ Lục, phụ lục/pitching/booking status+WIP columns — explicitly
//     skipped per the brief ("we may need to review the Phụ Lục system" /
//     "shown another way in the UI").
//
// Defaults to a DRY RUN — pass --confirm to actually write anything.
// Strongly recommended: run scripts/backup.js first.
//
//   npm install xlsx --no-save
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-brief.js data/brief-import.xlsx
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-brief.js data/brief-import.xlsx --confirm

const { createClient } = require("@supabase/supabase-js");
const XLSX = require("xlsx");

const HEADER_ROW = 4; // 1-indexed row in the sheet holding column names
const FIRST_DATA_ROW = 5;

// index (0-based) -> [expected header substring, releases field, kind]
// kind: "text" | "date" | "time" | "tick" (Đã có -> boolean) | "did" | "skip"
const COLUMNS = {
  2: ["SOCIAL BOOKING", "requester_segment", "text"],
  3: ["GÓI HTTT", "project_type", "text"],
  4: ["LABEL", "label", "text"],
  5: ["DỰ ÁN", "title", "text"],
  6: ["Main Artist", "main_artist", "text"],
  7: ["Feature Artist", "feature_artist", "text"],
  8: ["Release Date", "release_date", "date"],
  9: ["Release Time", "release_time", "time"],
  10: ["THỂ LOẠI", "genre", "text"],
  11: ["Playlist", "theme", "text"],
  13: ["Link UGC", "link_ugc", "text"],
  14: ["Link Drive", "drive_link", "text"],
  15: ["Audio", "meta_audio", "tick"],
  16: ["Artwork", "meta_artwork", "tick"],
  17: ["Working Files", "meta_working_files", "tick"],
  18: ["Lyric", "meta_lyric", "tick"],
  19: ["MV", "meta_mv", "tick"],
  20: ["Metadata", "meta_doc", "tick"],
  21: ["DID", "__did_base__", "did"],
  22: ["Ngày Bắt Đầu", "start_date", "date"],
  23: ["Ngày Kết Thúc", "end_date", "date"],
  24: ["Booking Đợt 1", "legacy_booking_dot1_raw", "text"],
  25: ["Creations on Tiktok", "creation_on_tiktok", "text"],
  26: ["Booking Đợt 2", "legacy_booking_dot2_raw", "text"],
  29: ["CHECKLIST", "link_media_report", "text"],
  33: ["LINK LBM", "link_lbm", "text"],
  34: ["LINKSHARE", "link_share", "text"],
  35: ["UPC", "upc", "text"],
  36: ["SMARTLINK", "smartlink", "text"],
  37: ["PHỤ LỤC", "link_phu_luc", "text"],
  39: ["LINK DRIVE PROMOTION", "promotion_package_url", "text"],
  40: ["REQUESTED PL", "phu_luc_requested", "tick"],
  41: ["SIngle/Album/EP", "single_album_ep", "single_album_ep"],
  58: ["SONY PUBLISH", "sony_publish", "tick"],
  59: ["Is_publish", "is_publish", "tick"],
  60: ["Split Share", "has_splitshare", "tick"],
  61: ["Priority Pitching", "__priority_pitching__", "tick"],
};

function isDaCo(v) {
  return String(v || "").trim() === "Đã có";
}

// Same fix as import-ops-tracking.js's normalizeProjectType — BRIEF's
// "GÓI HTTT" carries the same legacy "New Release - " prefix v2 doesn't
// use for project_type (see contract_type_packages in schema.sql), which
// double-prefixes once release_category ALSO defaults to "New Release"
// at display time.
function normalizeProjectType(raw) {
  if (raw == null) return raw;
  let s = String(raw).trim();
  s = s.replace(/^(SONY\s*-\s*)?New Release\s*-\s*/i, "");
  s = s.trim();
  if (!s || s.toUpperCase() === "NEW RELEASE") return "BRIEF & DATA";
  return s;
}

function toDateStr(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toTimeStr(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(11, 16);
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

function checkHeaders(headerRow) {
  const problems = [];
  for (const [idx, [expect]] of Object.entries(COLUMNS)) {
    const actual = String(headerRow[idx] || "");
    if (!actual.toLowerCase().includes(expect.toLowerCase().split(" ")[0].toLowerCase())) {
      problems.push(`col ${idx}: expected something containing "${expect}", found "${actual}"`);
    }
  }
  return problems;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const filePath = process.argv[2];
  if (!filePath || filePath === "--confirm") {
    console.error("Usage: node scripts/import-brief.js <path-to-xlsx> [--confirm]");
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
    console.error(`No "BRIEF" sheet found in ${filePath}. Sheets present: ${wb.SheetNames.join(", ")}`);
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const headerRow = rows[HEADER_ROW - 1];
  if (!headerRow) {
    console.error(`Expected a header row at row ${HEADER_ROW} — sheet only has ${rows.length} rows.`);
    process.exit(1);
  }
  const headerProblems = checkHeaders(headerRow);
  if (headerProblems.length > 0) {
    console.error("Header check failed — the BRIEF sheet's columns don't match what this script expects:");
    headerProblems.forEach((p) => console.error(`  - ${p}`));
    console.error("\nEither the sheet changed since this script was written, or the wrong file was passed. Re-index COLUMNS in scripts/import-brief.js if the sheet genuinely changed, then re-run.");
    process.exit(1);
  }

  const dataRows = rows.slice(FIRST_DATA_ROW - 1).filter((r) => r && r.some((c) => c !== null && c !== ""));
  console.log(`${confirm ? "IMPORTING" : "DRY RUN —"} ${dataRows.length} data rows found in BRIEF.\n`);

  let created = 0, skipped = 0, failed = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNum = i + 1; // 1-indexed, top-down — this is what feeds the DID suffix
    const payload = {};
    let didBase = null;
    let priorityPitching = false;

    for (const [idxStr, [, field, kind]] of Object.entries(COLUMNS)) {
      const idx = Number(idxStr);
      const raw = row[idx];
      if (kind === "text") payload[field] = raw != null && String(raw).trim() !== "" ? String(raw).trim() : null;
      else if (kind === "date") payload[field] = toDateStr(raw);
      else if (kind === "time") payload[field] = toTimeStr(raw);
      else if (kind === "tick") payload[field] = isDaCo(raw);
      else if (kind === "single_album_ep") payload[field] = ["Single", "EP", "Album"].includes(raw) ? raw : "Single";
      else if (kind === "did") didBase = raw ? String(raw).trim() : null;
      else if (field === "__priority_pitching__") priorityPitching = isDaCo(raw);
    }

    if (!payload.title || !payload.main_artist || !payload.release_date || !payload.label) {
      console.log(`Row ${rowNum}: SKIP — missing one of title/main_artist/release_date/label (title="${payload.title}")`);
      skipped++;
      continue;
    }
    if (!didBase) {
      console.log(`Row ${rowNum} (${payload.title}): SKIP — no DID base value in the sheet.`);
      skipped++;
      continue;
    }
    if (payload.project_type != null) payload.project_type = normalizeProjectType(payload.project_type);

    const legacyId = didBase;
    const did = `${didBase}-${String(rowNum).padStart(4, "0")}`;
    payload.did = did;
    payload.legacy_id = legacyId;
    if (priorityPitching) payload.priority_pitching_used = true;

    const tickSummary = ["meta_audio", "meta_artwork", "meta_working_files", "meta_lyric", "meta_mv", "meta_doc", "sony_publish", "is_publish", "has_splitshare", "phu_luc_requested"]
      .map((f) => `${f}=${payload[f]}`)
      .join(" ");
    console.log(`Row ${rowNum}: ${did} — "${payload.title}" (${payload.main_artist}) — Label ${payload.label} — Release ${payload.release_date}`);
    console.log(`  checklist: ${tickSummary}`);

    if (!confirm) continue;

    const { data: existing } = await supabase.from("releases").select("id").eq("legacy_id", legacyId).maybeSingle();
    if (existing) {
      console.log(`  -> already imported (legacy_id ${legacyId} exists), skipping.`);
      skipped++;
      continue;
    }

    const { data: release, error: insertErr } = await supabase.from("releases").insert(payload).select("id, did").single();
    if (insertErr) {
      console.error(`  -> FAILED: ${insertErr.message}`);
      failed++;
      continue;
    }
    created++;

    if (priorityPitching) {
      const { data: tab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "pitching").single();
      if (tab) {
        await supabase.from("tickets").insert({
          tab_id: tab.id,
          data: { releaseId: release.did, priority: true, spotify: false, nct: false, zing: false },
          status: tab.default_status,
          status_log: { [tab.default_status]: new Date().toISOString() },
          requester_segment: payload.requester_segment || null,
        });
      }
    }
  }

  console.log(`\n${confirm ? "Done." : "Dry run complete — nothing written."} Created: ${created}, Skipped: ${skipped}, Failed: ${failed}.`);
  if (!confirm) console.log("Re-run with --confirm to actually write these rows.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
