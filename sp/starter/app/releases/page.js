"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate, metadataPercent, uploadPercent } from "../../lib/helpers";
import { useSortableRows } from "../../lib/useSortableRows";
import SortableTh, { ResetSortButton } from "../../lib/SortableTh";
import { usePagination } from "../../lib/usePagination";
import Pagination from "../../lib/Pagination";
import styles from "../shared.module.css";

const CHANNELS = ["VIEENT", "ENVI"];

// Mirrors app/workstation/pitching/page.js's DONE_VALUE/CANCEL_VALUES so the
// dashboard's "Status Pitching" column agrees with the Pitching workstation
// about what "done"/"cancelled" mean, instead of drifting into its own
// definition.
const PITCHING_DONE_VALUE = "Đã pitching";
const PITCHING_CANCEL_VALUES = ["Không thực hiện", "Không hỗ trợ"];
const PITCHING_TYPE_KEYS = ["priority", "spotify", "nct", "zing"];

function pitchingStatusFor(release, key) {
  if (key === "priority") return release?.priority_pitching;
  if (key === "spotify") return release?.pitching_status_spotify;
  if (key === "nct") return release?.pitching_status_nct;
  if (key === "zing") return release?.pitching_status_zing;
  return null;
}

// "Status Pitching" summary for a release, given the selected types from its
// Pitching ticket (ticket.data — see app/releases/[id]/page.js's
// pitchingTypesDraft) and the per-type status columns on the release itself.
function pitchingSummary(release, ticketData) {
  if (!ticketData) return { label: "Not requested", tone: "gray" };
  const types = PITCHING_TYPE_KEYS.filter((k) => ticketData[k]);
  if (types.length === 0) return { label: "Not requested", tone: "gray" };
  if (types.every((k) => pitchingStatusFor(release, k) === PITCHING_DONE_VALUE)) return { label: "Done", tone: "orange" };
  if (types.every((k) => PITCHING_CANCEL_VALUES.includes(pitchingStatusFor(release, k)))) return { label: "Cancelled", tone: "gray" };
  return { label: "In Progress", tone: "yellow" };
}

export default function ReleasesDashboard() {
  const [releases, setReleases] = useState([]);
  const [bookingPct, setBookingPct] = useState({}); // release_id -> %
  const [pitchingData, setPitchingData] = useState({}); // did -> pitching ticket's data (selected types)
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingChannel, setSavingChannel] = useState(null); // release id currently being saved

  const [statusFilter, setStatusFilter] = useState(null); // "preRelease" | "released" | "postRelease"
  const [createdFilter, setCreatedFilter] = useState(null); // "today" | "week" | "month"
  const [channelFilter, setChannelFilter] = useState(null); // "VIEENT" | "ENVI" (from stat click or dropdown, same state)
  const [typeFilter, setTypeFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [search, setSearch] = useState(""); // regex tested against main_artist, title, label
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

      // Pitching tickets — one per release (matched by DID, stored oddly as
      // data->>releaseId, same pattern as app/releases/[id]/page.js). Used
      // to compute the "Status Pitching" column below without opening each
      // release individually.
      const { data: pitchTab } = await supabase.from("ticket_tabs").select("id").eq("key", "pitching").single();
      if (pitchTab) {
        const { data: pitchTix } = await supabase
          .from("tickets")
          .select("data")
          .eq("tab_id", pitchTab.id)
          .is("deleted_at", null);
        const map = {};
        (pitchTix || []).forEach((t) => {
          const did = t.data?.releaseId;
          if (did) map[did] = t.data;
        });
        setPitchingData(map);
      }

      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfNextWeek = new Date(startOfWeek);
    startOfNextWeek.setDate(startOfWeek.getDate() + 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    let today = 0, thisWeek = 0, thisMonth = 0, preRelease = 0, released = 0, postRelease = 0;
    const byChannel = { VIEENT: 0, ENVI: 0 };

    releases.forEach((r) => {
      const created = new Date(r.created_at);
      if (created >= startOfToday) today++;
      // "This Week" means releasing this week (Sunday through the following
      // Sunday), not created this week — same reasoning/fix as "This Month"
      // below: release_date is what the team actually cares about tracking
      // here, and it can be set well after (or, for backfilled data, well
      // before) created_at.
      if (r.release_date) {
        const rdw = new Date(r.release_date);
        if (rdw >= startOfWeek && rdw < startOfNextWeek) thisWeek++;
      }
      // "This Month" means releasing this month, not created this month —
      // reads release_date, with an upper bound too (release_date can be
      // months/years in the future, unlike created_at).
      if (r.release_date) {
        const rd0 = new Date(r.release_date);
        if (rd0 >= startOfMonth && rd0 < startOfNextMonth) thisMonth++;
      }

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

    return { total: releases.length, today, thisWeek, thisMonth, preRelease, released, postRelease, byChannel };
  }, [releases]);

  // Regex-first: if the typed text is a valid regex, it's tested as one
  // (case-insensitive) against artist/song/label; anything that fails to
  // compile (unbalanced groups, etc. — easy to type by accident) just
  // falls back to a plain case-insensitive substring match instead of
  // erroring the whole page out.
  const searchTest = useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    try {
      const re = new RegExp(q, "i");
      return (s) => re.test(s || "");
    } catch {
      const needle = q.toLowerCase();
      return (s) => (s || "").toLowerCase().includes(needle);
    }
  }, [search]);

  const filteredReleases = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfNextWeek = new Date(startOfWeek);
    startOfNextWeek.setDate(startOfWeek.getDate() + 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    return releases.filter((r) => {
      if (createdFilter) {
        const created = new Date(r.created_at);
        if (createdFilter === "today" && !(created >= startOfToday)) return false;
        if (createdFilter === "week") {
          // Same fix as the stat card above — "This Week" filters by
          // release_date (releasing Sunday through the following Sunday),
          // not created_at.
          if (!r.release_date) return false;
          const rdw = new Date(r.release_date);
          if (!(rdw >= startOfWeek && rdw < startOfNextWeek)) return false;
        }
        if (createdFilter === "month") {
          // Same fix as the stat card above — "This Month" filters by
          // release_date (releasing this month), not created_at.
          if (!r.release_date) return false;
          const rd0 = new Date(r.release_date);
          if (!(rd0 >= startOfMonth && rd0 < startOfNextMonth)) return false;
        }
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
      if (searchTest && !(searchTest(r.main_artist) || searchTest(r.title) || searchTest(r.label))) return false;
      return true;
    });
  }, [releases, createdFilter, statusFilter, channelFilter, typeFilter, labelFilter, searchTest]);

  // "nhớ cập nhật cái channel nhan" — the Channel column was read-only and
  // commonly blank (requester_segment is an optional dropdown on the create
  // form, nothing defaults or requires it), so fixing a batch of blanks
  // meant opening every release individually. Inline-editable here instead.
  async function updateChannel(release, value) {
    setSavingChannel(release.id);
    const { error: err } = await supabase.from("releases").update({ requester_segment: value || null }).eq("id", release.id);
    if (!err) {
      setReleases((rows) => rows.map((r) => (r.id === release.id ? { ...r, requester_segment: value || null } : r)));
    }
    setSavingChannel(null);
  }

  const { sorted: sortedReleases, sort, toggleSort, resetSort, isDefault } = useSortableRows(filteredReleases);
  const { pageRows: pagedReleases, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(sortedReleases);

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
          <StatCard label="Today" value={stats.today} active={createdFilter === "today"} onClick={() => setCreatedFilter((f) => (f === "today" ? null : "today"))} onClear={() => setCreatedFilter(null)} />
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
          <input
            className={styles.input}
            style={{ width: 260 }}
            placeholder="Tìm nghệ sĩ, bài hát, label… (hỗ trợ regex)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
          {(typeFilter || labelFilter || search || anyStatClickFilter) && (
            <button
              onClick={() => { setStatusFilter(null); setChannelFilter(null); setCreatedFilter(null); setTypeFilter(""); setLabelFilter(""); setSearch(""); }}
              style={{ background: "none", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "6px 12px", fontSize: 11, color: "var(--text-faint)", cursor: "pointer" }}
            >
              ✕ Clear all filters
            </button>
          )}
          <ResetSortButton isDefault={isDefault} onReset={resetSort} styles={styles} />
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : sortedReleases.length === 0 ? (
          <div className={styles.emptyState}>No releases match these filters.</div>
        ) : (
          <>
          <table className={styles.table}>
            <thead>
              <tr>
                <SortableTh label="DID" sortKey="did" sort={sort} onToggle={toggleSort} />
                <SortableTh label="Channel" sortKey="requester_segment" sort={sort} onToggle={toggleSort} />
                <SortableTh label="Package" sortKey="release_category" sort={sort} onToggle={toggleSort} />
                <SortableTh label="Label" sortKey="label" sort={sort} onToggle={toggleSort} />
                <SortableTh label="Name" sortKey="title" sort={sort} onToggle={toggleSort} />
                <SortableTh label="Artist" sortKey="main_artist" sort={sort} onToggle={toggleSort} />
                <SortableTh label="Release Date" sortKey="release_date" sort={sort} onToggle={toggleSort} />
                <SortableTh label="Status" sortKey="status" sort={sort} onToggle={toggleSort} />
                <th>Status Pitching</th>
                <th>Metadata</th>
                <th>Booking</th>
                <th>Upload</th>
              </tr>
            </thead>
            <tbody>
              {pagedReleases.map((r) => {
                const pct = metadataPercent(r);
                const bpct = bookingPct[r.id] ?? 0;
                const upct = uploadPercent(r);
                const pitching = pitchingSummary(r, pitchingData[r.did]);
                return (
                  <tr key={r.id}>
                    <td
                      onMouseEnter={(e) => { setHoverRelease(r); setHoverPos({ x: e.clientX, y: e.clientY }); }}
                      onMouseLeave={() => setHoverRelease(null)}
                    >
                      <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.did || "—"}</Link>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className={styles.select}
                        style={{ minWidth: 100, opacity: savingChannel === r.id ? 0.5 : 1 }}
                        value={r.requester_segment || ""}
                        disabled={savingChannel === r.id}
                        onChange={(e) => updateChannel(r, e.target.value)}
                        title={
                          r.requester_segment && !CHANNELS.includes(r.requester_segment)
                            ? `Imported value doesn't match VIEENT/ENVI exactly — pick one to fix it`
                            : undefined
                        }
                      >
                        <option value="">—</option>
                        {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                        {/* An imported/legacy value that isn't exactly "VIEENT" or "ENVI"
                            (different casing, a typo, a different word entirely from the
                            source sheet) used to just render blank here — the data was
                            really in requester_segment, this <select> just had no <option>
                            for it. Surfacing it as its own option instead of silently
                            dropping it — see scripts/audit-release-channel.js to find every
                            release affected this way. */}
                        {r.requester_segment && !CHANNELS.includes(r.requester_segment) && (
                          <option value={r.requester_segment}>{r.requester_segment} (unrecognized — pick to fix)</option>
                        )}
                      </select>
                    </td>
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
                      <span
                        className={styles.statusBadge}
                        style={
                          pitching.tone === "orange"
                            ? { background: "rgba(255,107,26,0.12)", color: "#ff9d5c" }
                            : pitching.tone === "yellow"
                            ? { background: "rgba(234,179,8,0.14)", color: "#eab308" }
                            : { background: "rgba(148,163,184,0.14)", color: "var(--text-faint)" }
                        }
                      >
                        {pitching.label}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.pill} ${pct > 0 ? styles.pillOrange : styles.pillGray}`}>{pct}%</span>
                    </td>
                    <td>
                      <span className={`${styles.pill} ${bpct > 0 ? styles.pillOrange : styles.pillGray}`}>{bpct}%</span>
                    </td>
                    <td>
                      <span className={`${styles.pill} ${upct > 0 ? styles.pillOrange : styles.pillGray}`}>{upct}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
          </>
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
          <div>Upload: {uploadPercent(hoverRelease)}%</div>
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
