"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import MultiLinkCell from "../../../lib/MultiLinkCell";
import styles from "../../shared.module.css";

// Rebuilt bespoke to match v1's real Manual Claim table — simpler than
// Phái Sinh (no computed group columns), but same link-or-edit URL
// pattern and full continuous column set rather than a 4-field preview.
const REFUND_LIKE = ["REFUND"];

export default function ManualClaimList() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);

  const isExecutorView = !profile?.segment || profile.segment === "OPS";

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name").order("name").then(({ data }) => setProfiles(data || []));
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "manual_claim").single();
    if (!tabRow) { setLoading(false); return; }
    setTab(tabRow);
    if (!statusFilter) setStatusFilter(tabRow.status_options[0]);
    const { data } = await supabase.from("tickets").select("*, profiles(name)").eq("tab_id", tabRow.id).is("deleted_at", null).order("created_at", { ascending: false });
    setTickets(data || []);
    setLoading(false);
  }

  async function updateField(t, key, value) {
    const newData = { ...t.data, [key]: value };
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

  async function updateStatus(t, newStatus) {
    const newLog = { ...t.status_log, [newStatus]: new Date().toISOString() };
    const patch = { status: newStatus, status_log: newLog };
    if (REFUND_LIKE.includes(newStatus)) patch.pic_profile_id = null;
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  const visibleTickets = isExecutorView
    ? tickets.filter((t) => t.status === statusFilter)
    : [...tickets].sort((a, b) => (REFUND_LIKE.includes(a.status) ? 0 : 1) - (REFUND_LIKE.includes(b.status) ? 0 : 1));

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1300 }}>
          <TypeSwitcher kind="ticket" current="manual_claim" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Manual Claim</h1>
            </div>
            <Link href="/tickets/manual-claim/new" className={styles.btnPrimary}>+ New Ticket</Link>
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
            <div style={{ overflowX: "auto" }}>
            <table className={styles.table} style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th>Request Date</th><th>Label</th><th>Tên Bài</th><th>Artist</th><th>URL</th><th>Note</th>
                  <th>PIC</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleTickets.map((t) => (
                  <ManualClaimRow
                    key={t.id}
                    ticket={t}
                    tab={tab}
                    profiles={profiles}
                    isExecutorView={isExecutorView}
                    onUpdateField={updateField}
                    onUpdateStatus={updateStatus}
                    onUpdatePic={updatePic}
                  />
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ManualClaimRow({ ticket, tab, profiles, isExecutorView, onUpdateField, onUpdateStatus, onUpdatePic }) {
  const d = ticket.data || {};
  const color = statusColor(ticket.status);
  const isRefundLike = REFUND_LIKE.includes(ticket.status);
  const statusEditable = isExecutorView || isRefundLike;
  const statusOptions = isExecutorView
    ? tab?.status_options || []
    : [ticket.status, tab?.default_status, "REFUND", "CANCELED"].filter((v, i, a) => v && a.indexOf(v) === i);

  function textCell(key, value) {
    if (!isExecutorView) return <td style={{ fontSize: 12 }}>{value || "—"}</td>;
    return (
      <td>
        <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12 }} defaultValue={value || ""} onBlur={(e) => onUpdateField(ticket, key, e.target.value)} />
      </td>
    );
  }

  return (
    <tr>
      <td style={{ fontSize: 12 }}>{fmtDate(ticket.created_at)}</td>
      {textCell("label", d.label)}
      {textCell("tenBai", d.tenBai)}
      {textCell("artist", d.artist)}
      <td style={{ minWidth: 220 }}><MultiLinkCell styles={styles} value={d.url} onSave={(v) => onUpdateField(ticket, "url", v)} /></td>
      <td style={{ minWidth: 200 }}>
        <textarea className={styles.textarea} style={{ fontSize: 12, minHeight: 40 }} defaultValue={d.note || ""} onBlur={(e) => onUpdateField(ticket, "note", e.target.value)} />
      </td>
      <td>
        {isExecutorView ? (
          <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12 }} value={ticket.pic_profile_id || ""} onChange={(e) => onUpdatePic(ticket, e.target.value)}>
            <option value="">— Unassigned —</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <span style={{ fontSize: 12 }}>{ticket.profiles?.name || "—"}</span>
        )}
      </td>
      <td>
        {statusEditable ? (
          <select value={ticket.status} onChange={(e) => onUpdateStatus(ticket, e.target.value)} style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{ticket.status}</span>
        )}
      </td>
    </tr>
  );
}
