"use client";

import { useEffect, useMemo, useState } from "react";
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
  Apple: ["Playlist Vietnam Ơi!", "Playlist New Music Daily", "APPLE MUSIC - Top ALBUMs Vietnam", "APPLE MUSIC - Top POP Albums", "APPLE MUSIC -Top HIPHOP/RAP Albums", "APPLE MUSIC - Top DANCE Albums", "APPLE MUSIC - Top ALTERNATIVE Albums", "Apple Music - Top Songs Vietnam", "Apple Music - Top POP Songs", "Apple - Top Alternative Songs", "Apple Music - Top Dance Songs", "Apple Music - Top Hiphop/Rap Songs", "Vietnam iTunes Top Songs", "Apple Daily Album"],
  TikTok: ["TIKTOK POPULAR", "TIKTOK BREAKOUT", "TIKTOK HOT"],
  Instagram: ["INSTAGRAM"],
  // Round 171 — 5 new charts added, same reasoning as Apple's two above:
  // real recurring volume in the historical import (398/106/70/113/82
  // rows respectively, each already a merge of several inconsistently-
  // named variants of the same underlying chart — see CHART_MAP) with no
  // existing entry here to land in.
  YouTube: ["YOUTUBE CHARTS | TOP SONGS WEEKLY", "YOUTUBE CHARTS | TOP ARTISTS WEEKLY", "YOUTUBE CHARTS | TOP SONGS DAILY", "YOUTUBE CHARTS | VIETNAM TRENDING MUSIC", "YOUTUBE CHARTS | Top Video Trending on YTB", "YOUTUBE CHARTS | Top Videos Daily", "YOUTUBE CHARTS | Daily Top Songs on Shorts", "YOUTUBE CHARTS | Weekly Top Music Videos", "PLAYLIST YOUTUBE | The Hit List", "PLAYLIST YOUTUBE | RELEASED"],
  Shazam: ["Shazam Top Songs"],
};
const PLATFORMS = Object.keys(PLATFORM_CHARTS);

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgoStr(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
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
      .filter((r) => r.track_title?.trim())
      .map((r, i) => ({
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
        track_title: r.track_title.trim(), artist: r.artist?.trim() || "",
        rank: parseInt(r.rank, 10) || 0, did: r.did?.trim() || null,
        // Round 174 — persists this row's position in the popup's own
        // list (see sortByOrder above) — index is taken AFTER the
        // blank-title filter above, so it's always a clean 0..N-1 over
        // just the rows that actually saved. Every save writes this
        // (not just ones that touched the reorder buttons), so a row
        // naturally picks up a real value the next time it's touched.
        sort_order: i,
      }));
    if (payload.length === 0) return;
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
    // Real upsert on the natural key so re-entering today's numbers for
    // the same chart/song just updates rather than duplicating.
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
    const outRows = yesterdayRows
      .filter((r) => !todayKeys.has(key(r.chart, r.track_title, r.artist)))
      .map((r) => ({ ...r, status: "OUT", streak: streakEndingYesterday(key(r.chart, r.track_title, r.artist)) + 1, rankChange: null, dayIn: null, entry_date: yesterday }));

    return { today, yesterday, todayRows, outRows };
  }, [entries]);

  // Round 127 — the "Highlight" rule set (see lib/milestoneHighlight.js),
  // computed straight from report.todayRows using the admin-editable
  // thresholds. A row counts as highlight-worthy when ANY of: it's IN,
  // it's RETURN, its rank is exactly #1, or it's REMAIN + climbed + at or
  // better than highlightConfig.topNRank — matches the real Highlight
  // sheet's filter formula exactly, just with the two hardcoded numbers
  // (5, and the excluded-charts/min-count pair below) now configurable.
  const highlight = useMemo(() => {
    const isHighlighted = (r) =>
      r.status === "IN" || r.status === "RETURN" || r.rank === 1 ||
      (r.status === "REMAIN" && r.rankChange?.dir === "up" && r.rank <= highlightConfig.topNRank);

    const inRows = report.todayRows.filter((r) => r.status === "IN");
    const climbedRows = report.todayRows.filter((r) => r.status === "REMAIN" && r.rankChange?.dir === "up" && r.rank <= highlightConfig.topNRank);
    const returnRows = report.todayRows.filter((r) => r.status === "RETURN");
    // #1 rows are always highlighted but may already be IN/RETURN/climbed
    // above — only add rows here that wouldn't otherwise be listed
    // (a REMAIN #1 that didn't climb, e.g. held #1 from yesterday).
    const alreadyListed = new Set([...inRows, ...climbedRows, ...returnRows]);
    const topOneOnlyRows = report.todayRows.filter((r) => r.rank === 1 && !alreadyListed.has(r));

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
    chartSummary.sort((a, b) => a.platform.localeCompare(b.platform));

    return { inRows, climbedRows, returnRows, topOneOnlyRows, chartSummary, isHighlighted };
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
    return [...groups.values()].sort((a, b) => a.platform.localeCompare(b.platform) || a.chart.localeCompare(b.chart));
  }, [report]);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1200 }}>
          <TypeSwitcher kind="workstation" current="milestone" />
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 16 }}>Milestone</h1>

          <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
            {[["input", "Input"], ["report", "Report"], ["log", "Log"]].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`${styles.tabBtn} ${tab === k ? styles.tabBtnActive : ""}`} style={{ border: "1px solid var(--border)", borderRadius: 6 }}>
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
      {showChart && <span style={{ color: "#ff9d5c" }}>{r.chart} |</span>}
      <span>{r.track_title}{r.artist ? ` - ${r.artist}` : ""}</span>
      {r.dayIn && <span style={{ color: "var(--text-faint)" }}>{fmtDate(r.dayIn)}</span>}
      {r.rankChange && <RankChangeArrow rankChange={r.rankChange} />}
      <span style={{ color: TAG_COLOR[r.status], fontWeight: 700 }}>{r.status}</span>
    </div>
  );
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
  if (report.todayRows.length === 0) {
    return <div className={styles.emptyState}>No entries for today ({fmtDate(report.today)}) yet — use the Input tab.</div>;
  }
  return (
    <div style={{ display: "flex", gap: 16, flexDirection: isMobile ? "column" : "row", alignItems: "flex-start" }}>
      {/* Report — full digest */}
      <div style={{ flex: 1, minWidth: 0, width: isMobile ? "100%" : undefined, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#ff6b1a", textTransform: "uppercase", marginBottom: 10 }}>Report — {fmtDate(report.today)}</div>
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
        <div style={{ fontSize: 12, fontWeight: 800, color: "#ff6b1a", textTransform: "uppercase", marginBottom: 10 }}>Highlight</div>

        <HighlightSection title="Bắt Đầu Vào Chart" rows={highlight.inRows} />
        <HighlightSection title={`Thăng Hạng (top ${highlightConfig.topNRank})`} rows={highlight.climbedRows} />
        <HighlightSection title="Quay Lại Chart" rows={highlight.returnRows} />
        <HighlightSection title="Giữ #1" rows={highlight.topOneOnlyRows} />

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
      {rows.map((r) => <SongLine key={r.id} r={r} showChart />)}
    </div>
  );
}

function LogTable({ entries }) {
  const [artistFilter, setArtistFilter] = useState("");
  const [songFilter, setSongFilter] = useState("");

  const filtered = entries.filter((e) =>
    (!artistFilter || (e.artist || "").toLowerCase().includes(artistFilter.toLowerCase())) &&
    (!songFilter || (e.track_title || "").toLowerCase().includes(songFilter.toLowerCase()))
  );

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

  function setRows(newRows) {
    setRowsByChart((prev) => ({ ...prev, [activeChart]: newRows }));
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
      for (const [chart, chartRows] of Object.entries(rowsByChart)) {
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
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 0, maxWidth: 780, width: "100%", maxHeight: "85vh", display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
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
                    <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 12 }} value={r.track_title} onChange={(e) => updateRow(i, "track_title", e.target.value)} /></td>
                    <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 12 }} value={r.artist} onChange={(e) => updateRow(i, "artist", e.target.value)} /></td>
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
      </div>
    </div>
  );
}
