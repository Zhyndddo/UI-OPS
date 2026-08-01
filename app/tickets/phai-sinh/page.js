"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import LinkOrEditCell from "../../../lib/LinkOrEditCell";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import styles from "../../shared.module.css";

// Rebuilt bespoke to match v1's real Phái Sinh table exactly — it shows
// every real column continuously (not capped at a short preview), with
// v1's computed group columns (Artist+Composer, Producer+Mixer,
// Release Date+Time combined) and the link-or-edit URL pattern. PIC and
// Deadline are v2 additions layered on top, not in v1.
const REFUND_LIKE = ["REFUND"];

export default function PhaiSinhList() {
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
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "phai_sinh").single();
    if (!tabRow) { setLoading(false); return; }
    setTab(tabRow);
    if (!statusFilter) setStatusFilter(tabRow.status_options[0]);
    const { data } = await supabase.from("tickets").select("*, profiles(name)").eq("tab_id", tabRow.id).is("deleted_at", null).order("created_at", { ascending: false });
    setTickets(data || []);
    setLoading(false);
  }

  // typeRequest/label/tenBai/relatedDid used to be locked read-only text
  // on the requester side — now editable there too, flagged + pinged to
  // OPS instead of blocked outright.
  async function updateField(t, key, value, editedByRequester) {
    const newData = { ...t.data, [key]: value };
    if (editedByRequester) {
      newData.__requesterEdited = true;
      newData.__requesterEditedAt = new Date().toISOString();
      newData.__requesterEditedField = key;
      newData.__requesterEditedBy = profile?.name || null;
    }
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, data: newData } : x)));
    await supabase.from("tickets").update({ data: newData }).eq("id", t.id);
    if (editedByRequester) {
      const labels = { typeRequest: "Type", label: "Label", tenBai: "Tên Bài", relatedDid: "Related DID", description: "Description", tacQuyen: "Tác Quyền", url: "URL", note: "Note", refLink: "LBM url" };
      await supabase.rpc("fanout_notification", {
        p_team: "OPS",
        p_type: "ticket_edited",
        p_title: "Phái Sinh ticket edited by requester",
        p_body: `${profile?.name || "The requester"} changed "${labels[key] || key}".`,
        p_link: "/tickets/phai-sinh",
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
    if (REFUND_LIKE.includes(newStatus)) patch.pic_profile_id = null;
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  const visibleTickets = isExecutorView
    ? tickets.filter((t) => t.status === statusFilter)
    : [...tickets].sort((a, b) => (REFUND_LIKE.includes(a.status) ? 0 : 1) - (REFUND_LIKE.includes(b.status) ? 0 : 1));

  const { pageRows: pagedTickets, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleTickets);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1500 }}>
          <TypeSwitcher kind="ticket" current="phai_sinh" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Phái Sinh</h1>
            </div>
            <Link href="/tickets/phai-sinh/new" className={styles.btnPrimary}>+ New Ticket</Link>
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
            <table className={styles.table} style={{ minWidth: 1700 }}>
              <thead>
                <tr>
                  <th>Type</th><th>Label</th><th>Tên Bài</th><th>Related DID</th><th>Artist</th><th>Contributor</th>
                  <th>Release</th><th>Description</th><th>Tác Quyền</th><th>URL</th><th>Note</th><th>LBM url</th>
                  <th>PIC</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pagedTickets.map((t) => (
                  <PhaiSinhRow
                    key={t.id}
                    ticket={t}
                    tab={tab}
                    profiles={profiles}
                    isExecutorView={isExecutorView}
                    onUpdateField={updateField}
                    onUpdateStatus={updateStatus}
                    onUpdatePic={updatePic}
                    onAcknowledgeEdit={acknowledgeEdit}
                  />
                ))}
              </tbody>
            </table>
            <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function PhaiSinhRow({ ticket, tab, profiles, isExecutorView, onUpdateField, onUpdateStatus, onUpdatePic, onAcknowledgeEdit }) {
  const d = ticket.data || {};
  const color = statusColor(ticket.status);
  const isRefundLike = REFUND_LIKE.includes(ticket.status);
  const statusEditable = isExecutorView || isRefundLike;
  const statusOptions = isExecutorView
    ? tab?.status_options || []
    : [ticket.status, tab?.default_status, "REFUND", "CANCELED"].filter((v, i, a) => v && a.indexOf(v) === i);
  const showEditedHighlight = isExecutorView && !!d.__requesterEdited;

  // Every field here is now editable from both sides — a requester's edit
  // just gets flagged (see showEditedHighlight) instead of the field
  // being locked read-only text.
  function textCell(key, value) {
    return (
      <td>
        <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12 }} defaultValue={value || ""} onBlur={(e) => onUpdateField(ticket, key, e.target.value, !isExecutorView)} />
      </td>
    );
  }
  function textareaCell(key, value) {
    return (
      <td style={{ minWidth: 160 }}>
        <textarea className={styles.textarea} style={{ fontSize: 12, minHeight: 40 }} defaultValue={value || ""} onBlur={(e) => onUpdateField(ticket, key, e.target.value, !isExecutorView)} />
      </td>
    );
  }

  const releaseGroup = [d.releaseDate ? fmtDate(d.releaseDate) : "", d.releaseTime].filter(Boolean).join(" ") || "—";
  // Lyricist and Mixer both default to Composer's name when left blank at
  // creation (see app/tickets/phai-sinh/new/page.js) — these lines always
  // show that fallback, whichever of the pair actually has a value.
  const composerLyricist = d.lyricist || d.composer;
  const mixerDisplay = d.mixer || d.composer;
  const artistGroup = (d.artist || "")
    + (d.featureArtist ? `\nFeat: ${d.featureArtist}` : "")
    + (composerLyricist ? `\nComposer/Lyricist: ${composerLyricist}` : "");
  const contributorGroup = [d.producer ? `Producer: ${d.producer}` : "", mixerDisplay ? `Mixer: ${mixerDisplay}` : ""].filter(Boolean).join("\n");

  return (
    <tr style={showEditedHighlight ? { boxShadow: "inset 3px 0 0 var(--accent)", background: "rgba(255,107,26,0.06)" } : undefined}>
      <td style={{ verticalAlign: "top" }}>
        <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12 }} defaultValue={d.typeRequest || ""} onBlur={(e) => onUpdateField(ticket, "typeRequest", e.target.value, !isExecutorView)} />
        {showEditedHighlight && (
          <div
            title={`Edited by ${d.__requesterEditedBy || "requester"} — click to clear`}
            onClick={() => onAcknowledgeEdit(ticket)}
            style={{ cursor: "pointer", fontSize: 9, fontWeight: 700, color: "var(--accent)", marginTop: 2, whiteSpace: "nowrap" }}
          >
            ✎ edited
          </div>
        )}
      </td>
      {textCell("label", d.label)}
      {textCell("tenBai", d.tenBai)}
      {textCell("relatedDid", d.relatedDid)}
      <td style={{ fontSize: 12, whiteSpace: "pre-line" }}>{artistGroup || "—"}</td>
      <td style={{ fontSize: 12, whiteSpace: "pre-line" }}>{contributorGroup || "—"}</td>
      <td style={{ fontSize: 12 }}>{releaseGroup}</td>
      {textareaCell("description", d.description)}
      {textareaCell("tacQuyen", d.tacQuyen)}
      <td style={{ minWidth: 160 }}><LinkOrEditCell styles={styles} value={d.url} onSave={(v) => onUpdateField(ticket, "url", v, !isExecutorView)} /></td>
      {textareaCell("note", d.note)}
      <td style={{ minWidth: 160 }}><LinkOrEditCell styles={styles} value={d.refLink} onSave={(v) => onUpdateField(ticket, "refLink", v, !isExecutorView)} /></td>
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
