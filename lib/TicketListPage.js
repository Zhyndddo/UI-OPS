"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "./supabaseClient";
import { fmtDate, ticketStatus, statusColor } from "./helpers";
import { TICKET_CONFIGS } from "./ticketConfigs";
import styles from "../app/shared.module.css";

// Shared by all 7 ticket types that don't need bespoke UI (Newrelease
// Upload and Phụ Lục have their own dedicated pages since they need
// special logic — dual status, auto-creation, editing release fields
// directly, etc.). Shows the first 3 configured fields as columns, plus
// the standard #/Ngày Order/PIC/Deadline/Status/Note set from the plan.
export default function TicketListPage({ typeKey, basePath }) {
  const config = TICKET_CONFIGS[typeKey];
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", typeKey).single();
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

  if (!config) return <div className={styles.page}><div className={styles.container}>Unknown ticket type: {typeKey}</div></div>;

  const previewFields = config.fields.slice(0, 3);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.topRow}>
          <div>
            <div className={styles.eyebrow}>// Ticket</div>
            <h1 className={styles.title} style={{ marginBottom: 0 }}>{config.label}</h1>
          </div>
          <Link href={`${basePath}/new`} className={styles.btnPrimary}>+ New Ticket</Link>
        </div>

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : tickets.length === 0 ? (
          <div className={styles.emptyState}>No tickets yet.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th><th>Ngày Order</th>
                {previewFields.map((f) => <th key={f.key}>{f.label}</th>)}
                <th>Deadline</th><th>Status</th><th>Actions</th>
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
                    {previewFields.map((f) => (
                      <td key={f.key} style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.data?.[f.key] || "—"}
                      </td>
                    ))}
                    <td>{fmtDate(t.deadline)}</td>
                    <td><span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{status}</span></td>
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
