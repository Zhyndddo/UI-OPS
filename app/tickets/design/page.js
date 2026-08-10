"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import SearchBox, { matchesQuery } from "../../../lib/SearchBox";
import NoteCell from "../../../lib/NoteCell";
import {
  DESIGN_STATUSES,
  statusOptionsFor,
  NOTE_REQUIRED_STATUSES,
  designTeamStatusComment,
  DEFAULT_DESIGN_NOTIFICATION_TEMPLATES,
} from "../../../lib/designFlow";
import { resolveProfilesByEmail } from "../../../lib/pingNotification";
import { canEditLockedDeadline } from "../../../lib/permissions";
import styles from "../../shared.module.css";

const OVERLOAD_EMAIL = "anh.duong@vieent.vn";
const OVERLOAD_THRESHOLD = 11;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function StatBox({ title, value, sub, style }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", minWidth: 140, ...style }}>
      <div style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Round 34 rewrite — new status vocabulary (REQUEST/PROCESS/PENDING/
// REVISE/COMPLETE/CANCEL, see lib/designFlow.js), Priority column/field
// retired in favor of an auto-computed Urgent flag + dev-only unlock,
// a Note column (exec-only edit), a Proposed PIC column (visible only
// while a ticket is still in REQUEST), Expected Deadline locked while
// PROCESS, and the 4 top counter boxes from the request.
export default function DesignList() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [types, setTypes] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [query, setQuery] = useState(""); // round 76 — quick index search box
  const [overload, setOverload] = useState(null);
  const [notifTemplates, setNotifTemplates] = useState(DEFAULT_DESIGN_NOTIFICATION_TEMPLATES);
  const [processModal, setProcessModal] = useState(null); // { ticket } | null

  const isDev = profile?.role === "dev";
  const isExecutorView = !profile?.segment || profile.segment === "Design";

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("app_settings").select("value").eq("key", "design_notification_templates").maybeSingle()
      .then(({ data }) => setNotifTemplates({ ...DEFAULT_DESIGN_NOTIFICATION_TEMPLATES, ...(data?.value || {}) }));
  }, []);

  useEffect(() => {
    if (!supabase || !isExecutorView) return;
    (async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "design_overload").maybeSingle();
      let val = data?.value || { active: false, date: null };
      if (val.date !== todayStr()) {
        val = { active: false, date: todayStr() };
        await supabase.from("app_settings").update({ value: val }).eq("key", "design_overload");
      }
      setOverload(val);
    })();
  }, [isExecutorView]);

  async function toggleOverload() {
    const next = { active: !overload.active, date: todayStr() };
    setOverload(next);
    await supabase.from("app_settings").update({ value: next }).eq("key", "design_overload");
  }

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "design").single();
    setTab(tabRow);
    if (tabRow && !statusFilter) setStatusFilter(tabRow.status_options[0]);
    const { data: tix } = tabRow
      ? await supabase.from("tickets").select("*").eq("tab_id", tabRow.id).is("deleted_at", null).order("created_at", { ascending: false })
      : { data: [] };
    setTickets(tix || []);
    const { data: p } = await supabase.from("design_platforms").select("*").order("sort_order");
    const { data: t } = await supabase.from("design_types").select("*").order("sort_order");
    const { data: s } = await supabase.from("design_sizes").select("*").order("sort_order");
    setPlatforms(p || []);
    setTypes(t || []);
    setSizes(s || []);
    const { data: profs } = await supabase.from("profiles").select("id, name").order("name");
    setProfiles(profs || []);
    setLoading(false);
  }

  async function patchTicket(t, patch) {
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  async function updateData(t, dataPatch) {
    await patchTicket(t, { data: { ...t.data, ...dataPatch } });
  }

  async function updatePic(t, profileId) {
    const patch = { pic_profile_id: profileId || null };
    await patchTicket(t, patch);
  }

  async function updateDeadline(t, deadline) {
    await patchTicket(t, { deadline });
  }

  // Checks the "design team Status" counter (PROCESS + REVISE) after a
  // status change and, if it just crossed the threshold, pings the named
  // overload account — de-duplicated per day via app_settings so it fires
  // once, not on every subsequent change while the count stays high.
  async function maybeNotifyOverload(nextTickets) {
    const count = nextTickets.filter((x) => x.status === "PROCESS" || x.status === "REVISE").length;
    if (count < OVERLOAD_THRESHOLD) return;
    const { data } = await supabase.from("app_settings").select("value").eq("key", "design_overload_alert_state").maybeSingle();
    const state = data?.value || { active: false, date: null };
    if (state.date === todayStr() && state.active) return;
    const targets = await resolveProfilesByEmail(OVERLOAD_EMAIL);
    if (targets.length > 0) {
      const body = (notifTemplates.overload || DEFAULT_DESIGN_NOTIFICATION_TEMPLATES.overload).replace("{count}", String(count));
      await supabase.from("notifications").insert(
        targets.map((profileId) => ({ profile_id: profileId, title: "Design team overloaded", body, link: "/tickets/design", created_at: new Date().toISOString() }))
      );
    }
    await supabase.from("app_settings").upsert({ key: "design_overload_alert_state", value: { active: true, date: todayStr() } });
  }

  async function updateStatus(t, newStatus, extra = {}) {
    const newLog = { ...t.status_log, [newStatus]: new Date().toISOString() };
    const patch = { status: newStatus, status_log: newLog, ...extra };
    setTickets((prev) => {
      const next = prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x));
      maybeNotifyOverload(next);
      return next;
    });
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  // Central "what happens when the status dropdown changes" handler — the
  // one place all of round 34 item 3a's transition rules live.
  async function handleStatusChange(t, newStatus) {
    if (newStatus === t.status) return;

    // REQUEST -> PROCESS is gated: exec must confirm Expected Deadline +
    // PIC via a modal (per explicit request) rather than a bare dropdown pick.
    if (t.status === "REQUEST" && newStatus === "PROCESS") {
      setProcessModal({ ticket: t, deadline: t.deadline ? t.deadline.slice(0, 10) : "", picId: t.pic_profile_id || "" });
      return;
    }

    // PENDING/REVISE require a Note first (exec-authored, "used for note
    // missing stuff by design exc").
    if (NOTE_REQUIRED_STATUSES.includes(newStatus) && !(t.data?.note || "").trim()) {
      window.alert(`A Note is required before moving to ${newStatus} — fill in the Note field for this ticket first.`);
      return;
    }

    const extra = {};
    // Entering PENDING from PROCESS/REVISE — remember what to bounce back
    // to once the requester (or exec) resolves it.
    if (newStatus === "PENDING") {
      extra.data = { ...t.data, returnStatus: t.status };
    }
    // Leaving PENDING back to its stored returnStatus — clear the marker.
    if (t.status === "PENDING" && newStatus === (t.data?.returnStatus)) {
      extra.data = { ...t.data, returnStatus: null };
    }
    await updateStatus(t, newStatus, extra);
  }

  async function confirmProcessModal() {
    const { ticket, deadline, picId } = processModal;
    if (!deadline || !picId) {
      window.alert("Both Expected Deadline and PIC are required to move this into Process.");
      return;
    }
    const newLog = { ...ticket.status_log, PROCESS: new Date().toISOString() };
    const patch = { status: "PROCESS", status_log: newLog, deadline, pic_profile_id: picId };
    setTickets((prev) => {
      const next = prev.map((x) => (x.id === ticket.id ? { ...x, ...patch } : x));
      maybeNotifyOverload(next);
      return next;
    });
    await supabase.from("tickets").update(patch).eq("id", ticket.id);
    setProcessModal(null);
  }

  async function confirmUrgent(t) {
    await updateData(t, { urgentConfirmed: true });
  }

  const visibleTickets = useMemo(() => {
    const base = isExecutorView ? tickets.filter((t) => t.status === statusFilter) : tickets;
    return base.filter((t) => matchesQuery(t, query));
  }, [tickets, isExecutorView, statusFilter, query]);

  const { pageRows: pagedTickets, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleTickets);

  // ── Counter boxes (item e) ──────────────────────────────────────────
  const designTeamCount = tickets.filter((t) => t.status === "PROCESS" || t.status === "REVISE").length;
  const waitingCount = tickets.filter((t) => t.status === "REQUEST" && !(t.data?.urgent && !t.data?.urgentConfirmed)).length;
  const inProgressByPic = useMemo(() => {
    const map = {};
    tickets.filter((t) => t.status === "PROCESS" || t.status === "REVISE").forEach((t) => {
      const name = profiles.find((p) => p.id === t.pic_profile_id)?.name || "Unassigned";
      map[name] = (map[name] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [tickets, profiles]);
  const urgentConfirmed = tickets.filter((t) => t.data?.urgent && t.data?.urgentConfirmed && t.status !== "COMPLETE").length;
  const urgentNotConfirmed = tickets.filter((t) => t.data?.urgent && !t.data?.urgentConfirmed && t.status !== "COMPLETE").length;

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1400 }}>
          <TypeSwitcher kind="ticket" current="design" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Design</h1>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {isExecutorView && overload && (
                <button
                  onClick={toggleOverload}
                  title="When active, new Design tickets can't pick today as their deadline"
                  style={{
                    background: overload.active ? "#2a1a0a" : "transparent",
                    color: overload.active ? "#ffca4d" : "var(--text)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: 6,
                    padding: "9px 16px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {overload.active ? "🔒 Overloaded" : "Overload"}
                </button>
              )}
              <Link href="/tickets/design/new" className={styles.btnPrimary}>+ Request</Link>
            </div>
          </div>

          {isExecutorView && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", minWidth: 140 }}>
                <div style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 700, marginBottom: 4 }}>Design Team Status</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{designTeamStatusComment(designTeamCount)}</span>
                  <span style={{ fontSize: 18, fontWeight: 800 }}>{designTeamCount}</span>
                </div>
              </div>
              <StatBox title="Đang chờ nhận" value={waitingCount} />
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 700, marginBottom: 6 }}>Đang thực hiện</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {inProgressByPic.length === 0 ? (
                    <span style={{ fontSize: 12, color: "var(--text-faint)" }}>—</span>
                  ) : (
                    inProgressByPic.map(([name, count]) => (
                      <div key={name} style={{ background: "var(--bg-hover)", borderRadius: 6, padding: "4px 8px", fontSize: 11 }}>
                        {name}: <strong>{count}</strong>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 700, marginBottom: 6 }}>Urgent Task</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ background: "rgba(76,175,80,0.15)", color: "#7ee6a8", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 700 }}>Confirmed: {urgentConfirmed}</div>
                  <div style={{ background: "rgba(244,67,54,0.15)", color: "#ff8a80", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 700 }}>Not confirmed: {urgentNotConfirmed}</div>
                </div>
              </div>
            </div>
          )}

          <SearchBox value={query} onChange={setQuery} placeholder="Search this list…" />

          {isExecutorView && tab && (
            <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
              {DESIGN_STATUSES.map((s) => (
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
            <div className={styles.emptyState}>{isExecutorView ? `No tickets with status "${statusFilter}".` : "No tickets yet."}</div>
          ) : (
            <>
            <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
            <table className={styles.table} style={{ minWidth: 1500 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Task</th><th>Description</th><th>Platform</th><th>Design Type</th><th>Size</th>
                  <th style={{ minWidth: 140 }}>Note</th><th>PIC</th><th>Proposed PIC</th><th style={{ minWidth: 120 }}>Expected Deadline</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pagedTickets.map((t) => (
                  <DesignRow
                    key={t.id}
                    ticket={t}
                    platforms={platforms}
                    types={types}
                    sizes={sizes}
                    profiles={profiles}
                    isExecutorView={isExecutorView}
                    isDev={isDev}
                    isAdmin={canEditLockedDeadline(profile)}
                    onUpdateData={updateData}
                    onStatusChange={handleStatusChange}
                    onUpdatePic={updatePic}
                    onUpdateDeadline={updateDeadline}
                    onConfirmUrgent={confirmUrgent}
                  />
                ))}
              </tbody>
            </table>
            </div>
            <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
            </>
          )}

          {processModal && (
            <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setProcessModal(null)}>
              <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 20, width: 420 }} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 10px" }}>Confirm before moving to Process</h3>
                <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 0 }}>Expected Deadline and PIC are both required.</p>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Expected Deadline</label>
                  <input type="date" className={styles.input} value={processModal.deadline} onChange={(e) => setProcessModal((m) => ({ ...m, deadline: e.target.value }))} />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>PIC</label>
                  <select className={styles.select} value={processModal.picId} onChange={(e) => setProcessModal((m) => ({ ...m, picId: e.target.value }))}>
                    <option value="">—</option>
                    {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button type="button" className={styles.btnPrimary} onClick={confirmProcessModal}>Confirm & Move to Process</button>
                  <button type="button" className={styles.btnSmall} onClick={() => setProcessModal(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function DesignRow({ ticket, platforms, types, sizes, profiles, isExecutorView, isDev, isAdmin, onUpdateData, onStatusChange, onUpdatePic, onConfirmUrgent, onUpdateDeadline }) {
  const status = ticket.status;
  const color = statusColor(status);
  const isUrgentUnconfirmed = !!ticket.data?.urgent && !ticket.data?.urgentConfirmed;
  const statusLocked = isUrgentUnconfirmed; // "row is locked for changing status until the dev confirm it"
  const statusEditable = (isExecutorView || status === "REQUEST") && !statusLocked;
  const statusOptions = statusOptionsFor(ticket, isExecutorView);
  // "locked in no change when change status to process, unlock after
  // moving out of process" — dev/admin can still override, same override
  // precedent set for Batch Phái Sinh's deadline lock (round 34 item 1).
  const deadlineLocked = status === "PROCESS" && !isDev && !isAdmin;

  const currentPlatform = platforms.find((p) => p.name === ticket.data?.platform);
  const typesForPlatform = currentPlatform ? types.filter((t) => t.platform_id === currentPlatform.id) : [];
  const currentType = types.find((t) => t.name === ticket.data?.designType);
  const sizesForType = currentType ? sizes.filter((s) => s.design_type_id === currentType.id) : [];

  function onPlatformChange(name) {
    onUpdateData(ticket, { platform: name, designType: "", size: "" });
  }
  function onTypeChange(name) {
    onUpdateData(ticket, { designType: name, size: "" });
  }

  const proposedPicName = profiles.find((p) => p.id === ticket.data?.proposedPicProfileId)?.name;

  return (
    <tr style={isUrgentUnconfirmed ? { boxShadow: "inset 3px 0 0 #ff4d4d", background: "rgba(255,77,77,0.06)" } : undefined}>
      <td style={{ minWidth: 220 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          {ticket.data?.urgent && (
            <div style={{ flexShrink: 0, textAlign: "center", paddingTop: 4 }}>
              <div style={{ color: "#ff4d4d", fontWeight: 800, fontSize: 10, lineHeight: 1.1 }}>URGENT</div>
              {isUrgentUnconfirmed && isDev && (
                <button
                  type="button"
                  style={{ display: "block", marginTop: 3, padding: "2px 5px", fontSize: 9, fontWeight: 700, color: "#ff4d4d", background: "none", border: "1px solid #ff4d4d", borderRadius: 3, cursor: "pointer" }}
                  onClick={() => onConfirmUrgent(ticket)}
                >
                  confirm
                </button>
              )}
              {ticket.data?.urgentConfirmed && <div style={{ fontSize: 8, color: "var(--text-faint)", marginTop: 2 }}>✓</div>}
            </div>
          )}
          <textarea className={styles.textarea} style={{ minHeight: 44, fontSize: 12, padding: "4px 8px", flex: 1 }} defaultValue={ticket.data?.task || ""} onBlur={(e) => onUpdateData(ticket, { task: e.target.value })} />
        </div>
      </td>
      <td style={{ minWidth: 160 }}>
        <textarea className={styles.textarea} style={{ minHeight: 44, fontSize: 12, padding: "4px 8px" }} defaultValue={ticket.data?.description || ""} onBlur={(e) => onUpdateData(ticket, { description: e.target.value })} />
      </td>
      <td>
        <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12 }} value={ticket.data?.platform || ""} onChange={(e) => onPlatformChange(e.target.value)}>
          <option value="">—</option>
          {platforms.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
      </td>
      <td>
        <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12 }} value={ticket.data?.designType || ""} onChange={(e) => onTypeChange(e.target.value)} disabled={!currentPlatform}>
          <option value="">—</option>
          {typesForPlatform.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
      </td>
      <td>
        <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12 }} value={ticket.data?.size || ""} onChange={(e) => onUpdateData(ticket, { size: e.target.value })} disabled={!currentType}>
          <option value="">—</option>
          {sizesForType.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
        </select>
      </td>
      <td style={{ minWidth: 140 }}>
        <NoteCell value={ticket.data?.note} editable={isExecutorView} onSave={(v) => onUpdateData(ticket, { note: v })} placeholder="Note missing stuff…" />
      </td>
      <td>
        {isExecutorView ? (
          <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12, minWidth: "16ch" }} value={ticket.pic_profile_id || ""} onChange={(e) => onUpdatePic(ticket, e.target.value)}>
            <option value="">— Unassigned —</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (profiles.find((p) => p.id === ticket.pic_profile_id)?.name || "—")}
      </td>
      <td style={{ fontSize: 12 }}>{status === "REQUEST" ? (proposedPicName || "—") : ""}</td>
      <td>
        {isExecutorView || isDev || isAdmin ? (
          <input
            type="date"
            className={styles.input}
            style={{ padding: "4px 6px", fontSize: 11 }}
            defaultValue={ticket.deadline ? ticket.deadline.slice(0, 10) : ""}
            disabled={deadlineLocked}
            title={deadlineLocked ? "Locked while in Process — only dev/admin can change it now." : undefined}
            onBlur={(e) => onUpdateDeadline(ticket, e.target.value || null)}
          />
        ) : (
          fmtDate(ticket.deadline)
        )}
      </td>
      <td>
        {statusEditable ? (
          <select
            value={status}
            onChange={(e) => onStatusChange(ticket, e.target.value)}
            style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}
          >
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }} title={statusLocked ? "Locked — waiting on dev to confirm this is genuinely urgent" : undefined}>
            {status}{statusLocked ? " 🔒" : ""}
          </span>
        )}
      </td>
    </tr>
  );
}
