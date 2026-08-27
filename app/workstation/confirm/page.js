"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, fetchAllRows } from "../../../lib/helpers";
import { BoolToggle } from "../../../lib/GateFields";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import UrlField from "../../../lib/UrlField";
import LinkLbmSourceBadge from "../../../lib/LinkLbmSourceBadge";
import PhaiSinhSmartlinkPopup from "../../../lib/PhaiSinhSmartlinkPopup";
import StatusCounter from "../../../lib/StatusCounter";
import { sortByReleaseDateDesc, filterProfilesByTeam } from "../../../lib/workstationHelpers";
import { rowHighlightColor } from "../../../lib/releaseDateHighlight";
import { useSortableRows } from "../../../lib/useSortableRows";
import SortableTh, { ResetSortButton } from "../../../lib/SortableTh";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import SearchBox, { matchesQuery } from "../../../lib/SearchBox";
import { PRIORITY_MODE_WARNING } from "../../../lib/releaseNotes";
import styles from "../../shared.module.css";

// Same tool, visited twice — Phase 1 while waiting for release, Phase 2
// after it's live. Rebuilt from scratch: the 6 individual DSP checks now
// live behind one bulk Yes/No (only reads "Yes" once every one of them
// is true), matching how everything else on this page is a plain Yes/No
// like the release detail popup, not a tri-state gate.
const DSP_CHECK_FIELDS = ["confirm_spotify_correct", "confirm_apple_correct", "confirm_zing_correct", "confirm_nct_correct", "confirm_fb_correct", "confirm_ytb_correct"];

// Round 158 — "Artist Pick" (releases.artist_pick_status), moved here from
// Pre-release (app/workstation/pre-release/page.js) per explicit request.
// Same fixed options that page used — kept as its own local list/select
// here rather than pulled into a shared lib, since Pre-release's PickSelect
// wasn't exported and this is the only other place using it.
const ARTIST_PICK_OPTS = ["", "Done", "Uneditible", "Skip"];
function ArtistPickSelect({ value, onChange }) {
  const unrecognized = value && !ARTIST_PICK_OPTS.includes(value) ? value : null;
  return (
    <select
      className={styles.select}
      style={{ minWidth: 100 }}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      title={unrecognized ? "Imported value doesn't match any picker option — pick one to fix it" : undefined}
    >
      {ARTIST_PICK_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
      {unrecognized && <option value={unrecognized}>{unrecognized} (unrecognized — pick to fix)</option>}
    </select>
  );
}

const SELECT_FIELDS = "id, did, title, main_artist, release_date, release_time, link_lbm, link_lbm_source, release_category, project_type, smartlink, upc, confirm_insta_sound, confirm_tiktok_sound_updated, confirm_smartlink_updated, confirm_tag, artist_pick_status, needs_update, confirm_note, " + DSP_CHECK_FIELDS.join(", ");

// Round 135 — per explicit request: "filter out product that hasn't had
// the UPC && smartlink filled yet" (item 1). A release only counts as
// "ready" once BOTH are filled — same field on both Phase 1 and Phase 2
// per the team's own confirmation ("both, since we actually have the
// smartlink saved and linked to it. if not, then just show rows with
// UPC is fine, should mean the same thing" — i.e. in practice the two
// fields land together, so one shared condition on both tabs is fine).
function hasUpcAndSmartlink(r) {
  return !!r.upc?.trim() && !!r.smartlink?.trim();
}

// Round 135 — items 2/3: row highlight color. Logic + colors pulled out
// into lib/releaseDateHighlight.js in Round 139 so New Release Setup can
// share the exact same rule instead of a second, driftable copy.

export default function ConfirmWorkstation() {
  const [phase, setPhase] = useState("confirm_phase1");
  const [releases, setReleases] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [defaultPics, setDefaultPics] = useState({}); // phase -> profile_id
  const [assignments, setAssignments] = useState({}); // phase -> { release_id -> profile_id }
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  // Round 135 — item 1: mirrors showDone's own "leave out by default, one
  // button restores them" idiom, just gated on hasUpcAndSmartlink instead
  // of isDone.
  const [showMissingUpcSmartlink, setShowMissingUpcSmartlink] = useState(false);
  const [query, setQuery] = useState(""); // round 76 — quick index search box
  // Round 213 — item 2: phái sinh smartlinks tracked alongside the release
  // smartlink table, same Phase 2 tab per the team's explicit "one
  // workstation" request (see lib/PhaiSinhSmartlinkPopup.js).
  const [phaiSinhSmartlinks, setPhaiSinhSmartlinks] = useState([]);
  const [showAddSmartlink, setShowAddSmartlink] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    // Round 60 — fetchAllRows instead of a plain select(): whole-table
    // read, no filter, subject to Supabase's default 1000-row cap (see
    // DATA_FIXES.md round 59/60).
    const { data: rels } = await fetchAllRows(() => supabase.from("releases").select(SELECT_FIELDS).order("id"));
    setReleases(rels || []);

    const { data: profs } = await supabase.from("profiles").select("id, name, segment, role").order("name");
    setProfiles(filterProfilesByTeam(profs || [], "OPS"));

    const { data: assigns } = await supabase.from("workstation_assignments").select("workstation, release_id, pic_profile_id").in("workstation", ["confirm_phase1", "confirm_phase2"]);
    const defs = {}, rows = { confirm_phase1: {}, confirm_phase2: {} };
    (assigns || []).forEach((a) => {
      if (a.release_id === null) defs[a.workstation] = a.pic_profile_id;
      else rows[a.workstation][a.release_id] = a.pic_profile_id;
    });
    setDefaultPics(defs);
    setAssignments(rows);

    const { data: psLinks } = await supabase.from("phai_sinh_smartlinks").select("*").order("created_at", { ascending: false });
    setPhaiSinhSmartlinks(psLinks || []);

    setLoading(false);
  }

  // Round 213 — same inline-edit-and-write convention as updateField above,
  // just against phai_sinh_smartlinks instead of releases.
  async function updatePhaiSinhSmartlinkField(row, field, value) {
    setPhaiSinhSmartlinks((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: value } : r)));
    await supabase.from("phai_sinh_smartlinks").update({ [field]: value }).eq("id", row.id);
  }

  async function deletePhaiSinhSmartlink(row) {
    setPhaiSinhSmartlinks((prev) => prev.filter((r) => r.id !== row.id));
    await supabase.from("phai_sinh_smartlinks").delete().eq("id", row.id);
  }

  async function updateField(release, field, value) {
    setReleases((prev) => prev.map((r) => (r.id === release.id ? { ...r, [field]: value } : r)));
    await supabase.from("releases").update({ [field]: value }).eq("id", release.id);
  }

  async function bulkToggleDsp(release, value) {
    const patch = {};
    DSP_CHECK_FIELDS.forEach((f) => (patch[f] = value));
    setReleases((prev) => prev.map((r) => (r.id === release.id ? { ...r, ...patch } : r)));
    await supabase.from("releases").update(patch).eq("id", release.id);
  }

  async function updatePic(releaseId, profileId) {
    setAssignments((prev) => ({ ...prev, [phase]: { ...prev[phase], [releaseId]: profileId || undefined } }));
    if (!profileId) {
      await supabase.from("workstation_assignments").delete().eq("workstation", phase).eq("release_id", releaseId);
      return;
    }
    const { data: existing } = await supabase.from("workstation_assignments").select("id").eq("workstation", phase).eq("column_key", "all").eq("release_id", releaseId).maybeSingle();
    if (existing) await supabase.from("workstation_assignments").update({ pic_profile_id: profileId }).eq("id", existing.id);
    else await supabase.from("workstation_assignments").insert({ workstation: phase, column_key: "all", release_id: releaseId, pic_profile_id: profileId });
  }

  function dspAllChecked(r) {
    return DSP_CHECK_FIELDS.every((f) => r[f]);
  }
  // Round 153 — "Tag Confirm" (confirm_tag) is a real Yes/No column on
  // this tab (see the BoolToggle a few lines below) but was never part of
  // the completion rule — per explicit request ("all column check yes no
  // must be yes"), every Yes/No toggle on THIS tab must be Yes for a row
  // to count as done, not just the DSP-check bundle + the URL LBM field.
  // Phase 2's isDonePhase2 already required all 3 of its own Yes/No
  // toggles, so only Phase 1 needed this fix.
  function isDonePhase1(r) { return dspAllChecked(r) && !!r.link_lbm && !!r.confirm_tag; }
  // Round 158 — Artist Pick (artist_pick_status) is now editable on this
  // tab (moved here from Pre-release, see ArtistPickSelect above), but
  // deliberately NOT added to this rule. It DID gate Pre-release's own
  // isDone() before the move — but "move the column" was a request to
  // relocate where it's edited, not necessarily to also make it gate
  // Phase 2 completion here, so it's purely informational on this tab for
  // now. Flag if it should count toward isDonePhase2 too.
  function isDonePhase2(r) { return !!r.smartlink && r.confirm_smartlink_updated && r.confirm_insta_sound && r.confirm_tiktok_sound_updated; }
  const isDone = phase === "confirm_phase1" ? isDonePhase1 : isDonePhase2;

  const counts = useMemo(() => {
    let done = 0, notDone = 0;
    releases.forEach((r) => (isDone(r) ? done++ : notDone++));
    return { done, notDone, cancel: 0 };
  }, [releases, phase]);

  // Round 135 — item 1: count against the full unfiltered list, same
  // convention `counts` above already uses for its own button label.
  const missingUpcSmartlinkCount = useMemo(
    () => releases.filter((r) => !hasUpcAndSmartlink(r)).length,
    [releases]
  );

  const filteredReleases = useMemo(() => {
    let base = showDone ? releases : releases.filter((r) => !isDone(r));
    if (!showMissingUpcSmartlink) base = base.filter((r) => hasUpcAndSmartlink(r));
    return base.filter((r) => matchesQuery(r, query));
  }, [releases, showDone, showMissingUpcSmartlink, phase, query]);

  const { sorted: visibleReleases, sort, toggleSort, resetSort, isDefault } = useSortableRows(filteredReleases);
  const { pageRows: pagedReleases, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleReleases);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1800 }}>
          <TypeSwitcher kind="workstation" current="confirm" />
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 16 }}>Re-Check</h1>

          <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
            {[["confirm_phase1", "Phase 1: Pre-release"], ["confirm_phase2", "Phase 2 — Smartlink"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setPhase(key); setShowDone(false); }}
                className={`${styles.tabBtn} ${phase === key ? styles.tabBtnActive : ""}`}
                style={{ border: phase === key ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: phase === key ? "rgba(255,107,26,0.1)" : "transparent" }}
              >
                {label}
              </button>
            ))}
          </div>

          <StatusCounter done={counts.done} notDone={counts.notDone} cancel={counts.cancel} />
          <SearchBox value={query} onChange={setQuery} placeholder="Search this list…" />
          <button onClick={() => setShowDone((s) => !s)} className={styles.btnSmall} style={{ marginBottom: 16, marginRight: 8 }}>
            {showDone ? "Hide done rows" : `Show done rows (${counts.done})`}
          </button>
          {/* Round 135 — item 1: same "hidden by default, one button
              restores" idiom as "Show done rows" just above, gated on
              missing UPC/Smartlink instead of Done. */}
          <button onClick={() => setShowMissingUpcSmartlink((s) => !s)} className={styles.btnSmall} style={{ marginBottom: 16 }}>
            {showMissingUpcSmartlink ? "Hide missing UPC/Smartlink" : `Show missing UPC/Smartlink (${missingUpcSmartlinkCount})`}
          </button>
          <ResetSortButton isDefault={isDefault} onReset={resetSort} styles={styles} />

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : visibleReleases.length === 0 ? (
            <div className={styles.emptyState}>{releases.length === 0 ? "No releases yet." : "Nothing outstanding."}</div>
          ) : phase === "confirm_phase1" ? (
            <>
            <div className={styles.scrollBox} style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh" }}>
            <table className={styles.table} style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <SortableTh
                    sortKey="release_date"
                    sort={sort}
                    onToggle={toggleSort}
                    style={{ position: "sticky", left: 0, zIndex: 21, background: "var(--bg)", borderRight: "2px solid var(--accent)", minWidth: 260 }}
                  >
                    Release info
                  </SortableTh>
                  <th>DSP check</th>
                  <th>URL LBM</th>
                  <th>Tag Confirm</th>
                  <SortableTh label="Product Type" sortKey="project_type" sort={sort} onToggle={toggleSort} />
                  <th>PIC</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {pagedReleases.map((r) => {
                  // Round 135 — items 2/3: yellow (today) over orange
                  // (this week) over nothing. Applied to both the row AND
                  // the sticky first cell (which sets its own opaque
                  // background to stay readable while scrolled — see its
                  // own style below) so the highlight doesn't visibly
                  // "stop" at that column.
                  const highlight = rowHighlightColor(r);
                  return (
                  <tr key={r.id} style={highlight ? { background: highlight } : undefined}>
                    <td style={{ position: "sticky", left: 0, zIndex: 1, background: highlight || "var(--bg)", borderRight: "2px solid var(--accent)", minWidth: 260 }}>
                      <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{r.main_artist} · {r.did} · {fmtDate(r.release_date)} {r.release_time}</div>
                    </td>
                    <td style={{ minWidth: 90 }}>
                      <BoolToggle value={dspAllChecked(r)} onChange={(v) => bulkToggleDsp(r, v)} />
                    </td>
                    <td style={{ minWidth: 180 }}>
                      <LbmCell release={r} onUpdateField={updateField} />
                    </td>
                    <td style={{ minWidth: 90 }}><BoolToggle value={!!r.confirm_tag} onChange={(v) => updateField(r, "confirm_tag", v)} /></td>
                    <td><span className={styles.statusBadge} style={{ background: "rgba(255,107,26,0.12)", color: "#ff9d5c" }}>{r.project_type || "—"}</span></td>
                    <td>
                      <select className={styles.select} style={{ minWidth: "16ch" }} value={assignments.confirm_phase1?.[r.id] ?? defaultPics.confirm_phase1 ?? ""} onChange={(e) => updatePic(r.id, e.target.value)}>
                        <option value="">— Unassigned —</option>
                        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className={styles.input} style={{ minWidth: 140 }} defaultValue={r.confirm_note || ""} onBlur={(e) => updateField(r, "confirm_note", e.target.value)} />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
            </>
          ) : (
            <>
            <div className={styles.scrollBox} style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh" }}>
            <table className={styles.table} style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <SortableTh
                    sortKey="release_date"
                    sort={sort}
                    onToggle={toggleSort}
                    style={{ position: "sticky", left: 0, zIndex: 21, background: "var(--bg)", borderRight: "2px solid var(--accent)", minWidth: 260 }}
                  >
                    Release info
                  </SortableTh>
                  <th>Smartlink</th>
                  <th>URL LBM</th>
                  <th>Update Smartlink</th>
                  <th>Sound Instagram</th>
                  <th>Sound TikTok</th>
                  <th style={{ borderLeft: "1px solid var(--border)" }}>Artist Pick</th>
                  <th>PIC</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {pagedReleases.map((r) => {
                  // Round 135 — items 2/3: yellow (today) over orange
                  // (this week) over nothing. Applied to both the row AND
                  // the sticky first cell (which sets its own opaque
                  // background to stay readable while scrolled — see its
                  // own style below) so the highlight doesn't visibly
                  // "stop" at that column.
                  const highlight = rowHighlightColor(r);
                  return (
                  <tr key={r.id} style={highlight ? { background: highlight } : undefined}>
                    <td style={{ position: "sticky", left: 0, zIndex: 1, background: highlight || "var(--bg)", borderRight: "2px solid var(--accent)", minWidth: 260 }}>
                      <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{r.main_artist} · {r.did} · {fmtDate(r.release_date)} {r.release_time}</div>
                    </td>
                    <td style={{ minWidth: 180 }}>
                      <SmartlinkCell release={r} onUpdateField={updateField} />
                    </td>
                    <td style={{ minWidth: 180 }}>
                      <LbmCell release={r} onUpdateField={updateField} />
                    </td>
                    <td style={{ minWidth: 90 }}>
                      <BoolToggle value={!!r.confirm_smartlink_updated} onChange={(v) => updateField(r, "confirm_smartlink_updated", v)} />
                    </td>
                    <td style={{ minWidth: 90 }}>
                      <BoolToggle value={!!r.confirm_insta_sound} onChange={(v) => updateField(r, "confirm_insta_sound", v)} />
                    </td>
                    <td style={{ minWidth: 90 }}>
                      <BoolToggle value={!!r.confirm_tiktok_sound_updated} onChange={(v) => updateField(r, "confirm_tiktok_sound_updated", v)} />
                    </td>
                    <td style={{ borderLeft: "1px solid var(--border)" }}>
                      <ArtistPickSelect value={r.artist_pick_status} onChange={(v) => updateField(r, "artist_pick_status", v)} />
                    </td>
                    <td>
                      <select className={styles.select} style={{ minWidth: "16ch" }} value={assignments.confirm_phase2?.[r.id] ?? defaultPics.confirm_phase2 ?? ""} onChange={(e) => updatePic(r.id, e.target.value)}>
                        <option value="">— Unassigned —</option>
                        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className={styles.input} style={{ minWidth: 140 }} defaultValue={r.confirm_note || ""} onBlur={(e) => updateField(r, "confirm_note", e.target.value)} />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />

            {/* Round 213 — item 2: Phái Sinh Smartlinks, second section on
                this same Phase 2 tab, below the release smartlink table —
                per the team's explicit "one workstation" decision so
                there's exactly one place to look for any smartlink. */}
            <h2 className={styles.subheading} style={{ marginTop: 32 }}>Phái Sinh Smartlinks</h2>
            <button onClick={() => setShowAddSmartlink(true)} className={styles.btnSmall} style={{ marginBottom: 16 }}>
              + Add Smartlink
            </button>
            {phaiSinhSmartlinks.length === 0 ? (
              <div className={styles.emptyState}>No phái sinh smartlinks tracked yet.</div>
            ) : (
              <div className={styles.scrollBox} style={{ overflowX: "auto", overflowY: "auto", maxHeight: "50vh" }}>
                <table className={styles.table} style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th>Song / Artist / DID</th>
                      <th>Smartlink</th>
                      <th>Source</th>
                      <th>PIC</th>
                      <th>Note</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {phaiSinhSmartlinks.map((r) => (
                      <PhaiSinhSmartlinkRow
                        key={r.id}
                        row={r}
                        profiles={profiles}
                        onUpdateField={updatePhaiSinhSmartlinkField}
                        onDelete={deletePhaiSinhSmartlink}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {showAddSmartlink && (
              <PhaiSinhSmartlinkPopup
                profiles={profiles}
                onClose={() => setShowAddSmartlink(false)}
                onSaved={(row) => setPhaiSinhSmartlinks((prev) => [row, ...prev])}
              />
            )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function PhaiSinhSmartlinkRow({ row, profiles, onUpdateField, onDelete }) {
  const [draftLink, setDraftLink] = useState(row.smartlink || "");
  return (
    <tr>
      <td>
        <div style={{ fontWeight: 700 }}>{row.song_title || "—"}</div>
        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{row.artist || "—"} · {row.did || "no DID"}</div>
      </td>
      <td style={{ minWidth: 180 }}>
        <UrlField styles={styles} value={draftLink} onChange={setDraftLink} onBlur={() => onUpdateField(row, "smartlink", draftLink)} />
      </td>
      <td>
        {row.source_ticket_id ? (
          <Link href={`/tickets/phai-sinh`} className={styles.rowLink} style={{ fontSize: 11 }}>From ticket ↗</Link>
        ) : (
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Manual</span>
        )}
      </td>
      <td>
        <select className={styles.select} style={{ minWidth: "16ch" }} value={row.pic_profile_id || ""} onChange={(e) => onUpdateField(row, "pic_profile_id", e.target.value || null)}>
          <option value="">— Unassigned —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </td>
      <td>
        <input className={styles.input} style={{ minWidth: 140 }} defaultValue={row.note || ""} onBlur={(e) => onUpdateField(row, "note", e.target.value || null)} />
      </td>
      <td>
        <button onClick={() => { if (confirm("Remove this smartlink row?")) onDelete(row); }} className={styles.btnSmall}>Delete</button>
      </td>
    </tr>
  );
}

function LbmCell({ release, onUpdateField }) {
  const [draft, setDraft] = useState(release.link_lbm || "");
  return (
    <>
      <UrlField styles={styles} value={draft} onChange={setDraft} onBlur={() => onUpdateField(release, "link_lbm", draft)} />
      {/* Round 211 — who's actually expected to create this upload, see lib/LinkLbmSourceBadge.js. Shared by both phase 1 and phase 2 tables, same as this cell already is. */}
      <LinkLbmSourceBadge styles={styles} value={release.link_lbm_source} onChange={(v) => onUpdateField(release, "link_lbm_source", v)} />
    </>
  );
}

function SmartlinkCell({ release, onUpdateField }) {
  const [draft, setDraft] = useState(release.smartlink || "");
  return (
    <UrlField
      styles={styles}
      value={draft}
      onChange={setDraft}
      onBlur={() => onUpdateField(release, "smartlink", draft)}
      disabled={release.needs_update}
      disabledTitle={PRIORITY_MODE_WARNING}
    />
  );
}
