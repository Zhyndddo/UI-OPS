"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, ticketStatus, statusColor, phuLucStatus } from "../../../lib/helpers";
import styles from "../../shared.module.css";

const PHU_LUC_COLOR = {
  "Chưa Soạn": { bg: "rgba(255,255,255,0.06)", fg: "#999" },
  "Đã Soạn": { bg: "rgba(33,150,243,0.15)", fg: "#5cb3ff" },
  "Chờ Ký": { bg: "rgba(255,193,7,0.15)", fg: "#ffca4d" },
  "Đã Ký": { bg: "rgba(76,175,80,0.15)", fg: "#7ee6a8" },
};

export default function PhuLucList() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "phu_luc").single();
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

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.topRow}>
          <div>
            <div className={styles.eyebrow}>// Ticket</div>
            <h1 className={styles.title} style={{ marginBottom: 0 }}>Phụ Lục</h1>
          </div>
          <Link href="/tickets/phu-luc/new" className={styles.btnPrimary}>+ New Ticket</Link>
        </div>

        <p style={{ color: "#888", fontSize: 12, marginBottom: 20 }}>
          Two independent status columns here: the generic ticket lifecycle (Status) and the
          Phụ Lục-specific document status (PL Status), computed separately.
        </p>

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : tickets.length === 0 ? (
          <div className={styles.emptyState}>No tickets yet.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th><th>Ngày Order</th><th>DID</th><th>Giá Trị PL</th><th>Deadline</th>
                <th>Status</th><th>PL Status</th><th>Ngày Gửi</th><th>Ngày Ký</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t, i) => {
                const status = ticketStatus(t);
                const color = statusColor(status);
                const plStatus = phuLucStatus(t.data);
                const plColor = PHU_LUC_COLOR[plStatus];
                return (
                  <tr key={t.id}>
                    <td>{i + 1}</td>
                    <td>{fmtDate(t.created_at)}</td>
                    <td>{t.data?.releaseId || "—"}</td>
                    <td>{t.data?.giaTri || "—"}</td>
                    <td>{fmtDate(t.deadline)}</td>
                    <td><span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{status}</span></td>
                    <td><span className={styles.statusBadge} style={{ background: plColor.bg, color: plColor.fg }}>{plStatus}</span></td>
                    <td>{fmtDate(t.data?.ngayGui)}</td>
                    <td>{fmtDate(t.data?.ngayKy)}</td>
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
