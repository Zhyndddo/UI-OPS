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
import PicTagInput from "./PicTagInput";
import { statusNeedsNote, withStatusNote } from "./statusNoteGate";
import { useIsMobile } from "./useIsMobile";
import { logTicketStatusChange, logPicReassign } from "./auditLog";
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

// Round 146 follow-up — per-type override that swaps a plain-text field's
// list-view column for a read-only value pulled off the field's matching
// release instead (matched via config.releaseFieldMap, which every type
// using this already has for the New Ticket auto-fill). Currently just
// Hợp Đồng Nhạc Số's DID column -> the release's Label — scoped to one
// type by design; add more entries here rather than changing the default
// behavior for every generic ticket list.
const RELEASE_COLUMN_OVERRIDES = {
  hop_dong_nhac_so: { fieldKey: "releaseId", label: "Label", selectField: "label", compute: (release, rawValue) => release?.label || rawValue || "—" },
};

// Round 275 — buffered server-side pagination (executor view only; the
// requester view has no status dimension to scope a query by and is
// generally much lower volume, so its "fetch everything for this tab"
// behavior is left exactly as it was before this round). Full writeup in
// claude/server-side-pagination-pitch.md.
//
// - A status tab with SMALL_RESULT_THRESHOLD rows or fewer is just
//   fetched whole, once — byte-identical to the old behavior, including
//   full-tab client-side search.
// - Above that, we fetch a "buffer" (BUFFER_PAGE_MULTIPLIER pages' worth
//   of rows around wherever the user is paging) instead of the whole tab.
//   Paging inside the buffer is a free client-side slice; paging past its
//   edge triggers a fresh buffer fetch anchored around the new page
//   ("reset on miss" — a plain replace, not an append/merge).
// - The moment a search query goes active in a large tab, we fall back to
//   fetching that tab's full status-scoped set once (still just ONE
//   status — already better than today's all-statuses fetch) so search
//   never silently misses a row sitting outside whatever buffer happened
//   to be loaded, and stays out of that fetch again for further keystrokes
//   since the full set is now already in hand.
const SMALL_RESULT_THRESHOLD = 200;
const BUFFER_PAGE_MULTIPLIER = 5;

// Anchor a buffer fetch a couple of pages *before* the requested page (not
// exactly on it) so paging one step back from a fresh buffer still hits
// cache instead of missing immediately.
function computeAnchorPage(targetPage) {
  const half = Math.floor(BUFFER_PAGE_MULTIPLIER / 2);
  return Math.max(1, targetPage - half);
}

export default function TicketListPage({ typeKey, basePath, externalLink }) {
  const config = TICKET_CONFIGS[typeKey];
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [releaseMap, setReleaseMap] = useState({}); // DID -> release row, only populated when RELEASE_COLUMN_OVERRIDES[typeKey] is set
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [query, setQuery] = useState(""); // round 76 — quick index search box
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const releaseOverride = RELEASE_COLUMN_OVERRIDES[typeKey] || null;

  // Round 275 — buffer-mode bookkeeping. `bufferMode` off means `tickets`
  // already holds every row relevant to the current view (requester view,
  // a small tab, or an active search) and the plain client-side
  // usePagination further below is in charge, same as before this round.
  const [bufferMode, setBufferMode] = useState(false);
  const [bufferAnchorPage, setBufferAnchorPage] = useState(1); // page number tickets[0] belongs to, while bufferMode is on
  const [bufferTotalRows, setBufferTotalRows] = useState(0);
  const [bufferLoading, setBufferLoading] = useState(false); // separate, smaller spinner for a paging-triggered buffer refetch
  const [bufPage, setBufPage] = useState(1);
  const [bufPageSize, setBufPageSize] = useState(50);

  useEffect(() => {
    if (!supabase) return;
    loadTab();
    // Round 78 — PIC list is now filtered to the type's own executor team
    // (config.executorTeam — already the exact team this type's PIC work
    // belongs to; null for shared/no-PIC types like Khác/Stream Update,
    // which leaves it unfiltered other than dropping dev), and dev never
    // shows up in any PIC list at all — see filterProfilesByTeam.
    supabase.from("profiles").select("id, name, segment, role").order("name").then(({ data }) => setProfiles(filterProfilesByTeam(data || [], config?.executorTeam)));
  }, []);

  // Debounce the search box before it's allowed to trigger a network
  // fetch (see loadRows below) — the box itself still filters whatever's
  // already loaded on every keystroke, instantly, via `query` (not this).
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  async function loadTab() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", typeKey).single();
    if (!tabRow) { setLoading(false); return; }
    setTab(tabRow);
    // If this is the first load, setting statusFilter here just kicks off
    // the [tab, statusFilter, ...] effect below, which calls loadRows —
    // nothing else to do in that case.
    if (!statusFilter) setStatusFilter(tabRow.status_options[0]);
    else await loadRows(tabRow, statusFilter, debouncedQuery.length > 0);
  }

  // Dual-view: no executorTeam configured = always the fuller view (no
  // natural requester/executor split for this type). Otherwise, being on
  // the executor team (or having no team at all, i.e. dev) gets the
  // executor view; everyone else gets the requester view.
  const isExecutorView = !config?.executorTeam || !profile?.segment || isExecutorSegment(profile.segment, config.executorTeam);
  const hasActiveSearch = debouncedQuery.length > 0;

  useEffect(() => {
    if (!tab || !statusFilter) return;
    loadRows(tab, statusFilter, hasActiveSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusFilter, isExecutorView, hasActiveSearch]);

  async function fetchBuffer(tabRow, status, anchorPage, size) {
    const bufferSize = size * BUFFER_PAGE_MULTIPLIER;
    const from = (anchorPage - 1) * size;
    const to = from + bufferSize - 1;
    const { data } = await supabase
      .from("tickets")
      .select("*, profiles!tickets_pic_profile_id_fkey(name)")
      .eq("tab_id", tabRow.id)
      .is("deleted_at", null)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .range(from, to);
    return data || [];
  }

  async function loadRows(tabRow, status, hasSearch) {
    setLoading(true);
    setBufferMode(false);

    if (!isExecutorView) {
      // Requester view — unchanged: fetch everything for this tab, no
      // status scoping (there's no status-tab UI on this side).
      const { data } = await supabase
        .from("tickets")
        .select("*, profiles!tickets_pic_profile_id_fkey(name)")
        .eq("tab_id", tabRow.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      setTickets(data || []);
      setLoading(false);
      return;
    }

    // Executor view — always scoped to the active status tab now (a real
    // improvement on its own: before this round every status got fetched
    // and everything but the active tab was thrown away client-side).
    const { count } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("tab_id", tabRow.id)
      .is("deleted_at", null)
      .eq("status", status);
    const total = count ?? 0;

    if (total <= SMALL_RESULT_THRESHOLD || hasSearch) {
      // Small tab, or an active search in a large one — fetch the whole
      // status-scoped set once.
      const { data } = await supabase
        .from("tickets")
        .select("*, profiles!tickets_pic_profile_id_fkey(name)")
        .eq("tab_id", tabRow.id)
        .is("deleted_at", null)
        .eq("status", status)
        .order("created_at", { ascending: false });
      setTickets(data || []);
      setBufPage(1);
      setLoading(false);
      return;
    }

    // Large tab, no active search — fetch just a buffer around page 1.
    const anchor = computeAnchorPage(1);
    const rows = await fetchBuffer(tabRow, status, anchor, bufPageSize);
    setTickets(rows);
    setBufferMode(true);
    setBufferAnchorPage(anchor);
    setBufferTotalRows(total);
    setBufPage(1);
    setLoading(false);
  }

  // Paging inside a large tab — a step within the current buffer is a
  // free client-side page flip; a step past its edge is a "buffer miss"
  // that fetches a fresh buffer anchored around the newly requested page.
  async function gotoBufferPage(nextPageOrUpdater) {
    const target = typeof nextPageOrUpdater === "function" ? nextPageOrUpdater(bufPage) : nextPageOrUpdater;
    const bufferPages = Math.max(1, Math.ceil((tickets.length || 1) / bufPageSize));
    const withinBuffer = target >= bufferAnchorPage && target < bufferAnchorPage + bufferPages;
    if (withinBuffer) {
      setBufPage(target);
      return;
    }
    setBufferLoading(true);
    const anchor = computeAnchorPage(target);
    const rows = await fetchBuffer(tab, statusFilter, anchor, bufPageSize);
    setTickets(rows);
    setBufferAnchorPage(anchor);
    setBufPage(target);
    setBufferLoading(false);
  }

  async function changeBufferPageSize(nextSizeOrUpdater) {
    const target = typeof nextSizeOrUpdater === "function" ? nextSizeOrUpdater(bufPageSize) : nextSizeOrUpdater;
    setBufferLoading(true);
    setBufPageSize(target);
    const anchor = computeAnchorPage(1);
    const rows = await fetchBuffer(tab, statusFilter, anchor, target);
    setTickets(rows);
    setBufferAnchorPage(anchor);
    setBufPage(1);
    setBufferLoading(false);
  }

  // Round 146 follow-up's release-override lookup — now keyed off
  // whatever `tickets` currently holds (the whole tab, a search result
  // set, or just the active buffer chunk), merging into the existing map
  // instead of replacing it so DIDs already resolved by an earlier buffer
  // aren't forgotten when paging moves the window.
  useEffect(() => {
    if (!releaseOverride || tickets.length === 0) return;
    const dids = [...new Set(tickets.map((t) => t.data?.[releaseOverride.fieldKey]).filter(Boolean))];
    if (dids.length === 0) return;
    supabase.from("releases").select(`id, did, ${releaseOverride.selectField}`).in("did", dids).then(({ data: rels }) => {
      if (!rels || rels.length === 0) return;
      setReleaseMap((prev) => {
        const map = { ...prev };
        rels.forEach((r) => (map[r.did] = r));
        return map;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, releaseOverride]);

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
  //
  // Round 279 — PIC is now a tag list (pic_profile_ids), not one profile.
  // pic_profile_id (singular) is still written on every change too, kept
  // as the array's first entry (or null once it's emptied) — every OTHER
  // ticket-list page not yet converted to the tag UI (task-table
  // attribution, the same auto-advance rule on its own bespoke pages,
  // etc.) still reads only that column, so it keeps seeing a sane single
  // value even on a ticket tagged with several people here. The auto-
  // advance rule now fires the moment the tag list goes from empty to
  // non-empty (was "a profile got picked at all") — same "first PIC picked
  // up the ticket" moment, just generalized to a list.
  async function updatePics(t, ids) {
    const prevIds = t.pic_profile_ids || (t.pic_profile_id ? [t.pic_profile_id] : []);
    const patch = { pic_profile_ids: ids.length > 0 ? ids : null, pic_profile_id: ids[0] || null };
    if (prevIds.length === 0 && ids.length > 0 && t.status === tab.default_status) {
      const nextStatus = tab.status_options[1];
      if (nextStatus) {
        patch.status = nextStatus;
        patch.status_log = { ...t.status_log, [nextStatus]: new Date().toISOString() };
      }
    }
    const firstPic = profiles.find((p) => p.id === ids[0]);
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch, profiles: firstPic ? { name: firstPic.name } : null } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
    // Round 281 — audit log / requester attribution
    logPicReassign({ actor: profile?.id, entity: "ticket", entityId: t.id, before: prevIds, after: patch.pic_profile_ids });
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
    // Round 281 — audit log / requester attribution
    logTicketStatusChange({ actor: profile?.id, ticketId: t.id, prevStatus: t.status, newStatus, statusOptions: tab?.status_options });
  }

  const visibleTickets = useMemo(() => {
    const base = isExecutorView
      // `tickets` is already status-scoped from the server in every
      // executor-view mode (whole tab, search fetch, or buffer chunk) —
      // this re-check is what makes a status change made right here (the
      // optimistic setTickets in updateStatus) drop the row out of view
      // immediately instead of waiting on the next fetch.
      ? tickets.filter((t) => t.status === statusFilter)
      // Requester view — no tabs, just surface refund-like ones first
      : [...tickets].sort((a, b) => (REFUND_LIKE.includes(a.status) ? 0 : 1) - (REFUND_LIKE.includes(b.status) ? 0 : 1));
    return base.filter((t) => matchesQuery(t, query));
  }, [tickets, isExecutorView, statusFilter, query]);

  // Round 275 — client-side pagination (usePagination) stays exactly as
  // it was for every mode except an active buffer: requester view, a
  // small tab, and an active-search fetch all still hand it the complete
  // relevant row set and let it slice. Buffer mode has its own
  // page/pageSize state above instead, since `tickets` there is only ever
  // a window, not the full set — plug in whichever one is live.
  const clientPagination = usePagination(visibleTickets, { defaultPageSize: bufPageSize });
  const page = bufferMode ? bufPage : clientPagination.page;
  const pageSize = bufferMode ? bufPageSize : clientPagination.pageSize;
  const setPage = bufferMode ? gotoBufferPage : clientPagination.setPage;
  const setPageSize = bufferMode ? changeBufferPageSize : clientPagination.setPageSize;
  const totalPages = bufferMode ? Math.max(1, Math.ceil(bufferTotalRows / bufPageSize)) : clientPagination.totalPages;
  const totalRows = bufferMode ? bufferTotalRows : clientPagination.totalRows;
  const pagedTickets = bufferMode
    ? visibleTickets.slice((bufPage - bufferAnchorPage) * bufPageSize, (bufPage - bufferAnchorPage + 1) * bufPageSize)
    : clientPagination.pageRows;

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
          <div style={{ display: "flex", gap: 8 }}>
            {/* Round 146 follow-up — optional external tool link, shown
                next to "+ New Ticket" when a type config passes one (e.g.
                Hợp Đồng Nhạc Số's "Information List" spreadsheet). Opt-in
                per type via the page.js wrapper's externalLink prop —
                other generic ticket lists are unaffected. */}
            {externalLink && (
              <a
                href={externalLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.btnSecondary}
                style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
              >
                {externalLink.label}
              </a>
            )}
            <Link href={`${basePath}/new`} className={styles.btnPrimary}>+ New Ticket</Link>
          </div>
        </div>

        <SearchBox value={query} onChange={setQuery} placeholder="Search this list…" />

        {isExecutorView && tab && (
          <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
            {tab.status_options.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`${styles.tabBtn} ${statusFilter === s ? styles.tabBtnActive : ""}`}
                style={{ border: statusFilter === s ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: statusFilter === s ? "rgba(255,107,26,0.1)" : "transparent" }}
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
        ) : isMobile ? (
          <>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pagedTickets.map((t, i) => (
              <TicketRow
                key={t.id}
                mobile
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
                onUpdatePic={updatePics}
                onAcknowledgeEdit={acknowledgeEdit}
                releaseOverride={releaseOverride}
                release={releaseOverride ? releaseMap[t.data?.[releaseOverride.fieldKey]] : null}
              />
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
                <th>#</th><th>Ngày Order</th>
                {previewFields.map((f) => <th key={f.key}>{releaseOverride?.fieldKey === f.key ? releaseOverride.label : f.label}</th>)}
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
                  onUpdatePic={updatePics}
                  onAcknowledgeEdit={acknowledgeEdit}
                  releaseOverride={releaseOverride}
                  release={releaseOverride ? releaseMap[t.data?.[releaseOverride.fieldKey]] : null}
                />
              ))}
            </tbody>
          </table>
          </div>
          <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
          </>
        )}
      </div>
    </div>
  );
}

// Round 87 follow-up 5 — mobile card layout for the generic ticket list
// (shared by most app/tickets/*/page.js). Same reasoning/pattern as Booking
// Board's card conversion: below the mobile breakpoint this renders as a
// stacked card per ticket instead of the side-scrolling table, but every
// editable bit — the field input/NoteCell/ProfileSearchField, the PIC
// select, the status select — is the exact same markup produced by the
// same helper, just wrapped in a labeled <div> instead of a <td>. Desktop
// (mobile=false, the default) renders byte-identical to before.
const fieldLabelStyle = { fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 4 };

function TicketRow({ ticket, index, previewFields, computedCols, config, tab, profiles, isExecutorView, onUpdateField, onUpdateStatus, onUpdatePic, onAcknowledgeEdit, mobile = false, releaseOverride = null, release = null }) {
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

  // Renders one previewField's editable/read-only content — no <td>/<div>
  // wrapper, so both the desktop row and the mobile card can call this and
  // just wrap it differently. Single source of truth for the actual
  // editing behavior.
  function fieldBody(f) {
    const isComputed = computedCols.some((c) => c.key === f.key);
    const value = isComputed ? f.compute(ticket.data) : ticket.data?.[f.key];
    // Round 146 follow-up — this field's list column is overridden to show
    // a value pulled off the matching release instead (see
    // RELEASE_COLUMN_OVERRIDES) — read-only, since it's not something
    // typed directly into the ticket.
    if (releaseOverride && releaseOverride.fieldKey === f.key) {
      return <div style={{ maxWidth: mobile ? "none" : 200, whiteSpace: "pre-line", fontSize: 12 }}>{releaseOverride.compute(release, value)}</div>;
    }
    // Every non-computed field is now editable from both sides — a
    // requester's edit gets flagged (see showEditedHighlight above)
    // instead of being blocked outright.
    const canEdit = !isComputed;
    if (!canEdit) {
      return <div style={{ maxWidth: mobile ? "none" : 200, whiteSpace: "pre-line", fontSize: 12 }}>{value || "—"}</div>;
    }
    // Round 76 — Note fields get the shared hover-preview + edit-modal
    // cell instead of an always-visible input, same as every other
    // list's Note column.
    if (f.key === "note") {
      return <NoteCell value={value} onSave={(v) => onUpdateField(ticket, f.key, v, !isExecutorView)} />;
    }
    // Round 86 item 1 — Khác's CC field gets the same search-picker
    // here as on the creation form, instead of a plain input, so
    // inline list-editing stays consistent with NewTicketPage.
    if (f.type === "profileSearch") {
      return (
        <ProfileSearchField
          styles={styles}
          value={rowDrafts[f.key] ?? value ?? ""}
          onChange={(v) => setRowDraft(f.key, v)}
          onCommit={(v) => { setRowDraft(f.key, undefined); onUpdateField(ticket, f.key, v, !isExecutorView); }}
          placeholder={f.label}
        />
      );
    }
    return (
      <input
        className={styles.input}
        style={{ padding: "4px 8px", fontSize: 12, minWidth: mobile ? 0 : 180, width: mobile ? "100%" : undefined, boxSizing: "border-box" }}
        defaultValue={value || ""}
        onBlur={(e) => onUpdateField(ticket, f.key, e.target.value, !isExecutorView)}
      />
    );
  }

  // Round 279 — PIC as tags. Falls back to the single legacy
  // pic_profile_id (as a one-item array) for any ticket written before
  // this round that has no pic_profile_ids yet, so nothing existing shows
  // up blank.
  const picIds = ticket.pic_profile_ids || (ticket.pic_profile_id ? [ticket.pic_profile_id] : []);
  const picNames = picIds.map((id) => profiles.find((p) => p.id === id)?.name).filter(Boolean);
  const picBody = isExecutorView ? (
    <div style={{ minWidth: mobile ? 0 : "16ch", maxWidth: mobile ? "100%" : 220 }}>
      <PicTagInput styles={styles} value={picIds} onChange={(ids) => onUpdatePic(ticket, ids)} profiles={profiles} />
    </div>
  ) : (
    <span style={{ fontSize: 12 }}>{picNames.length > 0 ? picNames.join(", ") : "—"}</span>
  );

  const statusBody = statusEditable ? (
    <select
      value={status}
      onChange={(e) => onUpdateStatus(ticket, e.target.value)}
      style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}
    >
      {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  ) : (
    <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{status}</span>
  );

  if (mobile) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, background: showEditedHighlight ? "rgba(255,107,26,0.06)" : "var(--bg-card)", boxShadow: showEditedHighlight ? "inset 3px 0 0 var(--accent)" : undefined }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>#{index + 1}</div>
            <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{fmtDate(ticket.created_at)}</div>
            {showEditedHighlight && (
              <div
                title={`Edited by ${ticket.data?.__requesterEditedBy || "requester"} — tap to clear`}
                onClick={() => onAcknowledgeEdit(ticket)}
                style={{ cursor: "pointer", fontSize: 10, fontWeight: 700, color: "var(--accent)", marginTop: 2 }}
              >
                ✎ edited
              </div>
            )}
          </div>
          <div title={ticket.data?.note || undefined}>{statusBody}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {previewFields.map((f) => (
            <div key={f.key}>
              <div style={fieldLabelStyle}>{releaseOverride?.fieldKey === f.key ? releaseOverride.label : f.label}</div>
              {fieldBody(f)}
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={fieldLabelStyle}>PIC</div>
              {picBody}
            </div>
            <div>
              <div style={fieldLabelStyle}>Deadline</div>
              <div style={{ fontSize: 12 }}>{fmtDate(ticket.deadline)}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
      {previewFields.map((f) => (
        <td key={f.key}>{fieldBody(f)}</td>
      ))}
      <td>{picBody}</td>
      <td>{fmtDate(ticket.deadline)}</td>
      <td title={ticket.data?.note || undefined}>{statusBody}</td>
    </tr>
  );
}
