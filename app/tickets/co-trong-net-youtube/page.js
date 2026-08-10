"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, fmtDateTime, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import { isOpsTeam } from "../../../lib/teamTypes";
import { filterProfilesByTeam } from "../../../lib/workstationHelpers";
import { MoTaPopup } from "../../../lib/GateFields";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import styles from "../../shared.module.css";

// Bespoke (not the generic TicketListPage) per explicit request — Teaser/
// Official/Short (a period, not a point in time) each need their own
// picker, Mô Tả lives behind a small popup instead of a cramped inline
// box, and the executor columns (Thời gian đăng / Ytb page / link YTB)
// don't match the generic engine's single-column-per-field model at all.
// "Executed by Youtube" per explicit spec resolves through the same OPS
// aggregate every other OPS-executed type uses (isOpsTeam), same as Sony
// Publish/MV Spotify/etc.
export default function CoTrongNetYoutubeTicketList() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [moTaOpenFor, setMoTaOpenFor] = useState(null);

  const isExecutorView = !profile?.segment || isOpsTeam(profile.segment);

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name, segment, role").order("name").then(({ data }) => setProfiles(filterProfilesByTeam(data || [], "OPS"))); // round 78
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "co_trong_net_youtube").single();
    if (!tabRow) { setLoading(false); return; }
    setTab(tabRow);
    if (!statusFilter) setStatusFilter(tabRow.status_options[0]);
    const { data: tix } = await supabase
      .from("tickets")
      .select("*, profiles(name)")
      .eq("tab_id", tabRow.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    const dids = [...new Set((tix || []).map((t) => t.data?.releaseId).filter(Boolean))];
    let releaseMap = {};
    if (dids.length > 0) {
      const { data: rels } = await supabase.from("releases").select("id, did, title, main_artist, release_date").in("did", dids);
      (rels || []).forEach((r) => (releaseMap[r.did] = r));
    }
    setTickets((tix || []).map((t) => ({ ...t, _release: releaseMap[t.data?.releaseId] || null })));
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
  const moTaTicket = tickets.find((t) => t.id === moTaOpenFor) || null;

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1400 }}>
          <TypeSwitcher kind="ticket" current="co_trong_net_youtube" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Có Trong Net YouTube</h1>
            </div>
            <Link href="/tickets/co-trong-net-youtube/new" className={styles.btnPrimary}>+ New Ticket</Link>
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
            <table className={styles.table} style={{ minWidth: 1300 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Dự Án Info</th>
                  <th style={{ minWidth: 220 }}>Thời Gian Đăng</th>
                  <th style={{ minWidth: 90 }}>Mô Tả</th>
                  <th style={{ minWidth: 160 }}>Ytb Page</th>
                  <th style={{ minWidth: 240 }}>Link YTB</th>
                  <th>PIC</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pagedTickets.map((t) => {
                  const color = statusColor(t.status);
                  const r = t._release;
                  const d = t.data || {};
                  return (
                    <tr key={t.id}>
                      <td>
                        {r ? (
                          <>
                            <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link>
                            <div style={{ fontSize: 11, color: "var(--text-faint)", whiteSpace: "nowrap" }}>{r.main_artist} · {r.did}</div>
                          </>
                        ) : (
                          <span>Release {d.releaseId} (not found)</span>
                        )}
                      </td>
                      <td style={{ fontSize: 11, lineHeight: 1.6 }}>
                        <div>Teaser: {fmtDateTime(d.teaser)}</div>
                        <div>Official: {fmtDateTime(d.official)}</div>
                        <div>Short: {d.shortFrom ? fmtDate(d.shortFrom) : "—"} → {d.shortTo ? fmtDate(d.shortTo) : "—"}</div>
                      </td>
                      <td>
                        <button type="button" className={styles.btnSmall} onClick={() => setMoTaOpenFor(t.id)}>
                          {d.moTa ? "✓ View" : "+ Add"}
                        </button>
                      </td>
                      <td>
                        <input
                          className={styles.input}
                          style={{ padding: "4px 8px", fontSize: 12 }}
                          defaultValue={d.ytbPage || ""}
                          onBlur={(e) => updateTicketData(t, { ytbPage: e.target.value })}
                        />
                      </td>
                      <td style={{ fontSize: 11 }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <input className={styles.input} style={{ padding: "3px 6px", fontSize: 11 }} placeholder="Link Teaser" defaultValue={d.linkTeaser || ""} onBlur={(e) => updateTicketData(t, { linkTeaser: e.target.value })} />
                          <input className={styles.input} style={{ padding: "3px 6px", fontSize: 11 }} placeholder="Link Official" defaultValue={d.linkOfficial || ""} onBlur={(e) => updateTicketData(t, { linkOfficial: e.target.value })} />
                          <input className={styles.input} style={{ padding: "3px 6px", fontSize: 11 }} placeholder="Link Short" defaultValue={d.linkShort || ""} onBlur={(e) => updateTicketData(t, { linkShort: e.target.value })} />
                        </div>
                      </td>
                      <td>
                        {isExecutorView ? (
                          <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12, minWidth: "16ch" }} value={t.pic_profile_id || ""} onChange={(e) => updatePic(t, e.target.value)}>
                            <option value="">— Unassigned —</option>
                            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 12 }}>{t.profiles?.name || "—"}</span>
                        )}
                      </td>
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
      {moTaTicket && (
        <MoTaPopup
          value={moTaTicket.data?.moTa}
          onChange={(v) => updateTicketData(moTaTicket, { moTa: v })}
          onClose={() => setMoTaOpenFor(null)}
        />
      )}
    </AppShell>
  );
}
