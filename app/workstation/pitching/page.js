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
import {
  PITCHING_DOMESTIC_SERVICES_KEY, DEFAULT_PITCHING_DOMESTIC_SERVICES, parsePitchingDomesticServices,
  PITCHING_NCT_EXTRA_SERVICES_KEY, DEFAULT_PITCHING_NCT_EXTRA_SERVICES, parsePitchingNctExtraServices,
  PITCHING_ZING_EXTRA_SERVICES_KEY, DEFAULT_PITCHING_ZING_EXTRA_SERVICES, parsePitchingZingExtraServices,
} from "../../../lib/pitchingDomesticServices";
import { PITCHING_PIC_LIST_KEY, parsePitchingPicList, applyPitchingPicList } from "../../../lib/pitchingPicList";
import { buildZingPitchNote } from "../../../lib/zingPitchNote";
import { rowHighlightColor } from "../../../lib/releaseDateHighlight";
import styles from "../../shared.module.css";

const STATUS_OPTS = ["", "Chưa thực hiện", "Đang thực hiện", "Đã pitching", "Không thực hiện"];
const NCT_ZING_OPTS = ["", "Chưa thực hiện", "Đã pitching", "Không hỗ trợ", "Có gói"];
const CANCEL_VALUES = ["Không thực hiện", "Không hỗ trợ"];
const DONE_VALUE = "Đã pitching";
const CO_GOI_VALUE = "Có gói";
// Round 170 — NCT-only addition to the "Có Gói" services checklist, per
// explicit request. Not part of the shared, Config-editable
// domesticServiceItems list (lib/pitchingDomesticServices.js) since that
// list is shared by both NCT and Zing and this was asked for on the NCT
// side only — see DomesticPlatformColumn's extraItems prop.
const NCT_ONLY_SERVICES = ["New Release Song"];
// Round 187 — 2 more config-editable, per-platform extra-item lists
// (Config → Pitching → NCT/Zing Extra Services) layered on top of the
// hardcoded one above — see lib/pitchingDomesticServices.js's own
// comment for the reasoning. NCT ends up with NCT_ONLY_SERVICES PLUS
// whatever's in the config list; Zing had none before this round.

// Round 106 item 5 — the top-level release-detail checkbox picker merged
// down to 4 keys (priority/spotifyBanner/spotifyS4a/domestic — see
// lib/GateFields.js's PITCHING_TYPES). This Workstation is where every
// deeper mechanic still lives, per explicit confirmation — so it keeps 5
// real, independently-tracked platforms internally (Priority Spotify and
// Priority Apple both still get their own status/PIC/extra fields, just
// gated by the SAME "priority" ticket flag now instead of two separate
// ones) plus the brand-new Spotify Banner platform.
//
// TYPE_TABS is the workstation's own 5 platform tabs. REQUEST_FLAG_FOR maps
// each real tab key to the ticket.data flag that gates its visibility —
// this is the layer that absorbs the top-level merge (Priority Spotify +
// Priority Apple both read ticket.data.priority; NCT + Zing both read
// ticket.data.domestic) without collapsing their independent status/PIC
// tracking underneath.
// Round 153 — per explicit request, "Priority Spotify" and "Priority
// Apple" collapse from 2 separate visual tabs into 1 ("Priority"), Apple's
// fields now rendered stacked underneath Spotify's inside that same tab.
// This ONLY changes the visual/tab grouping (this array + the popup body
// below) — DSP_COLUMNS/REAL_TO_FLAG/requestedRealTypes below are
// untouched, so Apple keeps its own independent status/PIC columns
// (pitching_status_apple/pitching_pic_apple) exactly as before, same as
// NCT/Zing already stayed independent underneath the merged "Domestic"
// tab. "apple" deliberately has NO entry in this array anymore — it's no
// longer a tab of its own, just a section within "priority"'s tab body.
const TYPE_TABS = [
  ["priority", "Priority"],
  ["spotifyBanner", "Spotify Banner"],
  ["spotify", "Spotify S4A"],
  ["domestic", "Domestic"],
];
const REQUEST_FLAG_FOR = { priority: "priority", apple: "priority", spotifyBanner: "spotifyBanner", spotify: "spotifyS4a", domestic: "domestic" };
function isTypeRequested(ticket, key) {
  return !!ticket.data?.[REQUEST_FLAG_FOR[key]];
}
function requestedVisualTypes(ticket) {
  return TYPE_TABS.filter(([key]) => isTypeRequested(ticket, key)).map(([key]) => key);
}

// The 6 real requestable platforms and their status columns on `releases`
// ("domestic" itself isn't a real column — nct/zing are the 2 real ones
// underneath it, same as before). Priority/Apple/Spotify Banner/Spotify S4A
// share STATUS_OPTS' vocab (has an "in progress" state); NCT/Zing share
// NCT_ZING_OPTS' vocab (no "in progress", has "Có gói" instead).
const DSP_COLUMNS = { priority: "priority_pitching", apple: "pitching_status_apple", spotifyBanner: "pitching_status_spotify_banner", spotify: "pitching_status_spotify", nct: "pitching_status_nct", zing: "pitching_status_zing" };
// Each real DSP key's requestedness now comes from its owning top-level
// flag (see REQUEST_FLAG_FOR above), not its own same-named ticket.data
// key — nct/zing both read ticket.data.domestic, priority/apple both read
// ticket.data.priority.
const REAL_TO_FLAG = { priority: "priority", apple: "priority", spotifyBanner: "spotifyBanner", spotify: "spotifyS4a", nct: "domestic", zing: "domestic" };
function requestedRealTypes(ticket) {
  return Object.keys(DSP_COLUMNS).filter((k) => !!ticket.data?.[REAL_TO_FLAG[k]]);
}

// Round 173 — visual tab tags (Priority/Spotify Banner/Spotify S4A/
// Domestic) per explicit request: "make the tag for request... grow
// yellow if requested, green for done (status 'có gói' hoặc 'đã
// pitching')". Every tag rendered here is already request-only (see
// isTypeRequested/TYPE_TABS.filter above — a not-requested tab never
// shows a tag at all), so "requested" is just the default/starting color;
// it flips to green once every REAL DSP column feeding that visual tab is
// done. "Priority" is one tag covering 2 real columns (priority + apple —
// see REAL_TO_FLAG), "Domestic" is one tag covering 2 real columns (nct +
// zing) — done means ALL of them are done, not just one, so the tag never
// reads green while a linked platform is still outstanding.
function realKeysForTab(tabKey) {
  const flag = REQUEST_FLAG_FOR[tabKey];
  return Object.keys(REAL_TO_FLAG).filter((k) => REAL_TO_FLAG[k] === flag);
}
function isTabDone(release, tabKey) {
  const keys = realKeysForTab(tabKey);
  if (keys.length === 0) return false;
  return keys.every((k) => {
    const status = release?.[DSP_COLUMNS[k]] || "";
    return status === DONE_VALUE || status === CO_GOI_VALUE;
  });
}
function tabTagStyle(done) {
  return done
    ? { background: "var(--success-bg)", color: "var(--success-fg)", borderColor: "var(--success-fg)" }
    : { background: "var(--warn-bg)", color: "var(--warn-fg)", borderColor: "var(--warn-fg)" };
}

// Round 79 — each visual tab owns its own PIC (a release column, same
// immediate-write pattern as every status field below) — replaces both the
// Pitching ticket list's ticket-level PIC and this workstation's own
// release-level PIC (workstation_assignments), which were too coarse for
// "individual tracking of who has which task" once the work is split by
// platform. Domestic shares ONE PIC column across both NCT and Zing, per
// explicit request — only the statuses stay split. Priority Spotify and
// Priority Apple keep their own separate PIC columns (merging the
// top-level REQUEST checkbox didn't merge who's actually assigned to each).
// Round 106 item 5 — spotifyBanner gets its own new PIC column.
const PIC_COLUMNS = { priority: "pitching_pic_priority", apple: "pitching_pic_apple", spotifyBanner: "pitching_pic_spotify_banner", spotify: "pitching_pic_spotify", domestic: "pitching_pic_domestic" };

// "We already know which pitching should be done" — each real platform's
// owning ticket flag (see REAL_TO_FLAG) plus the ticket's overall status
// now drive each DSP column's status automatically, per explicit request:
//   - not requested at all      -> the DSP's own "won't do" value
//     (Priority/Apple/Spotify Banner/Spotify S4A: "Không thực hiện"; NCT/
//     Zing have no exact equivalent word, closest is "Không hỗ trợ" — same
//     CANCEL_VALUES bucket either way)
//   - requested, ticket not yet in PROCESS -> "Chưa thực hiện"
//   - requested, ticket IS in PROCESS -> "Đang thực hiện" for
//     Priority/Apple/Spotify Banner/Spotify S4A (NCT/Zing have no
//     "in progress" option in their own vocab — STATUS_OPTS vs
//     NCT_ZING_OPTS above — so they stay at "Chưa thực hiện" until someone
//     picks a real NCT_ZING_OPTS value by hand)
// Only ever touches a column that's currently blank or still one of these
// same auto-managed "not started yet" values — a real in-progress pick or
// a completed one ("Đã pitching"/"Có gói") is never overwritten by this.
const PRE_WORK_VALUES = ["", "Chưa thực hiện", "Đang thực hiện", "Không thực hiện", "Không hỗ trợ"];
const IN_PROGRESS_CAPABLE = ["priority", "apple", "spotifyBanner", "spotify"];

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
  // Round 106 item 5 — config-editable Domestic "Có Gói" services checklist
  // (Config → Pitching → Domestic "Có Gói" Services), default falls back to
  // DEFAULT_PITCHING_DOMESTIC_SERVICES until load() finishes.
  const [domesticServiceItems, setDomesticServiceItems] = useState(DEFAULT_PITCHING_DOMESTIC_SERVICES);
  // Round 187 — config-editable NCT/Zing-only extra items, same idiom.
  const [nctExtraServiceItems, setNctExtraServiceItems] = useState(DEFAULT_PITCHING_NCT_EXTRA_SERVICES);
  const [zingExtraServiceItems, setZingExtraServiceItems] = useState(DEFAULT_PITCHING_ZING_EXTRA_SERVICES);

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
        // Round 162 — link_share added: the "Thông tin phát hành" field
        // the Zing pitch email tool needs (see buildZingPitchNote in
        // lib/zingPitchNote.js) — wasn't previously read on this page at
        // all, only by the standalone Tools Directory version of this
        // same generator.
        // Round 168 — link_lbm added per explicit request ("add the LBM
        // url column, from the detail page") — same releases.link_lbm
        // column the release detail page's own "Link LBM" field, the
        // Re-Check workstation's LbmCell, and Pre-release's LBM URL
        // column (Round 165) all already read/write.
        .select("id, did, title, main_artist, release_date, release_time, upc, priority_pitching, isrc, apple_id, pitching_status_spotify, pitching_status_apple, pitching_status_spotify_banner, pitching_spotify_banner_drive_link, pitching_status_nct, pitching_status_zing, pitch_genre, pitch_mood, pitch_instrumental, pitch_note, pitch_memo, pitching_note, pitching_pic_priority, pitching_pic_spotify, pitching_pic_apple, pitching_pic_spotify_banner, pitching_pic_domestic, pitching_domestic_services_nct, pitching_domestic_services_zing, link_share, link_lbm")
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
        const requested = !!row.ticket.data?.[REAL_TO_FLAG[key]];
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
    // Round 106 item 5 — "make a new pic list just for this one since
    // there is multiple team join in but not all member": Config →
    // Pitching → PIC List (blank by default) restricts who shows up as
    // PIC here instead of the usual whole-OPS-team filter. Falls back to
    // the normal OPS filter until an admin actually sets the list.
    const { data: settingsRows } = await supabase.from("global_settings").select("key, value").in("key", [PITCHING_DOMESTIC_SERVICES_KEY, PITCHING_NCT_EXTRA_SERVICES_KEY, PITCHING_ZING_EXTRA_SERVICES_KEY, PITCHING_PIC_LIST_KEY]);
    const settingsByKey = {};
    (settingsRows || []).forEach((s) => (settingsByKey[s.key] = s.value));
    setDomesticServiceItems(parsePitchingDomesticServices(settingsByKey[PITCHING_DOMESTIC_SERVICES_KEY]));
    setNctExtraServiceItems(parsePitchingNctExtraServices(settingsByKey[PITCHING_NCT_EXTRA_SERVICES_KEY]));
    setZingExtraServiceItems(parsePitchingZingExtraServices(settingsByKey[PITCHING_ZING_EXTRA_SERVICES_KEY]));
    const picList = parsePitchingPicList(settingsByKey[PITCHING_PIC_LIST_KEY]);
    // Round 159 — AR added as a 2nd executor team here (was OPS-only), per
    // explicit "add pitching workstation for AR team as executor" request.
    // filterProfilesByTeam now accepts an array of teams for exactly this
    // case (see its own comment) — falls back, same as before, to whatever
    // the Pitching PIC List (Config → Pitching) narrows it down to.
    setProfiles(applyPitchingPicList(filterProfilesByTeam(profs || [], ["OPS", "AR"]), picList));

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
        <div className={styles.container} style={{ maxWidth: 1680 }}>
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
                  <th style={{ maxWidth: 150 }}>LBM URL</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => {
                  const types = requestedVisualTypes(row.ticket);
                  // Round 164 — same today(yellow)/this-week(light blue)
                  // row highlight already used on the Re-Check and New
                  // Release Setup workstations (see
                  // lib/releaseDateHighlight.js) — applied here too so
                  // Pitching gets the same at-a-glance urgency cue,
                  // instead of being the one workstation table without it.
                  const highlight = rowHighlightColor(row.release);
                  return (
                    <tr key={row.ticket.id} onClick={() => setOpenTicketId(row.ticket.id)} style={{ cursor: "pointer", ...(highlight ? { background: highlight } : {}) }}>
                      <td style={{ position: "sticky", left: 0, zIndex: 1, background: highlight || "var(--bg)", borderRight: "2px solid var(--accent)" }}>
                        {row.release ? (
                          <Link href={`/releases/${row.release.id}`} className={styles.rowLink} onClick={(e) => e.stopPropagation()}>{row.release.title}</Link>
                        ) : (
                          <span>Release {row.ticket.data?.releaseId} (not found)</span>
                        )}
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                          {row.release?.main_artist} · {row.release?.did} · {fmtDate(row.release?.release_date)} {row.release?.release_time}
                        </div>
                        {/* Round 162 — item 4: copy this row's DID without
                            opening the popup, so it can be pasted straight
                            into whichever outside tool (Zing pitch email,
                            or anything else DID-driven) instead of having
                            to open the row and hunt for it there first.
                            stopPropagation so the click doesn't also open
                            the popup underneath it. */}
                        {row.release?.did && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(row.release.did); }}
                            title="Copy DID"
                            style={{ background: "none", border: "none", color: "var(--accent-soft)", fontSize: 10, cursor: "pointer", padding: "2px 0 0", display: "block" }}
                          >
                            📋 Copy DID
                          </button>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {types.map((t) => (
                            <span key={t} className={styles.statusBadge} style={tabTagStyle(isTabDone(row.release, t))}>
                              {TYPE_TABS.find(([k]) => k === t)[1]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ maxWidth: 150 }} onClick={(e) => e.stopPropagation()}>
                        {row.release ? (
                          <PitchingLbmCell release={row.release} onUpdate={updateRelease} />
                        ) : (
                          <span style={{ color: "var(--text-faint)" }}>—</span>
                        )}
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
          domesticServiceItems={domesticServiceItems}
          nctExtraServiceItems={nctExtraServiceItems}
          zingExtraServiceItems={zingExtraServiceItems}
        />
      )}
    </AppShell>
  );
}

// Round 168 — same editable-URL-cell-with-local-draft-state pattern as
// the Re-Check workstation's LbmCell and Pre-release's inline LBM field,
// all three now backed by the one releases.link_lbm column.
function PitchingLbmCell({ release, onUpdate }) {
  const [draft, setDraft] = useState(release.link_lbm || "");
  return <UrlField styles={styles} value={draft} onChange={setDraft} onBlur={() => onUpdate(release, "link_lbm", draft)} />;
}

function PitchingPopup({ row, profiles, onClose, onUpdateRelease, domesticServiceItems, nctExtraServiceItems, zingExtraServiceItems }) {
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
          {types.map(([key, label]) => {
            const done = isTabDone(release, key);
            return (
              <button
                key={key}
                onClick={() => setActiveType(key)}
                className={`${styles.tabBtn} ${activeType === key ? styles.tabBtnActive : ""}`}
                style={{ border: `1px solid ${done ? "var(--success-fg)" : "var(--warn-fg)"}`, borderRadius: 6, ...(activeType === key ? {} : tabTagStyle(done)) }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {activeType === "priority" && (
          <>
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
          {/* Round 153 — Priority Apple, merged in from its own former tab
              (see TYPE_TABS' comment above). Same fields/columns as
              before (pitching_status_apple/pitching_pic_apple/apple_id) —
              only the visual placement changed, now stacked under
              Priority Spotify's fields within this one "Priority" tab
              instead of behind a separate "Priority Apple" tab button. */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", margin: "16px 0 10px", borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            Priority Apple
          </div>
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
          </>
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

        {/* Round 106 item 5 — new platform, "use the spotify priority [template]
            for now, the team will send later" — same STATUS_OPTS template as
            Priority Spotify's tab, own PIC/status columns. */}
        {activeType === "spotifyBanner" && (
          <div className={styles.grid2}>
            <PicField tabKey="spotifyBanner" />
            <Field label="Spotify Banner Status">
              <select className={styles.select} value={release?.pitching_status_spotify_banner || ""} onChange={(e) => onUpdateRelease(release, "pitching_status_spotify_banner", e.target.value)}>
                {STATUS_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
              </select>
            </Field>
            {/* Round 153 — the one additional field the Round 106 comment
                above already flagged as coming "later": Link Drive, same
                one-extra-field template shape as Priority's own ISRC
                field. New release column (pitching_spotify_banner_drive_link)
                — see the SQL handed off alongside this round. */}
            <Field label="Link Drive">
              <input
                className={styles.input}
                defaultValue={release?.pitching_spotify_banner_drive_link || ""}
                onBlur={(e) => onUpdateRelease(release, "pitching_spotify_banner_drive_link", e.target.value)}
              />
            </Field>
          </div>
        )}

        {activeType === "domestic" && (
          <>
          <div className={styles.grid2}>
            <PicField tabKey="domestic" />
          </div>
          {/* Round 110 — NCT and Zing moved onto their own parallel pair of
              columns (was PIC+NCT sharing a row, Zing wrapping to its own
              row below) — per explicit request: "move the NCT and Zing to
              same row, like a parallel". Each now also carries its own
              independent "Có Gói" services checklist directly underneath
              its own status, instead of one shared checklist covering
              both — "under each if choose 'Có gói', add its own... tick." */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }}>
            <DomesticPlatformColumn
              label="NCT Status"
              status={release?.pitching_status_nct || ""}
              onStatusChange={(v) => onUpdateRelease(release, "pitching_status_nct", v)}
              services={release?.pitching_domestic_services_nct || []}
              onServicesChange={(next) => onUpdateRelease(release, "pitching_domestic_services_nct", next)}
              domesticServiceItems={domesticServiceItems}
              // Round 170 — "new release song" added per explicit request,
              // NCT-only (not Zing) — kept as a column-local extra item
              // rather than folded into the shared, Config-editable
              // domesticServiceItems list (Config → Pitching → Domestic
              // "Có Gói" Services), since that list is shared by both NCT
              // and Zing and this was asked for on the NCT side only.
              // Round 187 — nctExtraServiceItems (Config → Pitching → NCT
              // Extra Services) layered on top of that same hardcoded item.
              extraItems={[...NCT_ONLY_SERVICES, ...nctExtraServiceItems]}
            />
            <DomesticPlatformColumn
              label="Zing Status"
              status={release?.pitching_status_zing || ""}
              onStatusChange={(v) => onUpdateRelease(release, "pitching_status_zing", v)}
              services={release?.pitching_domestic_services_zing || []}
              onServicesChange={(next) => onUpdateRelease(release, "pitching_domestic_services_zing", next)}
              domesticServiceItems={domesticServiceItems}
              // Round 187 — Zing's first-ever extra item(s), same
              // Config-editable list mechanism as NCT's above.
              extraItems={zingExtraServiceItems}
            />
          </div>
          {/* Round 162 — item 1: same generator as the standalone "Zing"
              tool under Tools Directory (see lib/zingPitchNote.js /
              ZingPitchCard) — that version needs the DID pasted in by
              hand; this one already has it (this popup is already scoped
              to one release), so it just runs buildZingPitchNote against
              this release directly. */}
          <ZingPitchInlineButton release={release} />
          </>
        )}
      </div>
    </div>
  );
}

// Round 162 — item 1: "add a button for zing tools in pitching domestic
// tab... automatically get the DID and generate the email content." This
// popup is already scoped to one release (see PitchingPopup's `release`),
// so no DID-paste step is needed — collapsed/expanded state mirrors
// ZingPitchCard's own (app/tool-directory/page.js), just pre-loaded with
// this one release instead of a textarea of pasted DIDs.
function ZingPitchInlineButton({ release }) {
  const [open, setOpen] = useState(false);
  const note = release ? buildZingPitchNote([release]) : "";
  return (
    <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <button type="button" className={styles.btnSmall} onClick={() => setOpen((o) => !o)} disabled={!release}>
        {open ? "▾" : "▸"} Zing pitch email
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "var(--bg-hover)", padding: 8, borderRadius: 6 }}>{note}</pre>
          <button type="button" className={styles.btnSmall} onClick={() => navigator.clipboard?.writeText(note)}>Copy</button>
        </div>
      )}
    </div>
  );
}

// Round 110 — one NCT or Zing column on the Domestic tab: its own status
// dropdown plus, once that status is "Có gói", its own independent
// services checklist directly underneath (was one shared checklist below
// both platforms — see the activeType === "domestic" block above).
function DomesticPlatformColumn({ label, status, onStatusChange, services, onServicesChange, domesticServiceItems, extraItems }) {
  // Round 170 — extraItems is a column-local addition (see
  // NCT_ONLY_SERVICES) on top of the shared Config-editable list, not
  // stored anywhere separately — same `services` array/field either way,
  // so ticking it saves/loads exactly like any other item here.
  const allItems = extraItems?.length ? [...domesticServiceItems, ...extraItems] : domesticServiceItems;
  return (
    <div>
      <Field label={label}>
        <select className={styles.select} value={status} onChange={(e) => onStatusChange(e.target.value)}>
          {NCT_ZING_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
        </select>
      </Field>
      {status === CO_GOI_VALUE && (
        <div style={{ marginTop: 10 }}>
          <div className={styles.fieldLabel} style={{ marginBottom: 8 }}>Có Gói — Services</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {allItems.map((item) => {
              const checked = services.includes(item);
              return (
                <label key={item} className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked ? [...services, item] : services.filter((s) => s !== item);
                      onServicesChange(next);
                    }}
                  />
                  {item}
                </label>
              );
            })}
          </div>
        </div>
      )}
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
