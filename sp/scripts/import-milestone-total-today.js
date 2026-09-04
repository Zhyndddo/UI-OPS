#!/usr/bin/env node
// Daily backfill — imports the "total today" sheet from the team's "Sam
// milestone" xlsx into milestone_chart_entries. Round 189 follow-up.
//
// Superseded import-milestone-input.js as the recommended way to backfill
// a day's chart data: the "input" sheet's per-block date labels turned
// out to be unreliable (left stale from a prior day when the team copies
// the sheet forward — the underlying song/rank data was correct, only
// the date header wasn't updated), which silently wrote 105 rows under
// the WRONG entry_date in the very first run of this feature. "total
// today" carries the SAME underlying data but as a flat table with a
// real per-row date column (confirmed correct — 2026-08-26 on every
// row, cross-checked against "input"'s identical song/rank data), so
// there's no separate "which date is this" step to get wrong.
//
// SOURCE SHEET LAYOUT ("total today", header row 1) — same shape as
// TOTAL_STREAK, just one day's worth instead of the full history:
//   A "SEGMENT"    — raw chart name (same messy vocabulary as
//                     TOTAL_STREAK — see CHART_MAP, shared via
//                     lib/milestoneChartMap.js)
//   B "date"       — a real Excel date in every row
//   C "tên"        — track title
//   D "ca sĩ"      — artist
//   E "Thứ hạng"   — rank, formatted "#7"
//   F "DSP"        — raw platform label
// Columns G onward (LENGTH, etc.) are the team's own working columns,
// not imported.
//
// entry_date comes from the sheet's own date column (this sheet is a
// day-of snapshot, not "today" as computed by whoever runs the script —
// same principle as TOTAL_STREAK, just a much narrower date range in
// practice). did is always null, same as every other milestone import —
// fuzzy-matched to releases.did at the app layer, not a hard FK.
//
// Same natural-key upsert every other write path in this app uses
// (chart, track_title, artist, entry_date), so re-running this script is
// always safe.
//
// Usage:
//   npm install xlsx --no-save
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-milestone-total-today.js "Sam milestone.xlsx"
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-milestone-total-today.js "Sam milestone.xlsx" --confirm

const { createClient } = require("@supabase/supabase-js");
const XLSX = require("xlsx");
const { CHART_MAP } = require("../lib/milestoneChartMap");

const SHEET_NAME = "total today";
const FIRST_DATA_ROW = 2;
const COL = { CHART: 0, DATE: 1, TITLE: 2, ARTIST: 3, RANK: 4, PLATFORM: 5 };

function norm(v) {
  if (v == null) return null;
  return String(v).replace(/\s+/g, " ").trim();
}

function parseRank(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  const m = s.match(/(\d+(\.\d+)?)/);
  if (!m) return null;
  return Math.round(parseFloat(m[1]));
}

function excelDateToISO(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return null;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const filePath = process.argv[2];
  if (!filePath || filePath === "--confirm") {
    console.error('Usage: node scripts/import-milestone-total-today.js "<path-to-xlsx>" [--confirm]');
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
  const sheet = wb.Sheets[SHEET_NAME];
  if (!sheet) {
    console.error(`No "${SHEET_NAME}" sheet found in this file. Sheets present: ${wb.SheetNames.join(", ")}`);
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const dataRows = rows.slice(FIRST_DATA_ROW - 1);

  const payload = [];
  const unmappedCounts = new Map(); // "chart␟platform" -> count
  let skippedNoTitle = 0, skippedNoDate = 0, skippedNoRank = 0;

  for (const row of dataRows) {
    const rawChart = norm(row[COL.CHART]);
    const rawPlatform = norm(row[COL.PLATFORM]);
    const title = norm(row[COL.TITLE]);
    if (!rawChart && !title) continue; // fully blank row
    if (!title) { skippedNoTitle++; continue; } // template row, no real entry
    const entryDate = excelDateToISO(row[COL.DATE]);
    if (!entryDate) { skippedNoDate++; continue; }
    const rank = parseRank(row[COL.RANK]);
    if (rank == null) { skippedNoRank++; continue; }
    const artist = norm(row[COL.ARTIST]) || "";

    const mapKey = `${rawChart}␟${rawPlatform}`;
    const mapped = CHART_MAP[mapKey];
    if (!mapped) {
      unmappedCounts.set(mapKey, (unmappedCounts.get(mapKey) || 0) + 1);
      continue;
    }

    payload.push({
      chart: mapped.chart,
      platform: mapped.platform,
      entry_date: entryDate,
      track_title: title,
      artist,
      rank,
      did: null,
    });
  }

  const byKey = new Map();
  let dedupedAway = 0;
  for (const p of payload) {
    const k = `${p.chart}␟${p.track_title}␟${p.artist}␟${p.entry_date}`;
    if (byKey.has(k)) dedupedAway++;
    byKey.set(k, p);
  }
  const dedupedPayload = [...byKey.values()];

  console.log(`${confirm ? "IMPORTING" : "DRY RUN —"} ${dedupedPayload.length} row(s) ready to upsert (${payload.length} matched CHART_MAP; ${dedupedAway} were duplicate same-chart/song/artist/date rows, deduped to the last occurrence).`);
  console.log(`Skipped: ${skippedNoTitle} blank/template row(s), ${skippedNoDate} row(s) with no date, ${skippedNoRank} row(s) with no parseable rank.`);
  console.log("");

  if (unmappedCounts.size > 0) {
    const totalUnmapped = [...unmappedCounts.values()].reduce((a, b) => a + b, 0);
    console.log(`⚠ ${unmappedCounts.size} (chart, platform) pair(s) — ${totalUnmapped} row(s) total — have no entry in CHART_MAP and were SKIPPED (not guessed at):`);
    [...unmappedCounts.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, c]) => {
      const [chart, platform] = k.split("␟");
      console.log(`   ${c}x  "${chart}" / "${platform}"`);
    });
    console.log("Add these to lib/milestoneChartMap.js's CHART_MAP (and, if it's a genuinely new chart, to PLATFORM_CHARTS in app/workstation/milestone/page.js) and re-run if they should be imported.");
    console.log("");
  }

  if (!confirm) {
    console.log("Dry run complete — re-run with --confirm to actually write.");
    return;
  }

  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < dedupedPayload.length; i += CHUNK) {
    const chunk = dedupedPayload.slice(i, i + CHUNK);
    const { error } = await supabase.from("milestone_chart_entries").upsert(chunk, { onConflict: "chart,track_title,artist,entry_date" });
    if (error) throw new Error(`Upsert failed at row ${i}: ${error.message}`);
    written += chunk.length;
    process.stdout.write(`\r  ${written}/${dedupedPayload.length} written…`);
  }
  console.log(`\n\nDone — ${written} row(s) upserted into milestone_chart_entries.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
