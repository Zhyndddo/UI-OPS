"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "./supabaseClient";
import { fmtDate, statusColor } from "./helpers";
import { useAuth } from "./AuthContext";
import { TICKET_CONFIGS } from "./ticketConfigs";
import { isExecutorSegment } from "./teamTypes";
import { filterProfilesByTeam } from "./workstationHelpers";
import TypeSwitcher from "./TypeSwitcher";
import { usePagination } from "./usePagination";
import Pagination from "./Pagination";
import SearchBox, { matchesQuery } from "./SearchBox";
import NoteCell from "./NoteCell";
import ProfileSearchField from "./ProfileSearchField";
import { statusNeedsNote, withStatusNote } from "./statusNoteGate";
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
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [query, setQuery] = useState(""); // round 76 — quick index search box

  useEffect(() => {
    if (!supabase) return;
    load();
    // Round 78 — PIC list is now filtered to the type's own executor team
    // (config.executorTeam — already the exact team this type's PIC work
    // belongs to; null for shared/no-PIC types like Khác/Stream Update,
    // which leaves it unfiltered other than dropping dev), and dev never
    // shows up in any PIC list at all — see filterProfilesByTeam.
    supabase.from("profiles").select("id, name, segment, role").order("name").then(({ data }) => setProfiles(filterProfilesByTeam(data || [], config?.executorTeam)));
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", typeKey).single();
    if (!tabRow) { setLoading(false); return; }
    setTab(tabRow);
    if (!statusFilter) setStatusFilter(tabRow.status_options[0]);
    const { data } = await supabase
      .from("tickets")
      .select("*, profiles(name)")
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
  const isExecutorView = !config?.executorTeam || !profile?.segment || isExecutorSegment(profile.segment, config.executorTeam);

  // Every field is now editable from both sides — previously only fields
  // listed in config.bothEditable were requester-editable, everything
  // else showed as locked read-only text. Instead of blocking the edit,
  // a requester's change now just flags the ticket (data.__requesterEdited
  // + who/when/which field) and pings the executor team so it doesn't slip
  // by unnoticed — same trade-off the "highlight instead of block" ask
  // was going for.
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
    if (editedByRequester && config.executorTeam) {
      const fieldLabel = config.fields.find((f) => f.key === key)?.label || key;
      await supabase.rpc("fanout_notification", {
        p_team: config.executorTeam,
        p_type: "ticket_edited",
        p_title: `${config.label} ticket edited by requester`,
        p_body: `${profile?.name || "The requester"} changed "${fieldLabel}".`,
        p_link: basePath,
        p_ticket_id: t.id,
      });
    }
  }

  // Executor's way of clearing the "edited by requester" highlight once
  // they've seen it — doesn't touch the actual field values, just the flag.
  async function acknowledgeEdit(t) {
    const newData = { ...t.data, __requesterEdited: false };
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, data: newData } : x)));
    await supabase.from("tickets").update({ data: newData }).eq("id", t.id);
  }

  // Picking a PIC on a fresh (first-status) ticket is what actually moves
  // it into the working queue — matches the agreed cycle: order a ticket
  // -> sits at the starting status -> a PIC picks it up -> auto-advances
  // to the next status. No manual status click needed for that step.
  async function updatePic(t, profileId) {
    const patch = { pic_profile_id: profileId || null };
    if (profileId && t.status === tab.default_status) {
      const nextStatus = tab.status_options[1];
      if (nextStatus) {
        patch.status = nextStatus;
        patch.status_log = { ...t.status_log, [nextStatus]: new Date().toISOString() };
      }
    }
    const pic = profiles.find((p) => p.id === profileId);
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch, profiles: pic ? { name: pic.name } : null } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  // Refund clears the PIC — a real reset, not just a label. The next
  // person to pick it up starts the cycle fresh rather than inheriting a
  // stale assignment tied to the wrong/missing data that caused the refund.
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
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch, profiles: patch.pic_profile_id === null ? null : x.profiles } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  const visibleTickets = useMemo(() => {
    const base = isExecutorView
      ? tickets.filter((t) => t.status === statusFilter)
      // Requester view — no tabs, just surface refund-like ones first
      : [...tickets].sort((a, b) => (REFUND_LIKE.includes(a.status) ? 0 : 1) - (REFUND_LIKE.includes(b.status) ? 0 : 1));
    return base.filter((t) => matchesQuery(t, query));
  }, [tickets, isExecutorView, statusFilter, query]);

  const { pageRows: pagedTickets, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleTickets);

  if (!config) return <div className={styles.page}><div className={styles.container}>Unknown ticket type: {typeKey}</div></div>;

  const computedCols = COMPUTED_LIST_COLUMNS[typeKey] || [];
  const replaced = COMPUTED_REPLACES[typeKey] || [];
  const listFields = config.fields.filter((f) => !replaced.includes(f.key));
  const previewFields = [...computedCols, ...listFields].slice(0, 4);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <TypeSwitcher kind="ticket" current={typeKey} />
        <div className={styles.topRow}>
          <div>
            <div className={styles.eyebrow}>// Ticket</div>
            <h1 className={styles.title} style={{ marginBottom: 0 }}>{config.label}</h1>
          </div>
          <Link href={`${basePath}/new`} className={styles.btnPrimary}>+ New Ticket</Link>
        </div>

        <SearchBox value={query} onChange={setQuery} placeholder="Search this list…" />

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
          <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th><th>Ngày Order</th>
                {previewFields.map((f) => <th key={f.key}>{f.label}</th>)}
                <th>PIC</th><th>Deadline</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pagedTickets.map((t, i) => (
                <TicketRow
                  key={t.id}
                  ticket={t}
                  index={(page - 1) * pageSize + i}
                  previewFields={previewFields}
                  computedCols={computedCols}
                  config={config}
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
          </>
        )}
      </div>
    </div>
  );
}

function TicketRow({ ticket, index, previewFields, computedCols, config, tab, profiles, isExecutorView, onUpdateField, onUpdateStatus, onUpdatePic, onAcknowledgeEdit }) {
  // Round 86 item 1 — local in-progress text for profileSearch cells
  // (e.g. Khác's CC field), keyed by field key. Lets the search box filter
  // on every keystroke without writing to Supabase until a real commit
  // (selecting a match or blurring) — see ProfileSearchField's onCommit.
  const [rowDrafts, setRowDrafts] = useState({});
  const setRowDraft = (key, v) => setRowDrafts((d) => ({ ...d, [key]: v }));

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

  // Highlight only shows on the executor's side — the requester already
  // knows they just edited it.
  const showEditedHighlight = isExecutorView && !!ticket.data?.__requesterEdited;

  return (
    <tr style={showEditedHighlight ? { boxShadow: "inset 3px 0 0 var(--accent)", background: "rgba(255,107,26,0.06)" } : undefined}>
      <td>
        {index + 1}
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
      <td>{fmtDate(ticket.created_at)}</td>
      {previewFields.map((f) => {
        const isComputed = computedCols.some((c) => c.key === f.key);
        const value = isComputed ? f.compute(ticket.data) : ticket.data?.[f.key];
        // Every non-computed field is now editable from both sides — a
        // requester's edit gets flagged (see showEditedHighlight above)
        // instead of being blocked outright.
        const canEdit = !isComputed;
        if (!canEdit) {
          return (
            <td key={f.key} style={{ maxWidth: 200, whiteSpace: "pre-line", fontSize: 12 }}>
              {value || "—"}
            </td>
          );
        }
        // Round 76 — Note fields get the shared hover-preview + edit-modal
        // cell instead of an always-visible input, same as every other
        // list's Note column.
        if (f.key === "note") {
          return (
            <td key={f.key}>
              <NoteCell value={value} onSave={(v) => onUpdateField(ticket, f.key, v, !isExecutorView)} />
            </td>
          );
        }
        // Round 86 item 1 — Khác's CC field gets the same search-picker
        // here as on the creation form, instead of a plain input, so
        // inline list-editing stays consistent with NewTicketPage.
        if (f.type === "profileSearch") {
          return (
            <td key={f.key}>
              <ProfileSearchField
                styles={styles}
                value={rowDrafts[f.key] ?? value ?? ""}
                onChange={(v) => setRowDraft(f.key, v)}
                onCommit={(v) => { setRowDraft(f.key, undefined); onUpdateField(ticket, f.key, v, !isExecutorView); }}
                placeholder={f.label}
              />
            </td>
          );
        }
        return (
          <td key={f.key}>
            <input
              className={styles.input}
              style={{ padding: "4px 8px", fontSize: 12, minWidth: 180 }}
              defaultValue={value || ""}
              onBlur={(e) => onUpdateField(ticket, f.key, e.target.value, !isExecutorView)}
            />
          </td>
        );
      })}
      <td>
        {isExecutorView ? (
          <select
            className={styles.select}
            style={{ padding: "4px 8px", fontSize: 12, minWidth: "16ch" }}
            value={ticket.pic_profile_id || ""}
            onChange={(e) => onUpdatePic(ticket, e.target.value)}
          >
            <option value="">— Unassigned —</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <span style={{ fontSize: 12 }}>{ticket.profiles?.name || "—"}</span>
        )}
      </td>
      <td>{fmtDate(ticket.deadline)}</td>
      <td title={ticket.data?.note || undefined}>
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
