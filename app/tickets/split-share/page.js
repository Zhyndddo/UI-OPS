"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import { isExecutorSegment } from "../../../lib/teamTypes";
import { filterProfilesByTeam } from "../../../lib/workstationHelpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import { statusNeedsNote, withStatusNote } from "../../../lib/statusNoteGate";
import styles from "../../shared.module.css";

// Bespoke (not the generic TicketListPage) per explicit request — "reuse
// the current phụ lục template" (dual view + 4 status tabs, same visual
// language as PhuLucStyleTicketList) but with its own, much shorter,
// field set: Release / PIC / Status / Ngày Set / Ngày Hoàn Thành. Ngày
// Hoàn Thành is NOT hand-edited — updateStatus() below stamps it the
// moment status becomes COMPLETE and clears it back to null the moment
// status moves away from COMPLETE, per explicit request. Distinct from
// releases.split_share_entries (the inline % / Shared Label / Scope
// editor already on the Legal Request group) — that editor is untouched,
// this is the Legal team's own tracking surface for the request itself.
export default function SplitShareTicketList() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [releases, setReleases] = useState({}); // did -> release
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);

  const isExecutorView = !profile?.segment || isExecutorSegment(profile.segment, "Legal");

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name, segment, role").order("name").then(({ data }) => setProfiles(filterProfilesByTeam(data || [], "Legal"))); // round 78
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "split_share").single();
    if (!tabRow) { setLoading(false); return; }
    setTab(tabRow);
    if (!statusFilter) setStatusFilter(tabRow.status_options[0]);
    const { data: tix } = await supabase
      .from("tickets")
      .select("*")
      .eq("tab_id", tabRow.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setTickets(tix || []);

    const dids = [...new Set((tix || []).map((t) => t.data?.releaseId).filter(Boolean))];
    if (dids.length > 0) {
      const { data: rels } = await supabase.from("releases").select("id, did, title, main_artist").in("did", dids);
      const map = {};
      (rels || []).forEach((r) => (map[r.did] = r));
      setReleases(map);
    }
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
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  // Ngày Hoàn Thành tracks COMPLETE specifically, independent of the
  // generic status_log timestamps — stamped the moment status becomes
  // COMPLETE, cleared back to null the moment it's taken back out of
  // COMPLETE (reopened to any other status), per explicit request.
  async function updateStatus(t, newStatus) {
    const newLog = { ...t.status_log, [newStatus]: new Date().toISOString() };
    const newData = { ...t.data };
    if (newStatus === "COMPLETE") newData.ngayHoanThanh = new Date().toISOString().slice(0, 10);
    else if (t.status === "COMPLETE") newData.ngayHoanThanh = null;
    const patch = { status: newStatus, status_log: newLog, data: newData };
    // Round 80 — refund/cancel-like moves require a short reason, folded
    // into ticket.data.note (see lib/statusNoteGate.js).
    if (statusNeedsNote(newStatus)) {
      const notedData = withStatusNote(newData, newStatus);
      if (!notedData) return; // cancelled / no reason given — abort the change
      patch.data = notedData;
    }
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  const visibleTickets = isExecutorView ? tickets.filter((t) => t.status === statusFilter) : tickets;
  const { pageRows: pagedTickets, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleTickets);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 900 }}>
          <TypeSwitcher kind="ticket" current="split_share" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Splitshare</h1>
            </div>
            <Link href="/tickets/split-share/new" className={styles.btnPrimary}>+ New Ticket</Link>
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
          ) : visibleTickets.length === 0 ? (
            <div className={styles.emptyState}>{isExecutorView ? `No tickets with status "${statusFilter}".` : "No tickets yet."}</div>
          ) : (
            <>
            <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Release</th>
                  <th>PIC</th>
                  <th>Status</th>
                  <th>Ngày Set</th>
                  <th>Ngày Hoàn Thành</th>
                </tr>
              </thead>
              <tbody>
                {pagedTickets.map((t) => {
                  const color = statusColor(t.status);
                  const rel = releases[t.data?.releaseId];
                  return (
                    <tr key={t.id}>
                      <td>
                        {rel ? (
                          <Link href={`/releases/${rel.id}`} className={styles.rowLink}>
                            {rel.title} <span style={{ color: "var(--text-faint)" }}>({rel.did})</span>
                          </Link>
                        ) : (
                          <span>Release {t.data?.releaseId} (not found)</span>
                        )}
                      </td>
                      <td>
                        {isExecutorView ? (
                          <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12, minWidth: "16ch" }} value={t.pic_profile_id || ""} onChange={(e) => updatePic(t, e.target.value)}>
                            <option value="">— Unassigned —</option>
                            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 12 }}>{profiles.find((p) => p.id === t.pic_profile_id)?.name || "—"}</span>
                        )}
                      </td>
                      <td title={t.data?.note || undefined}>
                        {isExecutorView ? (
                          <select value={t.status} onChange={(e) => updateStatus(t, e.target.value)} style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>
                            {tab?.status_options.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{t.status}</span>
                        )}
                      </td>
                      <td>
                        <input type="date" className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 180 }} defaultValue={t.data?.ngaySet || ""} onBlur={(e) => updateTicketData(t, { ngaySet: e.target.value })} />
                      </td>
                      <td>
                        <span style={{ fontSize: 12, color: t.data?.ngayHoanThanh ? "var(--success-fg)" : "var(--text-faint)" }}>
                          {t.data?.ngayHoanThanh ? fmtDate(t.data.ngayHoanThanh) : "—"}
                        </span>
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
