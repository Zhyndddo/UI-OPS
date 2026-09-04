#!/usr/bin/env node
// Round 239 — wipe-and-reinstate import for the Milestone log CSV the team
// exported once they finished tracking by hand (before switching fully to
// the app's own Input tab on 27/8/2026). Per explicit request: only
// 26/8/2026 and before comes from this file — the app has been the source
// of truth for everything from 27/8 onward, so this script never touches
// those rows.
//
// SOURCE FILE LAYOUT (CSV, header row 1) — same 6 data columns as
// TOTAL_STREAK's own xlsx import (see import-milestone-total-streak.js),
// just as a CSV export instead of a sheet, with 2 extra trailing columns
// this script ignores (LENGTH — a streak count the app computes itself
// from entry_date history, not stored input; and a concatenated
// date+chart+title+artist helper column, an artifact of the source
// spreadsheet's own de-dupe formulas):
//   SEGMENT   — the chart's raw name, as the team's sheet happened to
//               label it (inconsistent — see CHART_MAP below)
//   date      — DD/MM/YYYY
//   tên       — track title
//   ca sĩ     — artist
//   Thứ hạng  — rank, formatted "#7" (parseRank handles the "#")
//   DSP       — raw platform label (also inconsistent, and a handful of
//               rows have it blank — see BLANK_DSP_FALLBACK below)
//
// CHART_MAP is the SAME shared table every other milestone import script
// uses (lib/milestoneChartMap.js) — round 239 added a few entries for
// this file specifically (see that file's own round-239 comments), all
// blank-DSP fallbacks for chart names that already have an unambiguous
// mapping under their normal DSP value elsewhere in this same file.
//
// Swept ahead of time (round 237/238's chat, not repeated here): 22,069
// real data rows, 21,944 of them (99.4%) map cleanly. The remaining 125
// rows across ~28 (chart, platform) pairs are genuine one-offs this app
// doesn't track at all (NCT, Facebook, iTunes-as-a-platform, Cambodia/Laos
// regional Apple charts, single-row typos) plus 2 pairs with real but
// small volume that were flagged for a human decision rather than guessed
// at — see this script's own dry-run output, which lists every one, exact
// same "report and skip, never guess" convention as
// import-milestone-total-streak.js.
//
// WIPE, not merge: unlike every other milestone import script (which
// upserts on top of whatever's already there), this one DELETES every
// existing row with entry_date <= CUTOFF_DATE before writing the CSV's
// rows back in — per explicit request ("we wipe and reinstate the data"),
// since the point is a clean, authoritative replacement of the
// pre-app-adoption history, not a merge that could leave stale/duplicate
// rows from an earlier import sitting alongside the new one. Rows with
// entry_date > CUTOFF_DATE (anything logged through the app since 27/8)
// are never touched — the DELETE is scoped to CUTOFF_DATE and below, and
// any CSV row that somehow carries a later date is skipped outright
// (defensive — this file's own dates all top out at 26/8 today, but a
// future re-run against an updated export shouldn't accidentally reach
// past the cutoff just because the file changed).
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-milestone-round239-csv.js "<path-to-csv>"
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-milestone-round239-csv.js "<path-to-csv>" --confirm
//
// Dry run (no --confirm) does everything except the DELETE/insert — read
// it first, every time, before ever passing --confirm.

const { createClient } = require("@supabase/supabase-js");
const { CHART_MAP } = require("../lib/milestoneChartMap");

const CUTOFF_DATE = "2026-08-26"; // inclusive — everything on/before this date comes from the CSV; nothing after it is ever touched.

function norm(v) {
  if (v == null) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function parseRank(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  const m = s.match(/(\d+(\.\d+)?)/);
  if (!m) return null;
  return Math.round(parseFloat(m[1]));
}

// DD/MM/YYYY -> YYYY-MM-DD. Returns null for anything that doesn't parse
// cleanly (the row is skipped, same as a missing date in the xlsx import).
function parseDMY(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s || "").trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = d.padStart(2, "0"), month = mo.padStart(2, "0");
  return `${y}-${month}-${day}`;
}

// Minimal RFC4180 CSV parser — handles quoted fields (with embedded
// commas AND embedded newlines, both of which this specific export has),
// doubled-quote escaping (""), and both \n and \r\n line endings. Reads
// the whole file into memory and tokenizes character by character rather
// than splitting on newlines first, specifically because a naive
// line-split would break on a quoted field that itself contains a
// newline (confirmed present in this file — see round 237/238 chat).
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Round 239 follow-up — recovers a real, fully-deterministic 3-line
// export corruption found in exactly 73 records (5 artists: Tùng, Đình
// Nguyễn, Sinl, Lục Huy & Châu Bùi, and "TRANG feat. Ban nhạc Không Màu &
// CAM Philharmonic & Nhóm bè Sang Chấn"). Not an ampersand/special-
// character problem — 3 of those 5 names have no special characters at
// all. The source spreadsheet's own export split each of these rows
// across 3 physical CSV lines instead of 1:
//   HEAD: chart, date, title, "", "", "", "", ""        (rank/artist/etc
//         genuinely blank on this line)
//   MID:  "", artist, rank, platform, length, "date+chart+title" (no
//         artist — cut off), "", ""
//   TAIL: artist, "", "", "", "", "", "", ""             (pure leftover,
//         no new information)
// Verified against every one of the 73 occurrences before writing this —
// the pattern is identical every time, so this reconstructs the real row
// (chart/date/title from HEAD, artist/rank/platform from MID) rather than
// guessing, and discards the TAIL line (nothing in it isn't already in
// MID's artist field). Runs once, before the normal per-row loop below,
// so a fixed-up row goes through every existing validation the same as
// any normal row.
function repairSplitRows(dataRows) {
  const repaired = [];
  const consumed = new Set();
  let recoveredCount = 0;
  for (let i = 0; i < dataRows.length; i++) {
    if (consumed.has(i)) continue;
    const row = dataRows[i];
    const chart = norm(row[0]), date = norm(row[1]), title = norm(row[2]);
    const restBlank = !norm(row[3]) && !norm(row[4]) && !norm(row[5]) && !norm(row[6]);
    const mid = dataRows[i + 1];
    if (chart && date && title && restBlank && mid && !norm(mid[0]) && norm(mid[1]) && norm(mid[2]) && norm(mid[3])) {
      const artist = norm(mid[1]), rank = mid[2], platform = norm(mid[3]), length = norm(mid[4]);
      repaired.push([chart, date, title, artist, rank, platform, length, ""]);
      consumed.add(i); consumed.add(i + 1);
      recoveredCount++;
      const tail = dataRows[i + 2];
      if (tail && norm(tail[0]) === artist && !norm(tail[1]) && !norm(tail[2]) && !norm(tail[3])) {
        consumed.add(i + 2);
      }
      continue;
    }
    repaired.push(row);
  }
  if (recoveredCount > 0) console.log(`Repaired ${recoveredCount} row(s) split across multiple CSV lines by the source export (see repairSplitRows' comment).`);
  return repaired;
}

// Round 240 — extracted from main() so scripts/generate-milestone-round239-sql.js
// (a plain-.sql-file alternative to this live-DB script, for whoever
// prefers pasting SQL into the Supabase editor over running Node) can
// share the exact same parse/repair/map/dedupe logic instead of
// duplicating it — one transform, two ways to apply it.
function buildImportPayload(csvText) {
  const rows = parseCSV(csvText);
  const dataRows = repairSplitRows(rows.slice(1)); // drop header, then fix the 3-line-split rows

  const payload = [];
  const unmappedCounts = new Map(); // "seg␟dsp" -> count
  let skippedBlank = 0, skippedNoDate = 0, skippedNoRank = 0, skippedPastCutoff = 0;

  for (const row of dataRows) {
    const seg = norm(row[0]);
    const dateStr = norm(row[1]);
    const title = norm(row[2]);
    const artist = norm(row[3]);
    const rank = parseRank(row[4]);
    const dsp = norm(row[5]);

    if (!seg && !dateStr) { skippedBlank++; continue; } // stray junk row, no real data (see round 237/238 chat — ~5 of these)
    const entryDate = parseDMY(dateStr);
    if (!entryDate) { skippedNoDate++; continue; }
    if (entryDate > CUTOFF_DATE) { skippedPastCutoff++; continue; }
    if (rank == null) { skippedNoRank++; continue; }

    const mapKey = `${seg}␟${dsp}`;
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

  // Same de-dupe-on-natural-key convention as every other milestone
  // import script — keeps the last occurrence of a (chart, title, artist,
  // date) key, since a single upsert() call can't affect the same row
  // twice.
  const byKey = new Map();
  let dedupedAway = 0;
  for (const p of payload) {
    const k = `${p.chart}␟${p.track_title}␟${p.artist}␟${p.entry_date}`;
    if (byKey.has(k)) dedupedAway++;
    byKey.set(k, p);
  }
  const dedupedPayload = [...byKey.values()];

  return { dedupedPayload, matchedCount: payload.length, dedupedAway, unmappedCounts, skippedBlank, skippedNoDate, skippedNoRank, skippedPastCutoff };
}

function printReport(result, confirm) {
  const { dedupedPayload, matchedCount, dedupedAway, unmappedCounts, skippedBlank, skippedNoDate, skippedNoRank, skippedPastCutoff } = result;
  console.log(`${confirm ? "IMPORTING" : "DRY RUN —"} ${dedupedPayload.length} row(s) ready (${matchedCount} matched CHART_MAP; ${dedupedAway} deduped to the last occurrence).`);
  console.log(`Skipped: ${skippedBlank} blank/junk row(s), ${skippedNoDate} unparseable date(s), ${skippedPastCutoff} row(s) past ${CUTOFF_DATE} (shouldn't be any today), ${skippedNoRank} row(s) with no parseable rank.`);
  console.log("");

  if (unmappedCounts.size > 0) {
    const totalUnmapped = [...unmappedCounts.values()].reduce((a, b) => a + b, 0);
    console.log(`⚠ ${unmappedCounts.size} (segment, dsp) pair(s) — ${totalUnmapped} row(s) total — have no entry in CHART_MAP and were SKIPPED (not guessed at):`);
    [...unmappedCounts.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, c]) => {
      const [seg, dsp] = k.split("␟");
      console.log(`   ${c}x  "${seg}" / "${dsp || "(blank)"}"`);
    });
    console.log("");
    console.log("Add any of these to lib/milestoneChartMap.js's CHART_MAP and re-run if they should be included.");
    console.log("");
  }
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const filePath = process.argv[2];
  if (!filePath || filePath === "--confirm") {
    console.error('Usage: node scripts/import-milestone-round239-csv.js "<path-to-csv>" [--confirm]');
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const fs = require("fs");
  const text = fs.readFileSync(filePath, "utf8");
  const result = buildImportPayload(text);
  const { dedupedPayload } = result;

  printReport(result, confirm);

  if (!confirm) {
    console.log(`Dry run complete — re-run with --confirm to WIPE every existing row with entry_date <= ${CUTOFF_DATE} and reinstate from this file. Rows after ${CUTOFF_DATE} are never touched.`);
    return;
  }

  console.log(`Deleting existing rows with entry_date <= ${CUTOFF_DATE}…`);
  const { error: deleteError, count } = await supabase
    .from("milestone_chart_entries")
    .delete({ count: "exact" })
    .lte("entry_date", CUTOFF_DATE);
  if (deleteError) throw new Error(`Delete failed: ${deleteError.message}`);
  console.log(`  deleted ${count ?? "an unknown number of"} row(s).`);

  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < dedupedPayload.length; i += CHUNK) {
    const chunk = dedupedPayload.slice(i, i + CHUNK);
    const { error } = await supabase.from("milestone_chart_entries").upsert(chunk, { onConflict: "chart,track_title,artist,entry_date" });
    if (error) throw new Error(`Insert failed at row ${i}: ${error.message}`);
    written += chunk.length;
    process.stdout.write(`\r  ${written}/${dedupedPayload.length} written…`);
  }
  console.log(`\n\nDone — table wiped for entry_date <= ${CUTOFF_DATE} and ${written} row(s) reinstated from the CSV.`);
}

module.exports = { buildImportPayload, printReport, CUTOFF_DATE };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
