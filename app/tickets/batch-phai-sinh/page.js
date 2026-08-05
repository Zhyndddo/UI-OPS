"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import { isOpsTeam } from "../../../lib/teamTypes";
import { batchProgress } from "../../../lib/batchPhaiSinhStatus";
import { sendPing, resolvePingTargets } from "../../../lib/pingNotification";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import styles from "../../shared.module.css";

// Batch Phái Sinh's list — ONE row per batch ticket (not per song), per
// explicit request: submitting a bulk derivative-tracklist request should
// be one ticket/one notification, never one per song. Clicking "Open
// Batch" routes to the expanded per-batch table
// (app/tickets/batch-phai-sinh/[id]/page.js), opened in a new tab per
// explicit request ("to another browser tab for clarity") — that's where
// the actual songs live and get worked.
export default function BatchPhaiSinhList() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [itemsByBatch, setItemsByBatch] = useState({}); // batch ticket id -> [{status}]
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
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "batch_phai_sinh").single();
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

    const batchIds = (tix || []).map((t) => t.id);
    if (batchIds.length > 0) {
      const { data: items } = await supabase.from("phai_sinh_batch_items").select("batch_ticket_id, status").in("batch_ticket_id", batchIds).is("deleted_at", null);
      const grouped = {};
      (items || []).forEach((i) => {
        (grouped[i.batch_ticket_id] = grouped[i.batch_ticket_id] || []).push(i);
      });
      setItemsByBatch(grouped);
    }
    setLoading(false);
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

  async function pingBatch(t) {
    const targets = await resolvePingTargets(t.pic_profile_id);
    await sendPing({
      targetProfileIds: targets,
      ticketId: t.id,
      title: "Ping — Phái Sinh (Batch)",
      body: `${t.data?.batchLabel || "A batch"} needs attention.`,
      link: `/tickets/batch-phai-sinh/${t.id}`,
    });
  }

  const visibleTickets = isExecutorView ? tickets.filter((t) => t.status === statusFilter) : tickets;
  const { pageRows: pagedTickets, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleTickets);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1200 }}>
          <TypeSwitcher kind="ticket" current="batch_phai_sinh" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Phái Sinh (Batch)</h1>
            </div>
            <Link href="/tickets/batch-phai-sinh/new" className={styles.btnPrimary}>+ New Batch</Link>
          </div>
          <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: -12, marginBottom: 20 }}>
            One ticket per batch, however many songs are inside it — this keeps notifications to one per batch
            (plus one when it's fully complete) instead of spamming one per song. Each song still counts as its
            own workload item everywhere else in the app.
          </p>

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
            <div className={styles.emptyState}>{isExecutorView ? `No batches with status "${statusFilter}".` : "No batches yet."}</div>
          ) : (
            <>
            <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
            <table className={styles.table} style={{ minWidth: 1000 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 260 }}>Batch</th>
                  <th style={{ minWidth: 160 }}>Progress</th>
                  <th>PIC</th>
                  <th>Status</th>
                  <th style={{ minWidth: 180 }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {pagedTickets.map((t) => {
                  const color = statusColor(t.status);
                  const items = itemsByBatch[t.id] || [];
                  const { done, total } = batchProgress(items);
                  return (
                    <tr key={t.id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{t.data?.batchLabel || "(untitled batch)"}</div>
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{t.data?.mainArtist}</div>
                      </td>
                      <td>
                        {total === 0 ? (
                          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>No songs added</span>
                        ) : (
                          <div>
                            <div style={{ fontSize: 12, marginBottom: 3 }}>{done}/{total} resolved</div>
                            <div style={{ background: "var(--bg-hover)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                              <div style={{ width: `${Math.round((done / total) * 100)}%`, background: "#ff6b1a", height: "100%" }} />
                            </div>
                          </div>
                        )}
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
                      <td>
                        <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{t.status}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Link href={`/tickets/batch-phai-sinh/${t.id}`} target="_blank" rel="noopener noreferrer" className={styles.btnSmall}>
                            Open Batch ↗
                          </Link>
                          <button type="button" className={styles.btnSmall} onClick={() => pingBatch(t)} title="Manually notify the PIC (or OPS if unassigned) about this batch">
                            Ping
                          </button>
                        </div>
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
