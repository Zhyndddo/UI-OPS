"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import { useIsMobile } from "../../../lib/useIsMobile";
import { MILESTONE_HIGHLIGHT_SETTING_KEY, DEFAULT_MILESTONE_HIGHLIGHT_CONFIG, parseMilestoneHighlightConfig } from "../../../lib/milestoneHighlight";
import { MILESTONE_CHART_LINKS } from "../../../lib/milestoneChartLinks";
import styles from "../../shared.module.css";

// Real platform → chart lists, straight from v1's MILESTONE_PLATFORM_TABS.
const PLATFORM_CHARTS = {
  Zing: ["ZMP3|ZING CHART", "ZMP3|BXH NHẠC MỚI"],
  // Round 155 item 1c — "Playlist Đoá Hồng Nhạc Việt" added, per explicit
  // request: the team's xlsx tracked this 5th Spotify playlist chart but
  // it had no entry here yet (see lib/milestoneChartLinks.js's comment on
  // where its URL came from).
  Spotify: ["WEEKLY TOP ALBUM", "WEEKLY TOP ARTIST", "WEEKLY TOP SONG", "DAILY TOP SONG", "DAILY TOP ARTIST", "DAILY VIRAL SONGs", "HANOI", "LOCAL PULSE - HANOI", "HOCHIMINH CITY", "LOCAL PULSE - HOCHIMINH CITY", "Playlist NEW MUSIC FRIDAY VIETNAM", "Playlist Fresh Find Vietnam", "Playlist Vsound Ngay Lúc Này", "Playlist Thiên Hạ Nghe Gì", "Playlist Đoá Hồng Nhạc Việt"],
  // Round 171 — "Vietnam iTunes Top Songs" and "Apple Daily Album" added:
  // both showed up with real, sustained volume (138 and 50 rows
  // respectively) in the TOTAL_STREAK historical import but had no home
  // in this list yet — see scripts/import-milestone-total-streak.js's
  // CHART_MAP for the full mapping this round worked from.
  // Round 190 — "New Release on Apple" added: showed up unmapped in both
  // "total today" and TOTAL_STREAK (2 rows each), a real recurring chart
  // the team's started tracking, not a one-off typo — see
  // lib/milestoneChartMap.js's CHART_MAP for the raw-name mapping.
  Apple: ["Playlist Vietnam Ơi!", "Playlist New Music Daily", "APPLE MUSIC - Top ALBUMs Vietnam", "APPLE MUSIC - Top POP Albums", "APPLE MUSIC -Top HIPHOP/RAP Albums", "APPLE MUSIC - Top DANCE Albums", "APPLE MUSIC - Top ALTERNATIVE Albums", "Apple Music - Top Songs Vietnam", "Apple Music - Top POP Songs", "Apple - Top Alternative Songs", "Apple Music - Top Dance Songs", "Apple Music - Top Hiphop/Rap Songs", "Vietnam iTunes Top Songs", "Apple Daily Album", "New Release on Apple"],
  TikTok: ["TIKTOK POPULAR", "TIKTOK BREAKOUT", "TIKTOK HOT"],
  Instagram: ["INSTAGRAM"],
  // Round 207 — corrected per the team's own recheck of these tab
  // labels ("most of them is not correct"). Of the old 10:
  //  - 4 renamed (existing rows migrated to the new name, see
  //    add-round207-youtube-chart-renames.sql, so today-vs-yesterday
  //    comparisons and streaks stay continuous across the rename):
  //    VIETNAM TRENDING MUSIC -> Trending Music, Top Videos Daily ->
  //    Daily Top Music Videos, TOP ARTISTS WEEKLY -> Weekly Top Artists,
  //    both PLAYLIST YOUTUBE entries -> PLAYLIST YOUTUBE MUSIC.
  //  - 2 unchanged: Daily Top Songs on Shorts, Weekly Top Music Videos.
  //  - 3 dropped entirely, not renamed into anything (TOP SONGS WEEKLY,
  //    TOP SONGS DAILY, Top Video Trending on YTB) — per explicit
  //    confirmation their existing rows are left in place untouched,
  //    just no longer editable here since there's no tab for them.
  YouTube: ["YOUTUBE CHARTS | Trending Music", "YOUTUBE CHARTS | Daily Top Music Videos", "YOUTUBE CHARTS | Weekly Top Music Videos", "YOUTUBE CHARTS | Weekly Top Artists", "YOUTUBE CHARTS | Daily Top Songs on Shorts", "PLAYLIST YOUTUBE MUSIC | The Hit List", "PLAYLIST YOUTUBE MUSIC | RELEASED"],
  Shazam: ["Shazam Top Songs"],
};
const PLATFORMS = Object.keys(PLATFORM_CHARTS);

// Round 209 — the Input tab's platform picker already shows Zing first
// (it's just the first key in PLATFORM_CHARTS above), but the Report
// tab's digest and Chart Highlight summary both group-sort platforms
// with a plain alphabetical `localeCompare`, which puts "Zing" dead
// last (Z is the last letter) — per explicit request ("make zing goes
// first"), those two now use this instead: Zing always sorts first,
// everything else alphabetical after it.
function platformCompare(a, b) {
  if (a === "Zing" && b !== "Zing") return -1;
  if (b === "Zing" && a !== "Zing") return 1;
  return a.localeCompare(b);
}

// Round 193 — fixed a real timezone bug, per explicit report ("import
// somehow drop the rank column data... should be us wiping the thing
// after every save or at open"). Both of these used to build the date
// string via `new Date().toISOString().slice(0, 10)` — toISOString
// always converts to UTC first. For this team (Vietnam, UTC+7), any
// time between local midnight and ~7am, the UTC date is still
// YESTERDAY's date, so todayStr() silently returned the wrong (earlier)
// day during that ~7-hour window every single day. The Input popup's
// "does today already have rows saved?" check (see ChartEntryPopup
// below) uses this exact string to filter `entries` — when it's wrong,
// today's already-imported rows (real ranks and all) don't match, the
// popup falls through to the round-174 "carry forward prior day, rank
// deliberately blank" branch instead, and the rank column reads empty
// even though the real data is sitting right there in the database.
// Fixed by reading the LOCAL date components directly instead of
// converting through UTC — this reflects whatever calendar day it
// actually is for the person looking at the screen, in their own
// timezone, at any hour.
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayStr() { return localDateStr(new Date()); }
function daysAgoStr(n) { const d = new Date(); d.setDate(d.getDate() - n); return localDateStr(d); }
const key = (chart, track, artist) => `${chart}|${track}|${artist}`.replace(/\s+/g, "").toLowerCase();

// Round 174 — manual row order (see add-round174-milestone-sort-order.sql).
// null sort_order (every pre-round-174 row, and any row saved before ever
// touching the reorder buttons) sorts after anything that DOES have one —
// existing rows just keep whatever order they came back from Supabase in,
// nothing shuffles unexpectedly the first time this ships.
function sortByOrder(rows) {
  return [...rows].sort((a, b) => {
    const ao = a.sort_order, bo = b.sort_order;
    if (ao == null && bo == null) return 0;
    if (ao == null) return 1;
    if (bo == null) return -1;
    return ao - bo;
  });
}

// Round 174 — the Input popup used to only ever pre-fill from TODAY's own
// already-saved rows (see ChartEntryPopup below); the moment a new day
// starts and nothing's been saved yet, every chart fell back to one blank
// row, meaning every previously-tracked song had to be retyped from
// scratch daily. Per explicit report + the "swipe the number, leave the
// row intact" rule already established for the historical import (round
// 171), this looks at the most recent PRIOR day with any rows for this
// (platform, chart) and hands those back (still ordered by sort_order) so
// the caller can carry the song/artist/DID forward while blanking rank.
function findPriorRows(entries, platform, chart, today) {
  const priorDates = [...new Set(
    entries.filter((e) => e.platform === platform && e.chart === chart && e.entry_date < today).map((e) => e.entry_date)
  )].sort().reverse();
  if (priorDates.length === 0) return null;
  const latestDate = priorDates[0];
  return sortByOrder(entries.filter((e) => e.platform === platform && e.chart === chart && e.entry_date === latestDate));
}

export default function MilestoneWorkstation() {
  const [tab, setTab] = useState("input");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openPlatform, setOpenPlatform] = useState(null);
  // Round 127 — Config → Milestone's admin-editable Highlight thresholds
  // (see lib/milestoneHighlight.js). Starts at the real system's own
  // hardcoded defaults so the Report tab isn't empty/wrong before an
  // admin ever opens Config.
  const [highlightConfig, setHighlightConfig] = useState(DEFAULT_MILESTONE_HIGHLIGHT_CONFIG);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("milestone_chart_entries").select("*").order("entry_date", { ascending: false });
    setEntries(data || []);
    const { data: cfg } = await supabase.from("app_settings").select("value").eq("key", MILESTONE_HIGHLIGHT_SETTING_KEY).maybeSingle();
    setHighlightConfig(parseMilestoneHighlightConfig(cfg?.value));
    setLoading(false);
  }

  async function saveRows(platform, chart, rows) {
    const payload = rows
      // Round 202 — was `.filter((r) => r.track_title?.trim())`, which
      // required EVERY row on EVERY chart to have a Song filled in. That's
      // fine for song charts, but an artist-ranking chart (e.g. Spotify's
      // "WEEKLY TOP ARTIST"/"DAILY TOP ARTIST", YouTube's "TOP ARTISTS
      // WEEKLY") has no song at all — the user only fills in Artist and
      // leaves Song blank, since there's nothing to put there. Every row on
      // those charts was silently dropped by this filter, so `payload`
      // ended up empty even though the user genuinely typed data in — and
      // since the delete below runs unconditionally BEFORE the
      // `payload.length === 0` check, that emptied payload meant today's
      // real rows got deleted with nothing to reinsert: "click save just
      // throws everything away," exactly as reported for the Weekly Artist
      // tab. Now a row counts as real if EITHER Song or Artist is filled.
      .filter((r) => r.track_title?.trim() || r.artist?.trim())
      .map((r, i) => {
        const parsedRank = parseInt(r.rank, 10);
        return {
          chart, platform, entry_date: todayStr(),
          // Round 127 — artist stays "" (not null) for entries with no
          // artist typed, matching the codebase's established fix for this
          // exact class of bug (see MUSHED_BRAND_CATEGORIES in
          // app/booking/page.js): NULL is never equal to NULL in a unique
          // constraint, so an artist column that could be null let every
          // artist-less save silently create a NEW duplicate row instead of
          // upserting onto the existing one — found while importing the
          // real system's historical log (see add-round127-milestone-
          // artist-notnull.sql), not something visible from this file
          // alone since every read path already tolerates "" the same as
          // null (r.artist || "—").
          // track_title stays "" (not left undefined) for artist-only
          // charts — the column is NOT NULL but has no default, unlike
          // artist, so an explicit "" is required rather than relying on
          // the DB to fill it in.
          track_title: r.track_title?.trim() || "", artist: r.artist?.trim() || "",
          // Round 193 — a blank/unparseable rank used to become a real
          // `0` here (`parseInt(...) || 0`); kept as `null` now and
          // filtered out below instead, so a row with no rank typed in
          // is simply left out of what gets (re)written rather than
          // recorded as rank 0.
          rank: Number.isFinite(parsedRank) ? parsedRank : null, did: r.did?.trim() || null,
          // Round 174 — persists this row's position in the popup's own
          // list (see sortByOrder above) — index is taken AFTER the
          // blank-title filter above, so it's always a clean 0..N-1 over
          // just the rows that actually saved. Every save writes this
          // (not just ones that touched the reorder buttons), so a row
          // naturally picks up a real value the next time it's touched.
          sort_order: i,
        };
      })
      .filter((r) => r.rank != null);

    // Round 194 — full replace instead of merge-upsert, per explicit
    // request/confirmation ("usually only 1-2 people but they do not
    // overlap doing it on the same platform"). A plain upsert (the old
    // behavior) only ever created/updated rows present in the popup's
    // current list — a row REMOVED from the popup (a wrong entry the
    // user deleted) stayed sitting in the database forever, since
    // nothing ever told it to go away. Since this team never has two
    // people editing the same chart at once, it's safe to treat
    // "what's in the popup right now" as the full, authoritative set of
    // today's rows for this chart: clear everything already saved for
    // (platform, chart, today), then write back exactly what's here —
    // an intentionally blank/removed row now actually disappears
    // instead of lingering with stale data.
    //
    // Not fully atomic (two separate requests, not one DB transaction):
    // if the delete succeeds but the insert below fails (e.g. a network
    // drop), today's rows for this chart are gone until the next
    // successful save. The error is surfaced (not swallowed) specifically
    // so a failed save is obvious and worth retrying rather than assumed
    // to have silently kept the old data.
    const { error: deleteError } = await supabase
      .from("milestone_chart_entries")
      .delete()
      .eq("platform", platform)
      .eq("chart", chart)
      .eq("entry_date", todayStr());
    if (deleteError) {
      alert(`Failed to clear old rows for ${chart}: ${deleteError.message}`);
      throw deleteError;
    }
    if (payload.length === 0) {
      // Every row was blank/deleted — today's rows for this chart are
      // now intentionally empty. Still reload so the UI reflects that.
      load();
      return;
    }
    // Round 182 — de-dupe on the exact same natural key the upsert itself
    // conflicts on (chart/track_title/artist/entry_date — platform is
    // fixed per call already), keeping the LAST occurrence. Two rows in
    // one popup save sharing that key (e.g. a song typed in twice, or
    // left over from a carry-forward that wasn't cleaned up) used to make
    // Postgres itself reject the whole batch — "ON CONFLICT DO UPDATE
    // command cannot affect row a second time" — and this call had no
    // error handling at all, so that failure was completely silent: the
    // popup called load() right after regardless, which then reflected
    // NONE of this chart's just-typed rows, reading exactly like they'd
    // been deleted.
    const seen = new Map();
    payload.forEach((row) => seen.set(`${row.track_title}␟${row.artist}`, row));
    const deduped = [...seen.values()];
    // Still upserts (not a plain insert) even after the delete above —
    // a defensive no-op in the normal case, but a safety net rather than
    // a hard failure if anything else (a concurrent import script, say)
    // wrote a matching row in the moment between the delete and here.
    const { error } = await supabase.from("milestone_chart_entries").upsert(deduped, { onConflict: "chart,track_title,artist,entry_date" });
    if (error) {
      // Round 182 — surface a failed save instead of silently reloading
      // as if it had worked; the caller (ChartEntryPopup's handleSaveAll)
      // still awaits this, so throwing here stops it from moving on to
      // the next chart or closing the popup on a failed write.
      alert(`Failed to save ${chart}: ${error.message}`);
      throw error;
    }
    load();
  }

  // Round 127 — rewritten to match the REAL system's refreshDashboard()
  // Apps Script function (the team sent its source directly), not just
  // v1's spec-approximation the way this used to be built. Still
  // computed client-side over the fetched history rather than as a SQL
  // view — same idiom as before, just a truer algorithm:
  //   - IN: never appeared on this chart before today.
  //   - RETURN: appeared before (any earlier date), but not yesterday.
  //   - REMAIN: appeared yesterday too.
  //   - streak: resets to 1 on IN/RETURN, +1 on REMAIN (based on the
  //     longest run of consecutive days ending yesterday, same "walk
  //     backward from yesterday" approach the streak already used).
  //   - rankChange: only meaningful for REMAIN (both today's and
  //     yesterday's rank are known) — {dir:"up"|"down"|"same", amount}.
  //     "up" = climbed (rank NUMBER went down, e.g. #12 -> #7).
  //   - dayIn: the date this streak run started (entry_date minus
  //     streak-1 days) — matches the real report's "Day in" column.
  const report = useMemo(() => {
    const today = todayStr(), yesterday = daysAgoStr(1);
    const todayRowsRaw = entries.filter((e) => e.entry_date === today);
    const yesterdayRows = entries.filter((e) => e.entry_date === yesterday);
    const yesterdayRankByKey = new Map();
    yesterdayRows.forEach((r) => yesterdayRankByKey.set(key(r.chart, r.track_title, r.artist), r.rank));

    function streakEndingYesterday(k) {
      const all = entries.filter((r) => key(r.chart, r.track_title, r.artist) === k && r.entry_date < today).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
      let streak = 0, checkDate = yesterday;
      for (const r of all) {
        if (r.entry_date === checkDate) {
          streak++;
          const d = new Date(checkDate); d.setDate(d.getDate() - 1);
          checkDate = d.toISOString().slice(0, 10);
        } else break;
      }
      return streak;
    }

    const todayRows = todayRowsRaw.map((r) => {
      const k = key(r.chart, r.track_title, r.artist);
      const inYesterday = yesterdayRankByKey.has(k);
      let status;
      if (inYesterday) status = "REMAIN";
      else {
        const everAppearedBefore = entries.some((x) => key(x.chart, x.track_title, x.artist) === k && x.entry_date < today);
        status = everAppearedBefore ? "RETURN" : "IN";
      }
      const streak = inYesterday ? streakEndingYesterday(k) + 1 : 1;

      let rankChange = null;
      if (inYesterday) {
        const diff = yesterdayRankByKey.get(k) - r.rank; // positive = climbed (lower rank number)
        rankChange = diff > 0 ? { dir: "up", amount: diff } : diff < 0 ? { dir: "down", amount: Math.abs(diff) } : { dir: "same", amount: 0 };
      }

      const dayInDate = new Date(r.entry_date);
      dayInDate.setDate(dayInDate.getDate() - (streak - 1));

      return { ...r, status, streak, rankChange, dayIn: dayInDate.toISOString().slice(0, 10) };
    });

    // OUT — kept as an additive, useful view of what fell off since
    // yesterday. The real refreshDashboard() doesn't write these to its
    // own output sheet, but the workflow's earlier draft already showed
    // them and the team's never asked to drop it.
    const todayKeys = new Set(todayRowsRaw.map((r) => key(r.chart, r.track_title, r.artist)));
    // Round 220 — same "highest rank first" rule as the Report digest
    // (round 215), extended here per explicit follow-up request ("check
    // if we have the highest rank in the highlight, filter, and all
    // that") — the Fell-off list is the one other place on this same
    // Report panel that was still showing raw fetch order.
    const outRows = yesterdayRows
      .filter((r) => !todayKeys.has(key(r.chart, r.track_title, r.artist)))
      .map((r) => ({ ...r, status: "OUT", streak: streakEndingYesterday(key(r.chart, r.track_title, r.artist)) + 1, rankChange: null, dayIn: null, entry_date: yesterday }))
      .sort((a, b) => a.rank - b.rank);

    return { today, yesterday, todayRows, outRows };
  }, [entries]);

  // Round 127 — the "Highlight" rule set (see lib/milestoneHighlight.js),
  // computed straight from report.todayRows using the admin-editable
  // thresholds. Round 192 — simplified to 3 rules per explicit request:
  // it's IN, it's RETURN, or (while REMAIN) it's either climbing and now
  // at or better than climbToRankHighlight, OR its rank — regardless of
  // movement — is at or better than topRankAlwaysHighlight. That last
  // condition subsumes the old separate "held #1" rule, so there's no
  // longer a 4th case to track.
  const highlight = useMemo(() => {
    const isRemainHighlighted = (r) =>
      r.status === "REMAIN" &&
      ((r.rankChange?.dir === "up" && r.rank <= highlightConfig.climbToRankHighlight) || r.rank <= highlightConfig.topRankAlwaysHighlight);

    const isHighlighted = (r) => r.status === "IN" || r.status === "RETURN" || isRemainHighlighted(r);

    // Round 220 — same "highest rank first" rule as the Report digest
    // (round 215: plain ascending numeric sort — #1 above #2 above #12)
    // applied to all 3 Highlight lists too, per explicit follow-up
    // request. These lists span multiple charts/platforms at once (not
    // grouped like the Report digest), so "highest rank" here just means
    // the numerically best rank sits first regardless of which chart it
    // came from — same reading of "highest rank" as everywhere else on
    // this page.
    const inRows = report.todayRows.filter((r) => r.status === "IN").sort((a, b) => a.rank - b.rank);
    const returnRows = report.todayRows.filter((r) => r.status === "RETURN").sort((a, b) => a.rank - b.rank);
    const topRows = report.todayRows.filter(isRemainHighlighted).sort((a, b) => a.rank - b.rank);

    // Chart Highlight summary — per platform, every chart currently
    // charting more than highlightConfig.minChartCount entries, excluding
    // highlightConfig.excludedCharts.
    const countByPlatformChart = new Map(); // platform -> chart -> count
    report.todayRows.forEach((r) => {
      if (highlightConfig.excludedCharts.includes(r.chart)) return;
      const platform = r.platform || "—";
      if (!countByPlatformChart.has(platform)) countByPlatformChart.set(platform, new Map());
      const m = countByPlatformChart.get(platform);
      m.set(r.chart, (m.get(r.chart) || 0) + 1);
    });
    const chartSummary = [];
    for (const [platform, chartCounts] of countByPlatformChart) {
      const charts = [...chartCounts.entries()].filter(([, count]) => count > highlightConfig.minChartCount).sort((a, b) => b[1] - a[1]);
      if (charts.length > 0) chartSummary.push({ platform, charts });
    }
    chartSummary.sort((a, b) => platformCompare(a.platform, b.platform));

    return { inRows, returnRows, topRows, chartSummary, isHighlighted };
  }, [report, highlightConfig]);

  // Digest grouping for the Report panel — every today row grouped by
  // (platform, chart), matching the real report's numbered
  // "N. Platform | Chart -- filled/depth --" sections.
  const digest = useMemo(() => {
    const groups = new Map(); // `${platform}||${chart}` -> rows
    report.todayRows.forEach((r) => {
      const gk = `${r.platform || "—"}||${r.chart}`;
      if (!groups.has(gk)) groups.set(gk, { platform: r.platform || "—", chart: r.chart, rows: [] });
      groups.get(gk).rows.push(r);
    });
    // Round 215 — per explicit request, each chart's rows now auto-sort
    // highest rank first (smaller rank number = higher, so plain
    // ascending numeric sort — #1 above #2 above #12, etc.) instead of
    // whatever order they happened to be imported/entered in.
    groups.forEach((g) => g.rows.sort((a, b) => a.rank - b.rank));
    return [...groups.values()].sort((a, b) => platformCompare(a.platform, b.platform) || a.chart.localeCompare(b.chart));
  }, [report]);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1400 }}>
          <TypeSwitcher kind="workstation" current="milestone" />
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 16 }}>Milestone</h1>

          <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
            {[["input", "Input"], ["report", "Report"], ["log", "Log"]].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`${styles.tabBtn} ${tab === k ? styles.tabBtnActive : ""}`} style={{ border: tab === k ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: tab === k ? "rgba(255,107,26,0.1)" : "transparent" }}>
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : tab === "input" ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  onClick={() => setOpenPlatform(p)}
                  style={{ width: 110, height: 80, border: "1px solid var(--border-strong)", borderRadius: 10, background: "var(--bg-card)", color: "var(--text)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  {p}
                </button>
              ))}
            </div>
          ) : tab === "report" ? (
            <ReportAndHighlight digest={digest} highlight={highlight} report={report} highlightConfig={highlightConfig} />
          ) : (
            <LogTable entries={entries} />
          )}
        </div>
      </div>

      {openPlatform && (
        <ChartEntryPopup platform={openPlatform} onClose={() => setOpenPlatform(null)} onSave={saveRows} entries={entries} />
      )}
    </AppShell>
  );
}

const TAG_COLOR = { IN: "var(--success-fg)", REMAIN: "#5cb3ff", RETURN: "#ffca4d", OUT: "var(--error-fg)" };

function RankChangeArrow({ rankChange }) {
  if (!rankChange || rankChange.dir === "same") return <span style={{ color: "var(--text-faint)" }}>0</span>;
  return rankChange.dir === "up"
    ? <span style={{ color: "var(--success-fg)" }}>↑{rankChange.amount}</span>
    : <span style={{ color: "var(--error-fg)" }}>↓{rankChange.amount}</span>;
}

function SongLine({ r, showChart }) {
  return (
    <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "3px 0", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline" }}>
      <span style={{ fontWeight: 700, color: "var(--text)" }}>#{r.rank}</span>
      {/* Round 192 — relabeled to "Platform | Chart" per explicit
          request, so a chart name shown outside its own group header
          (Fell-off, and previously the Highlight panel) is unambiguous
          even though the underlying value is the CHART_MAP-canonicalized
          name, not whatever raw label the sheet happened to use. */}
      {showChart && <span style={{ color: "#ff9d5c" }}>{r.platform} | {r.chart} |</span>}
      <span>{r.track_title}{r.artist ? ` - ${r.artist}` : ""}</span>
      {r.dayIn && <span style={{ color: "var(--text-faint)" }}>{fmtDate(r.dayIn)}</span>}
      {r.rankChange && <RankChangeArrow rankChange={r.rankChange} />}
      <span style={{ color: TAG_COLOR[r.status], fontWeight: 700 }}>{r.status}</span>
    </div>
  );
}

// Round 192 — compact per-row line for the Highlight panel specifically
// (IN / RETURN / Top rows), split out from SongLine per explicit
// request: "yes do that, but keep the arrow, since highlight is each
// day already" — the Highlight panel doesn't need SongLine's date or
// status tag (each Highlight section's own title already says the
// status; the date matters for the full Report digest, not for a
// same-day highlight), but the rank-change arrow stays since it's the
// whole point of the "Thăng Hạng" section.
function HighlightLine({ r }) {
  return (
    <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "3px 0", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline" }}>
      <span style={{ fontWeight: 700, color: "var(--text)" }}>#{r.rank}</span>
      <span style={{ color: "#ff9d5c" }}>{r.platform} | {r.chart} |</span>
      <span>{r.track_title}{r.artist ? ` - ${r.artist}` : ""}</span>
      {r.rankChange && <RankChangeArrow rankChange={r.rankChange} />}
    </div>
  );
}

// Round 204 — plain-text version of one SongLine, for the "Copy for
// Telegram" button below. SongLine itself renders rank/song-artist/date/
// status as separate flex spans that wrap onto their own visual line
// once the panel gets narrow — fine on screen, but per explicit report
// ("tab here somehow show line break in telegram text box"), copying
// that on-screen text (the only way to get it into Telegram before this
// button existed) copied each wrapped line as its own line in the
// clipboard, turning one song into 4 separate lines once pasted. This
// builds the same fields as one deliberate string instead, so the
// button's output can never pick up stray wrapping.
// Round 208 — per explicit follow-up ("make the copied text also have
// a line break to separate the platform, and chart"), the Fell-off
// section's "Platform | Chart |" prefix (only place songLineText ever
// sets showChart) now sits on its own line above the song details
// instead of jammed onto the front of the same line.
function songLineText(r, showChart) {
  const songDetails = `#${r.rank} ${r.track_title}${r.artist ? ` - ${r.artist}` : ""} — ${fmtDate(r.dayIn || r.entry_date)} — ${r.status}`;
  return showChart ? `${r.platform} | ${r.chart}\n${songDetails}` : songDetails;
}

// Round 204 — builds the whole day's digest as one plain-text block,
// same order/grouping as the on-screen Report panel (digest groups, then
// the Fell-off section if there is one). Header line matches the format
// already used when sending these by hand ("Em gửi BXH hnay d.m.yyyy").
function buildReportText(digest, report, highlightConfig) {
  // Reuses fmtDate (same "YYYY-MM-DD" -> locale date-string conversion
  // already used everywhere else in this file, e.g. the on-screen "Report
  // — {fmtDate(report.today)}" heading) rather than a second, separate
  // `new Date(...)` parse — keeps this in exact sync with what's already
  // shown on screen instead of risking a different date under a different
  // parsing path. Only reformats fmtDate's "27/8/2026" to the dotted
  // "27.8.2026" the team already writes by hand ("hnay 27.8.2026").
  const lines = [`Em gửi BXH hnay ${fmtDate(report.today).replace(/\//g, ".")}`];
  digest.forEach((g, i) => {
    lines.push(`${i + 1}. ${g.platform} | ${g.chart} — ${g.rows.length}/${highlightConfig.chartDepth}`);
    g.rows.forEach((r) => lines.push(songLineText(r, false)));
  });
  if (report.outRows.length > 0) {
    lines.push(`Fell off since ${fmtDate(report.yesterday)}`);
    report.outRows.forEach((r) => lines.push(songLineText(r, true)));
  }
  return lines.join("\n");
}

// Round 205 — same fix as songLineText/buildReportText above, applied to
// the Highlight panel per explicit request ("same button for highlight
// table, no change, just different content"). Plain-text version of one
// HighlightLine (rank, platform|chart, title-artist, rank-change arrow —
// no date/status, matching what HighlightLine actually shows on screen).
function rankChangeText(rankChange) {
  if (!rankChange || rankChange.dir === "same") return "0";
  return rankChange.dir === "up" ? `↑${rankChange.amount}` : `↓${rankChange.amount}`;
}
// Round 208 — same line-break-before-song-details treatment as
// songLineText above, applied here too since every HighlightLine always
// shows its platform|chart (there's no non-showChart variant on this
// side).
function highlightLineText(r) {
  return `${r.platform} | ${r.chart}\n#${r.rank} ${r.track_title}${r.artist ? ` - ${r.artist}` : ""} ${rankChangeText(r.rankChange)}`;
}

// Round 205 — builds the whole Highlight panel as one plain-text block,
// same sections/order as on screen: the 3 HighlightSections (skipped if
// empty, same as their on-screen counterparts), then the Chart Highlight
// summary if there is one.
function buildHighlightText(highlight, highlightConfig) {
  const lines = [];
  const section = (title, rows) => {
    if (rows.length === 0) return;
    lines.push(title);
    rows.forEach((r) => lines.push(highlightLineText(r)));
  };
  section("Bắt Đầu Vào Chart", highlight.inRows);
  section("Quay Lại Chart", highlight.returnRows);
  section(`Thăng Hạng (lên top ${highlightConfig.climbToRankHighlight}) / Top ${highlightConfig.topRankAlwaysHighlight}`, highlight.topRows);
  if (highlight.chartSummary.length > 0) {
    lines.push("Chart Highlight");
    highlight.chartSummary.forEach(({ platform, charts }) => {
      lines.push(platform);
      charts.forEach(([chart, count]) => lines.push(`${chart} — ${count}/${highlightConfig.chartDepth}`));
    });
  }
  return lines.join("\n");
}

// Round 127 — the Report tab, rebuilt to match the real system's "report"
// + "Highlight" sheets side by side, per explicit request ("showing side
// by side for comparison is preferred"). Left = the full digest (every
// today row, grouped by platform/chart, numbered — same shape as the
// real report!A:I sheet). Right = Highlight (the config-driven
// IN/climbed/RETURN sections plus the per-platform Chart Highlight
// summary — same shape as the real Highlight sheet's O4 TEXTJOIN digest).
function ReportAndHighlight({ digest, highlight, report, highlightConfig }) {
  const isMobile = useIsMobile();
  // Round 204 — brief "Copied!" confirmation on the button itself so a
  // click gives visible feedback without a popup/alert interrupting the
  // flow of copy → switch to Telegram → paste.
  const [copied, setCopied] = useState(false);
  function handleCopyReport() {
    navigator.clipboard?.writeText(buildReportText(digest, report, highlightConfig)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  // Round 205 — separate copied/handler pair for the Highlight panel
  // (its own button, own text builder) — kept independent of the Report
  // panel's so each button's "Copied!" only shows on the button actually
  // clicked, not both at once.
  const [copiedHighlight, setCopiedHighlight] = useState(false);
  function handleCopyHighlight() {
    navigator.clipboard?.writeText(buildHighlightText(highlight, highlightConfig)).then(() => {
      setCopiedHighlight(true);
      setTimeout(() => setCopiedHighlight(false), 1500);
    });
  }
  if (report.todayRows.length === 0) {
    return <div className={styles.emptyState}>No entries for today ({fmtDate(report.today)}) yet — use the Input tab.</div>;
  }
  return (
    <div style={{ display: "flex", gap: 16, flexDirection: isMobile ? "column" : "row", alignItems: "flex-start" }}>
      {/* Report — full digest */}
      <div style={{ flex: 1, minWidth: 0, width: isMobile ? "100%" : undefined, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#ff6b1a", textTransform: "uppercase" }}>Report — {fmtDate(report.today)}</div>
          <button className={styles.btnSmall} onClick={handleCopyReport}>{copied ? "Copied!" : "Copy for Telegram"}</button>
        </div>
        {digest.map((g, i) => (
          <div key={`${g.platform}||${g.chart}`} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
              {i + 1}. {g.platform} | {g.chart} — {g.rows.length}/{highlightConfig.chartDepth}
            </div>
            {g.rows.map((r) => <SongLine key={r.id} r={r} />)}
          </div>
        ))}
        {report.outRows.length > 0 && (
          <div style={{ marginTop: 14, borderTop: "1px dashed var(--border-strong)", paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", marginBottom: 4, textTransform: "uppercase" }}>
              Fell off since {fmtDate(report.yesterday)}
            </div>
            {report.outRows.map((r) => <SongLine key={r.id} r={r} showChart />)}
          </div>
        )}
      </div>

      {/* Highlight */}
      <div style={{ flex: 1, minWidth: 0, width: isMobile ? "100%" : undefined, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#ff6b1a", textTransform: "uppercase" }}>Highlight</div>
          <button className={styles.btnSmall} onClick={handleCopyHighlight}>{copiedHighlight ? "Copied!" : "Copy for Telegram"}</button>
        </div>

        <HighlightSection title="Bắt Đầu Vào Chart" rows={highlight.inRows} />
        <HighlightSection title="Quay Lại Chart" rows={highlight.returnRows} />
        <HighlightSection title={`Thăng Hạng (lên top ${highlightConfig.climbToRankHighlight}) / Top ${highlightConfig.topRankAlwaysHighlight}`} rows={highlight.topRows} />

        {highlight.chartSummary.length > 0 && (
          <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", marginBottom: 6, textTransform: "uppercase" }}>Chart Highlight</div>
            {highlight.chartSummary.map(({ platform, charts }) => (
              <div key={platform} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#ff9d5c", marginBottom: 2 }}>{platform}</div>
                {charts.map(([chart, count]) => (
                  <div key={chart} style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {chart} — {count}/{highlightConfig.chartDepth}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HighlightSection({ title, rows }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", marginBottom: 4, textTransform: "uppercase" }}>{title}</div>
      {rows.map((r) => <HighlightLine key={r.id} r={r} />)}
    </div>
  );
}

function LogTable({ entries }) {
  const [artistFilter, setArtistFilter] = useState("");
  const [songFilter, setSongFilter] = useState("");

  // Round 221 — corrected per explicit follow-up: round 220 kept date as
  // the primary sort (newest first) and only used rank to break ties on
  // the exact same date, which in practice meant this filter showed the
  // LATEST entry first, not the best one — not what "highest rank
  // first" was actually asking for. Rank ascending is now the primary
  // sort (the whole point of typing an artist/song filter here is
  // usually "what's the best this has ever charted"), with date as the
  // tiebreaker only when two rows land on the exact same rank.
  const filtered = entries
    .filter((e) =>
      (!artistFilter || (e.artist || "").toLowerCase().includes(artistFilter.toLowerCase())) &&
      (!songFilter || (e.track_title || "").toLowerCase().includes(songFilter.toLowerCase()))
    )
    .sort((a, b) => a.rank - b.rank || b.entry_date.localeCompare(a.entry_date));

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input className={styles.input} style={{ maxWidth: 220 }} placeholder="Filter artist…" value={artistFilter} onChange={(e) => setArtistFilter(e.target.value)} />
        <input className={styles.input} style={{ maxWidth: 220 }} placeholder="Filter song…" value={songFilter} onChange={(e) => setSongFilter(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <div className={styles.emptyState}>No results.</div>
      ) : (
        <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead><tr><th>Date</th><th>Chart</th><th>Song</th><th>Artist</th><th>Rank</th><th>Platform</th><th>DID</th></tr></thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.entry_date)}</td>
                  <td style={{ fontSize: 11 }}>{e.chart}</td>
                  <td>{e.track_title}</td>
                  <td>{e.artist || "—"}</td>
                  <td>#{e.rank}</td>
                  <td>{e.platform}</td>
                  <td style={{ fontSize: 11, color: "var(--text-faint)" }}>{e.did || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Round 201 — Song/Artist swapped from plain single-line <input>s to
// this, per explicit request: wider fields that GROW IN HEIGHT (wrap to
// a second/third line, same as a textarea) once typed content outruns
// the width, instead of silently scrolling sideways inside a fixed-height
// box the way a native <input> always does — a native input can't wrap
// at all, so a textarea is the only way to get that. Auto-resize is the
// classic two-step: reset height to "auto" so scrollHeight reports the
// CURRENT content's real height (otherwise it only ever reports the
// tallest height this element has ever had), then set height to that.
// Runs on every value change AND once on mount, so a row that already
// has a long title (loaded from today's saved data, or carried forward
// from yesterday) starts at the right height instead of a single blank
// line that only grows the next time it's typed into.
function AutoGrowField({ value, onChange, style, ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={onChange}
      style={{ resize: "none", overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.4, ...style }}
      {...props}
    />
  );
}

function ChartEntryPopup({ platform, onClose, onSave, entries }) {
  const isMobile = useIsMobile();
  const charts = PLATFORM_CHARTS[platform];
  const [activeChart, setActiveChart] = useState(charts[0]);
  // Round 171 — per explicit request: pre-fill from whatever's already
  // saved for TODAY (same date saveRows always writes to) instead of
  // always starting blank, so re-opening this popup shows what's already
  // there for review/completion rather than risking a re-typed row typo.
  // Saving still upserts on the natural key (chart, track_title, artist,
  // entry_date — see saveRows), so editing a pre-filled row updates it in
  // place; nothing here can create a duplicate. Charts with nothing saved
  // yet for today are left out of this initial map entirely, so the
  // existing "one blank starter row" fallback below still applies to
  // them exactly as before.
  // Round 174 — a chart with nothing saved yet TODAY now falls back to the
  // most recent PRIOR day's row list (song/artist/DID carried over, rank
  // deliberately blanked — "swipe the number, leave the row intact")
  // instead of one lone blank row, per explicit report that a fresh day
  // meant retyping every previously-tracked song from scratch. Both
  // branches respect sort_order (see sortByOrder above).
  const [rowsByChart, setRowsByChart] = useState(() => {
    const today = todayStr();
    const initial = {};
    charts.forEach((c) => {
      const todays = (entries || []).filter((e) => e.platform === platform && e.chart === c && e.entry_date === today);
      if (todays.length > 0) {
        initial[c] = sortByOrder(todays).map((e) => ({ track_title: e.track_title || "", artist: e.artist || "", rank: e.rank != null ? String(e.rank) : "", did: e.did || "" }));
      } else {
        const prior = findPriorRows(entries || [], platform, c, today);
        if (prior && prior.length > 0) {
          initial[c] = prior.map((e) => ({ track_title: e.track_title || "", artist: e.artist || "", rank: "", did: e.did || "" }));
        }
      }
    });
    return initial;
  });
  // Round 195 — "Rewind" reference panel. Round 194 made Save a full
  // replace (a row removed from the popup is genuinely gone from the
  // database once saved — "any save that delete by user saving is on
  // them"), so this exists purely as a fast, no-retype way to look at
  // what used to be there and pull a row back in with one click, not to
  // auto-recover anything. Two sources, both already sitting in memory
  // (no extra DB read — `entries` already holds every date's rows):
  // yesterday's saved rows for the active chart (recomputed live per
  // chart below, since "yesterday" never changes while this popup is
  // open — no need to snapshot it), and a ONE-TIME snapshot of today's
  // rows exactly as they were loaded when this popup opened, captured
  // once here and never updated as the user edits. Per explicit request
  // ("keep the rewind temporary for them") this only ever lives in this
  // component's own state — never written to the database — so it's
  // gone the moment this popup closes.
  const [rewindToday] = useState(() => {
    const today = todayStr();
    const initial = {};
    charts.forEach((c) => {
      const todays = (entries || []).filter((e) => e.platform === platform && e.chart === c && e.entry_date === today);
      if (todays.length > 0) {
        initial[c] = sortByOrder(todays).map((e) => ({ track_title: e.track_title || "", artist: e.artist || "", rank: e.rank != null ? String(e.rank) : "", did: e.did || "" }));
      }
    });
    return initial;
  });
  // Round 174 — off by default so the reorder controls don't clutter the
  // table or risk an accidental tap during normal typing; per explicit
  // request, gated behind a toggle switch rather than always shown.
  const [reorderMode, setReorderMode] = useState(false);
  // Round 177 — per explicit request, the old ↑/↓ button pair is now a
  // single drag handle (native HTML5 drag-and-drop) — dragIndex tracks
  // which row is currently being dragged so the drop target can reorder
  // relative to it.
  const [dragIndex, setDragIndex] = useState(null);

  const rows = rowsByChart[activeChart] || [{ track_title: "", artist: "", rank: "", did: "" }];

  // Round 202 — fix for "2 out of 5 it doesn't save, just returns blank".
  // handleSaveAll below used to loop over EVERY chart in `rowsByChart`, not
  // just the one the user actually worked on. Round 174's carry-forward
  // feature pre-populates rowsByChart for every chart that has today's OR
  // a prior day's rows, with rank left blank on carry-forward — so any
  // chart the user never touched this session still had payload.length
  // === 0 in saveRows (see parent), whose unconditional delete-before-
  // check then wiped that chart's real, already-saved data for today with
  // nothing re-inserted. touchedCharts tracks which charts were actually
  // edited in THIS popup session so handleSaveAll can skip (not delete,
  // not even call onSave for) every chart the user never touched.
  const [touchedCharts, setTouchedCharts] = useState(() => new Set());

  function setRows(newRows) {
    setRowsByChart((prev) => ({ ...prev, [activeChart]: newRows }));
    setTouchedCharts((prev) => (prev.has(activeChart) ? prev : new Set(prev).add(activeChart)));
  }
  function updateRow(i, field, value) {
    const next = [...rows];
    next[i] = { ...next[i], [field]: value };
    setRows(next);
  }
  // Round 177 — replaces round 174's moveRow (adjacent swap only) with a
  // real move-to-position, since a drag can drop a row anywhere in the
  // list, not just one slot up/down. Same deal as before: the new array
  // order IS the new sort_order, persisted on the next Save (see
  // saveRows' payload mapping above) — no separate "confirm order" step.
  function reorderRows(from, to) {
    if (from == null || to == null || from === to) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setRows(next);
  }
  // Round 195 — appends a Rewind row back into the active chart's live
  // table. `keepRank` is true only for the "Today (before edit)" tab,
  // where the rank shown is real and worth restoring as-is (a fast
  // undo); the "Yesterday" tab always blanks the rank on restore, same
  // convention as the round-174 carry-forward fallback below — a prior
  // day's rank isn't necessarily today's, so it's left for the user to
  // retype rather than silently reused.
  function restoreRow(row, keepRank) {
    setRows([...rows, { track_title: row.track_title || "", artist: row.artist || "", rank: keepRank ? row.rank || "" : "", did: row.did || "" }]);
  }
  // Round 195 — recomputed live per render (not snapshotted like
  // rewindToday above) since "yesterday" is fixed data that can't change
  // while this popup is open; reuses the same prior-day lookup the
  // round-174 carry-forward fallback already relies on.
  const priorRows = (findPriorRows(entries || [], platform, activeChart, todayStr()) || [])
    .map((e) => ({ track_title: e.track_title || "", artist: e.artist || "", rank: e.rank != null ? String(e.rank) : "", did: e.did || "" }));
  // Round 182 — fix for "rows getting deleted, some retain, some don't"
  // (a real bug, not user error): this used to compute `next` off the
  // `rows` closure captured at the moment the DID input was blurred, then
  // call setRows(next) only after awaiting a network round-trip (the
  // releases lookup). Any edit made to this chart's rows WHILE that
  // lookup was in flight — typing in another row, adding/deleting a row,
  // dragging a reorder — got silently clobbered the instant this resolved
  // and wrote back its now-stale snapshot, overwriting whatever the user
  // had done in the meantime. Classic stale-closure race, and exactly
  // "quirky": only reproduces when a DID lookup happens to still be
  // pending when something else touches the same chart's rows. Fixed by
  // reading and writing through setRowsByChart's functional updater, so
  // this always applies its patch on top of whatever `rowsByChart` state
  // is CURRENT when the lookup resolves, not a snapshot from before it
  // started. Also now bails out safely (no-op) if the row at index `i`
  // no longer exists by then (e.g. it was deleted while the lookup was
  // in flight) instead of writing into an out-of-bounds hole.
  async function handleDidBlur(i, did, chart) {
    if (!did.trim()) return;
    const { data } = await supabase.from("releases").select("title, main_artist").eq("did", did.trim()).maybeSingle();
    if (!data) return;
    setRowsByChart((prev) => {
      const currentRows = prev[chart];
      if (!currentRows || !currentRows[i]) return prev;
      const next = [...currentRows];
      const row = { ...next[i] };
      if (!row.track_title) row.track_title = data.title;
      if (!row.artist) row.artist = data.main_artist;
      next[i] = row;
      return { ...prev, [chart]: next };
    });
    // Round 202 — this auto-fill is a real edit too; mark the chart touched
    // so a save afterward doesn't skip it (see touchedCharts above).
    setTouchedCharts((prev) => (prev.has(chart) ? prev : new Set(prev).add(chart)));
  }

  // Round 178 — fix for "rows aren't persisting after Save + reopen",
  // per explicit report. onSave (saveRows in the parent) is async — it
  // awaits the upsert, THEN calls the parent's load() to refresh
  // `entries`. This used to fire every chart's onSave with no await at
  // all (fire-and-forget) and close the popup immediately afterward:
  // closing unmounts this popup instantly, well before any of those
  // network round-trips even started resolving, so a quick reopen built
  // its initial rowsByChart from the parent's STILL-STALE `entries` prop
  // (the just-typed rows genuinely were saved server-side, just not
  // reflected back into this popup yet) — reading as "it didn't save".
  // Awaiting each save in sequence (not Promise.all) guarantees every
  // upsert AND its own reload have both finished — in particular the
  // LAST chart's reload only fires once every earlier chart's upsert has
  // already committed, so it reflects the complete picture — before
  // onClose() ever runs.
  const [saving, setSaving] = useState(false);
  async function handleSaveAll() {
    if (saving) return;
    setSaving(true);
    try {
      // Round 202 — only save charts the user actually touched this
      // session (see touchedCharts above). A chart sitting untouched in
      // rowsByChart is either today's already-saved data (nothing to do)
      // or a carry-forward preview with blank ranks (not real data yet)
      // — saving either one would hit saveRows' unconditional delete and
      // silently wipe that chart's existing rows for today.
      for (const [chart, chartRows] of Object.entries(rowsByChart)) {
        if (!touchedCharts.has(chart)) continue;
        await onSave(platform, chart, chartRows);
      }
      onClose();
    } catch {
      // Round 182 — saveRows now throws (after alerting) on a real
      // upsert failure instead of failing silently — catch it here so
      // the popup stays open (nothing was closed/lost) and the button
      // re-enables for another try, instead of the whole save flow
      // dying with an unhandled rejection.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      {/* Round 202 — widened again (was maxWidth 1000, round 195) per
          direct report that the table's Song(200)/Artist(150)/Rank(60)/
          DID(100) columns — round 201's wider Song/Artist plus the
          existing Rewind panel — no longer fit without an internal
          horizontal scrollbar cutting off DID. "min(…, calc(100vw -
          40px))" matches the same responsive idiom this app's other
          popups already use (e.g. lib/NewArtistProfileTicketPopup.js). */}
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 0, width: isMobile ? "100%" : "min(1360px, calc(100vw - 40px))", maxHeight: "85vh", display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: isMobile ? "100%" : 200, maxHeight: isMobile ? 140 : undefined, borderRight: isMobile ? "none" : "1px solid var(--border)", borderBottom: isMobile ? "1px solid var(--border)" : "none", overflowY: "auto", flexShrink: 0 }}>
          <div style={{ padding: 14, fontSize: 13, fontWeight: 800 }}>{platform}</div>
          {charts.map((c) => {
            const filled = (rowsByChart[c] || []).filter((r) => r.track_title).length;
            return (
              <button
                key={c}
                onClick={() => setActiveChart(c)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "8px 14px", fontSize: 11,
                  background: activeChart === c ? "var(--bg-hover)" : "transparent",
                  borderLeft: activeChart === c ? "3px solid var(--accent)" : "3px solid transparent",
                  border: "none", cursor: "pointer", color: activeChart === c ? "var(--accent)" : "var(--text)",
                }}
              >
                {c} {filled > 0 && <span style={{ color: "var(--success-fg)" }}>●</span>}
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-faint)" }}>{activeChart}</div>
              {/* Round 155 item 1h — tool button placed right next to the
                  active chart's own tab name, not the topbar, per explicit
                  request ("so many of them"). Desktop only (isMobile check
                  above); simply doesn't render for a chart with no
                  confirmed URL yet (see lib/milestoneChartLinks.js's own
                  comment for the still-open list) rather than showing a
                  dead link. */}
              {!isMobile && MILESTONE_CHART_LINKS[activeChart] && (
                <a
                  href={MILESTONE_CHART_LINKS[activeChart]}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.btnSmall}
                  style={{ textDecoration: "none", fontSize: 10, padding: "2px 8px" }}
                >
                  🔗 Tool
                </a>
              )}
              {/* Round 174 — off by default; per explicit request the
                  reorder controls (a drag handle per row, round 177) live
                  behind this toggle rather than always showing, one flag
                  for the whole popup (not per-chart) since switching tabs
                  is already a clean context break. */}
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-faint)", cursor: "pointer", userSelect: "none" }}>
                <input type="checkbox" checked={reorderMode} onChange={(e) => setReorderMode(e.target.checked)} />
                Reorder
              </label>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 18, cursor: "pointer" }}>✕</button>
          </div>
          <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
            <table className={styles.table} style={{ marginBottom: 10 }}>
              <thead><tr>{reorderMode && <th></th>}<th>Song</th><th>Artist</th><th>Rank</th><th>DID</th><th></th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    // Round 177 — the row itself is the drop target (drag
                    // can start ONLY from the handle below, via its own
                    // draggable=true — the row isn't draggable as a
                    // whole, so clicking/typing in its inputs is
                    // unaffected). onDragOver must preventDefault or the
                    // browser never fires onDrop.
                    onDragOver={reorderMode ? (e) => e.preventDefault() : undefined}
                    onDrop={reorderMode ? (e) => { e.preventDefault(); reorderRows(dragIndex, i); setDragIndex(null); } : undefined}
                    style={reorderMode && dragIndex === i ? { opacity: 0.5 } : undefined}
                  >
                    {reorderMode && (
                      <td>
                        <span
                          draggable
                          onDragStart={() => setDragIndex(i)}
                          onDragEnd={() => setDragIndex(null)}
                          title="Drag to reorder"
                          style={{ display: "inline-flex", flexDirection: "column", gap: 3, padding: "6px 7px", border: "1px solid var(--border)", borderRadius: 4, cursor: "grab" }}
                        >
                          <span style={{ width: 13, height: 2, background: "var(--text-faint)", borderRadius: 1 }} />
                          <span style={{ width: 13, height: 2, background: "var(--text-faint)", borderRadius: 1 }} />
                          <span style={{ width: 13, height: 2, background: "var(--text-faint)", borderRadius: 1 }} />
                        </span>
                      </td>
                    )}
                    {/* Round 201 — Song is 2x, Artist 1.5x the app's
                        common 100px field unit (the DID field two
                        columns over is exactly that unit, unchanged) —
                        both now auto-grow in height via AutoGrowField
                        instead of scrolling sideways once text outruns
                        the width. */}
                    <td><AutoGrowField className={styles.input} style={{ padding: "4px 6px", fontSize: 12, width: 200 }} value={r.track_title} onChange={(e) => updateRow(i, "track_title", e.target.value)} /></td>
                    <td><AutoGrowField className={styles.input} style={{ padding: "4px 6px", fontSize: 12, width: 150 }} value={r.artist} onChange={(e) => updateRow(i, "artist", e.target.value)} /></td>
                    <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 12, width: 60 }} value={r.rank} onChange={(e) => updateRow(i, "rank", e.target.value)} /></td>
                    <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 12, width: 100 }} value={r.did} onChange={(e) => updateRow(i, "did", e.target.value)} onBlur={(e) => handleDidBlur(i, e.target.value, activeChart)} /></td>
                    <td><button onClick={() => setRows(rows.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className={styles.btnSmall} onClick={() => setRows([...rows, { track_title: "", artist: "", rank: "", did: "" }])}>+ Add row</button>
          <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <button className={styles.btnPrimary} onClick={handleSaveAll} disabled={saving} style={saving ? { opacity: 0.6, cursor: "not-allowed" } : undefined}>
              {saving ? "Saving…" : "Save All Charts"}
            </button>
          </div>
        </div>
        {/* Round 195 — Rewind panel sits right next to the main table,
            same as the chart-list sidebar on the other side, per explicit
            request. Stacks below on mobile since the whole popup already
            drops to a column layout there. */}
        <div style={{ width: isMobile ? "100%" : 240, maxHeight: isMobile ? 220 : undefined, borderLeft: isMobile ? "none" : "1px solid var(--border)", borderTop: isMobile ? "1px solid var(--border)" : "none", overflowY: "auto", flexShrink: 0, padding: 14 }}>
          <RewindPanel priorRows={priorRows} todayBefore={rewindToday[activeChart] || []} onRestore={restoreRow} />
        </div>
      </div>
    </div>
  );
}

// Round 195 — read-only reference list with a one-click restore per row;
// never auto-applies anything to the live table on its own. See the
// `rewindToday`/`priorRows` comments in ChartEntryPopup above for what
// each tab actually sources.
function RewindPanel({ priorRows, todayBefore, onRestore }) {
  const [tab, setTab] = useState("today");
  const list = tab === "today" ? todayBefore : priorRows;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", marginBottom: 8 }}>Rewind</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button
          onClick={() => setTab("today")}
          className={styles.btnSmall}
          style={{ fontSize: 10, padding: "3px 8px", background: tab === "today" ? "var(--bg-hover)" : "transparent" }}
        >
          Today (before edit)
        </button>
        <button
          onClick={() => setTab("yesterday")}
          className={styles.btnSmall}
          style={{ fontSize: 10, padding: "3px 8px", background: tab === "yesterday" ? "var(--bg-hover)" : "transparent" }}
        >
          Yesterday
        </button>
      </div>
      {list.length === 0 && <div style={{ fontSize: 10, color: "var(--text-faint)" }}>Nothing here.</div>}
      {list.map((r, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, fontSize: 10, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${r.track_title}${r.artist ? ` - ${r.artist}` : ""}`}>
            <span style={{ fontWeight: 700 }}>{r.rank || "–"}</span> {r.track_title}{r.artist ? ` - ${r.artist}` : ""}
          </div>
          <button
            title="Add this row back into the table"
            onClick={() => onRestore(r, tab === "today")}
            style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", flexShrink: 0, fontSize: 13 }}
          >
            ↩
          </button>
        </div>
      ))}
    </div>
  );
}
