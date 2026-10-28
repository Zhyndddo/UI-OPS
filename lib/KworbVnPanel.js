"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";

// Round 561 — Milestone -> "Spotify VN": our tracks on kworb's Vietnam Spotify daily chart (total streams + daily change),
// and a review popup for suspicious ones (same title / our artist). Data comes from the 12-hour cron (lib/kworbVn.js).
// Deliberately standalone: not connected to the Report tab.
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const spotifyUrl = (id) => `https://open.spotify.com/track/${id}`;
const ago = (iso) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export default function KworbVnPanel({ styles }) {
  const { profile } = useAuth();
  const [tracks, setTracks] = useState([]);
  const [snaps, setSnaps] = useState({});       // track_id -> [{chart_date,total,...}] newest first
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const [review, setReview] = useState(false);
  const [reviewTab, setReviewTab] = useState("pending");

  const load = useCallback(async () => {
    setErr("");
    const t = await supabase.from("kworb_vn_tracks").select("*").order("title");
    if (t.error) { setErr(t.error.message.includes("kworb_vn") ? "Tables missing — run add-round561-kworb-vn.sql" : t.error.message); setLoading(false); return; }
    setTracks(t.data || []);
    const since = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
    const s = await supabase.from("kworb_vn_snapshots").select("track_id, chart_date, total, days, peak, peak_streams, taken_at").gte("chart_date", since).order("chart_date", { ascending: false }).limit(5000);
    const map = {};
    (s.data || []).forEach((r) => { (map[r.track_id] = map[r.track_id] || []).push(r); });
    setSnaps(map);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const ours = useMemo(() => tracks.filter((x) => x.status === "ours"), [tracks]);
  const suspects = useMemo(() => tracks.filter((x) => x.status === "suspect"), [tracks]);
  const pending = suspects.filter((x) => !x.review);
  const lastTaken = useMemo(() => Object.values(snaps).flat().reduce((a, r) => (r.taken_at > a ? r.taken_at : a), ""), [snaps]);
  const lastChart = useMemo(() => Object.values(snaps).flat().reduce((a, r) => (r.chart_date > a ? r.chart_date : a), ""), [snaps]);

  // daily streams = total on the newest chart date minus the total on the previous one; 7-day = vs the snapshot 7+ days earlier
  function stats(id) {
    const list = snaps[id] || [];
    const cur = list[0];
    if (!cur) return {};
    const prev = list[1];
    const wk = list.find((r) => (new Date(cur.chart_date) - new Date(r.chart_date)) / 86400000 >= 7);
    const gap = prev ? Math.round((new Date(cur.chart_date) - new Date(prev.chart_date)) / 86400000) : null;
    return { cur, daily: prev ? cur.total - prev.total : null, gap, week: wk ? cur.total - wk.total : null };
  }

  async function refreshNow() {
    setBusy(true); setInfo(""); setErr("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/kworb-vn-refresh", { method: "POST", headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Refresh failed");
      setInfo(`Chart ${j.chartDate}: ${j.pageRows} rows read · ${j.ours} ours · ${j.suspects} suspects (${j.newSuspects} new)`);
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function decide(row, decision) {
    const patch = { review: decision, reviewed_by: profile?.name || null, reviewed_at: decision ? new Date().toISOString() : null };
    setTracks((cur) => cur.map((x) => (x.track_id === row.track_id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("kworb_vn_tracks").update(patch).eq("track_id", row.track_id);
    if (error) { setErr(error.message); load(); }
  }

  const shown = suspects.filter((x) => (reviewTab === "pending" ? !x.review : x.review === reviewTab));
  const th = { textAlign: "left", padding: "6px 10px", fontSize: 11, color: "var(--text-faint)", fontWeight: 600, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
  const td = { padding: "6px 10px", fontSize: 13, borderBottom: "1px solid var(--border)", verticalAlign: "top" };
  const btn = { background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <strong>Spotify · Vietnam daily chart (kworb)</strong>
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>chart up to {lastChart || "—"} · fetched {ago(lastTaken)} · updates every 12 h</span>
        <span style={{ flex: 1 }} />
        <button type="button" style={btn} onClick={() => setReview(true)}>
          Review suspects{pending.length ? <span style={{ marginLeft: 6, background: "#e5484d", color: "#fff", borderRadius: 999, padding: "0 7px", fontSize: 11, fontWeight: 800 }}>{pending.length}</span> : null}
        </button>
        <button type="button" style={btn} disabled={busy} onClick={refreshNow}>{busy ? "Fetching…" : "↻ Refresh now"}</button>
      </div>
      {info && <div style={{ fontSize: 12, color: "var(--success-fg)", marginBottom: 8 }}>{info}</div>}
      {err && <div style={{ background: "var(--error-bg)", color: "var(--error-fg)", fontSize: 12, padding: "6px 12px", marginBottom: 8 }}>{err}</div>}
      <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "0 0 10px" }}>
        Only tracks that match a release (title + artist) in our products are listed. Daily = change in kworb's total between the two newest chart days; kworb does not count time spent outside the chart.
      </p>
      {loading ? <div className="uix-skeleton" style={{ height: 120, borderRadius: 8 }} /> : ours.length === 0 ? (
        <div style={{ color: "var(--text-faint)", fontSize: 13 }}>No tracks of ours on the Vietnam chart yet (or the first fetch has not run). Press Refresh now.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={th}>Track</th><th style={th}>Artist</th><th style={th}>DID</th>
              <th style={{ ...th, textAlign: "right" }}>Daily</th><th style={{ ...th, textAlign: "right" }}>7 days</th>
              <th style={{ ...th, textAlign: "right" }}>Total</th><th style={{ ...th, textAlign: "right" }}>Days on chart</th><th style={{ ...th, textAlign: "right" }}>Peak</th>
            </tr></thead>
            <tbody>
              {[...ours].sort((a, b) => (stats(b.track_id).cur?.total || 0) - (stats(a.track_id).cur?.total || 0)).map((x) => {
                const st = stats(x.track_id);
                return (
                  <tr key={x.track_id} style={{ opacity: x.in_chart ? 1 : 0.55 }}>
                    <td style={td}><a href={spotifyUrl(x.track_id)} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{x.title}</a>{!x.in_chart ? <span style={{ color: "var(--text-faint)", fontSize: 11 }}> · left the chart</span> : null}</td>
                    <td style={td}>{x.artist}</td>
                    <td style={td}>{x.release_id ? <Link href={`/releases/${x.release_id}`} style={{ color: "var(--text)" }}>{x.did || "open"}</Link> : "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }} title={st.gap ? `vs ${st.gap} day(s) earlier` : ""}>{st.daily == null ? "—" : (st.daily >= 0 ? "+" : "") + fmt(st.daily)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{st.week == null ? "—" : "+" + fmt(st.week)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{fmt(st.cur?.total)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{fmt(st.cur?.days)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{st.cur?.peak ? `#${st.cur.peak}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {review && (
        <div onClick={() => setReview(false)} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(900px, 100%)", maxHeight: "85vh", display: "flex", flexDirection: "column", background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              <strong>Suspicious tracks on the Vietnam chart</strong>
              <span style={{ flex: 1 }} />
              {[["pending", `Pending (${pending.length})`], ["follow_up", `Follow up (${suspects.filter((x) => x.review === "follow_up").length})`], ["dismissed", `Dismissed (${suspects.filter((x) => x.review === "dismissed").length})`]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setReviewTab(k)} style={{ ...btn, background: reviewTab === k ? "rgba(255,107,26,0.15)" : "var(--bg-hover)", borderColor: reviewTab === k ? "var(--accent)" : "var(--border)" }}>{l}</button>
              ))}
              <button type="button" onClick={() => setReview(false)} aria-label="Close" style={{ background: "transparent", border: "none", color: "var(--text)", fontSize: 18, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ overflowY: "auto", padding: "4px 16px 12px" }}>
              {shown.length === 0 ? <div style={{ padding: 16, color: "var(--text-faint)", fontSize: 13 }}>Nothing here.</div> : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>Track · artist</th><th style={th}>Why flagged</th><th style={{ ...th, textAlign: "right" }}>Total</th><th style={th}></th></tr></thead>
                  <tbody>
                    {shown.map((x) => (
                      <tr key={x.track_id}>
                        <td style={td}><a href={spotifyUrl(x.track_id)} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontWeight: 700 }}>{x.title}</a><div style={{ fontSize: 12, color: "var(--text-muted)" }}>{x.artist}</div></td>
                        <td style={{ ...td, fontSize: 12, color: "var(--text-muted)" }}>{x.reason}{x.release_id ? <> · <Link href={`/releases/${x.release_id}`} style={{ color: "var(--accent)" }}>open our release</Link></> : null}{x.review ? <div style={{ color: "var(--text-faint)" }}>{x.review === "follow_up" ? "Follow up" : "Dismissed"} by {x.reviewed_by || "?"}</div> : null}</td>
                        <td style={{ ...td, textAlign: "right" }}>{fmt(snaps[x.track_id]?.[0]?.total)}</td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          {x.review !== "follow_up" && <button type="button" style={{ ...btn, marginRight: 6 }} onClick={() => decide(x, "follow_up")}>Follow up</button>}
                          {x.review !== "dismissed" && <button type="button" style={btn} onClick={() => decide(x, "dismissed")}>Dismiss</button>}
                          {x.review && <button type="button" style={{ ...btn, marginLeft: 6 }} onClick={() => decide(x, null)}>Undo</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
