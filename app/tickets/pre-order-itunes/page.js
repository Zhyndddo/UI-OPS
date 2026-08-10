"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import { isOpsTeam } from "../../../lib/teamTypes";
import { filterProfilesByTeam } from "../../../lib/workstationHelpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import UrlField from "../../../lib/UrlField";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import { statusNeedsNote, withStatusNote } from "../../../lib/statusNoteGate";
import styles from "../../shared.module.css";

const ITUNES_CONVERT_URL = "https://www.vieent.com/en/ituneslink";
const LINKFIRE_URL = "https://app.linkfire.com/#/vieent-coltd/dashboard";

// Bespoke (not the generic TicketListPage) per explicit request — a
// click-the-row popup with real release fields (Link LBM, Link Preorder,
// both real `releases` columns, same ones the URL tab and Upload
// Workstation already read/write) rather than the generic data-jsonb form.
// Link Preorder's own column in the Upload Workstation table was removed
// in favor of editing it here instead — one surface, not two.
export default function PreOrderItunesTicketList() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [rows, setRows] = useState([]); // { ticket, release }
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [openRow, setOpenRow] = useState(null); // { ticket, release } | null

  const isExecutorView = !profile?.segment || isOpsTeam(profile.segment);

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name, segment, role").order("name").then(({ data }) => setProfiles(filterProfilesByTeam(data || [], "OPS"))); // round 78
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "pre_order_itunes").single();
    if (!tabRow) { setLoading(false); return; }
    setTab(tabRow);
    if (!statusFilter) setStatusFilter(tabRow.status_options[0]);
    const { data: tickets } = await supabase
      .from("tickets")
      .select("*, profiles(name)")
      .eq("tab_id", tabRow.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    const dids = [...new Set((tickets || []).map((t) => t.data?.releaseId).filter(Boolean))];
    let releaseMap = {};
    if (dids.length > 0) {
      const { data: rels } = await supabase.from("releases").select("id, did, title, main_artist, release_date, link_lbm, link_preorder").in("did", dids);
      (rels || []).forEach((r) => (releaseMap[r.did] = r));
    }
    setRows((tickets || []).map((t) => ({ ticket: t, release: releaseMap[t.data?.releaseId] || null })));
    setLoading(false);
  }

  async function updatePic(t, profileId) {
    const patch = { pic_profile_id: profileId || null };
    if (profileId && t.status === tab.default_status) {
      const nextStatus = tab.status_options[1];
      if (nextStatus) { patch.status = nextStatus; patch.status_log = { ...t.status_log, [nextStatus]: new Date().toISOString() }; }
    }
    const pic = profiles.find((p) => p.id === profileId);
    setRows((prev) => prev.map((row) => (row.ticket.id === t.id ? { ...row, ticket: { ...row.ticket, ...patch, profiles: pic ? { name: pic.name } : null } } : row)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  async function updateStatus(t, newStatus) {
    const newLog = { ...t.status_log, [newStatus]: new Date().toISOString() };
    const patch = { status: newStatus, status_log: newLog };
    // Round 80 — refund/cancel-like moves require a short reason, folded
    // into ticket.data.note (see lib/statusNoteGate.js).
    if (statusNeedsNote(newStatus)) {
      const newData = withStatusNote(t.data, newStatus);
      if (!newData) return; // cancelled / no reason given — abort the change
      patch.data = newData;
    }
    setRows((prev) => prev.map((row) => (row.ticket.id === t.id ? { ...row, ticket: { ...row.ticket, ...patch } } : row)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
    setOpenRow((r) => (r && r.ticket.id === t.id ? { ...r, ticket: { ...r.ticket, ...patch } } : r));
  }

  async function updateReleaseField(release, key, value) {
    setRows((prev) => prev.map((row) => (row.release?.id === release.id ? { ...row, release: { ...row.release, [key]: value } } : row)));
    setOpenRow((r) => (r && r.release?.id === release.id ? { ...r, release: { ...r.release, [key]: value } } : r));
    await supabase.from("releases").update({ [key]: value }).eq("id", release.id);
  }

  const visibleRows = isExecutorView ? rows.filter((row) => row.ticket.status === statusFilter) : rows;
  const { pageRows: pagedRows, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleRows);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1100 }}>
          <TypeSwitcher kind="ticket" current="pre_order_itunes" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Pre-order Itunes</h1>
            </div>
            <Link href="/tickets/pre-order-itunes/new" className={styles.btnPrimary}>+ New Ticket</Link>
          </div>

          {isExecutorView && tab && (
            <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
              {tab.status_options.map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`${styles.tabBtn} ${statusFilter === s ? styles.tabBtnActive : ""}`} style={{ border: "1px solid var(--border)", borderRadius: 6 }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : visibleRows.length === 0 ? (
            <div className={styles.emptyState}>{isExecutorView ? `No tickets with status "${statusFilter}".` : "No tickets yet."}</div>
          ) : (
            <>
            <table className={styles.table}>
              <thead>
                <tr><th>Request Date</th><th>Release</th><th>PIC</th><th>Status</th></tr>
              </thead>
              <tbody>
                {pagedRows.map(({ ticket, release }) => {
                  const color = statusColor(ticket.status);
                  return (
                    <tr key={ticket.id} onClick={() => setOpenRow({ ticket, release })} style={{ cursor: "pointer" }}>
                      <td style={{ fontSize: 12 }}>{fmtDate(ticket.created_at)}</td>
                      <td style={{ fontSize: 12 }}>
                        {release ? `${release.title} — ${release.main_artist}` : (ticket.data?.releaseId || "—")}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {isExecutorView ? (
                          <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12, minWidth: "16ch" }} value={ticket.pic_profile_id || ""} onChange={(e) => updatePic(ticket, e.target.value)}>
                            <option value="">— Unassigned —</option>
                            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 12 }}>{ticket.profiles?.name || "—"}</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()} title={ticket.data?.note || undefined}>
                        {isExecutorView ? (
                          <select value={ticket.status} onChange={(e) => updateStatus(ticket, e.target.value)} style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>
                            {tab?.status_options.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{ticket.status}</span>
                        )}
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

      {openRow && (
        <PreOrderPopup
          ticket={openRow.ticket}
          release={openRow.release}
          tab={tab}
          isExecutorView={isExecutorView}
          onUpdateStatus={updateStatus}
          onUpdateReleaseField={updateReleaseField}
          onClose={() => setOpenRow(null)}
        />
      )}
    </AppShell>
  );
}

function PreOrderPopup({ ticket, release, tab, isExecutorView, onUpdateStatus, onUpdateReleaseField, onClose }) {
  const color = statusColor(ticket.status);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 20, width: 480, maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div className={styles.eyebrow}>// Ticket</div>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Pre-order Itunes ticket</h3>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <a href={ITUNES_CONVERT_URL} target="_blank" rel="noopener noreferrer" className={styles.btnSmall}>Itunes convert</a>
          <a href={LINKFIRE_URL} target="_blank" rel="noopener noreferrer" className={styles.btnSmall}>linkfire</a>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>Release Info</div>
        {release ? (
          <div style={{ marginBottom: 16, fontSize: 12 }}>
            <Link href={`/releases/${release.id}`} className={styles.rowLink}>{release.title} — {release.main_artist}</Link>
            <div style={{ color: "var(--text-faint)", marginTop: 2 }}>{release.did} · {fmtDate(release.release_date)}</div>
          </div>
        ) : (
          <div style={{ marginBottom: 16, fontSize: 12, color: "var(--text-faint)" }}>{ticket.data?.releaseId || "No release linked."}</div>
        )}

        {release && (
          <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Link LBM</label>
              <UrlField styles={styles} value={release.link_lbm} onChange={(v) => onUpdateReleaseField(release, "link_lbm", v)} placeholder="https://…" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Link Preorder</label>
              <UrlField styles={styles} value={release.link_preorder} onChange={(v) => onUpdateReleaseField(release, "link_preorder", v)} placeholder="https://…" />
            </div>
          </div>
        )}

        <div>
          <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Status</label>
          {isExecutorView ? (
            <select value={ticket.status} onChange={(e) => onUpdateStatus(ticket, e.target.value)} style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "5px 10px", fontSize: 12, fontWeight: 700 }}>
              {tab?.status_options.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{ticket.status}</span>
          )}
        </div>
      </div>
    </div>
  );
}
