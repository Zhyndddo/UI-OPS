#!/usr/bin/env node
// ⚠ SUPERSEDED — do not use for new imports. Kept only for reference.
// The very first run of this script (round 189) silently wrote 105 rows
// under the WRONG entry_date: this sheet's per-block "Ngày DD/MM/YYYY"
// date labels turned out to be stale (left over from a prior day when
// the team copies the sheet forward day to day) even though the actual
// song/rank data underneath was genuinely current. Confirmed by
// cross-checking against the same workbook's "total today" sheet, which
// carries the identical underlying data with a correct, reliable
// per-row date column. Use scripts/import-milestone-total-today.js
// instead — same CHART_MAP, same safety, no stale-date-label risk.
//
// Original round-189 comment below, left intact for context:
//
// Backfill/upsert for the "input" sheet of the team's "Sam milestone" xlsx
// (e.g. "Sam _ milstone 2.0.2026 2.xlsx") into milestone_chart_entries.
// Round 189, per explicit request — "the total streak is the log, the
// input is input, can you make the backfill." Unlike
// import-milestone-total-streak.js (a one-time historical dump spanning
// many dates), the "input" sheet is the team's day-of manual entry form:
// every block on it carries exactly ONE date (the sheet's own "Ngày
// DD/MM/YYYY" label repeated at the top of each block), so this script
// reads that date from the sheet itself rather than assuming "today" —
// safe to re-run against a future day's copy of the same workbook.
//
// SOURCE SHEET LAYOUT ("input", header row 1, data starting row 4) — a
// non-uniform horizontal strip of 7 blocks, left to right. Two blocks
// (Zing Chart, BXH Nhạc Mới) have ONE fixed chart name for the whole
// block with no per-row chart column; the other five repeat the chart
// name in every data row because one block covers several charts on the
// same platform (Spotify Chart itself has multiple named charts, etc).
// Every block also carries a decorative multi-row-MERGED "label" column
// immediately to its left (confirmed via ws.merged_cells.ranges) that
// duplicates the block's title purely for readability — openpyxl/xlsx
// readers see that column as populated only in each merge's top-left
// cell, so it's skipped entirely; the real per-row values live one
// column to the right of it.
//
//   Block 1 — Zing Chart      cols C-F   (fixed chart "ZMP3|ZING CHART", platform Zing)
//   Block 2 — BXH Nhạc Mới    cols J-M   (fixed chart "ZMP3|BXH NHẠC MỚI", platform Zing)
//   Block 3 — Spotify Chart   cols O-T   (O=chart name, P=date, platform Spotify)
//   Block 4 — Spotify Playlist cols V-AA (V=chart name, W=date, platform Spotify)
//   Block 5 — Apple Music     cols AC-AH (AC=chart name, AD=date, platform Apple)
//   Block 6 — TikTok/Instagram cols AJ-AO (AJ=chart name, AK=date, NO platform
//                              column of its own — inferred from CHART_MAP by
//                              chart name alone, see CHART_MAP_BY_NAME below)
//   Block 7 — YouTube         cols AQ-AV (AQ=chart name, AR=date, platform YouTube)
//
// Each block's own columns, relative to its first column above: title,
// artist, rank-as-text ("#7"), rank-as-number (a numeric duplicate of the
// text rank — used preferentially since it's already clean).
//
// CHART_MAP is the SAME table import-milestone-total-streak.js uses (now
// shared via lib/milestoneChartMap.js so both scripts stay in sync). It's
// keyed by raw chart name + raw platform, but 3 raw names showed up in
// the "input" sheet that TOTAL_STREAK's own historical dump never used
// (two already-canonical block titles needing only a pass-through alias,
// one more wording variant of an Apple Music album chart) — added to
// lib/milestoneChartMap.js this round rather than duplicated here.
//
// For Block 6 (no platform column), this script also builds a
// chart-name-only reverse index off CHART_MAP and confirmed there are NO
// raw-chart-name collisions across different platform taggings anywhere
// in the table (67 distinct raw names, 0 collisions) — so a name-only
// lookup is safe here specifically, even though CHART_MAP's primary key
// is (chart, platform) for every other block/script.
//
// did is always null — the "input" sheet has no DID column, matching
// TOTAL_STREAK's own precedent (fuzzy-matched to releases.did at the app
// layer, not a hard FK).
//
// Usage:
//   npm install xlsx --no-save
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-milestone-input.js "Sam _ milstone 2.0.2026 2.xlsx"
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-milestone-input.js "Sam _ milstone 2.0.2026 2.xlsx" --confirm

const { createClient } = require("@supabase/supabase-js");
const XLSX = require("xlsx");
const { CHART_MAP } = require("../lib/milestoneChartMap");

const SHEET_NAME = "input";
const FIRST_DATA_ROW = 4;
const LAST_DATA_ROW = 1033;

// col letters -> 1-indexed column numbers, matching XLSX.utils.decode_col
function col(letters) {
  return XLSX.utils.decode_col(letters) + 1;
}

// Each block: { fixedChart, platform, chartCol, dateCol, titleCol, artistCol, rankTextCol, rankNumCol }
// chartCol is null for the 2 fixed-chart blocks (Zing Chart / BXH Nhạc Mới).
const BLOCKS = [
  { fixedChart: "ZMP3|ZING CHART", platform: "Zing", chartCol: null, dateCol: null, titleCol: col("C"), artistCol: col("D"), rankTextCol: col("E"), rankNumCol: col("F") },
  { fixedChart: "ZMP3|BXH NHẠC MỚI", platform: "Zing", chartCol: null, dateCol: null, titleCol: col("J"), artistCol: col("K"), rankTextCol: col("L"), rankNumCol: col("M") },
  { fixedChart: null, platform: "Spotify", chartCol: col("O"), dateCol: col("P"), titleCol: col("Q"), artistCol: col("R"), rankTextCol: col("S"), rankNumCol: col("T") },
  { fixedChart: null, platform: "Spotify", chartCol: col("V"), dateCol: col("W"), titleCol: col("X"), artistCol: col("Y"), rankTextCol: col("Z"), rankNumCol: col("AA") },
  { fixedChart: null, platform: "Apple", chartCol: col("AC"), dateCol: col("AD"), titleCol: col("AE"), artistCol: col("AF"), rankTextCol: col("AG"), rankNumCol: col("AH") },
  { fixedChart: null, platform: null, chartCol: col("AJ"), dateCol: col("AK"), titleCol: col("AL"), artistCol: col("AM"), rankTextCol: col("AN"), rankNumCol: col("AO") },
  { fixedChart: null, platform: "YouTube", chartCol: col("AQ"), dateCol: col("AR"), titleCol: col("AS"), artistCol: col("AT"), rankTextCol: col("AU"), rankNumCol: col("AV") },
];

// name-only reverse index — see file comment above on why this is safe.
const CHART_MAP_BY_NAME = {};
for (const k of Object.keys(CHART_MAP)) {
  const [rawChart] = k.split("␟");
  CHART_MAP_BY_NAME[rawChart] = CHART_MAP[k];
}

function norm(v) {
  if (v == null) return null;
  return String(v).replace(/\s+/g, " ").trim();
}

function parseRank(numRaw, textRaw) {
  const tryVal = (raw) => {
    if (raw == null) return null;
    if (typeof raw === "number") return Math.round(raw);
    const m = String(raw).match(/(\d+(\.\d+)?)/);
    return m ? Math.round(parseFloat(m[1])) : null;
  };
  return tryVal(numRaw) ?? tryVal(textRaw);
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
    console.error('Usage: node scripts/import-milestone-input.js "<path-to-xlsx>" [--confirm]');
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
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const cell = (r, c) => (grid[r - 1] ? grid[r - 1][c - 1] : null); // r,c 1-indexed

  // The whole sheet shares one date (every block's title reads "Ngày
  // DD/MM/YYYY") — read it from the first per-row date column that has a
  // real value (Spotify Chart's, block index 2).
  const dateBlock = BLOCKS.find((b) => b.dateCol);
  for (let r = FIRST_DATA_ROW; r <= LAST_DATA_ROW && !SHEET_DATE; r++) {
    SHEET_DATE = excelDateToISO(cell(r, dateBlock.dateCol));
  }
  if (!SHEET_DATE) {
    console.error(`Could not find a date anywhere in the "${SHEET_NAME}" sheet's Spotify Chart date column — aborting rather than guessing.`);
    process.exit(1);
  }
  console.log(`Sheet date: ${SHEET_DATE}\n`);

  const payload = [];
  const unmappedCounts = new Map(); // "chart␟platform" -> count
  let skippedNoTitle = 0, skippedNoDate = 0, skippedNoRank = 0;

  for (const block of BLOCKS) {
    for (let r = FIRST_DATA_ROW; r <= LAST_DATA_ROW; r++) {
      const rawChart = block.fixedChart || norm(cell(r, block.chartCol));
      const title = norm(cell(r, block.titleCol));
      if (!rawChart && !title) continue; // fully blank row
      if (!title) { skippedNoTitle++; continue; }

      // Fixed-chart blocks (Zing Chart / BXH Nhạc Mới) have no per-row date
      // column — every row shares the sheet's single date, read off the
      // nearest block that does carry one (Spotify Chart's date column).
      let entryDate;
      if (block.dateCol) {
        entryDate = excelDateToISO(cell(r, block.dateCol));
      } else {
        entryDate = SHEET_DATE;
      }
      if (!entryDate) { skippedNoDate++; continue; }

      const rank = parseRank(cell(r, block.rankNumCol), cell(r, block.rankTextCol));
      if (rank == null) { skippedNoRank++; continue; }
      const artist = norm(cell(r, block.artistCol)) || "";

      let mapped = null;
      if (block.platform) {
        mapped = CHART_MAP[`${rawChart}␟${block.platform}`];
      }
      if (!mapped) {
        mapped = CHART_MAP_BY_NAME[rawChart]; // covers Block 6 (no platform column) too
      }
      if (!mapped) {
        const mapKey = `${rawChart}␟${block.platform || "(none)"}`;
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
    console.log("Add these to lib/milestoneChartMap.js's CHART_MAP and re-run if they should be imported.");
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

// The whole sheet shares one date (every block's title reads "Ngày
// DD/MM/YYYY"), read from Spotify Chart's own per-row date column (the
// first block that has one) — set once main() opens the workbook.
let SHEET_DATE = null;

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
