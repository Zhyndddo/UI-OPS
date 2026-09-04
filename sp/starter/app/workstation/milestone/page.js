"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
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

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("milestone_chart_entries").select("*").order("entry_date", { ascending: false });
    setEntries(data || []);
    setLoading(false);
  }

  async function saveRows(platform, chart, rows) {
    const payload = rows
      .filter((r) => r.track_title?.trim())
      .map((r) => ({
        chart, platform, entry_date: todayStr(),
        track_title: r.track_title.trim(), artist: r.artist?.trim() || null,
        rank: parseInt(r.rank, 10) || 0, did: r.did?.trim() || null,
      }));
    if (payload.length === 0) return;
    // Real upsert on the natural key so re-entering today's numbers for
    // the same chart/song just updates rather than duplicating.
    await supabase.from("milestone_chart_entries").upsert(payload, { onConflict: "chart,track_title,artist,entry_date" });
    load();
  }

  // Same algorithm as v1's REPORT tab / the doc's refreshDashboard script —
  // computed client-side over the fetched history, not as a SQL view.
  const report = useMemo(() => {
    const today = todayStr(), yesterday = daysAgoStr(1);
    const todayRows = entries.filter((e) => e.entry_date === today);
    const yesterdayRows = entries.filter((e) => e.entry_date === yesterday);
    const todayKeys = new Set(todayRows.map((r) => key(r.chart, r.track_title, r.artist)));
    const yesterdayKeys = new Set(yesterdayRows.map((r) => key(r.chart, r.track_title, r.artist)));

    function streakCount(k) {
      const all = entries.filter((r) => key(r.chart, r.track_title, r.artist) === k).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
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

    const rows = [];
    todayRows.forEach((r) => {
      const k = key(r.chart, r.track_title, r.artist);
      let tag, streak;
      if (yesterdayKeys.has(k)) { tag = "REMAIN"; streak = streakCount(k) + 1; }
      else {
        const everAppeared = entries.some((x) => key(x.chart, x.track_title, x.artist) === k && x.entry_date < today);
        if (everAppeared) { tag = "RETURN"; streak = 1; }
        else { tag = "IN"; streak = 1; }
      }
      rows.push({ ...r, tag, streak });
    });
    yesterdayRows.forEach((r) => {
      const k = key(r.chart, r.track_title, r.artist);
      if (!todayKeys.has(k)) rows.push({ ...r, tag: "OUT", streak: streakCount(k), entry_date: yesterday });
    });
    rows.sort((a, b) => ["IN", "REMAIN", "RETURN", "OUT"].indexOf(a.tag) - ["IN", "REMAIN", "RETURN", "OUT"].indexOf(b.tag));
    return rows;
  }, [entries]);

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
            <ReportTable rows={report} />
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

function ReportTable({ rows }) {
  if (rows.length === 0) return <div className={styles.emptyState}>No data for today/yesterday yet.</div>;
  return (
    <table className={styles.table}>
      <thead><tr><th>Tag</th><th>Chart</th><th>Song</th><th>Artist</th><th>Rank</th><th>Platform</th><th>Streak</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td><span className={styles.statusBadge} style={{ color: TAG_COLOR[r.tag], background: "var(--bg-hover)" }}>{r.tag}</span></td>
            <td style={{ fontSize: 11 }}>{r.chart}</td>
            <td>{r.track_title}</td>
            <td>{r.artist || "—"}</td>
            <td>#{r.rank}</td>
            <td>{r.platform}</td>
            <td>{r.streak}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
      )}
    </div>
  );
}

function ChartEntryPopup({ platform, onClose, onSave }) {
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
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 0, maxWidth: 780, width: "100%", maxHeight: "85vh", display: "flex", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 200, borderRight: "1px solid var(--border)", overflowY: "auto", flexShrink: 0 }}>
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
          <button className={styles.btnSmall} onClick={() => setRows([...rows, { track_title: "", artist: "", rank: "", did: "" }])}>+ Add row</button>
          <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <button className={styles.btnPrimary} onClick={handleSaveAll}>Save All Charts</button>
          </div>
        </div>
      </div>
    </div>
  );
}
