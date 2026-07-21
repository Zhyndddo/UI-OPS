"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, ticketStatus, statusColor } from "../../../lib/helpers";
import styles from "../../shared.module.css";

export default function NewreleaseUploadList() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "newrelease_upload").single();
    if (!tab) { setLoading(false); return; }
    const { data } = await supabase
      .from("tickets")
      .select("*")
      .eq("tab_id", tab.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setTickets(data || []);
    setLoading(false);
  }

  async function markReceived(t) {
    await supabase.from("tickets").update({ received_at: new Date().toISOString() }).eq("id", t.id);
    load();
  }
  async function markStarted(t) {
    await supabase.from("tickets").update({ started_at: new Date().toISOString() }).eq("id", t.id);
    load();
  }
  async function markCompleted(t) {
    await supabase.from("tickets").update({ completed_at: new Date().toISOString() }).eq("id", t.id);
    load();
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.topRow}>
          <div>
            <div className={styles.eyebrow}>// Ticket</div>
            <h1 className={styles.title} style={{ marginBottom: 0 }}>Newrelease Upload</h1>
          </div>
          <Link href="/tickets/newrelease-upload/new" className={styles.btnPrimary}>+ New Ticket</Link>
        </div>

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : tickets.length === 0 ? (
          <div className={styles.emptyState}>No tickets yet.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th><th>Ngày Order</th><th>Nội Dung</th><th>PIC</th><th>Deadline</th><th>Status</th><th>Note</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t, i) => {
                const status = ticketStatus(t);
                const color = statusColor(status);
                return (
                  <tr key={t.id}>
                    <td>{i + 1}</td>
                    <td>{fmtDate(t.created_at)}</td>
                    <td>{t.data?.project || t.data?.releaseId || "—"} — {t.data?.artist || ""}</td>
                    <td>{t.executor || "—"}</td>
                    <td>{fmtDate(t.deadline)}</td>
                    <td><span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{status}</span></td>
                    <td>{t.data?.note || "—"}</td>
                    <td style={{ display: "flex", gap: 6 }}>
                      {!t.received_at && <button className={styles.btnSmall} onClick={() => markReceived(t)}>Receive</button>}
                      {t.received_at && !t.started_at && <button className={styles.btnSmall} onClick={() => markStarted(t)}>Start</button>}
                      {t.started_at && !t.completed_at && <button className={styles.btnSmall} onClick={() => markCompleted(t)}>Complete</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
