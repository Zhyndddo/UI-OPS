"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "./supabaseClient";
import { fmtDate, statusColor } from "./helpers";
import { useAuth } from "./AuthContext";
import { TICKET_CONFIGS } from "./ticketConfigs";
import styles from "../app/shared.module.css";

// Statuses that behave like v1's REFUND — the one state a requester is
// allowed to move a ticket out of themselves (back to the default, or to
// "canceled"). Everywhere else, status is read-only text to a requester.
// Report Conflict has no true refund state, but "Từ chối" plays the same
// "kicked back to requester" role.
const REFUND_LIKE = ["REFUND", "Từ chối"];

// Phái Sinh's list view combines several raw fields into computed display
// columns (matches v1's ALL_COLS computed entries exactly) — everything
// else just shows its raw fields directly.
const COMPUTED_LIST_COLUMNS = {
  phai_sinh: [
    { key: "artistGroup", label: "Artist", compute: (d) => [d.artist, d.composer ? `Composer: ${d.composer}` : null].filter(Boolean).join("\n") },
    { key: "contributorGroup", label: "Contributor", compute: (d) => [d.producer ? `Producer: ${d.producer}` : null, d.mixer ? `Mixer: ${d.mixer}` : null].filter(Boolean).join("\n") },
    { key: "releaseGroup", label: "Release", compute: (d) => [d.releaseDate ? fmtDate(d.releaseDate) : null, d.releaseTime].filter(Boolean).join(" ") || "—" },
  ],
};
// Which raw fields those computed columns replace, so they aren't shown twice
const COMPUTED_REPLACES = {
  phai_sinh: ["artist", "composer", "producer", "mixer", "releaseDate", "releaseTime"],
};

export default function TicketListPage({ typeKey, basePath }) {
  const config = TICKET_CONFIGS[typeKey];
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", typeKey).single();
    if (!tabRow) { setLoading(false); return; }
    setTab(tabRow);
    if (!statusFilter) setStatusFilter(tabRow.status_options[0]);
    const { data } = await supabase
      .from("tickets")
      .select("*")
      .eq("tab_id", tabRow.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setTickets(data || []);
    setLoading(false);
  }

  // Dual-view: no executorTeam configured = always the fuller view (no
  // natural requester/executor split for this type). Otherwise, being on
  // the executor team (or having no team at all, i.e. dev) gets the
  // executor view; everyone else gets the requester view.
  const isExecutorView = !config?.executorTeam || !profile?.segment || profile.segment === config.executorTeam;

  async function updateField(t, key, value) {
    const newData = { ...t.data, [key]: value };
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, data: newData } : x)));
    await supabase.from("tickets").update({ data: newData }).eq("id", t.id);
  }

  async function updateStatus(t, newStatus) {
    const newLog = { ...t.status_log, [newStatus]: new Date().toISOString() };
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: newStatus, status_log: newLog } : x)));
    await supabase.from("tickets").update({ status: newStatus, status_log: newLog }).eq("id", t.id);
  }

  const visibleTickets = useMemo(() => {
    if (isExecutorView) {
      return tickets.filter((t) => t.status === statusFilter);
    }
    // Requester view — no tabs, just surface refund-like ones first
    return [...tickets].sort((a, b) => (REFUND_LIKE.includes(a.status) ? 0 : 1) - (REFUND_LIKE.includes(b.status) ? 0 : 1));
  }, [tickets, isExecutorView, statusFilter]);

  if (!config) return <div className={styles.page}><div className={styles.container}>Unknown ticket type: {typeKey}</div></div>;

  const computedCols = COMPUTED_LIST_COLUMNS[typeKey] || [];
  const replaced = COMPUTED_REPLACES[typeKey] || [];
  const listFields = config.fields.filter((f) => !replaced.includes(f.key));
  const previewFields = [...computedCols, ...listFields].slice(0, 4);

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

        {isExecutorView && tab && (
          <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
            {tab.status_options.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`${styles.tabBtn} ${statusFilter === s ? styles.tabBtnActive : ""}`}
                style={{ border: "1px solid var(--border)", borderRadius: 6 }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : visibleTickets.length === 0 ? (
          <div className={styles.emptyState}>
            {isExecutorView ? `No tickets with status "${statusFilter}".` : "No tickets yet."}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th><th>Ngày Order</th>
                {previewFields.map((f) => <th key={f.key}>{f.label}</th>)}
                <th>Deadline</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleTickets.map((t, i) => (
                <TicketRow
                  key={t.id}
                  ticket={t}
                  index={i}
                  previewFields={previewFields}
                  computedCols={computedCols}
                  config={config}
                  tab={tab}
                  isExecutorView={isExecutorView}
                  onUpdateField={updateField}
                  onUpdateStatus={updateStatus}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function TicketRow({ ticket, index, previewFields, computedCols, config, tab, isExecutorView, onUpdateField, onUpdateStatus }) {
  const status = ticket.status;
  const color = statusColor(status);
  const isRefundLike = REFUND_LIKE.includes(status);
  // Requester can only touch the status dropdown at all when it's
  // currently in a refund-like state — matches v1 exactly. Executor
  // always gets the full dropdown.
  const statusEditable = isExecutorView || isRefundLike;
  const statusOptions = isExecutorView
    ? tab?.status_options || []
    : [status, tab?.default_status, tab?.status_options?.[tab.status_options.length - 1]].filter((v, i, a) => v && a.indexOf(v) === i);

  return (
    <tr>
      <td>{index + 1}</td>
      <td>{fmtDate(ticket.created_at)}</td>
      {previewFields.map((f) => {
        const isComputed = computedCols.some((c) => c.key === f.key);
        const value = isComputed ? f.compute(ticket.data) : ticket.data?.[f.key];
        const bothEdit = !isComputed && config.bothEditable.includes(f.key);
        const canEdit = isExecutorView || bothEdit;
        if (!canEdit || isComputed) {
          return (
            <td key={f.key} style={{ maxWidth: 200, whiteSpace: "pre-line", fontSize: 12 }}>
              {value || "—"}
            </td>
          );
        }
        return (
          <td key={f.key}>
            <input
              className={styles.input}
              style={{ padding: "4px 8px", fontSize: 12 }}
              defaultValue={value || ""}
              onBlur={(e) => onUpdateField(ticket, f.key, e.target.value)}
            />
          </td>
        );
      })}
      <td>{fmtDate(ticket.deadline)}</td>
      <td>
        {statusEditable ? (
          <select
            value={status}
            onChange={(e) => onUpdateStatus(ticket, e.target.value)}
            style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}
          >
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{status}</span>
        )}
      </td>
    </tr>
  );
}
