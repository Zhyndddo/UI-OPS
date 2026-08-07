"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import { isOpsTeam } from "../../../lib/teamTypes";
import { ARTIST_PROFILE_PLATFORMS } from "../../../lib/GateFields";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import styles from "../../shared.module.css";

// Bespoke (not the generic TicketListPage) per explicit request — the
// generic engine only ever shows the first 4 config.fields as columns and
// has no concept of a view-only field, neither of which works once this
// type needs a computed/view-only column, a Note column, and the new
// Spotify/Tiktok/Apple picker (lib/GateFields.js's ARTIST_PROFILE_
// PLATFORMS, same checkbox-group idiom as Pitching's, synced from the
// release detail page / New Release dashboard — see saveTab() in
// app/releases/[id]/page.js and performInsert() in app/new-release/
// page.js). Bài Hát Phát Hành Gần Nhất is view-only here per explicit
// request ("computed, not an input field") — it's still whatever value
// was captured when the ticket was created/last edited elsewhere, this
// page just never offers an input for it.
export default function ArtistProfileTicketList() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [links, setLinks] = useState({ spotify: "", apple: "" });

  const isExecutorView = !profile?.segment || isOpsTeam(profile.segment);

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name").order("name").then(({ data }) => setProfiles(data || []));
    supabase.from("app_settings").select("value").eq("key", "artist_profile_links").maybeSingle().then(({ data }) => {
      setLinks({ spotify: data?.value?.spotify || "", apple: data?.value?.apple || "" });
    });
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "artist_profile").single();
    if (!tabRow) { setLoading(false); return; }
    setTab(tabRow);
    if (!statusFilter) setStatusFilter(tabRow.status_options[0]);
    const { data: tix } = await supabase
      .from("tickets")
      .select("*, profiles(name)")
      .eq("tab_id", tabRow.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setTickets(tix || []);
    setLoading(false);
  }

  async function updateTicketData(t, patch) {
    const newData = { ...t.data, ...patch };
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, data: newData } : x)));
    await supabase.from("tickets").update({ data: newData }).eq("id", t.id);
  }

  async function updatePic(t, profileId) {
    const patch = { pic_profile_id: profileId || null };
    if (profileId && t.status === tab.default_status) {
      const nextStatus = tab.status_options[1];
      if (nextStatus) { patch.status = nextStatus; patch.status_log = { ...t.status_log, [nextStatus]: new Date().toISOString() }; }
    }
    const pic = profiles.find((p) => p.id === profileId);
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch, profiles: pic ? { name: pic.name } : null } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  async function updateStatus(t, newStatus) {
    const newLog = { ...t.status_log, [newStatus]: new Date().toISOString() };
    const patch = { status: newStatus, status_log: newLog };
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  const visibleTickets = isExecutorView ? tickets.filter((t) => t.status === statusFilter) : tickets;
  const { pageRows: pagedTickets, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleTickets);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1350 }}>
          <TypeSwitcher kind="ticket" current="artist_profile" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Artist Profile</h1>
            </div>
            <Link href="/tickets/artist-profile/new" className={styles.btnPrimary}>+ New Ticket</Link>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {links.spotify && (
              <a href={links.spotify} target="_blank" rel="noopener noreferrer" className={styles.btnSmall}>
                Spotify for Artists
              </a>
            )}
            {links.apple && (
              <a href={links.apple} target="_blank" rel="noopener noreferrer" className={styles.btnSmall}>
                Apple Music for Artists
              </a>
            )}
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
          ) : visibleTickets.length === 0 ? (
            <div className={styles.emptyState}>{isExecutorView ? `No tickets with status "${statusFilter}".` : "No tickets yet."}</div>
          ) : (
            <>
            <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
            <table className={styles.table} style={{ minWidth: 1250 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 140 }}>Tên Nghệ Sĩ</th>
                  <th style={{ minWidth: 160 }}>Email Nghệ Sĩ</th>
                  <th style={{ minWidth: 160 }}>Bài Hát Phát Hành Gần Nhất</th>
                  <th style={{ minWidth: 140 }}>Spotify URL</th>
                  <th style={{ minWidth: 140 }}>Apple URL</th>
                  <th style={{ minWidth: 140 }}>Facebook URL</th>
                  <th>Set up on</th>
                  <th style={{ minWidth: 140 }}>Note</th>
                  <th>PIC</th>
                  <th>Deadline</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pagedTickets.map((t) => {
                  const color = statusColor(t.status);
                  return (
                    <tr key={t.id}>
                      <td>
                        <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12 }} defaultValue={t.data?.artistName || ""} onBlur={(e) => updateTicketData(t, { artistName: e.target.value })} />
                      </td>
                      <td>
                        <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12 }} defaultValue={t.data?.email || ""} onBlur={(e) => updateTicketData(t, { email: e.target.value })} />
                      </td>
                      {/* View-only per explicit request — "computed, not an
                          input field" — no input rendered here at all. */}
                      <td style={{ fontSize: 12, color: "var(--text-faint)" }}>{t.data?.latestSong || "—"}</td>
                      <td>
                        <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12 }} defaultValue={t.data?.spotifyUrl || ""} onBlur={(e) => updateTicketData(t, { spotifyUrl: e.target.value })} />
                      </td>
                      <td>
                        <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12 }} defaultValue={t.data?.appleUrl || ""} onBlur={(e) => updateTicketData(t, { appleUrl: e.target.value })} />
                      </td>
                      <td>
                        <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12 }} defaultValue={t.data?.fbUrl || ""} onBlur={(e) => updateTicketData(t, { fbUrl: e.target.value })} />
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {ARTIST_PROFILE_PLATFORMS.map(([key, label]) => (
                            <label key={key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                              <input
                                type="checkbox"
                                checked={!!t.data?.[key]}
                                disabled={!isExecutorView}
                                onChange={(e) => updateTicketData(t, { [key]: e.target.checked })}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </td>
                      <td>
                        <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12 }} defaultValue={t.data?.note || ""} onBlur={(e) => updateTicketData(t, { note: e.target.value })} />
                      </td>
                      <td>
                        {isExecutorView ? (
                          <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12 }} value={t.pic_profile_id || ""} onChange={(e) => updatePic(t, e.target.value)}>
                            <option value="">— Unassigned —</option>
                            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 12 }}>{t.profiles?.name || "—"}</span>
                        )}
                      </td>
                      <td>{fmtDate(t.deadline)}</td>
                      <td>
                        {isExecutorView ? (
                          <select value={t.status} onChange={(e) => updateStatus(t, e.target.value)} style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>
                            {tab?.status_options.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{t.status}</span>
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
