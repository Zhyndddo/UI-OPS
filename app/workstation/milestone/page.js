"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import { useIsMobile } from "../../../lib/useIsMobile";
import { MILESTONE_HIGHLIGHT_SETTING_KEY, DEFAULT_MILESTONE_HIGHLIGHT_CONFIG, parseMilestoneHighlightConfig } from "../../../lib/milestoneHighlight";
import styles from "../../shared.module.css";

// Real platform → chart lists, straight from v1's MILESTONE_PLATFORM_TABS.
const PLATFORM_CHARTS = {
  Zing: ["ZMP3|ZING CHART", "ZMP3|BXH NHẠC MỚI"],
  Spotify: ["WEEKLY TOP ALBUM", "WEEKLY TOP ARTIST", "WEEKLY TOP SONG", "DAILY TOP SONG", "DAILY TOP ARTIST", "DAILY VIRAL SONGs", "HANOI", "LOCAL PULSE - HANOI", "HOCHIMINH CITY", "LOCAL PULSE - HOCHIMINH CITY", "Playlist NEW MUSIC FRIDAY VIETNAM", "Playlist Fresh Find Vietnam", "Playlist Vsound Ngay Lúc Này", "Playlist Thiên Hạ Nghe Gì"],
  Apple: ["Playlist Vietnam Ơi!", "Playlist New Music Daily", "APPLE MUSIC - Top ALBUMs Vietnam", "APPLE MUSIC - Top POP Albums", "APPLE MUSIC -Top HIPHOP/RAP Albums", "APPLE MUSIC - Top DANCE Albums", "APPLE MUSIC - Top ALTERNATIVE Albums", "Apple Music - Top Songs Vietnam", "Apple Music - Top POP Songs", "Apple - Top Alternative Songs", "Apple Music - Top Dance Songs", "Apple Music - Top Hiphop/Rap Songs"],
  TikTok: ["TIKTOK POPULAR", "TIKTOK BREAKOUT", "TIKTOK HOT"],
  Instagram: ["INSTAGRAM"],
  YouTube: ["YOUTUBE CHARTS | TOP SONGS WEEKLY", "YOUTUBE CHARTS | TOP ARTISTS WEEKLY", "YOUTUBE CHARTS | TOP SONGS DAILY", "YOUTUBE CHARTS | VIETNAM TRENDING MUSIC", "YOUTUBE CHARTS | Top Video Trending on YTB"],
  Shazam: ["Shazam Top Songs"],
};
const PLATFORMS = Object.keys(PLATFORM_CHARTS);

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgoStr(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
const key = (chart, track, artist) => `${chart}|${track}|${artist}`.replace(/\s+/g, "").toLowerCase();

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
      .map((r) => ({
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
      }));
    if (payload.length === 0) return;
    // Real upsert on the natural key so re-entering today's numbers for
    // the same chart/song just updates rather than duplicating.
    await supabase.from("milestone_chart_entries").upsert(payload, { onConflict: "chart,track_title,artist,entry_date" });
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
        <ChartEntryPopup platform={openPlatform} onClose={() => setOpenPlatform(null)} onSave={saveRows} />
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

function ChartEntryPopup({ platform, onClose, onSave }) {
  const isMobile = useIsMobile();
  const charts = PLATFORM_CHARTS[platform];
  const [activeChart, setActiveChart] = useState(charts[0]);
  const [rowsByChart, setRowsByChart] = useState({});

  const rows = rowsByChart[activeChart] || [{ track_title: "", artist: "", rank: "", did: "" }];

  function setRows(newRows) {
    setRowsByChart((prev) => ({ ...prev, [activeChart]: newRows }));
  }
  function updateRow(i, field, value) {
    const next = [...rows];
    next[i] = { ...next[i], [field]: value };
    setRows(next);
  }
  async function handleDidBlur(i, did) {
    if (!did.trim()) return;
    const { data } = await supabase.from("releases").select("title, main_artist").eq("did", did.trim()).maybeSingle();
    if (data) {
      const next = [...rows];
      if (!next[i].track_title) next[i].track_title = data.title;
      if (!next[i].artist) next[i].artist = data.main_artist;
      setRows(next);
    }
  }

  function handleSaveAll() {
    Object.entries(rowsByChart).forEach(([chart, chartRows]) => {
      onSave(platform, chart, chartRows);
    });
    onClose();
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
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-faint)" }}>{activeChart}</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 18, cursor: "pointer" }}>✕</button>
          </div>
          <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
            <table className={styles.table} style={{ marginBottom: 10 }}>
              <thead><tr><th>Song</th><th>Artist</th><th>Rank</th><th>DID</th><th></th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 12 }} value={r.track_title} onChange={(e) => updateRow(i, "track_title", e.target.value)} /></td>
                    <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 12 }} value={r.artist} onChange={(e) => updateRow(i, "artist", e.target.value)} /></td>
                    <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 12, width: 60 }} value={r.rank} onChange={(e) => updateRow(i, "rank", e.target.value)} /></td>
                    <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 12, width: 100 }} value={r.did} onChange={(e) => updateRow(i, "did", e.target.value)} onBlur={(e) => handleDidBlur(i, e.target.value)} /></td>
                    <td><button onClick={() => setRows(rows.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className={styles.btnSmall} onClick={() => setRows([...rows, { track_title: "", artist: "", rank: "", did: "" }])}>+ Add row</button>
          <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <button className={styles.btnPrimary} onClick={handleSaveAll}>Save All Charts</button>
          </div>
        </div>
      </div>
    </div>
  );
}
