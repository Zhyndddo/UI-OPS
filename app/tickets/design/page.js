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
import styles from "../../shared.module.css";

const REFUND_LIKE = ["REFUND"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

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
  const [overload, setOverload] = useState(null);

  const isExecutorView = !profile?.segment || profile.segment === "Design";

  useEffect(() => {
    if (!supabase) return;
    load();
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

  // Task/Description/Platform/Design Type/Size used to be locked read-only
  // text on the requester side (AR) — now editable there too, flagged +
  // pinged to Design instead of blocked outright.
  async function updateData(t, patch, editedByRequester) {
    const newData = { ...t.data, ...patch };
    if (editedByRequester) {
      newData.__requesterEdited = true;
      newData.__requesterEditedAt = new Date().toISOString();
      newData.__requesterEditedField = Object.keys(patch)[0];
      newData.__requesterEditedBy = profile?.name || null;
    }
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, data: newData } : x)));
    await supabase.from("tickets").update({ data: newData }).eq("id", t.id);
    if (editedByRequester) {
      const labels = { task: "Task", description: "Description", platform: "Platform", designType: "Design Type", size: "Size" };
      const changedKey = Object.keys(patch)[0];
      await supabase.rpc("fanout_notification", {
        p_team: "Design",
        p_type: "ticket_edited",
        p_title: "Design ticket edited by requester",
        p_body: `${profile?.name || "The requester"} changed "${labels[changedKey] || changedKey}".`,
        p_link: "/tickets/design",
        p_ticket_id: t.id,
      });
    }
  }

  async function acknowledgeEdit(t) {
    const newData = { ...t.data, __requesterEdited: false };
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
    if (newStatus === "REFUND") patch.pic_profile_id = null;
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  const visibleTickets = useMemo(() => {
    if (isExecutorView) return tickets.filter((t) => t.status === statusFilter);
    return [...tickets].sort((a, b) => (REFUND_LIKE.includes(a.status) ? 0 : 1) - (REFUND_LIKE.includes(b.status) ? 0 : 1));
  }, [tickets, isExecutorView, statusFilter]);

  const { pageRows: pagedTickets, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleTickets);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1300 }}>
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
            <div className={styles.emptyState}>{isExecutorView ? `No tickets with status "${statusFilter}".` : "No tickets yet."}</div>
          ) : (
            <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Priority</th><th>Task</th><th>Description</th><th>Platform</th><th>Design Type</th><th>Size</th>
                  <th>PIC</th><th>Deadline</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pagedTickets.map((t) => (
                  <DesignRow
                    key={t.id}
                    ticket={t}
                    tab={tab}
                    platforms={platforms}
                    types={types}
                    sizes={sizes}
                    profiles={profiles}
                    isExecutorView={isExecutorView}
                    onUpdateData={updateData}
                    onUpdateStatus={updateStatus}
                    onUpdatePic={updatePic}
                    onAcknowledgeEdit={acknowledgeEdit}
                  />
                ))}
              </tbody>
            </table>
            <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function DesignRow({ ticket, tab, platforms, types, sizes, profiles, isExecutorView, onUpdateData, onUpdateStatus, onUpdatePic, onAcknowledgeEdit }) {
  const status = ticket.status;
  const color = statusColor(status);
  const isRefundLike = REFUND_LIKE.includes(status);
  const statusEditable = isExecutorView || isRefundLike;
  const statusOptions = isExecutorView
    ? tab?.status_options || []
    : [status, tab?.default_status, tab?.status_options?.[tab.status_options.length - 1]].filter((v, i, a) => v && a.indexOf(v) === i);
  const showEditedHighlight = isExecutorView && !!ticket.data?.__requesterEdited;

  const currentPlatform = platforms.find((p) => p.name === ticket.data?.platform);
  const typesForPlatform = currentPlatform ? types.filter((t) => t.platform_id === currentPlatform.id) : [];
  const currentType = types.find((t) => t.name === ticket.data?.designType);
  const sizesForType = currentType ? sizes.filter((s) => s.design_type_id === currentType.id) : [];

  // Changing Platform clears Design Type + Size; changing Design Type
  // clears Size — matches v1's inline table behavior exactly. Now
  // reachable from either side (Task/Description/Platform/Type/Size used
  // to be locked read-only text for the requester) — the requester flag
  // just flows through to the flag/notify logic in updateData.
  function onPlatformChange(name) {
    onUpdateData(ticket, { platform: name, designType: "", size: "" }, !isExecutorView);
  }
  function onTypeChange(name) {
    onUpdateData(ticket, { designType: name, size: "" }, !isExecutorView);
  }

  return (
    <tr style={showEditedHighlight ? { boxShadow: "inset 3px 0 0 var(--accent)", background: "rgba(255,107,26,0.06)" } : undefined}>
      <td>
        {ticket.data?.priority || "NORMAL"}
        {showEditedHighlight && (
          <div
            title={`Edited by ${ticket.data?.__requesterEditedBy || "requester"} — click to clear`}
            onClick={() => onAcknowledgeEdit(ticket)}
            style={{ cursor: "pointer", fontSize: 9, fontWeight: 700, color: "var(--accent)", marginTop: 2, whiteSpace: "nowrap" }}
          >
            ✎ edited
          </div>
        )}
      </td>
      <td style={{ minWidth: 160 }}>
        <textarea
          className={styles.textarea}
          style={{ minHeight: 44, fontSize: 12, padding: "4px 8px" }}
          defaultValue={ticket.data?.task || ""}
          onBlur={(e) => onUpdateData(ticket, { task: e.target.value }, !isExecutorView)}
        />
      </td>
      <td style={{ minWidth: 160 }}>
        <textarea
          className={styles.textarea}
          style={{ minHeight: 44, fontSize: 12, padding: "4px 8px" }}
          defaultValue={ticket.data?.description || ""}
          onBlur={(e) => onUpdateData(ticket, { description: e.target.value }, !isExecutorView)}
        />
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
        <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12 }} value={ticket.data?.size || ""} onChange={(e) => onUpdateData(ticket, { size: e.target.value }, !isExecutorView)} disabled={!currentType}>
          <option value="">—</option>
          {sizesForType.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
        </select>
      </td>
      <td>
        {isExecutorView ? (
          <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12 }} value={ticket.pic_profile_id || ""} onChange={(e) => onUpdatePic(ticket, e.target.value)}>
            <option value="">— Unassigned —</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (profiles.find((p) => p.id === ticket.pic_profile_id)?.name || "—")}
      </td>
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
