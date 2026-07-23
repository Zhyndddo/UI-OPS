"use client";

import AppShell from "../../../lib/AppShell";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import styles from "../../shared.module.css";

const PHU_LUC_COLOR = {
  "Chưa Soạn": { bg: "rgba(255,255,255,0.06)", fg: "#999" },
  "Đã Soạn": { bg: "rgba(33,150,243,0.15)", fg: "#5cb3ff" },
  "Chờ Ký": { bg: "rgba(255,193,7,0.15)", fg: "#ffca4d" },
  "Đã Ký": { bg: "rgba(76,175,80,0.15)", fg: "#7ee6a8" },
};

// Mirrors phu_luc_status() in schema.sql
function phuLucStatus(r) {
  if (!r) return "Chưa Soạn";
  if (r.link_phu_luc && r.phu_luc_ngay_ky) return "Đã Ký";
  if (r.link_phu_luc && r.phu_luc_ngay_gui) return "Chờ Ký";
  if (r.link_phu_luc) return "Đã Soạn";
  return "Chưa Soạn";
}

export default function PhuLucList() {
  const [tickets, setTickets] = useState([]);
  const [releases, setReleases] = useState({}); // id -> release
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "phu_luc").single();
    if (!tab) { setLoading(false); return; }
    const { data: tix } = await supabase
      .from("tickets")
      .select("*")
      .eq("tab_id", tab.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setTickets(tix || []);

    // This ticket has no fields of its own for link/dates anymore — it
    // reads/writes releases.link_phu_luc/phu_luc_ngay_gui/phu_luc_ngay_ky
    // directly, so fetch the releases it points at (via data.releaseId,
    // a real releases.id set when the ticket was auto-created).
    const releaseIds = [...new Set((tix || []).map((t) => t.data?.releaseId).filter(Boolean))];
    if (releaseIds.length > 0) {
      const { data: rels } = await supabase
        .from("releases")
        .select("id, did, title, main_artist, link_phu_luc, phu_luc_ngay_gui, phu_luc_ngay_ky")
        .in("id", releaseIds);
      const map = {};
      (rels || []).forEach((r) => (map[r.id] = r));
      setReleases(map);
    }
    setLoading(false);
  }

  async function updateReleaseField(releaseId, field, value) {
    setReleases((prev) => ({ ...prev, [releaseId]: { ...prev[releaseId], [field]: value } }));
    await supabase.from("releases").update({ [field]: value }).eq("id", releaseId);
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 1100 }}>
        <div className={styles.topRow}>
          <div>
            <div className={styles.eyebrow}>// Ticket</div>
            <h1 className={styles.title} style={{ marginBottom: 0 }}>Phụ Lục</h1>
          </div>
          <Link href="/tickets/phu-luc/new" className={styles.btnPrimary}>+ New Ticket</Link>
        </div>

        <p style={{ color: "#888", fontSize: 12, marginBottom: 20 }}>
          Auto-created when an artist locks in a contract type via the magic link. Link/Ngày Gửi/Ngày Ký
          here edit the release directly (single source of truth) — Status is the generic ticket lifecycle,
          PL Status is the Phụ Lục-specific document status, computed separately.
        </p>

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : tickets.length === 0 ? (
          <div className={styles.emptyState}>No tickets yet.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th><th>Ngày Order</th><th>Release</th><th>Giá Trị PL</th><th>Mã PL</th>
                <th>Status</th><th>PL Status</th><th>Link Phụ Lục</th><th>Ngày Gửi</th><th>Ngày Ký</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t, i) => {
                const status = t.status;
                const color = statusColor(status);
                const rel = releases[t.data?.releaseId];
                const plStatus = phuLucStatus(rel);
                const plColor = PHU_LUC_COLOR[plStatus];
                return (
                  <tr key={t.id}>
                    <td>{i + 1}</td>
                    <td>{fmtDate(t.created_at)}</td>
                    <td>
                      {rel ? (
                        <Link href={`/releases/${rel.id}`} className={styles.rowLink}>
                          {rel.title} <span style={{ color: "#666" }}>({rel.did})</span>
                        </Link>
                      ) : "—"}
                    </td>
                    <td>{t.data?.giaTri || "—"}</td>
                    <td>{t.data?.maPL || "—"}</td>
                    <td><span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{status}</span></td>
                    <td><span className={styles.statusBadge} style={{ background: plColor.bg, color: plColor.fg }}>{plStatus}</span></td>
                    <td>
                      <input
                        className={styles.input}
                        style={{ padding: "4px 8px", fontSize: 11, width: 120 }}
                        value={rel?.link_phu_luc || ""}
                        placeholder="link…"
                        onChange={(e) => rel && updateReleaseField(rel.id, "link_phu_luc", e.target.value)}
                        disabled={!rel}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className={styles.input}
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        value={rel?.phu_luc_ngay_gui || ""}
                        onChange={(e) => rel && updateReleaseField(rel.id, "phu_luc_ngay_gui", e.target.value)}
                        disabled={!rel}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className={styles.input}
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        value={rel?.phu_luc_ngay_ky || ""}
                        onChange={(e) => rel && updateReleaseField(rel.id, "phu_luc_ngay_ky", e.target.value)}
                        disabled={!rel}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
    </AppShell>
  );
}
