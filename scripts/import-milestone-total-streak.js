#!/usr/bin/env node
// One-time historical backfill — imports the TOTAL_STREAK sheet from the
// team's "milestone update" xlsx into milestone_chart_entries. Round 171,
// per explicit request.
//
// SOURCE SHEET LAYOUT (TOTAL_STREAK, header row 1):
//   A "Ftieen"    — the chart's raw name, as the team's own tracking
//                    tool/process happened to label it (inconsistent —
//                    see CHART_MAP below)
//   B "date"      — the chart date (a real Excel date in every row)
//   C "tên"       — track title
//   D "ca sĩ"     — artist
//   E "Thứ hạng"  — rank, formatted "#7" (occasionally bare "#" for a
//                    blank/unranked row, or a stray float like "2.0")
//   F "Platform"  — raw platform label (also inconsistent — see
//                    PLATFORM_MAP)
// Columns G onward are working/lookup columns for the team's own sheet,
// not imported.
//
// CHART_MAP — the real work of this script. Scanning the full sheet
// (20,489 data rows) turned up 98 distinct (chart, platform) pairs, most
// of them the SAME real chart entered under slightly different names
// across different days/people (extra "CHART" word, "|" vs "-",
// trailing whitespace/newlines, singular/plural, Vietnamese vs English
// wording, or a platform mis-tag). CHART_MAP normalizes every pair this
// script is confident about into the milestone workstation's own
// canonical (chart, platform) pair — see
// app/workstation/milestone/page.js's PLATFORM_CHARTS, which this round
// also gained 7 new entries for real recurring charts (Vietnam iTunes Top
// Songs, Apple Daily Album, and 5 YouTube ones) that had solid volume
// here but nowhere to land in the existing list.
//
// UNMAPPED pairs (29 of them, 57 rows total — 0.28% of the sheet) are
// NOT guessed at: one-off typos ("Plalist Vpop Tháng 3"), single-row
// oddities ("Dance : Cambodia", "itunes"), a couple of entirely
// different platforms this system doesn't track at all (Facebook/Ins'
// "FB TRENDING", NCT's "NCT Charts" — 1-2 rows each), and a handful of
// low-volume seasonal/one-off playlists (Đón Tết variants). These are
// SKIPPED and printed in full every run (dry or live) rather than
// silently dropped — if any of these turn out to matter, they can be
// added to CHART_MAP and re-run; the upsert is idempotent either way.
//
// entry_date comes from the sheet's own date column (NOT today — this is
// historical data spanning 2026-01-05 through 2026-08-19). did is always
// null — TOTAL_STREAK has no DID column, matching ChartEntryPopup's own
// "blank until someone fills it in" default for manually-entered rows.
//
// Same natural-key upsert every other write path in this app uses
// (chart, track_title, artist, entry_date), so re-running this script
// (e.g. after adding a CHART_MAP entry) is always safe — it updates
// existing rows in place rather than duplicating them.
//
// Usage:
//   npm install xlsx --no-save
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-milestone-total-streak.js "milestone update 2011.xlsx"
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-milestone-total-streak.js "milestone update 2011.xlsx" --confirm

const { createClient } = require("@supabase/supabase-js");
const XLSX = require("xlsx");

const SHEET_NAME = "TOTAL_STREAK";
const HEADER_ROW = 1; // 1-indexed
const FIRST_DATA_ROW = 2;
const COL = { CHART: 0, DATE: 1, TITLE: 2, ARTIST: 3, RANK: 4, PLATFORM: 5 };

function norm(v) {
  if (v == null) return null;
  return String(v).replace(/\s+/g, " ").trim();
}

// See the file-level comment above for how this table was built.
const CHART_MAP = {
  "APPLE MUSIC - Top ALTERNATIVE Albums␟Apple": { chart: "APPLE MUSIC - Top ALTERNATIVE Albums", platform: "Apple" },
  "APPLE MUSIC - Top DANCE Albums␟Apple": { chart: "APPLE MUSIC - Top DANCE Albums", platform: "Apple" },
  "APPLE MUSIC -Top HIPHOP/RAP Albums␟Apple": { chart: "APPLE MUSIC -Top HIPHOP/RAP Albums", platform: "Apple" },
  "APPLE MUSIC CHART - Top ALBUMs Vietnam␟Apple": { chart: "APPLE MUSIC - Top ALBUMs Vietnam", platform: "Apple" },
  "APPLE MUSIC CHART - Top ALTERNATIVE Albums␟Apple": { chart: "APPLE MUSIC - Top ALTERNATIVE Albums", platform: "Apple" },
  "APPLE MUSIC CHART - Top DANCE Albums␟Apple": { chart: "APPLE MUSIC - Top DANCE Albums", platform: "Apple" },
  "APPLE MUSIC CHART - Top POP Album␟Apple": { chart: "APPLE MUSIC - Top POP Albums", platform: "Apple" },
  "APPLE MUSIC | Top Songs Vietnam␟Apple": { chart: "Apple Music - Top Songs Vietnam", platform: "Apple" },
  "Apple Daily Album␟Apple": { chart: "Apple Daily Album", platform: "Apple" },
  "Apple Music - Top Alternative Songs␟Apple": { chart: "Apple - Top Alternative Songs", platform: "Apple" },
  "Apple Music - Top Dance Songs␟Apple": { chart: "Apple Music - Top Dance Songs", platform: "Apple" },
  "Apple Music - Top Hiphop/Rap Songs␟Apple": { chart: "Apple Music - Top Hiphop/Rap Songs", platform: "Apple" },
  "Apple Music - Top POP Songs␟Apple": { chart: "Apple Music - Top POP Songs", platform: "Apple" },
  "Apple Music CHART - Top Alternative Songs␟Apple": { chart: "Apple - Top Alternative Songs", platform: "Apple" },
  "Apple Music CHART - Top Dance Songs␟Apple": { chart: "Apple Music - Top Dance Songs", platform: "Apple" },
  "Apple Playlist | New Music Daily␟Apple": { chart: "Playlist New Music Daily", platform: "Apple" },
  "Apple Playlist | Vietnam Ơi␟Apple": { chart: "Playlist Vietnam Ơi!", platform: "Apple" },
  "BXH NHẠC MỚI␟Zing": { chart: "ZMP3|BXH NHẠC MỚI", platform: "Zing" },
  "DAILY TOP ARTISTS␟Spotify": { chart: "DAILY TOP ARTIST", platform: "Spotify" },
  "DAILY TOP ARTIST␟Spotify": { chart: "DAILY TOP ARTIST", platform: "Spotify" },
  "DAILY TOP SONG␟Spotify": { chart: "DAILY TOP SONG", platform: "Spotify" },
  "DAILY VIRAL SONGs␟Spotify": { chart: "DAILY VIRAL SONGs", platform: "Spotify" },
  "HA NOI␟Spotify": { chart: "HANOI", platform: "Spotify" },
  "HANOI␟Spotify": { chart: "HANOI", platform: "Spotify" },
  "HO CHI MINH CITY␟Spotify": { chart: "HOCHIMINH CITY", platform: "Spotify" },
  "HOCHIMINH CITY␟Spotify": { chart: "HOCHIMINH CITY", platform: "Spotify" },
  "INSTAGRAM| TRENDING AUDIO␟Instagram": { chart: "INSTAGRAM", platform: "Instagram" },
  "LOCAL PULSE - HANOI␟Spotify": { chart: "LOCAL PULSE - HANOI", platform: "Spotify" },
  "LOCAL PULSE - HOCHIMINH CITY␟Spotify": { chart: "LOCAL PULSE - HOCHIMINH CITY", platform: "Spotify" },
  "PLAYLIST YOUTUBE CHARTS | RELEASED␟Youtube": { chart: "PLAYLIST YOUTUBE | RELEASED", platform: "YouTube" },
  "PLAYLIST YOUTUBE CHARTS | The Hit List␟Youtube": { chart: "PLAYLIST YOUTUBE | The Hit List", platform: "YouTube" },
  "PLAYLIST YOUTUBE | RELEASED␟Youtube": { chart: "PLAYLIST YOUTUBE | RELEASED", platform: "YouTube" },
  "PLAYLIST YOUTUBE | The Hit List␟Youtube": { chart: "PLAYLIST YOUTUBE | The Hit List", platform: "YouTube" },
  "Playlist Đoá Hồng Nhạc Việt␟Spotify": { chart: "Playlist Đoá Hồng Nhạc Việt", platform: "Spotify" },
  "Shazam Top Songs␟Shazam": { chart: "Shazam Top Songs", platform: "Shazam" },
  // Platform mis-tag fix — "Shazam Top Songs" tagged Platform="Youtube"
  // for 360 rows. The chart name unambiguously identifies Shazam; this
  // corrects it rather than either dropping 360 real rows or filing them
  // under YouTube.
  "Shazam Top Songs␟Youtube": { chart: "Shazam Top Songs", platform: "Shazam" },
  "Spotify Playlist | Fresh Find Vietnam␟Spotify": { chart: "Playlist Fresh Find Vietnam", platform: "Spotify" },
  "Spotify Playlist | NEW MUSIC FRIDAY VIETNAM␟Spotify": { chart: "Playlist NEW MUSIC FRIDAY VIETNAM", platform: "Spotify" },
  "Spotify Playlist | Thiên Hạ Nghe Gì␟Spotify": { chart: "Playlist Thiên Hạ Nghe Gì", platform: "Spotify" },
  "Spotify Playlist | Vsound Ngay Lúc Này␟Spotify": { chart: "Playlist Vsound Ngay Lúc Này", platform: "Spotify" },
  "TIKTOK BREAKOUT␟Tiktok": { chart: "TIKTOK BREAKOUT", platform: "TikTok" },
  "TIKTOK HOT␟Tiktok": { chart: "TIKTOK HOT", platform: "TikTok" },
  "TIKTOK POPULAR␟Tiktok": { chart: "TIKTOK POPULAR", platform: "TikTok" },
  "Vietnam iTunes Top Songs␟Apple": { chart: "Vietnam iTunes Top Songs", platform: "Apple" },
  "WEEKLY TOP ALBUM Tuần␟Spotify": { chart: "WEEKLY TOP ALBUM", platform: "Spotify" },
  "WEEKLY TOP ALBUM␟Spotify": { chart: "WEEKLY TOP ALBUM", platform: "Spotify" },
  "WEEKLY TOP ARTIST␟Spotify": { chart: "WEEKLY TOP ARTIST", platform: "Spotify" },
  "WEEKLY TOP SONG␟Spotify": { chart: "WEEKLY TOP SONG", platform: "Spotify" },
  "YOUTUBE CHART | TOP VIDEO␟YOUTUBE": { chart: "YOUTUBE CHARTS | Top Videos Daily", platform: "YouTube" },
  "YOUTUBE CHARTS | Daily Top Music Videos␟Youtube": { chart: "YOUTUBE CHARTS | Top Videos Daily", platform: "YouTube" },
  "YOUTUBE CHARTS | Daily Top Songs on Shorts␟Youtube": { chart: "YOUTUBE CHARTS | Daily Top Songs on Shorts", platform: "YouTube" },
  "YOUTUBE CHARTS | Nhạc thịnh hành␟Youtube": { chart: "YOUTUBE CHARTS | VIETNAM TRENDING MUSIC", platform: "YouTube" },
  "YOUTUBE CHARTS | TOP SONGS DAILY␟Youtube": { chart: "YOUTUBE CHARTS | TOP SONGS DAILY", platform: "YouTube" },
  "YOUTUBE CHARTS | TopArtists weekly␟Youtube": { chart: "YOUTUBE CHARTS | TOP ARTISTS WEEKLY", platform: "YouTube" },
  "YOUTUBE CHARTS | TopShortsSongs daily␟Youtube": { chart: "YOUTUBE CHARTS | Daily Top Songs on Shorts", platform: "YouTube" },
  "YOUTUBE CHARTS | TopSongs weekly␟Youtube": { chart: "YOUTUBE CHARTS | TOP SONGS WEEKLY", platform: "YouTube" },
  "YOUTUBE CHARTS | TopVideos daily␟Youtube": { chart: "YOUTUBE CHARTS | Top Videos Daily", platform: "YouTube" },
  "YOUTUBE CHARTS | Vietnam Trending Music␟Youtube": { chart: "YOUTUBE CHARTS | VIETNAM TRENDING MUSIC", platform: "YouTube" },
  "YOUTUBE CHARTS | Vietnam Trending Overall␟Youtube": { chart: "YOUTUBE CHARTS | VIETNAM TRENDING MUSIC", platform: "YouTube" },
  "YOUTUBE CHARTS | Weekly Top Artists␟Youtube": { chart: "YOUTUBE CHARTS | TOP ARTISTS WEEKLY", platform: "YouTube" },
  "YOUTUBE CHARTS | Weekly Top Music Videos␟Youtube": { chart: "YOUTUBE CHARTS | Weekly Top Music Videos", platform: "YouTube" },
  "YOUTUBE MUSIC CHART | TOP ARTIST WEEKLY␟Youtube": { chart: "YOUTUBE CHARTS | TOP ARTISTS WEEKLY", platform: "YouTube" },
  "YOUTUBE MUSIC CHART | TOP SONGS WEEKLY␟YOUTUBE": { chart: "YOUTUBE CHARTS | TOP SONGS WEEKLY", platform: "YouTube" },
  "YOUTUBE MUSIC CHART | TOP SONGS WEEKLY␟Youtube": { chart: "YOUTUBE CHARTS | TOP SONGS WEEKLY", platform: "YouTube" },
  "YOUTUBE MUSIC | DAILY TOP VIDEO␟Youtube": { chart: "YOUTUBE CHARTS | Top Videos Daily", platform: "YouTube" },
  "YOUTUBE MUSIC | WEEKLY TOP ARTIST␟Youtube": { chart: "YOUTUBE CHARTS | TOP ARTISTS WEEKLY", platform: "YouTube" },
  "YOUTUBE MUSIC | WEEKLY TOP SONG␟Youtube": { chart: "YOUTUBE CHARTS | TOP SONGS WEEKLY", platform: "YouTube" },
  "ZingCharts␟Zing": { chart: "ZMP3|ZING CHART", platform: "Zing" },
  "youworldtop | Trending On YouTube Vietnam Today␟Youtube": { chart: "YOUTUBE CHARTS | VIETNAM TRENDING MUSIC", platform: "YouTube" },
};

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
    console.error('Usage: node scripts/import-milestone-total-streak.js "<path-to-xlsx>" [--confirm]');
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

  // Dedupe on the same natural key the upsert itself uses, keeping the
  // LAST occurrence of each — 123 keys (191 rows) turned up appearing
  // more than once in the raw sheet (the same song re-logged on the same
  // chart/date, presumably a re-entry or copy-paste while the team
  // filled this in by hand). Without this, a single upsert() chunk that
  // happens to contain both occurrences of the same key fails outright —
  // Postgres refuses to let one ON CONFLICT DO UPDATE affect the same row
  // twice within one statement — so this isn't just tidiness, the import
  // would otherwise error partway through a chunk for reasons that have
  // nothing to do with the data actually being wrong.
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
