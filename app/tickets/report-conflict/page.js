"use client";

// Round 144 — Report Conflict's list page, rebuilt bespoke (see
// lib/ticketConfigs.js's comment on the now-unused generic config entry).
// The generic TicketListPage engine shows the exact same columns
// regardless of which status tab is active (just the first 4 fields,
// always); this ticket type needed a genuinely different column SET per
// tab, several of them computed rather than raw fields — something the
// generic engine has no support for at all.
//
// Underlying status VALUES in the DB are unchanged (still the Vietnamese
// vocabulary in ticket_tabs.status_options: 'Chưa bắt đầu' / 'Đã submit
// chờ duyệt' / 'Hoàn thành' / 'Từ chối' / 'Hủy') — only the TAB LABELS
// shown to the user are renamed (REQUEST/PROCESS/COMPLETE/REFUND), and
// only the Hủy tab BUTTON is hidden from the bar. 'Hủy' stays a valid
// status a ticket could theoretically still carry (nothing here strips it
// out of ticket_tabs.status_options), it just has no dedicated tab to
// filter down to anymore, matching the literal "remove this tab" ask
// rather than retiring the status value itself.
//
// Assumptions made building this (flagged, not asked, to keep this round
// moving — easy to adjust if any are wrong):
//   - The REQUEST tab's column list named both "Note" and "Next step"
//     separately, but the clarifying answer for "Next step" was "it's
//     just the Note field, not a new one" — so REQUEST shows ONE Note
//     column, not two. If a genuinely separate Next Step field/column was
//     wanted after all, flag it and it's a small add.
//   - "Lí Do" (PROCESS/COMPLETE/REFUND) reads the most recent bracketed
//     reason left in the Note field by the shared statusNeedsNote/
//     withStatusNote prompt (fires on moving a ticket to Từ chối) — see
//     parseReasonFromNote below. No separate "reason" field/column was
//     added; this parses the existing shared mechanism's output instead,
//     since every other ticket type in the app already relies on that
//     same mechanism and duplicating it risked the two drifting apart.
//   - "Thời gian xử lý" (REFUND) = the ticket's created_at to its Từ chối
//     status_log timestamp, shown as a whole/rounded number of days.
//   - Round 145 — PIC restored (per explicit follow-up: "i was defaulting
//     to PIC was a must column"), same full behavior the generic engine
//     had — profiles filtered to the executor team, assigning a PIC on a
//     fresh (Chưa bắt đầu) ticket auto-advances it to the next status.
//     Rendered as its own fixed column on every tab (not per-tab-listed,
//     since it's a constant, not part of the varying set), same position
//     the generic engine used it in, right before Status. Deadline was
//     NOT asked back — still dropped; only PIC was flagged as the missing
//     must-have, and no column list mentions Deadline at all.
//   - REFUND's column list named "Reported Link" AND "Reported Link /
//     Official Link" both — included both exactly as listed rather than
//     assuming one was a copy/paste duplicate; trivial to drop either.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import { isExecutorSegment } from "../../../lib/teamTypes";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import SearchBox, { matchesQuery } from "../../../lib/SearchBox";
import NoteCell from "../../../lib/NoteCell";
import { statusNeedsNote, withStatusNote } from "../../../lib/statusNoteGate";
import { useIsMobile } from "../../../lib/useIsMobile";
import { filterProfilesByTeam } from "../../../lib/workstationHelpers";
import styles from "../../shared.module.css";

const REQUESTER_TEAM = "AR";
const EXECUTOR_TEAM = "OPS";

// Real DB status values, in the order the tab bar shows them. 'Hủy' is
// deliberately left out — hidden from the bar, per explicit request —
// while staying a valid value in ticket_tabs.status_options.
const VISIBLE_STATUSES = ["Chưa bắt đầu", "Đã submit chờ duyệt", "Hoàn thành", "Từ chối"];
const TAB_LABELS = {
  "Chưa bắt đầu": "REQUEST",
  "Đã submit chờ duyệt": "PROCESS",
  "Hoàn thành": "COMPLETE",
  "Từ chối": "REFUND",
};
const REFUND_LIKE = ["Từ chối"];
const CONFLICT_TYPES = ["TikTok", "YouTube", "Facebook", "Spotify"];

function effectiveOfficialLink(d) {
  return d?.conflictType === "YouTube" ? d?.linkMVYoutube : d?.officialURL;
}
function slashJoin(a, b) {
  return `${a || "—"} / ${b || "—"}`;
}
// Pulls the most recent "[Từ chối — <stamp>] <reason>" entry withStatusNote
// (lib/statusNoteGate.js) appended into data.note, for the "Lí Do" column
// — see this file's top comment for why it's parsed rather than a
// separate stored field.
function parseReasonFromNote(note) {
  if (!note) return null;
  const matches = [...note.matchAll(/\[Từ chối — [^\]]+\]\s*([^\n]*)/g)];
  return matches.length ? matches[matches.length - 1][1].trim() || null : null;
}
function processingDays(createdAt, refundedAt) {
  if (!createdAt || !refundedAt) return null;
  const ms = new Date(refundedAt).getTime() - new Date(createdAt).getTime();
  if (isNaN(ms) || ms < 0) return null;
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  return `${days} ngày`;
}

// Column definitions per tab. `key` is either a raw ticket.data field (its
// value flows through the same editable input every other field uses) or
// one of the computed keys handled specially in fieldValue/fieldBody
// below. `editable: false` on a column marks it as always-computed/
// display-only, never a plain text input.
const COLS = {
  "Chưa bắt đầu": [
    { key: "__received", label: "Ngày Nhận Request", editable: false },
    { key: "conflictType", label: "TYPE" },
    { key: "assetTitle", label: "Asset Title" },
    { key: "artist", label: "Artist" },
    { key: "reportedISRC", label: "Reported ISRC" },
    { key: "reportedUPC", label: "Reported UPC" },
    { key: "reportedURL", label: "Reported Link" },
    { key: "label", label: "Label" },
    { key: "officialSongTitle", label: "Official Song Title" },
    { key: "officialArtist", label: "Official Artist" },
    { key: "officialISRC", label: "Official ISRC" },
    { key: "officialUPC", label: "Official UPC" },
    { key: "__officialSoundLink", label: "Official Sound Link", editable: false },
    { key: "originalReleaseDate", label: "Release date" },
    { key: "tiktokProfile", label: "Hình profile Tiktok" },
    { key: "note", label: "Note" },
  ],
  "Đã submit chờ duyệt": [
    { key: "__received", label: "Ngày Nhận Request", editable: false },
    { key: "conflictType", label: "TYPE" },
    { key: "assetTitle", label: "Asset Title" },
    { key: "artist", label: "Artist" },
    { key: "reportedISRC", label: "Reported ISRC" },
    { key: "reportedUPC", label: "Reported UPC" },
    { key: "reportedURL", label: "Reported Link" },
    { key: "label", label: "Label" },
    { key: "officialSongTitle", label: "Official Song Title" },
    { key: "officialArtist", label: "Official Artist" },
    { key: "__officialSoundLink", label: "Official Sound Link", editable: false },
    { key: "originalReleaseDate", label: "Release date" },
    { key: "tiktokProfile", label: "Hình profile Tiktok" },
    { key: "note", label: "Note" },
    { key: "__reason", label: "Lí Do", editable: false },
  ],
  "Hoàn thành": [
    { key: "__received", label: "Ngày Nhận Request", editable: false },
    { key: "conflictType", label: "TYPE" },
    { key: "assetTitle", label: "Asset Title" },
    { key: "artist", label: "Artist" },
    { key: "__reportedIsrcUpc", label: "Reported ISRC/UPC", editable: false },
    { key: "label", label: "Label" },
    { key: "officialSongTitle", label: "Official Song Title" },
    { key: "officialArtist", label: "Official Artist" },
    { key: "__officialUpcIsrc", label: "Official UPC/ISRC", editable: false },
    { key: "__reportedOfficialLink", label: "Reported Link / Official Link", editable: false },
    { key: "originalReleaseDate", label: "Release date" },
    { key: "tiktokProfile", label: "Hình profile Tiktok" },
    { key: "note", label: "Note" },
    { key: "__completedAt", label: "Ngày hoàn thành", editable: false },
  ],
  "Từ chối": [
    { key: "__received", label: "Ngày Nhận Request", editable: false },
    { key: "conflictType", label: "TYPE" },
    { key: "assetTitle", label: "Asset Title" },
    { key: "artist", label: "Artist" },
    { key: "__reportedIsrcUpc", label: "Reported ISRC/UPC", editable: false },
    { key: "reportedURL", label: "Reported Link" },
    { key: "label", label: "Label" },
    { key: "officialSongTitle", label: "Official Song Title" },
    { key: "officialArtist", label: "Official Artist" },
    { key: "__officialUpcIsrc", label: "Official UPC/ISRC", editable: false },
    { key: "__reportedOfficialLink", label: "Reported Link / Official Link", editable: false },
    { key: "originalReleaseDate", label: "Release date" },
    { key: "tiktokProfile", label: "Hình profile Tiktok" },
    { key: "note", label: "Note" },
    { key: "__refundedAt", label: "Ngày từ chối", editable: false },
    { key: "__reason", label: "Lí Do", editable: false },
    { key: "__processingTime", label: "Thời gian xử lý", editable: false },
    { key: "__requester", label: "Requester", editable: false },
  ],
};

function computedValue(key, ticket) {
  const d = ticket.data || {};
  switch (key) {
    case "__received": return fmtDate(ticket.created_at);
    case "__officialSoundLink": return effectiveOfficialLink(d) || "—";
    case "__reportedIsrcUpc": return slashJoin(d.reportedISRC, d.reportedUPC);
    case "__officialUpcIsrc": return slashJoin(d.officialUPC, d.officialISRC);
    case "__reportedOfficialLink": return slashJoin(d.reportedURL, effectiveOfficialLink(d));
    case "__completedAt": return ticket.status_log?.["Hoàn thành"] ? fmtDate(ticket.status_log["Hoàn thành"]) : "—";
    case "__refundedAt": return ticket.status_log?.["Từ chối"] ? fmtDate(ticket.status_log["Từ chối"]) : "—";
    case "__reason": return parseReasonFromNote(d.note) || "—";
    case "__processingTime": return processingDays(ticket.created_at, ticket.status_log?.["Từ chối"]) || "—";
    case "__requester": return `${ticket.requester_name || "—"}${ticket.requester_segment ? ` (${ticket.requester_segment})` : ""}`;
    default: return "—";
  }
}

export default function ReportConflictPage() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!supabase) return;
    load();
    // Round 145 — PIC list, same "profiles on the executor team, dev
    // excluded" scoping the generic engine used (see filterProfilesByTeam).
    supabase.from("profiles").select("id, name, segment, role").order("name").then(({ data }) => setProfiles(filterProfilesByTeam(data || [], EXECUTOR_TEAM)));
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "report_conflict").single();
    if (!tabRow) { setLoading(false); return; }
    setTab(tabRow);
    if (!statusFilter) setStatusFilter(VISIBLE_STATUSES[0]);
    // Round 145 — profiles(name) join restored alongside PIC.
    const { data } = await supabase
      .from("tickets")
      .select("*, profiles(name)")
      .eq("tab_id", tabRow.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setTickets(data || []);
    setLoading(false);
  }

  const isExecutorView = !profile?.segment || isExecutorSegment(profile.segment, EXECUTOR_TEAM);

  async function updateField(t, key, value) {
    const newData = { ...t.data, [key]: value };
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, data: newData } : x)));
    await supabase.from("tickets").update({ data: newData }).eq("id", t.id);
  }

  async function updateStatus(t, newStatus) {
    const newLog = { ...t.status_log, [newStatus]: new Date().toISOString() };
    const patch = { status: newStatus, status_log: newLog };
    if (statusNeedsNote(newStatus)) {
      const newData = withStatusNote(t.data, newStatus);
      if (!newData) return;
      patch.data = newData;
    }
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  // Round 145 — restored, same behavior the generic engine had: picking a
  // PIC on a fresh (starting-status) ticket is what actually moves it
  // into the working queue, auto-advancing to the next status — no
  // separate manual status click needed for that step.
  async function updatePic(t, profileId) {
    const patch = { pic_profile_id: profileId || null };
    if (profileId && t.status === tab.default_status) {
      const nextStatus = VISIBLE_STATUSES[VISIBLE_STATUSES.indexOf(tab.default_status) + 1];
      if (nextStatus) {
        patch.status = nextStatus;
        patch.status_log = { ...t.status_log, [nextStatus]: new Date().toISOString() };
      }
    }
    const pic = profiles.find((p) => p.id === profileId);
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch, profiles: pic ? { name: pic.name } : null } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  const visibleTickets = useMemo(() => {
    const base = isExecutorView
      ? tickets.filter((t) => t.status === statusFilter)
      : [...tickets].sort((a, b) => (REFUND_LIKE.includes(a.status) ? 0 : 1) - (REFUND_LIKE.includes(b.status) ? 0 : 1));
    return base.filter((t) => matchesQuery(t, query));
  }, [tickets, isExecutorView, statusFilter, query]);

  const { pageRows: pagedTickets, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleTickets);

  // Requester view has no per-status tab bar (matches the generic
  // engine's convention), so it needs its own column set — reuses the
  // REQUEST tab's columns since that's the closest general-purpose set.
  const cols = isExecutorView ? COLS[statusFilter] || [] : COLS["Chưa bắt đầu"];

  if (loading) {
    return (
      <AppShell>
        <div className={styles.page}>
          <div className={styles.container}>
            <div className={styles.emptyState}>Loading…</div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <TypeSwitcher kind="ticket" current="report_conflict" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Report Conflict</h1>
            </div>
            <Link href="/tickets/report-conflict/new" className={styles.btnPrimary}>+ New Ticket</Link>
          </div>

          <SearchBox value={query} onChange={setQuery} placeholder="Search this list…" />

          {isExecutorView && (
            <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
              {VISIBLE_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`${styles.tabBtn} ${statusFilter === s ? styles.tabBtnActive : ""}`}
                  style={{ border: "1px solid var(--border)", borderRadius: 6 }}
                >
                  {TAB_LABELS[s]}
                </button>
              ))}
            </div>
          )}

          {visibleTickets.length === 0 ? (
            <div className={styles.emptyState}>
              {isExecutorView ? `No tickets with status "${TAB_LABELS[statusFilter] || statusFilter}".` : "No tickets yet."}
            </div>
          ) : isMobile ? (
            <>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {pagedTickets.map((t, i) => (
                <ReportConflictRow key={t.id} mobile ticket={t} index={(page - 1) * pageSize + i} cols={cols} profiles={profiles} isExecutorView={isExecutorView} onUpdateField={updateField} onUpdateStatus={updateStatus} onUpdatePic={updatePic} />
              ))}
            </div>
            <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
            </>
          ) : (
            <>
            <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  {cols.map((c) => <th key={c.key}>{c.label}</th>)}
                  <th>PIC</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pagedTickets.map((t, i) => (
                  <ReportConflictRow key={t.id} ticket={t} index={(page - 1) * pageSize + i} cols={cols} profiles={profiles} isExecutorView={isExecutorView} onUpdateField={updateField} onUpdateStatus={updateStatus} onUpdatePic={updatePic} />
                ))}
              </tbody>
            </table>
            </div>
            <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

const fieldLabelStyle = { fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 4 };

function ReportConflictRow({ ticket, index, cols, profiles, isExecutorView, onUpdateField, onUpdateStatus, onUpdatePic, mobile = false }) {
  const status = ticket.status;
  const color = statusColor(status);
  const isRefundLike = REFUND_LIKE.includes(status);
  const statusEditable = isExecutorView || isRefundLike;
  const statusOptions = isExecutorView ? VISIBLE_STATUSES : [status, "Chưa bắt đầu"].filter((v, i, a) => v && a.indexOf(v) === i);

  function fieldBody(c) {
    if (c.editable === false) {
      const value = computedValue(c.key, ticket);
      return <div style={{ maxWidth: mobile ? "none" : 200, whiteSpace: "pre-line", fontSize: 12 }}>{value}</div>;
    }
    const value = ticket.data?.[c.key];
    if (c.key === "note") {
      return <NoteCell value={value} onSave={(v) => onUpdateField(ticket, c.key, v)} />;
    }
    // Item 1 — Type stays a single-choice dropdown for inline list edits
    // too, not a free-text input, so an existing ticket's Type can't drift
    // into a value the create form's dropdown wouldn't allow.
    if (c.key === "conflictType") {
      return (
        <select
          className={styles.select}
          style={{ padding: "4px 8px", fontSize: 12, minWidth: mobile ? 0 : 120, width: mobile ? "100%" : undefined }}
          value={value || ""}
          onChange={(e) => onUpdateField(ticket, c.key, e.target.value)}
        >
          <option value="">—</option>
          {CONFLICT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      );
    }
    return (
      <input
        className={styles.input}
        style={{ padding: "4px 8px", fontSize: 12, minWidth: mobile ? 0 : 160, width: mobile ? "100%" : undefined, boxSizing: "border-box" }}
        defaultValue={value || ""}
        onBlur={(e) => onUpdateField(ticket, c.key, e.target.value)}
      />
    );
  }

  const statusBody = statusEditable ? (
    <select
      value={status}
      onChange={(e) => onUpdateStatus(ticket, e.target.value)}
      style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}
    >
      {statusOptions.map((s) => <option key={s} value={s}>{TAB_LABELS[s] || s}</option>)}
    </select>
  ) : (
    <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{TAB_LABELS[status] || status}</span>
  );

  // Round 145 — PIC restored, same picker/behavior the generic engine had.
  const picBody = isExecutorView ? (
    <select
      className={styles.select}
      style={{ padding: "4px 8px", fontSize: 12, minWidth: mobile ? 0 : "16ch", width: mobile ? "100%" : undefined }}
      value={ticket.pic_profile_id || ""}
      onChange={(e) => onUpdatePic(ticket, e.target.value)}
    >
      <option value="">— Unassigned —</option>
      {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  ) : (
    <span style={{ fontSize: 12 }}>{ticket.profiles?.name || "—"}</span>
  );

  if (mobile) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, background: "var(--bg-card)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>#{index + 1}</div>
          {statusBody}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {cols.map((c) => (
            <div key={c.key}>
              <div style={fieldLabelStyle}>{c.label}</div>
              {fieldBody(c)}
            </div>
          ))}
          <div>
            <div style={fieldLabelStyle}>PIC</div>
            {picBody}
          </div>
        </div>
      </div>
    );
  }

  return (
    <tr>
      <td>{index + 1}</td>
      {cols.map((c) => <td key={c.key}>{fieldBody(c)}</td>)}
      <td>{picBody}</td>
      <td>{statusBody}</td>
    </tr>
  );
}
