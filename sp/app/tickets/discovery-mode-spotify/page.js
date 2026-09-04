"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import { isOpsTeam } from "../../../lib/teamTypes";
import { filterProfilesByTeam } from "../../../lib/workstationHelpers";
import { DISCOVERY_CLIP_STATUS_OPTIONS } from "../../../lib/GateFields";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import { statusNeedsNote, withStatusNote } from "../../../lib/statusNoteGate";
import styles from "../../shared.module.css";

// Bespoke (not the generic TicketListPage) per explicit request, laid out
// like Sony Publish's/Music Video on Spotify's ticket pages — Release
// info / Link LBM (view-only here, edited from Upload Workstation same as
// MV Spotify) / Discovery clip url (this ticket's own field) / Clip
// status (single choice) / an external-tool button whose destination is
// config-page-editable (app_settings key "artist_profile_links".
// discoveryMode — see app/config/page.js's ArtistProfileLinksSection) —
// per explicit request, the button exists now even with the URL still
// TBD ("team is confirming which to use"), just disabled until then.
export default function DiscoveryModeSpotifyTicketList() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [rows, setRows] = useState([]); // { ticket, release }
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [toolUrl, setToolUrl] = useState("");

  const isExecutorView = !profile?.segment || isOpsTeam(profile.segment);

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name, segment, role").order("name").then(({ data }) => setProfiles(filterProfilesByTeam(data || [], "OPS"))); // round 78
    supabase.from("app_settings").select("value").eq("key", "artist_profile_links").maybeSingle().then(({ data }) => {
      setToolUrl(data?.value?.discoveryMode || "");
    });
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "discovery_mode_spotify").single();
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
      const { data: rels } = await supabase.from("releases").select("id, did, title, main_artist, release_date, link_lbm").in("did", dids);
      (rels || []).forEach((r) => (releaseMap[r.did] = r));
    }
    setRows((tickets || []).map((t) => ({ ticket: t, release: releaseMap[t.data?.releaseId] || null })));
    setLoading(false);
  }

  async function updateTicketData(t, patch) {
    const newData = { ...t.data, ...patch };
    setRows((prev) => prev.map((row) => (row.ticket.id === t.id ? { ...row, ticket: { ...row.ticket, data: newData } } : row)));
    await supabase.from("tickets").update({ data: newData }).eq("id", t.id);
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

  const visibleRows = isExecutorView ? rows.filter((row) => row.ticket.status === statusFilter) : rows;
  const { pageRows: pagedRows, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleRows);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1250 }}>
          <TypeSwitcher kind="ticket" current="discovery_mode_spotify" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Discovery Mode on Spotify</h1>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <a
                href={toolUrl || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.btnSmall}
                aria-disabled={!toolUrl}
                onClick={(e) => !toolUrl && e.preventDefault()}
                title={toolUrl ? undefined : "URL not set yet — configure it on the Config page's External Tool Links tab"}
                style={!toolUrl ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
              >
                Discovery Mode Tool ↗
              </a>
              <Link href="/tickets/discovery-mode-spotify/new" className={styles.btnPrimary}>+ New Ticket</Link>
            </div>
          </div>

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
            <table className={styles.table} style={{ minWidth: 1150 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Dự Án Info</th>
                  <th style={{ minWidth: 160 }}>Url LBM</th>
                  <th style={{ minWidth: 180 }}>Discovery Clip Url</th>
                  <th style={{ minWidth: 150 }}>Clip Status</th>
                  <th>PIC</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map(({ ticket, release }) => {
                  const color = statusColor(ticket.status);
                  const d = ticket.data || {};
                  return (
                    <tr key={ticket.id}>
                      <td>
                        {release ? (
                          <>
                            <Link href={`/releases/${release.id}`} className={styles.rowLink}>{release.title}</Link>
                            <div style={{ fontSize: 11, color: "var(--text-faint)", whiteSpace: "nowrap" }}>{release.main_artist} · {release.did} · {fmtDate(release.release_date)}</div>
                          </>
                        ) : (
                          <span>Release {d.releaseId} (not found)</span>
                        )}
                      </td>
                      <td>
                        {release?.link_lbm ? (
                          <a href={release.link_lbm} target="_blank" rel="noopener noreferrer" style={{ color: "#ff6b1a", fontSize: 12, wordBreak: "break-all" }}>
                            {release.link_lbm}
                          </a>
                        ) : "—"}
                      </td>
                      <td>
                        <input
                          className={styles.input}
                          style={{ padding: "4px 8px", fontSize: 12, minWidth: 180 }}
                          defaultValue={d.discoveryClipUrl || ""}
                          onBlur={(e) => updateTicketData(ticket, { discoveryClipUrl: e.target.value })}
                        />
                      </td>
                      <td>
                        {isExecutorView ? (
                          <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12, minWidth: 180 }} value={d.clipStatus || DISCOVERY_CLIP_STATUS_OPTIONS[0]} onChange={(e) => updateTicketData(ticket, { clipStatus: e.target.value })}>
                            {DISCOVERY_CLIP_STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 12 }}>{d.clipStatus || DISCOVERY_CLIP_STATUS_OPTIONS[0]}</span>
                        )}
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
