"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import { isOpsTeam } from "../../../lib/teamTypes";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import UrlField from "../../../lib/UrlField";
import PickSelect from "../../../lib/PickSelect";
import { MV_TYPE_OPTIONS } from "../../../lib/pickerOptions";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import styles from "../../shared.module.css";

// Bespoke (not the generic TicketListPage) per explicit request, laid out
// like the Upload Workstation's row. Link LBM and Link Drive are view-only
// hyperlinks (edited from Upload Workstation/Pre-order Itunes, not here).
// "MV status" under Link Drive is releases.canva_status — the SAME field
// the Pre-release Workstation's "MV" column and the New Release/Overview
// conditional field already edit (see lib/pickerOptions.js MV_TYPE_OPTIONS)
// — editable here too, one shared column. Spotify MV Link is a new real
// releases.spotify_mv_link column (this ticket type is its only editor).
// Note is intentionally ticket-only (ticket.data.note) rather than a
// releases column, per explicit "no link to anywhere" — it doesn't show
// up on any workstation or the release detail page, only here.
export default function MvSpotifyTicketList() {
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
    supabase.from("profiles").select("id, name").order("name").then(({ data }) => setProfiles(data || []));
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "mv_spotify").single();
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
      const { data: rels } = await supabase.from("releases").select("id, did, title, main_artist, release_date, release_time, link_lbm, drive_link, canva_status, spotify_mv_link").in("did", dids);
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
    setRows((prev) => prev.map((row) => (row.ticket.id === t.id ? { ...row, ticket: { ...row.ticket, ...patch } } : row)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  async function updateReleaseField(release, key, value) {
    setRows((prev) => prev.map((row) => (row.release?.id === release.id ? { ...row, release: { ...row.release, [key]: value } } : row)));
    await supabase.from("releases").update({ [key]: value }).eq("id", release.id);
  }

  async function updateTicketNote(t, note) {
    const newData = { ...t.data, note };
    setRows((prev) => prev.map((row) => (row.ticket.id === t.id ? { ...row, ticket: { ...row.ticket, data: newData } } : row)));
    await supabase.from("tickets").update({ data: newData }).eq("id", t.id);
  }

  const visibleRows = isExecutorView ? rows.filter((row) => row.ticket.status === statusFilter) : rows;
  const { pageRows: pagedRows, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleRows);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1300 }}>
          <TypeSwitcher kind="ticket" current="mv_spotify" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Music Video on Spotify</h1>
            </div>
            <Link href="/tickets/mv-spotify/new" className={styles.btnPrimary}>+ New Ticket</Link>
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
            <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
            <table className={styles.table} style={{ minWidth: 1200 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Release info</th>
                  <th>Link LBM</th>
                  <th style={{ minWidth: 180 }}>Link Drive</th>
                  <th style={{ minWidth: 180 }}>Spotify MV Link</th>
                  <th style={{ minWidth: 160 }}>Note</th>
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
                      <td style={{ fontSize: 12 }}>
                        {release?.link_lbm ? (
                          <a href={release.link_lbm.split("\n")[0]} target="_blank" rel="noopener noreferrer" className={styles.rowLink}>
                            {release.link_lbm.split("\n")[0]}
                          </a>
                        ) : (
                          <span style={{ color: "var(--text-faint)" }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {release?.drive_link ? (
                          <a href={release.drive_link.split("\n")[0]} target="_blank" rel="noopener noreferrer" className={styles.rowLink}>
                            {release.drive_link.split("\n")[0]}
                          </a>
                        ) : (
                          <span style={{ color: "var(--text-faint)" }}>—</span>
                        )}
                        {release && (
                          <div style={{ marginTop: 4 }}>
                            <PickSelect styles={styles} opts={MV_TYPE_OPTIONS} value={release.canva_status} onChange={(v) => updateReleaseField(release, "canva_status", v)} placeholder="— MV status —" />
                          </div>
                        )}
                      </td>
                      <td style={{ minWidth: 180 }}>
                        {release ? (
                          <UrlField styles={styles} value={release.spotify_mv_link} onChange={(v) => updateReleaseField(release, "spotify_mv_link", v)} />
                        ) : "—"}
                      </td>
                      <td>
                        <input
                          className={styles.input}
                          style={{ padding: "4px 8px", fontSize: 12 }}
                          defaultValue={ticket.data?.note || ""}
                          onBlur={(e) => updateTicketNote(ticket, e.target.value)}
                        />
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
                      <td>
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
