"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import StatusCounter from "../../../lib/StatusCounter";
import UrlField from "../../../lib/UrlField";
import { sortByReleaseDateDesc, filterProfilesByTeam } from "../../../lib/workstationHelpers";
import { useSortableRows } from "../../../lib/useSortableRows";
import SortableTh, { ResetSortButton } from "../../../lib/SortableTh";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import SearchBox, { matchesQuery } from "../../../lib/SearchBox";
import styles from "../../shared.module.css";

const STATUS_OPTS = ["", "Chưa thực hiện", "Đang thực hiện", "Đã pitching", "Không thực hiện"];
const NCT_ZING_OPTS = ["", "Chưa thực hiện", "Đã pitching", "Không hỗ trợ", "Có gói"];
const CANCEL_VALUES = ["Không thực hiện", "Không hỗ trợ"];
const DONE_VALUE = "Đã pitching";

// Round 79 — redesigned from 4 tabs that mapped 1:1 to the 4 real
// requested-flags, into 4 VISUAL tabs where the last one ("Domestic")
// groups 2 real flags (nct + zing) together. TYPE_TABS/isTypeRequested
// below drive tab labels + the "Requested" column's badges; DSP_COLUMNS
// (5 real keys) is what actually drives done/cancel/status computation —
// keeping these separate is what lets Domestic show as one tab while NCT
// and Zing still complete independently underneath.
const TYPE_TABS = [
  ["priority", "Priority Spotify"],
  ["spotify", "Spotify (S4A)"],
  ["apple", "Priority Apple"],
  ["domestic", "Domestic"],
];
function isTypeRequested(ticket, key) {
  if (key === "domestic") return !!(ticket.data?.nct || ticket.data?.zing);
  return !!ticket.data?.[key];
}
function requestedVisualTypes(ticket) {
  return TYPE_TABS.filter(([key]) => isTypeRequested(ticket, key)).map(([key]) => key);
}

// The 5 real requestable platforms and their status columns on `releases`.
// Priority/Spotify/Apple share STATUS_OPTS' vocab (has an "in progress"
// state); NCT/Zing share NCT_ZING_OPTS' vocab (no "in progress", has "Có
// gói" instead).
const DSP_COLUMNS = { priority: "priority_pitching", spotify: "pitching_status_spotify", apple: "pitching_status_apple", nct: "pitching_status_nct", zing: "pitching_status_zing" };
function requestedRealTypes(ticket) {
  return Object.keys(DSP_COLUMNS).filter((k) => ticket.data?.[k]);
}

// Round 79 — each of the 4 visual tabs now owns its own PIC (a release
// column, same immediate-write pattern as every status field below) —
// replaces both the Pitching ticket list's ticket-level PIC and this
// workstation's own release-level PIC (workstation_assignments), which
// were too coarse for "individual tracking of who has which task" once
// the work is split by platform. Domestic shares ONE PIC column across
// both NCT and Zing, per explicit request — only the statuses stay split.
const PIC_COLUMNS = { priority: "pitching_pic_priority", spotify: "pitching_pic_spotify", apple: "pitching_pic_apple", domestic: "pitching_pic_domestic" };

// "We already know which pitching should be done" — the ticket's own
// requested-flags (priority/spotify/apple/nct/zing) plus its overall status
// now drive each DSP column's status automatically, per explicit request:
//   - not requested at all      -> the DSP's own "won't do" value
//     (Priority/Spotify/Apple: "Không thực hiện"; NCT/Zing have no exact
//     equivalent word, closest is "Không hỗ trợ" — same CANCEL_VALUES
//     bucket either way)
//   - requested, ticket not yet in PROCESS -> "Chưa thực hiện"
//   - requested, ticket IS in PROCESS -> "Đang thực hiện" for
//     Priority/Spotify/Apple (NCT/Zing have no "in progress" option in
//     their own vocab — STATUS_OPTS vs NCT_ZING_OPTS above — so they stay
//     at "Chưa thực hiện" until someone picks a real NCT_ZING_OPTS value by
//     hand)
// Only ever touches a column that's currently blank or still one of these
// same auto-managed "not started yet" values — a real in-progress pick or
// a completed one ("Đã pitching"/"Có gói") is never overwritten by this.
const PRE_WORK_VALUES = ["", "Chưa thực hiện", "Đang thực hiện", "Không thực hiện", "Không hỗ trợ"];
const IN_PROGRESS_CAPABLE = ["priority", "spotify", "apple"];

function autoTargetFor(key, requested, ticketStatus) {
  if (!requested) return IN_PROGRESS_CAPABLE.includes(key) ? "Không thực hiện" : "Không hỗ trợ";
  if (ticketStatus === "PROCESS" && IN_PROGRESS_CAPABLE.includes(key)) return "Đang thực hiện";
  return "Chưa thực hiện";
}

// Round 79 — the ticket's overall Status is no longer manually set anywhere
// (the Pitching ticket list's Status dropdown is gone) — it's fully
// computed from the 4 real requested platforms' own statuses, recomputed
// and persisted every time one of them changes (see updateRelease below)
// and once more on every page load (in case anything drifted before this
// existed). Returns null when nothing is requested yet (leaves whatever
// status the ticket already has alone — shouldn't happen in practice,
// every pitching ticket requests at least one platform).
function computeTicketStatus(ticket, release) {
  const required = requestedRealTypes(ticket);
  if (required.length === 0) return null;
  const statuses = required.map((k) => release?.[DSP_COLUMNS[k]] || "");
  if (statuses.every((s) => s === DONE_VALUE)) return "COMPLETE";
  if (statuses.every((s) => CANCEL_VALUES.includes(s))) return "CANCELED";
  if (statuses.some((s) => s && s !== "Chưa thực hiện")) return "PROCESS";
  return "REQUESTED";
}

// The Pitching ticket is just the request (which of the 5 types were
// asked for, chosen at New Release creation) — the actual work lives on
// the release itself. This workstation surfaces the queue and lets OPS
// do that work in one place — clicking a row opens the popup now,
// instead of expanding inline, so each platform gets its own clean tab.
export default function PitchingWorkstation() {
  const [rows, setRows] = useState([]); // { ticket, release }
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [query, setQuery] = useState(""); // round 76 — quick index search box
  const [openTicketId, setOpenTicketId] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "pitching").single();
    if (!tab) { setLoading(false); return; }
    const { data: tickets } = await supabase.from("tickets").select("*").eq("tab_id", tab.id).is("deleted_at", null);
    const dids = [...new Set((tickets || []).map((t) => t.data?.releaseId).filter(Boolean))];
    let releaseMap = {};
    if (dids.length > 0) {
      const { data: rels } = await supabase
        .from("releases")
        .select("id, did, title, main_artist, release_date, release_time, upc, priority_pitching, isrc, apple_id, pitching_status_spotify, pitching_status_apple, pitching_status_nct, pitching_status_zing, pitch_genre, pitch_mood, pitch_instrumental, pitch_note, pitch_memo, pitching_note, pitching_pic_priority, pitching_pic_spotify, pitching_pic_apple, pitching_pic_domestic")
        .in("did", dids);
      (rels || []).forEach((r) => (releaseMap[r.did] = r));
    }
    let allRows = (tickets || []).map((t) => ({ ticket: t, release: releaseMap[t.data?.releaseId] || null }));
    allRows = allRows.filter((row) => row.release?.upc);

    // Auto-sync each DSP's status column from the ticket's requested-flags
    // + overall status (see autoTargetFor above) — same "auto-sync on
    // load" pattern as the Stream Workstation's metrics rows, applied here
    // in the background; the UI above already shows the pre-sync values so
    // this doesn't block first paint.
    const syncPatches = [];
    allRows.forEach((row) => {
      if (!row.release) return;
      const patch = {};
      Object.entries(DSP_COLUMNS).forEach(([key, col]) => {
        const requested = !!row.ticket.data?.[key];
        const current = row.release[col] || "";
        if (!PRE_WORK_VALUES.includes(current)) return; // real progress/done — never touch
        const target = autoTargetFor(key, requested, row.ticket.status);
        if (current !== target) patch[col] = target;
      });
      if (Object.keys(patch).length > 0) syncPatches.push({ id: row.release.id, patch });
    });
    if (syncPatches.length > 0) {
      await Promise.all(syncPatches.map(({ id, patch }) => supabase.from("releases").update(patch).eq("id", id)));
      allRows = allRows.map((row) => {
        const found = syncPatches.find((p) => p.id === row.release?.id);
        return found ? { ...row, release: { ...row.release, ...found.patch } } : row;
      });
    }

    // Round 79 — also recompute + persist ticket.status once on load, in
    // case a status/PIC edit happened through some other path before this
    // existed and left it stale (the same recompute also runs live on
    // every relevant edit — see updateRelease).
    const statusPatches = [];
    allRows.forEach((row) => {
      const next = computeTicketStatus(row.ticket, row.release);
      if (next && next !== row.ticket.status) statusPatches.push({ id: row.ticket.id, status: next, status_log: { ...row.ticket.status_log, [next]: new Date().toISOString() } });
    });
    if (statusPatches.length > 0) {
      await Promise.all(statusPatches.map((p) => supabase.from("tickets").update({ status: p.status, status_log: p.status_log }).eq("id", p.id)));
      allRows = allRows.map((row) => {
        const found = statusPatches.find((p) => p.id === row.ticket.id);
        return found ? { ...row, ticket: { ...row.ticket, status: found.status, status_log: found.status_log } } : row;
      });
    }

    setRows(allRows);

    const { data: profs } = await supabase.from("profiles").select("id, name, segment, role").order("name");
    setProfiles(filterProfilesByTeam(profs || [], "OPS"));

    setLoading(false);
  }

  async function updateRelease(release, field, value) {
    setRows((prev) => prev.map((row) => (row.release?.id === release.id ? { ...row, release: { ...row.release, [field]: value } } : row)));
    await supabase.from("releases").update({ [field]: value }).eq("id", release.id);

    // Round 79 — a status-field edit can change what the ticket's overall
    // Status computes to; PIC edits and Note edits never do, so this only
    // fires for the 5 real status columns.
    if (!Object.values(DSP_COLUMNS).includes(field)) return;
    const row = rows.find((r) => r.release?.id === release.id);
    if (!row) return;
    const updatedRelease = { ...row.release, [field]: value };
    const nextStatus = computeTicketStatus(row.ticket, updatedRelease);
    if (nextStatus && nextStatus !== row.ticket.status) {
      const nextLog = { ...row.ticket.status_log, [nextStatus]: new Date().toISOString() };
      await supabase.from("tickets").update({ status: nextStatus, status_log: nextLog }).eq("id", row.ticket.id);
      setRows((prev) => prev.map((r) => (r.release?.id === release.id ? { ...r, ticket: { ...r.ticket, status: nextStatus, status_log: nextLog } } : r)));
    }
  }

  function statusFor(release, key) {
    return release?.[DSP_COLUMNS[key]] ?? null;
  }

  function isDone(row) {
    const types = requestedRealTypes(row.ticket);
    if (types.length === 0) return false;
    return types.every((k) => statusFor(row.release, k) === DONE_VALUE);
  }
  function isCancel(row) {
    const types = requestedRealTypes(row.ticket);
    if (types.length === 0) return false;
    return types.every((k) => CANCEL_VALUES.includes(statusFor(row.release, k)));
  }

  const counts = useMemo(() => {
    let done = 0, notDone = 0, cancel = 0;
    rows.forEach((row) => {
      if (isCancel(row)) cancel++;
      else if (isDone(row)) done++;
      else notDone++;
    });
    return { done, notDone, cancel };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const filtered = showDone ? rows : rows.filter((row) => !isDone(row));
    return filtered.map((row) => ({ ...row, release_date: row.release?.release_date })).filter((row) => matchesQuery(row, query));
  }, [rows, showDone, query]);

  const { sorted: visibleRows, sort, toggleSort, resetSort, isDefault } = useSortableRows(filteredRows);
  const { pageRows: pagedRows, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleRows);

  const openRow = rows.find((row) => row.ticket.id === openTicketId);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1200 }}>
          <TypeSwitcher kind="workstation" current="pitching" />
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 8 }}>Pitching</h1>

          <StatusCounter done={counts.done} notDone={counts.notDone} cancel={counts.cancel} />
          <SearchBox value={query} onChange={setQuery} placeholder="Search this list…" />
          <button onClick={() => setShowDone((s) => !s)} className={styles.btnSmall} style={{ marginBottom: 16 }}>
            {showDone ? "Hide done rows" : `Show done rows (${counts.done})`}
          </button>
          <ResetSortButton isDefault={isDefault} onReset={resetSort} styles={styles} />

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : visibleRows.length === 0 ? (
            <div className={styles.emptyState}>{rows.length === 0 ? "No Pitching tickets with UPC filled yet." : "Nothing outstanding."}</div>
          ) : (
            <>
            <div className={styles.scrollBox} style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh" }}>
            <table className={styles.table} style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <SortableTh
                    sortKey="release_date"
                    sort={sort}
                    onToggle={toggleSort}
                    style={{ position: "sticky", left: 0, zIndex: 21, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}
                  >
                    Release info
                  </SortableTh>
                  <th>Requested</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => {
                  const types = requestedVisualTypes(row.ticket);
                  return (
                    <tr key={row.ticket.id} onClick={() => setOpenTicketId(row.ticket.id)} style={{ cursor: "pointer" }}>
                      <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>
                        {row.release ? (
                          <Link href={`/releases/${row.release.id}`} className={styles.rowLink} onClick={(e) => e.stopPropagation()}>{row.release.title}</Link>
                        ) : (
                          <span>Release {row.ticket.data?.releaseId} (not found)</span>
                        )}
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                          {row.release?.main_artist} · {row.release?.did} · {fmtDate(row.release?.release_date)} {row.release?.release_time}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {types.map((t) => (
                            <span key={t} className={styles.statusBadge} style={{ background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
                              {TYPE_TABS.find(([k]) => k === t)[1]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        {/* Round 80 — fixed bug: stopPropagation belongs on
                            the input itself (so typing/clicking into it
                            doesn't also open the row's popup), NOT on the
                            whole <td> — that blocked the row's onClick from
                            ever firing for anyone clicking this column at
                            all, anywhere in it, popup or not. */}
                        {row.release ? (
                          <input
                            className={styles.input}
                            style={{ minWidth: 140 }}
                            defaultValue={row.release.pitching_note || ""}
                            onBlur={(e) => updateRelease(row.release, "pitching_note", e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span style={{ color: "var(--text-faint)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
            </>
          )}
        </div>
      </div>

      {openRow && (
        <PitchingPopup
          row={openRow}
          profiles={profiles}
          onClose={() => setOpenTicketId(null)}
          onUpdateRelease={updateRelease}
        />
      )}
    </AppShell>
  );
}

function PitchingPopup({ row, profiles, onClose, onUpdateRelease }) {
  const types = TYPE_TABS.filter(([key]) => isTypeRequested(row.ticket, key));
  const [activeType, setActiveType] = useState(types[0]?.[0]);
  const release = row.release;

  function PicField({ tabKey }) {
    const col = PIC_COLUMNS[tabKey];
    return (
      <Field label="PIC">
        <select className={styles.select} value={release?.[col] || ""} onChange={(e) => onUpdateRelease(release, col, e.target.value || null)}>
          <option value="">— Unassigned —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 24, maxWidth: 640, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div className={styles.eyebrow}>// Pitching</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{release?.title}</h2>
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{release?.main_artist}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
          {types.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveType(key)}
              className={`${styles.tabBtn} ${activeType === key ? styles.tabBtnActive : ""}`}
              style={{ border: "1px solid var(--border)", borderRadius: 6 }}
            >
              {label}
            </button>
          ))}
        </div>

        {activeType === "priority" && (
          <div className={styles.grid2}>
            <PicField tabKey="priority" />
            <Field label="Priority Pitching Status">
              <select className={styles.select} value={release?.priority_pitching || ""} onChange={(e) => onUpdateRelease(release, "priority_pitching", e.target.value)}>
                {STATUS_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
              </select>
            </Field>
            <Field label="ISRC">
              <input className={styles.input} defaultValue={release?.isrc || ""} onBlur={(e) => onUpdateRelease(release, "isrc", e.target.value)} />
            </Field>
          </div>
        )}

        {activeType === "spotify" && (
          <div className={styles.grid2}>
            <PicField tabKey="spotify" />
            <Field label="Status">
              <select className={styles.select} value={release?.pitching_status_spotify || ""} onChange={(e) => onUpdateRelease(release, "pitching_status_spotify", e.target.value)}>
                {STATUS_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
              </select>
            </Field>
            <Field label="Pitch Genre">
              <input className={styles.input} defaultValue={release?.pitch_genre || ""} onBlur={(e) => onUpdateRelease(release, "pitch_genre", e.target.value)} />
            </Field>
            <Field label="Mood">
              <input className={styles.input} defaultValue={release?.pitch_mood || ""} onBlur={(e) => onUpdateRelease(release, "pitch_mood", e.target.value)} />
            </Field>
            <Field label="Instrumental">
              <input className={styles.input} defaultValue={release?.pitch_instrumental || ""} onBlur={(e) => onUpdateRelease(release, "pitch_instrumental", e.target.value)} />
            </Field>
            <Field label="Memo">
              <input className={styles.input} defaultValue={release?.pitch_memo || ""} onBlur={(e) => onUpdateRelease(release, "pitch_memo", e.target.value)} />
            </Field>
            <Field label="Pitch Note">
              <input className={styles.input} defaultValue={release?.pitch_note || ""} onBlur={(e) => onUpdateRelease(release, "pitch_note", e.target.value)} />
            </Field>
          </div>
        )}

        {activeType === "apple" && (
          <div className={styles.grid2}>
            <PicField tabKey="apple" />
            <Field label="Priority Apple Status">
              <select className={styles.select} value={release?.pitching_status_apple || ""} onChange={(e) => onUpdateRelease(release, "pitching_status_apple", e.target.value)}>
                {STATUS_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
              </select>
            </Field>
            <Field label="Apple ID">
              <input className={styles.input} defaultValue={release?.apple_id || ""} onBlur={(e) => onUpdateRelease(release, "apple_id", e.target.value)} />
            </Field>
          </div>
        )}

        {activeType === "domestic" && (
          <div className={styles.grid2}>
            <PicField tabKey="domestic" />
            <Field label="NCT Status">
              <select className={styles.select} value={release?.pitching_status_nct || ""} onChange={(e) => onUpdateRelease(release, "pitching_status_nct", e.target.value)}>
                {NCT_ZING_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
              </select>
            </Field>
            <Field label="Zing Status">
              <select className={styles.select} value={release?.pitching_status_zing || ""} onChange={(e) => onUpdateRelease(release, "pitching_status_zing", e.target.value)}>
                {NCT_ZING_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
              </select>
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}
