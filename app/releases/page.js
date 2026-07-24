"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate, metadataPercent } from "../../lib/helpers";
import styles from "../shared.module.css";

const CHANNELS = ["VIEENT", "ENVI"];

export default function ReleasesDashboard() {
  const [releases, setReleases] = useState([]);
  const [bookingPct, setBookingPct] = useState({}); // release_id -> %
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [statusFilter, setStatusFilter] = useState(null); // "preRelease" | "released" | "postRelease"
  const [createdFilter, setCreatedFilter] = useState(null); // "week" | "month"
  const [channelFilter, setChannelFilter] = useState(null); // "VIEENT" | "ENVI" (from stat click or dropdown, same state)
  const [typeFilter, setTypeFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [hoverRelease, setHoverRelease] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data, error: err } = await supabase.from("releases").select("*").order("created_at", { ascending: false });
      if (err) { setError(err.message); setLoading(false); return; }
      setReleases(data || []);

      const { data: bookings } = await supabase.from("media_booking_entries").select("release_id, status");
      const grouped = {};
      (bookings || []).forEach((b) => {
        if (!grouped[b.release_id]) grouped[b.release_id] = { total: 0, done: 0 };
        grouped[b.release_id].total++;
        if (b.status === "Done") grouped[b.release_id].done++;
      });
      const pctMap = {};
      Object.entries(grouped).forEach(([id, g]) => (pctMap[id] = Math.round((g.done / g.total) * 100)));
      setBookingPct(pctMap);

      const { data: labelRows } = await supabase.from("labels").select("label_name").order("label_name");
      setLabels(labelRows || []);

      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let thisWeek = 0, thisMonth = 0, preRelease = 0, released = 0, postRelease = 0;
    const byChannel = { VIEENT: 0, ENVI: 0 };

    releases.forEach((r) => {
      const created = new Date(r.created_at);
      if (created >= startOfWeek) thisWeek++;
      if (created >= startOfMonth) thisMonth++;

      const rd = r.release_date ? new Date(r.release_date) : null;
      if (rd) {
        if (rd > now) preRelease++;
        else {
          const daysSince = (now - rd) / (1000 * 60 * 60 * 24);
          if (daysSince <= 7) released++;
          else postRelease++;
        }
      }
      if (byChannel[r.requester_segment] !== undefined) byChannel[r.requester_segment]++;
    });

    return { total: releases.length, thisWeek, thisMonth, preRelease, released, postRelease, byChannel };
  }, [releases]);

  const filteredReleases = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return releases.filter((r) => {
      if (createdFilter) {
        const created = new Date(r.created_at);
        if (createdFilter === "week" && !(created >= startOfWeek)) return false;
        if (createdFilter === "month" && !(created >= startOfMonth)) return false;
      }
      if (statusFilter) {
        const rd = r.release_date ? new Date(r.release_date) : null;
        if (!rd) return false;
        if (statusFilter === "preRelease" && !(rd > now)) return false;
        if (statusFilter === "released" && !(rd <= now && (now - rd) / (1000 * 60 * 60 * 24) <= 7)) return false;
        if (statusFilter === "postRelease" && !(rd <= now && (now - rd) / (1000 * 60 * 60 * 24) > 7)) return false;
      }
      if (channelFilter && r.requester_segment !== channelFilter) return false;
      if (typeFilter && r.project_type !== typeFilter) return false;
      if (labelFilter && r.label !== labelFilter) return false;
      return true;
    });
  }, [releases, createdFilter, statusFilter, channelFilter, typeFilter, labelFilter]);

  const anyStatClickFilter = statusFilter || channelFilter || createdFilter;

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 1400 }}>
        <div className={styles.topRow}>
          <div>
            <div className={styles.eyebrow}>// Overview</div>
            <h1 className={styles.title} style={{ marginBottom: 0 }}>New Release</h1>
          </div>
          <Link href="/new-release" className={styles.btnPrimary}>+ New Release</Link>
        </div>

        <div className={styles.statRow}>
          <StatCard label="Total Releases" value={stats.total} active={!createdFilter} onClick={() => setCreatedFilter(null)} onClear={() => setCreatedFilter(null)} hideClear />
          <StatCard label="This Week" value={stats.thisWeek} active={createdFilter === "week"} onClick={() => setCreatedFilter((f) => (f === "week" ? null : "week"))} onClear={() => setCreatedFilter(null)} />
          <StatCard label="This Month" value={stats.thisMonth} active={createdFilter === "month"} onClick={() => setCreatedFilter((f) => (f === "month" ? null : "month"))} onClear={() => setCreatedFilter(null)} />
          <StatCard label="Pre-release" value={stats.preRelease} active={statusFilter === "preRelease"} onClick={() => setStatusFilter((f) => (f === "preRelease" ? null : "preRelease"))} onClear={() => setStatusFilter(null)} />
          <StatCard label="Release" value={stats.released} active={statusFilter === "released"} onClick={() => setStatusFilter((f) => (f === "released" ? null : "released"))} onClear={() => setStatusFilter(null)} />
          <StatCard label="Post-release" value={stats.postRelease} active={statusFilter === "postRelease"} onClick={() => setStatusFilter((f) => (f === "postRelease" ? null : "postRelease"))} onClear={() => setStatusFilter(null)} />
        </div>

        <div className={styles.subheading} style={{ marginTop: 4 }}>By Media Channel</div>
        <div className={styles.statRow} style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 24 }}>
          <StatCard label="All" value={stats.total} active={!channelFilter} onClick={() => setChannelFilter(null)} onClear={() => setChannelFilter(null)} hideClear />
          {CHANNELS.map((c) => (
            <StatCard key={c} label={c} value={stats.byChannel[c] || 0} active={channelFilter === c} onClick={() => setChannelFilter((f) => (f === c ? null : c))} onClear={() => setChannelFilter(null)} />
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <select className={styles.select} style={{ maxWidth: 200 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Type — all</option>
            {[...new Set(releases.map((r) => r.project_type).filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className={styles.select} style={{ maxWidth: 200 }} value={channelFilter || ""} onChange={(e) => setChannelFilter(e.target.value || null)}>
            <option value="">Channel — all</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={styles.select} style={{ maxWidth: 200 }} value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)}>
            <option value="">Label — all</option>
            {labels.map((l) => <option key={l.label_name} value={l.label_name}>{l.label_name}</option>)}
          </select>
          {(typeFilter || labelFilter || anyStatClickFilter) && (
            <button
              onClick={() => { setStatusFilter(null); setChannelFilter(null); setCreatedFilter(null); setTypeFilter(""); setLabelFilter(""); }}
              style={{ background: "none", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "6px 12px", fontSize: 11, color: "var(--text-faint)", cursor: "pointer" }}
            >
              ✕ Clear all filters
            </button>
          )}
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : filteredReleases.length === 0 ? (
          <div className={styles.emptyState}>No releases match these filters.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>DID</th>
                <th>Channel</th>
                <th>Package</th>
                <th>Label</th>
                <th>Name</th>
                <th>Artist</th>
                <th>Release Date</th>
                <th>Status</th>
                <th>Metadata</th>
                <th>Booking</th>
              </tr>
            </thead>
            <tbody>
              {filteredReleases.map((r) => {
                const pct = metadataPercent(r);
                const bpct = bookingPct[r.id] ?? 0;
                return (
                  <tr key={r.id}>
                    <td
                      onMouseEnter={(e) => { setHoverRelease(r); setHoverPos({ x: e.clientX, y: e.clientY }); }}
                      onMouseLeave={() => setHoverRelease(null)}
                    >
                      <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.did || "—"}</Link>
                    </td>
                    <td>{r.requester_segment || "—"}</td>
                    <td style={{ maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.release_category ? `${r.release_category} - ${r.project_type || "—"}` : (r.project_type || "—")}
                    </td>
                    <td>{r.label || "—"}</td>
                    <td
                      onMouseEnter={(e) => { setHoverRelease(r); setHoverPos({ x: e.clientX, y: e.clientY }); }}
                      onMouseLeave={() => setHoverRelease(null)}
                    >
                      <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link>
                    </td>
                    <td>{r.main_artist}</td>
                    <td>{fmtDate(r.release_date)}</td>
                    <td>
                      <span className={styles.statusBadge} style={{ background: "rgba(255,107,26,0.12)", color: "#ff9d5c" }}>{r.status}</span>
                    </td>
                    <td>
                      <span className={`${styles.pill} ${pct > 0 ? styles.pillOrange : styles.pillGray}`}>{pct}%</span>
                    </td>
                    <td>
                      <span className={`${styles.pill} ${bpct > 0 ? styles.pillOrange : styles.pillGray}`}>{bpct}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>

    {hoverRelease && (
      <div
        style={{
          position: "fixed",
          left: Math.min(hoverPos.x + 16, (typeof window !== "undefined" ? window.innerWidth : 1200) - 320),
          top: hoverPos.y + 16,
          zIndex: 500,
          width: 300,
          background: "var(--bg-card)",
          border: "1px solid var(--border-strong)",
          borderRadius: 8,
          padding: 14,
          pointerEvents: "none",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700, marginBottom: 4 }}>{hoverRelease.did}</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{hoverRelease.title}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{hoverRelease.main_artist} · {hoverRelease.label}</div>
        <div style={{ fontSize: 11, color: "var(--text-faint)", display: "grid", gap: 3 }}>
          <div>Genre: {hoverRelease.genre || "—"}</div>
          <div>Topic: {hoverRelease.theme || "—"}</div>
          <div>Stage: {hoverRelease.project_type}</div>
          <div>Metadata: {metadataPercent(hoverRelease)}%</div>
          <div>Booking: {bookingPct[hoverRelease.id] ?? 0}%</div>
        </div>
      </div>
    )}
    </AppShell>
  );
}

function StatCard({ label, value, active, onClick, onClear, hideClear }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        cursor: "pointer",
        background: active ? "rgba(255,107,26,0.08)" : undefined,
        border: active ? "1px solid var(--accent)" : undefined,
        borderRadius: active ? 8 : undefined,
      }}
      className={active ? undefined : styles.statCard}
    >
      {active && !hideClear && (
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          style={{ position: "absolute", top: 6, right: 6, background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 12, padding: 0 }}
        >
          ✕
        </button>
      )}
      <div className={styles.statLabel} style={active ? { padding: "16px 16px 0" } : undefined}>{label}</div>
      <div className={styles.statValue} style={active ? { padding: "0 16px 16px" } : undefined}>{value}</div>
    </div>
  );
}
