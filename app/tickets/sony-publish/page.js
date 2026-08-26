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

// Bespoke (not the generic TicketListPage) per explicit request, laid out
// like the Upload Workstation's row — Release info / Link LBM / UPC /
// ISRC, plus the normal PIC/Status columns. Unlike Music Video on
// Spotify's ticket page (Link LBM there is view-only), Link LBM/UPC/ISRC
// here ARE editable — this ticket only ever exists once the release is
// locked into the Sony Publish path, at which point Upload/Pre-release
// Workstation rows for it go read-only (see the grey-out+watermark there)
// and this becomes the one place those fields get edited from. ISRC is
// releases.isrc — already existed as a column (Priority Pitching's
// supplement field) but had no editable UI anywhere until this ticket.
export default function SonyPublishTicketList() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [rows, setRows] = useState([]); // { ticket, release }
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);

  const isExecutorView = !profile?.segment || isOpsTeam(profile.segment);

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name, segment, role").order("name").then(({ data }) => setProfiles(filterProfilesByTeam(data || [], "OPS"))); // round 78
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "sony_publish").single();
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
      const { data: rels } = await supabase.from("releases").select("id, did, title, main_artist, release_date, release_time, link_lbm, upc, isrc").in("did", dids);
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
  }

  async function updateReleaseField(release, key, value) {
    setRows((prev) => prev.map((row) => (row.release?.id === release.id ? { ...row, release: { ...row.release, [key]: value } } : row)));
    await supabase.from("releases").update({ [key]: value }).eq("id", release.id);
  }

  const visibleRows = isExecutorView ? rows.filter((row) => row.ticket.status === statusFilter) : rows;
  const { pageRows: pagedRows, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleRows);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1200 }}>
          <TypeSwitcher kind="ticket" current="sony_publish" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Sony Publish</h1>
            </div>
            <Link href="/tickets/sony-publish/new" className={styles.btnPrimary}>+ New Ticket</Link>
          </div>
          <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: -12, marginBottom: 20 }}>
            Auto-created from New Release once Audio/Artwork/Lyric/Metadata doc are all filled in — sending this
            ticket also sends the release to the Upload workstation. Once a release has one of these, its Upload
            and Pre-release Workstation rows lock — Link LBM/UPC/ISRC are edited from here instead.
          </p>

          {isExecutorView && tab && (
            <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
              {tab.status_options.map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`${styles.tabBtn} ${statusFilter === s ? styles.tabBtnActive : ""}`} style={{ border: statusFilter === s ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: statusFilter === s ? "rgba(255,107,26,0.1)" : "transparent" }}>
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
            <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
            <table className={styles.table} style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Release info</th>
                  <th style={{ minWidth: 180 }}>Link LBM</th>
                  <th style={{ minWidth: 140 }}>UPC</th>
                  <th style={{ minWidth: 140 }}>ISRC</th>
                  <th>PIC</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map(({ ticket, release }) => {
                  const color = statusColor(ticket.status);
                  return (
                    <tr key={ticket.id}>
                      <td>
                        {release ? (
                          <>
                            <Link href={`/releases/${release.id}`} className={styles.rowLink}>{release.title}</Link>
                            <div style={{ fontSize: 11, color: "var(--text-faint)", whiteSpace: "nowrap" }}>{release.main_artist} · {release.did} · {fmtDate(release.release_date)} {release.release_time}</div>
                          </>
                        ) : (
                          <span>Release {ticket.data?.releaseId} (not found)</span>
                        )}
                      </td>
                      <td style={{ minWidth: 180 }}>
                        {release ? (
                          <UrlField styles={styles} value={release.link_lbm} onChange={(v) => updateReleaseField(release, "link_lbm", v)} />
                        ) : "—"}
                      </td>
                      <td>
                        {release ? (
                          <input
                            className={styles.input}
                            style={{ padding: "4px 8px", fontSize: 12, minWidth: 180 }}
                            defaultValue={release.upc || ""}
                            onBlur={(e) => updateReleaseField(release, "upc", e.target.value)}
                          />
                        ) : "—"}
                      </td>
                      <td>
                        {release ? (
                          <input
                            className={styles.input}
                            style={{ padding: "4px 8px", fontSize: 12, minWidth: 180 }}
                            defaultValue={release.isrc || ""}
                            onBlur={(e) => updateReleaseField(release, "isrc", e.target.value)}
                          />
                        ) : "—"}
                      </td>
                      <td>
                        {isExecutorView ? (
                          <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12, minWidth: "16ch" }} value={ticket.pic_profile_id || ""} onChange={(e) => updatePic(ticket, e.target.value)}>
                            <option value="">— Unassigned —</option>
                            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 12 }}>{ticket.profiles?.name || "—"}</span>
                        )}
                      </td>
                      <td title={ticket.data?.note || undefined}>
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
            </div>
            <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
