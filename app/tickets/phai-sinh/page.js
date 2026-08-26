"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import { isOpsTeam } from "../../../lib/teamTypes";
import { filterProfilesByTeam } from "../../../lib/workstationHelpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import LinkOrEditCell from "../../../lib/LinkOrEditCell";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import SearchBox, { matchesQuery } from "../../../lib/SearchBox";
import NoteCell from "../../../lib/NoteCell";
import { PHAI_SINH_TYPE_OPTIONS, isKhoNhacType, isMetadataConfirmed, CHILD_STATUS_COUNTERS } from "../../../lib/phaiSinhTypes";
import { canEditLockedDeadline } from "../../../lib/permissions";
import { statusNeedsNote, withStatusNote } from "../../../lib/statusNoteGate";
import { useIsMobile } from "../../../lib/useIsMobile";
import styles from "../../shared.module.css";

// Rebuilt bespoke to match v1's real Phái Sinh table exactly — it shows
// every real column continuously (not capped at a short preview), with
// v1's computed group columns (Artist+Composer, Producer+Mixer,
// Release Date+Time combined) and the link-or-edit URL pattern. PIC and
// Deadline are v2 additions layered on top, not in v1.
//
// Round 41 — merged with Phái Sinh (Batch): Type now decides the row's
// behavior (isKhoNhacType). Kho Nhạc-family rows (Kho nhạc / Chuyển net /
// Takedown) grey out the single-song-only fields, repurpose the URL cell
// into an "Open Batch" link into the same children table Batch Phái Sinh
// already used (app/tickets/batch-phai-sinh/[id]/page.js, unchanged —
// tab-agnostic), and get a mini counter dashboard computed from their
// phai_sinh_batch_items children.
const REFUND_LIKE = ["REFUND"];

export default function PhaiSinhList() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [query, setQuery] = useState(""); // round 76 — quick index search box
  const [relatedReleases, setRelatedReleases] = useState({}); // did -> release (gate_split_share/gate_phu_luc_publishing only)
  const [itemsByBatch, setItemsByBatch] = useState({}); // ticket id -> phai_sinh_batch_items rows, Kho Nhạc-family only

  const canEditDeadline = canEditLockedDeadline(profile); // round 57 — teamlead+

  const isExecutorView = !profile?.segment || isOpsTeam(profile.segment);

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name, segment, role").order("name").then(({ data }) => setProfiles(filterProfilesByTeam(data || [], "OPS"))); // round 78
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "phai_sinh").single();
    if (!tabRow) { setLoading(false); return; }
    setTab(tabRow);
    if (!statusFilter) setStatusFilter(tabRow.status_options[0]);
    const { data } = await supabase.from("tickets").select("*, profiles(name)").eq("tab_id", tabRow.id).is("deleted_at", null).order("created_at", { ascending: false });
    setTickets(data || []);
    // Related DID's own product — looked up so the Publishing/Splitshare
    // pill tags under Type can reflect that release's own gate fields
    // (gate_phu_luc_publishing / gate_split_share), per explicit request.
    const relatedDids = [...new Set((data || []).map((t) => t.data?.relatedDid).filter(Boolean))];
    if (relatedDids.length > 0) {
      const { data: rels } = await supabase.from("releases").select("did, gate_split_share, gate_phu_luc_publishing").in("did", relatedDids);
      const map = {};
      (rels || []).forEach((r) => (map[r.did] = r));
      setRelatedReleases(map);
    } else {
      setRelatedReleases({});
    }

    // Round 41 — Kho Nhạc-family tickets' mini counter dashboard is
    // computed from their children, same source table Batch Phái Sinh's
    // list page already grouped (app/tickets/batch-phai-sinh/page.js).
    const batchTicketIds = (data || []).filter((t) => isKhoNhacType(t.data?.typeRequest)).map((t) => t.id);
    if (batchTicketIds.length > 0) {
      const { data: items } = await supabase.from("phai_sinh_batch_items").select("*").in("batch_ticket_id", batchTicketIds).is("deleted_at", null);
      const grouped = {};
      (items || []).forEach((i) => { (grouped[i.batch_ticket_id] = grouped[i.batch_ticket_id] || []).push(i); });
      setItemsByBatch(grouped);
    } else {
      setItemsByBatch({});
    }
    setLoading(false);
  }

  async function updateDeadline(t, value) {
    const patch = { deadline: value || null };
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
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
    // Round 80 — refund/cancel-like moves require a short reason, folded
    // into ticket.data.note (see lib/statusNoteGate.js).
    if (statusNeedsNote(newStatus)) {
      const newData = withStatusNote(t.data, newStatus);
      if (!newData) return; // cancelled / no reason given — abort the change
      patch.data = newData;
    }
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  const visibleTickets = (isExecutorView
    ? tickets.filter((t) => t.status === statusFilter)
    : [...tickets].sort((a, b) => (REFUND_LIKE.includes(a.status) ? 0 : 1) - (REFUND_LIKE.includes(b.status) ? 0 : 1))
  ).filter((t) => matchesQuery(t, query));

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

          <SearchBox value={query} onChange={setQuery} placeholder="Search this list…" />

          {isExecutorView && tab && (
            <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
              {tab.status_options.map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`${styles.tabBtn} ${statusFilter === s ? styles.tabBtnActive : ""}`} style={{ border: statusFilter === s ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: statusFilter === s ? "rgba(255,107,26,0.1)" : "transparent" }}>
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
            {isMobile ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {pagedTickets.map((t) => (
                  <PhaiSinhRow
                    key={t.id}
                    mobile
                    ticket={t}
                    tab={tab}
                    profiles={profiles}
                    isExecutorView={isExecutorView}
                    relatedRelease={relatedReleases[t.data?.relatedDid]}
                    batchItems={itemsByBatch[t.id] || []}
                    canEditDeadline={canEditDeadline}
                    onUpdateField={updateField}
                    onUpdateStatus={updateStatus}
                    onUpdatePic={updatePic}
                    onAcknowledgeEdit={acknowledgeEdit}
                    onUpdateDeadline={updateDeadline}
                  />
                ))}
              </div>
            ) : (
            <div className={styles.scrollBox} style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh" }}>
            <table className={styles.table} style={{ minWidth: 2000 }}>
              <thead>
                <tr>
                  {/* Related DID no longer has its own column — moved into
                      the Tên Bài cell (see PhaiSinhRow) since each row is
                      already several lines tall, freeing up a column for
                      width instead. Widths tuned per explicit request:
                      Type/Label/Tên Bài/Artist/Contributor/Release/PIC
                      greatly widened, Tác Quyền a little, URL greatly
                      narrowed. */}
                  <th style={{ minWidth: 180 }}>Type</th>
                  <th style={{ minWidth: 180 }}>Label</th>
                  <th style={{ minWidth: 240 }}>Tên Bài</th>
                  <th style={{ minWidth: 240 }}>Artist</th>
                  {/* Contributor used to be an unbounded minWidth, which let
                      a long unbroken URL in the Mixer line (e.g. a raw
                      Drive folder link) blow the column way past its
                      neighbors — pinned to Artist's fixed width instead,
                      with word-break on the cell so long links wrap onto
                      their own line rather than stretching the column. */}
                  <th style={{ width: 240, minWidth: 240, maxWidth: 240 }}>Contributor</th>
                  <th style={{ minWidth: 180 }}>Release</th>
                  <th>Description</th>
                  <th style={{ minWidth: 200 }}>Tác Quyền</th>
                  <th style={{ minWidth: 70 }}>URL</th>
                  <th>Note</th>
                  {/* LBM url had no width cap at all, so the ellipsis
                      truncation LinkOrEditCell already applies never had a
                      bounded container to truncate against — capped to
                      double the URL column's width, matching that request. */}
                  <th style={{ minWidth: 140, maxWidth: 180 }}>LBM url</th>
                  <th style={{ minWidth: 130 }}>Hạn Cuối</th>
                  <th style={{ minWidth: 180 }}>PIC</th>
                  <th>Status</th>
                  <th style={{ minWidth: 220 }}>Kho Nhạc Progress</th>
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
                    relatedRelease={relatedReleases[t.data?.relatedDid]}
                    batchItems={itemsByBatch[t.id] || []}
                    canEditDeadline={canEditDeadline}
                    onUpdateField={updateField}
                    onUpdateStatus={updateStatus}
                    onUpdatePic={updatePic}
                    onAcknowledgeEdit={acknowledgeEdit}
                    onUpdateDeadline={updateDeadline}
                  />
                ))}
              </tbody>
            </table>
            </div>
            )}
            <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// Round 87 follow-up 5 — mobile prop, same "identical cell content, different
// wrapper" pattern used everywhere else this session (Booking Board, the
// generic ticket list). Every editable body below is exactly the markup the
// desktop <td> already rendered — just built once and reused so mobile can't
// drift from desktop's behavior.
const phaiSinhFieldLabelStyle = { fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 4 };

function PhaiSinhRow({ ticket, tab, profiles, isExecutorView, relatedRelease, batchItems, canEditDeadline, onUpdateField, onUpdateStatus, onUpdatePic, onAcknowledgeEdit, onUpdateDeadline, mobile = false }) {
  const d = ticket.data || {};
  const color = statusColor(ticket.status);
  const isRefundLike = REFUND_LIKE.includes(ticket.status);
  const statusEditable = isExecutorView || isRefundLike;
  const statusOptions = isExecutorView
    ? tab?.status_options || []
    : [ticket.status, tab?.default_status, "REFUND", "CANCELED"].filter((v, i, a) => v && a.indexOf(v) === i);
  const showEditedHighlight = isExecutorView && !!d.__requesterEdited;
  // Round 41 — Type now decides single-song vs Kho Nhạc/batch behavior.
  const isBatch = isKhoNhacType(d.typeRequest);
  const greyedStyle = isBatch ? { opacity: 0.4, pointerEvents: mobile ? undefined : "none" } : undefined;

  // Every field here is now editable from both sides — a requester's edit
  // just gets flagged (see showEditedHighlight) instead of the field
  // being locked read-only text.
  function textBody(key, value) {
    return (
      <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, width: mobile ? "100%" : undefined, boxSizing: "border-box" }} defaultValue={value || ""} onBlur={(e) => onUpdateField(ticket, key, e.target.value, !isExecutorView)} />
    );
  }
  function textareaBody(key, value) {
    return (
      <textarea className={styles.textarea} style={{ fontSize: 12, minHeight: 40, width: mobile ? "100%" : undefined, boxSizing: "border-box" }} defaultValue={value || ""} onBlur={(e) => onUpdateField(ticket, key, e.target.value, !isExecutorView)} />
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

  // Publishing/Splitshare pill tags — shown under Type when the related
  // DID's own release has that gate field ticked "Yes". Assumption:
  // "Publishing" maps to gate_phu_luc_publishing (the Legal Request field
  // literally labeled "Phụ Lục Publishing" on the release detail page) and
  // "Splitshare" maps to gate_split_share — flag if a different field was
  // meant.
  const relatedTags = [
    relatedRelease?.gate_phu_luc_publishing === "true" ? "Publishing" : null,
    relatedRelease?.gate_split_share === "true" ? "Splitshare" : null,
  ].filter(Boolean);

  const typeBody = (
    <>
      {/* Round 41 — free-text Type replaced with the real 4-option
          select (Phái sinh / Kho nhạc / Chuyển net / Takedown) — the one
          switch that decides which flow the whole row uses. */}
      <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12, minWidth: mobile ? 0 : 180, width: mobile ? "100%" : undefined }} value={d.typeRequest || PHAI_SINH_TYPE_OPTIONS[0]} onChange={(e) => onUpdateField(ticket, "typeRequest", e.target.value, !isExecutorView)}>
        {PHAI_SINH_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {relatedTags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
          {relatedTags.map((tag) => (
            <span key={tag} className={styles.pill}>{tag}</span>
          ))}
        </div>
      )}
    </>
  );

  const tenBaiBody = (
    <>
      <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, marginBottom: 4, width: mobile ? "100%" : undefined, boxSizing: "border-box" }} defaultValue={d.tenBai || ""} onBlur={(e) => onUpdateField(ticket, "tenBai", e.target.value, !isExecutorView)} disabled={isBatch} />
      {/* Related DID moved here from its own column, per explicit
          request — the row is already several lines tall (Artist/
          Contributor groups below), so this uses that height instead of
          costing a whole extra column. */}
      <input
        className={styles.input}
        style={{ padding: "4px 8px", fontSize: 11, opacity: 0.85, width: mobile ? "100%" : undefined, boxSizing: "border-box" }}
        placeholder="Related DID…"
        defaultValue={d.relatedDid || ""}
        onBlur={(e) => onUpdateField(ticket, "relatedDid", e.target.value, !isExecutorView)}
        disabled={isBatch}
      />
    </>
  );

  const urlBody = isBatch ? (
    // Round 57 fix — the column is narrow enough that "Open Batch ↗"
    // was wrapping mid-word wherever the browser happened to break
    // it (e.g. "Open Bat-ch"), which looked broken. Force a clean
    // 2-line break instead: "Open" / "Batch ↗".
    <Link
      href={`/tickets/batch-phai-sinh/${ticket.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.btnSmall}
      style={{ display: "inline-block", textAlign: "center", lineHeight: 1.3 }}
    >
      Open<br />Batch ↗
    </Link>
  ) : (
    <LinkOrEditCell styles={styles} value={d.url} onSave={(v) => onUpdateField(ticket, "url", v, !isExecutorView)} />
  );

  const deadlineBody = (
    <input
      type="date"
      className={styles.input}
      style={{ padding: "4px 6px", fontSize: 11, width: mobile ? "100%" : undefined, boxSizing: "border-box" }}
      defaultValue={ticket.deadline ? ticket.deadline.slice(0, 10) : ""}
      disabled={!canEditDeadline}
      title={!canEditDeadline ? "Only dev/admin can change the deadline." : undefined}
      onBlur={(e) => onUpdateDeadline(ticket, e.target.value || null)}
    />
  );

  const picBody = isExecutorView ? (
    <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12, minWidth: mobile ? 0 : "16ch", width: mobile ? "100%" : undefined }} value={ticket.pic_profile_id || ""} onChange={(e) => onUpdatePic(ticket, e.target.value)}>
      <option value="">— Unassigned —</option>
      {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  ) : (
    <span style={{ fontSize: 12 }}>{ticket.profiles?.name || "—"}</span>
  );

  const statusBody = statusEditable ? (
    <select value={ticket.status} onChange={(e) => onUpdateStatus(ticket, e.target.value)} style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>
      {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  ) : (
    <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{ticket.status}</span>
  );

  // Round 41 item 2d — mini counter dashboard, computed live from this
  // ticket's phai_sinh_batch_items children. Left blank for plain Phái
  // Sinh rows — they have no children.
  const progressBody = isBatch ? (
    batchItems.length === 0 ? (
      <span style={{ color: "var(--text-faint)" }}>No songs added</span>
    ) : (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        <span className={styles.pill}>Metadata {batchItems.filter(isMetadataConfirmed).length}/{batchItems.length}</span>
        {CHILD_STATUS_COUNTERS.map((s) => (
          <span key={s} className={styles.pill}>{s.charAt(0) + s.slice(1).toLowerCase()} {batchItems.filter((i) => i.status === s).length}</span>
        ))}
        <span className={styles.pill}>Takedown Bên Cũ {batchItems.filter((i) => i.takedown_ban_cu).length}</span>
      </div>
    )
  ) : (
    <span style={{ color: "var(--text-faint)" }}>—</span>
  );

  const editedBadge = showEditedHighlight && (
    <div
      title={`Edited by ${d.__requesterEditedBy || "requester"} — tap to clear`}
      onClick={() => onAcknowledgeEdit(ticket)}
      style={{ cursor: "pointer", fontSize: 9, fontWeight: 700, color: "var(--accent)", marginTop: 2, whiteSpace: "nowrap" }}
    >
      ✎ edited
    </div>
  );

  if (mobile) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, background: showEditedHighlight ? "rgba(255,107,26,0.06)" : "var(--bg-card)", boxShadow: showEditedHighlight ? "inset 3px 0 0 var(--accent)" : undefined }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={phaiSinhFieldLabelStyle}>Type</div>
            {typeBody}
            {editedBadge}
          </div>
          <div title={ticket.data?.note || undefined}>{statusBody}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={phaiSinhFieldLabelStyle}>Label</div>
            {textBody("label", d.label)}
          </div>
          <div style={greyedStyle}>
            <div style={phaiSinhFieldLabelStyle}>Tên Bài</div>
            {tenBaiBody}
          </div>
          <div style={greyedStyle}>
            <div style={phaiSinhFieldLabelStyle}>Artist</div>
            <div style={{ fontSize: 12, whiteSpace: "pre-line" }}>{artistGroup || "—"}</div>
          </div>
          <div style={greyedStyle}>
            <div style={phaiSinhFieldLabelStyle}>Contributor</div>
            <div style={{ fontSize: 12, whiteSpace: "pre-line", wordBreak: "break-word", overflowWrap: "break-word" }}>{contributorGroup || "—"}</div>
          </div>
          <div style={greyedStyle}>
            <div style={phaiSinhFieldLabelStyle}>Release</div>
            <div style={{ fontSize: 12 }}>{releaseGroup}</div>
          </div>
          <div>
            <div style={phaiSinhFieldLabelStyle}>Description</div>
            {textareaBody("description", d.description)}
          </div>
          <div>
            <div style={phaiSinhFieldLabelStyle}>Tác Quyền</div>
            {textareaBody("tacQuyen", d.tacQuyen)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={phaiSinhFieldLabelStyle}>URL</div>
              {urlBody}
            </div>
            <div style={greyedStyle}>
              <div style={phaiSinhFieldLabelStyle}>LBM url</div>
              <LinkOrEditCell styles={styles} value={d.refLink} onSave={(v) => onUpdateField(ticket, "refLink", v, !isExecutorView)} />
            </div>
          </div>
          <div>
            <div style={phaiSinhFieldLabelStyle}>Note</div>
            <NoteCell value={d.note} onSave={(v) => onUpdateField(ticket, "note", v, !isExecutorView)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={phaiSinhFieldLabelStyle}>Hạn Cuối</div>
              {deadlineBody}
            </div>
            <div>
              <div style={phaiSinhFieldLabelStyle}>PIC</div>
              {picBody}
            </div>
          </div>
          {isBatch && (
            <div>
              <div style={phaiSinhFieldLabelStyle}>Kho Nhạc Progress</div>
              <div style={{ fontSize: 10 }}>{progressBody}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Round 76 — item 3: every cell in this row aligns to the TOP
  // (verticalAlign: "top") instead of the browser default (middle), and
  // fills the cell's full height (height: "100%") instead of sitting at
  // its own natural size. Before this, a short single-line cell like
  // Label would vertical-center against whatever the tallest cell in the
  // row happened to be (Tên Bài's 2 stacked inputs, Artist/Contributor's
  // multi-line groups, …), so it visually floated away from the Type
  // select above it even though they're the same row. Now every cell
  // starts at the same top edge and stretches down to match, so the row
  // reads as one row regardless of which cell happens to have extra
  // hidden content.
  return (
    <tr style={showEditedHighlight ? { boxShadow: "inset 3px 0 0 var(--accent)", background: "rgba(255,107,26,0.06)" } : undefined}>
      <td style={{ verticalAlign: "top" }}>
        {typeBody}
        {editedBadge}
      </td>
      <td style={{ verticalAlign: "top" }}>{textBody("label", d.label)}</td>
      {/* Round 41 — Tên Bài/Related DID, Artist, Contributor, Release grey
          out (per explicit request "grey out if the row is not phái sinh
          type") for Kho Nhạc-family rows; that data lives per-song in the
          children table instead. */}
      <td style={{ verticalAlign: "top", ...greyedStyle }}>{tenBaiBody}</td>
      <td style={{ fontSize: 12, whiteSpace: "pre-line", verticalAlign: "top", ...greyedStyle }}>{artistGroup || "—"}</td>
      <td style={{ fontSize: 12, whiteSpace: "pre-line", width: 240, minWidth: 240, maxWidth: 240, wordBreak: "break-word", overflowWrap: "break-word", verticalAlign: "top", ...greyedStyle }}>{contributorGroup || "—"}</td>
      <td style={{ fontSize: 12, verticalAlign: "top", ...greyedStyle }}>{releaseGroup}</td>
      <td style={{ minWidth: 160, verticalAlign: "top" }}>{textareaBody("description", d.description)}</td>
      <td style={{ minWidth: 160, verticalAlign: "top" }}>{textareaBody("tacQuyen", d.tacQuyen)}</td>
      {/* URL repurposed into "Open Batch" for Kho Nhạc-family rows, per
          explicit request ("when choosing kho nhạc, change to the open
          the children table") — routes into the same expanded table Batch
          Phái Sinh already used (tab-agnostic, reused unchanged). */}
      <td style={{ minWidth: 70, maxWidth: isBatch ? 130 : 90, verticalAlign: "top" }}>{urlBody}</td>
      {/* Round 76 — item 1: Note now shows a compact hoverable preview
          (title= tooltip has the full text) + Edit button opening a
          bigger textarea in a modal, instead of an always-open small
          textarea. */}
      <td style={{ minWidth: 140, verticalAlign: "top" }}>
        <NoteCell value={d.note} onSave={(v) => onUpdateField(ticket, "note", v, !isExecutorView)} />
      </td>
      <td style={{ minWidth: 140, maxWidth: 180, verticalAlign: "top", ...greyedStyle }}><LinkOrEditCell styles={styles} value={d.refLink} onSave={(v) => onUpdateField(ticket, "refLink", v, !isExecutorView)} /></td>
      {/* Round 41 — Hạn Cuối: real deadline date picker, locked for `exc`
          role per explicit request ("lock for exc role") — only dev/admin
          can edit, same lock pattern as Batch Phái Sinh's item deadline. */}
      <td style={{ verticalAlign: "top" }}>{deadlineBody}</td>
      <td style={{ verticalAlign: "top" }}>{picBody}</td>
      {/* Round 80 — hover reveals the reason folded into data.note by
          statusNoteGate for refund/cancel-like status moves. */}
      <td style={{ verticalAlign: "top" }} title={ticket.data?.note || undefined}>{statusBody}</td>
      <td style={{ fontSize: 10, verticalAlign: "top" }}>{progressBody}</td>
    </tr>
  );
}
