"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import UrlField from "../../../lib/UrlField";
import StatusCounter from "../../../lib/StatusCounter";
import { sortByReleaseDateDesc, filterProfilesByTeam } from "../../../lib/workstationHelpers";
import { useSortableRows } from "../../../lib/useSortableRows";
import SortableTh, { ResetSortButton } from "../../../lib/SortableTh";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import SearchBox, { matchesQuery } from "../../../lib/SearchBox";
import { MV_TYPE_OPTIONS } from "../../../lib/pickerOptions";
import { rowHighlightColor } from "../../../lib/releaseDateHighlight";
import SonyPublishLockRow from "../../../lib/SonyPublishLockRow";
import { useSonyPublishDids } from "../../../lib/useSonyPublishDids";
import styles from "../../shared.module.css";

// Field labels swapped per the redesign: the column that used to show as
// "CANVA MV" is now labeled CANVA, and the one that used to show as
// "CANVA" is now labeled MV — same underlying columns, just relabeled,
// converted from free text to real single-choice pickers, plus one
// genuinely new field (Zing Lyric).
const CANVA_OPTS = ["", "Done", "CUT", "No Vid"];
const MV_OPTS = MV_TYPE_OPTIONS;
const PICK_OPTS = ["", "Done", "Uneditible", "Skip"];
const MUSIXMATCH_STATUS_OPTS = ["", "Catalog", "Added", "Sync"];

// Every one of the 6 columns above is a fixed single-choice picker, but
// import-ops-tracking.js writes whatever free text was in the source
// sheet's STATUS/NOTE/Artist Pick columns straight into these fields —
// nothing maps it onto one of the option lists above. A value that
// doesn't exactly match one of them (different wording, a legacy status
// from before the picker existed, a typo) has no matching <option>, so
// the <select> just renders blank ("—") even though the row genuinely
// has that value in the database — same bug class as the New Release
// dashboard's Channel column. PickSelect below surfaces the raw value as
// its own flagged option instead of silently hiding it, same fix as
// there — pick one of the real options to correct it in place.
function PickSelect({ styles, opts, value, onChange }) {
  const unrecognized = value && !opts.includes(value) ? value : null;
  return (
    <select
      className={styles.select}
      style={{ minWidth: 100 }}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      title={unrecognized ? "Imported value doesn't match any picker option — pick one to fix it" : undefined}
    >
      {opts.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
      {unrecognized && <option value={unrecognized}>{unrecognized} (unrecognized — pick to fix)</option>}
    </select>
  );
}

// Round 152 — "unfilled field" purple highlight, per explicit request to
// match New Release Setup's same marker (app/workstation/upload/page.js's
// missingHighlightStyle — identical implementation, reusing the same
// global --missing-highlight/--missing-highlight-bg CSS vars, fixed
// purple #9D00FF in both themes, no new CSS needed). Applied to each of
// this page's 6 fillable fields (the same 6 isDone() below checks — was 7
// before Round 158 moved Artist Pick to Re-Check Phase 2).
function missingHighlightStyle(value) {
  return value
    ? undefined
    : { boxShadow: "inset 0 0 0 2px var(--missing-highlight)", background: "var(--missing-highlight-bg)", borderRadius: 6 };
}

export default function PreReleaseWorkstation() {
  const [releases, setReleases] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [defaultPic, setDefaultPic] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [query, setQuery] = useState(""); // round 76 — quick index search box
  const sonyPublishDids = useSonyPublishDids();

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: rels } = await supabase
      .from("releases")
      // Round 158 — artist_pick_status moved to Re-Check Phase 2 (see
      // app/workstation/confirm/page.js), per explicit request. No longer
      // fetched/rendered here — the underlying releases column is
      // unchanged, this page just stopped being its edit surface.
      // Round 165 — link_lbm added per explicit request, so LBM/Labelmaster
      // URL is visible and editable from this workstation too (same
      // releases.link_lbm column the Re-Check workstation's LbmCell and
      // the release detail page's URL tab already read/write — one shared
      // field, just another edit surface, same pattern as Musixmatch Link
      // already being editable from both this page and the detail page).
      .select("id, did, title, main_artist, release_date, release_time, link_lbm, canva_mv_status, canva_status, musixmatch_link, musixmatch_status, nct_lyric, zing_lyric, pre_release_note");
    setReleases(rels || []);

    const { data: profs } = await supabase.from("profiles").select("id, name, segment, role").order("name");
    setProfiles(filterProfilesByTeam(profs || [], "OPS"));

    const { data: assigns } = await supabase.from("workstation_assignments").select("release_id, pic_profile_id").eq("workstation", "pre_release");
    const map = {};
    let def = null;
    (assigns || []).forEach((a) => {
      if (a.release_id === null) def = a.pic_profile_id;
      else map[a.release_id] = a.pic_profile_id;
    });
    setDefaultPic(def);
    setAssignments(map);

    setLoading(false);
  }

  async function updateField(release, field, value) {
    setReleases((prev) => prev.map((r) => (r.id === release.id ? { ...r, [field]: value } : r)));
    await supabase.from("releases").update({ [field]: value }).eq("id", release.id);
  }

  async function updatePic(releaseId, profileId) {
    setAssignments((prev) => ({ ...prev, [releaseId]: profileId || undefined }));
    if (!profileId) {
      await supabase.from("workstation_assignments").delete().eq("workstation", "pre_release").eq("release_id", releaseId);
      return;
    }
    const { data: existing } = await supabase.from("workstation_assignments").select("id").eq("workstation", "pre_release").eq("column_key", "all").eq("release_id", releaseId).maybeSingle();
    if (existing) await supabase.from("workstation_assignments").update({ pic_profile_id: profileId }).eq("id", existing.id);
    else await supabase.from("workstation_assignments").insert({ workstation: "pre_release", column_key: "all", release_id: releaseId, pic_profile_id: profileId });
  }

  // Round 158 — artist_pick_status dropped from this rule (moved to
  // Re-Check Phase 2, see above) — a row here is done once its 6
  // remaining fields are filled, not 7.
  function isDone(r) {
    return !!(r.canva_mv_status && r.canva_status && r.musixmatch_link && r.musixmatch_status && r.nct_lyric && r.zing_lyric);
  }

  const counts = useMemo(() => {
    let done = 0, notDone = 0;
    releases.forEach((r) => (isDone(r) ? done++ : notDone++));
    return { done, notDone, cancel: 0 };
  }, [releases]);

  const filteredReleases = useMemo(() => {
    const base = showDone ? releases : releases.filter((r) => !isDone(r));
    return base.filter((r) => matchesQuery(r, query));
  }, [releases, showDone, query]);

  const { sorted: visibleReleases, sort, toggleSort, resetSort, isDefault } = useSortableRows(filteredReleases);
  const { pageRows: pagedReleases, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleReleases);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1400 }}>
          <TypeSwitcher kind="workstation" current="pre_release" />
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 16 }}>Pre-release</h1>

          <StatusCounter done={counts.done} notDone={counts.notDone} cancel={counts.cancel} />
          <SearchBox value={query} onChange={setQuery} placeholder="Search this list…" />
          <button onClick={() => setShowDone((s) => !s)} className={styles.btnSmall} style={{ marginBottom: 16 }}>
            {showDone ? "Hide done rows" : `Show done rows (${counts.done})`}
          </button>
          <ResetSortButton isDefault={isDefault} onReset={resetSort} styles={styles} />

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : visibleReleases.length === 0 ? (
            <div className={styles.emptyState}>{releases.length === 0 ? "No releases yet." : "Nothing outstanding."}</div>
          ) : (
            <>
            <div className={styles.scrollBox} style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh" }}>
            <table className={styles.table} style={{ minWidth: 1300 }}>
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
                  <th style={{ maxWidth: 150 }}>LBM URL</th>
                  <th>CANVA</th>
                  <th>MV</th>
                  <th style={{ borderLeft: "1px solid var(--border)" }}>Musixmatch Status</th>
                  <th>Musixmatch Link</th>
                  <th style={{ borderLeft: "1px solid var(--border)" }}>NCT Lyric</th>
                  <th>Zing Lyric</th>
                  <th>PIC</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {pagedReleases.map((r) =>
                  sonyPublishDids.has(r.did) ? (
                    <SonyPublishLockRow key={r.id} colSpan={10} />
                  ) : (
                    <PreReleaseRow
                      key={r.id}
                      release={r}
                      pic={assignments[r.id] ?? defaultPic}
                      isOverride={assignments[r.id] != null}
                      profiles={profiles}
                      onUpdateField={updateField}
                      onUpdatePic={updatePic}
                    />
                  )
                )}
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

function PreReleaseRow({ release, pic, isOverride, profiles, onUpdateField, onUpdatePic }) {
  const [mmLink, setMmLink] = useState(release.musixmatch_link || "");
  // Round 165 — LBM/Labelmaster URL, added per explicit request in place
  // of Artist Pick (which had already moved off this workstation in Round
  // 158 — nothing to remove here, this is a straight addition). Same
  // local-buffer-then-onBlur-commit pattern as Musixmatch Link right next
  // to it, and the same releases.link_lbm column the Re-Check
  // workstation's LbmCell already edits.
  const [lbmLink, setLbmLink] = useState(release.link_lbm || "");

  // Round 152 — same today/this-week row highlight as Re-Check
  // (app/workstation/confirm/page.js), applied here per explicit request.
  // Same rowHighlightColor() shared helper, same "row + sticky first cell"
  // application so the highlight doesn't visibly stop at that column.
  const highlight = rowHighlightColor(release);

  return (
    <tr style={highlight ? { background: highlight } : undefined}>
      <td style={{ position: "sticky", left: 0, zIndex: 1, background: highlight || "var(--bg)", borderRight: "2px solid var(--accent)", minWidth: 260 }}>
        {/* Explicit 3-line layout per explicit request — Name / Artist &
            DID / Release date + time — instead of one run-on line, for
            clarity and so each line stays short enough to not wrap. */}
        <div style={{ whiteSpace: "nowrap" }}>
          <Link href={`/releases/${release.id}`} className={styles.rowLink}>{release.title}</Link>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-faint)", whiteSpace: "nowrap" }}>{release.main_artist} · {release.did}</div>
        <div style={{ fontSize: 11, color: "var(--text-faint)", whiteSpace: "nowrap" }}>{fmtDate(release.release_date)} {release.release_time}</div>
      </td>
      <td style={{ maxWidth: 150 }}>
        <UrlField styles={styles} value={lbmLink} onChange={setLbmLink} onBlur={() => onUpdateField(release, "link_lbm", lbmLink)} />
      </td>
      <td style={missingHighlightStyle(release.canva_mv_status)}>
        <PickSelect styles={styles} opts={CANVA_OPTS} value={release.canva_mv_status} onChange={(v) => onUpdateField(release, "canva_mv_status", v)} />
      </td>
      <td style={missingHighlightStyle(release.canva_status)}>
        <PickSelect styles={styles} opts={MV_OPTS} value={release.canva_status} onChange={(v) => onUpdateField(release, "canva_status", v)} />
      </td>
      <td style={{ borderLeft: "1px solid var(--border)", ...missingHighlightStyle(release.musixmatch_status) }}>
        <PickSelect styles={styles} opts={MUSIXMATCH_STATUS_OPTS} value={release.musixmatch_status} onChange={(v) => onUpdateField(release, "musixmatch_status", v)} />
      </td>
      <td style={{ minWidth: 180, ...missingHighlightStyle(mmLink) }}>
        <UrlField styles={styles} value={mmLink} onChange={setMmLink} onBlur={() => onUpdateField(release, "musixmatch_link", mmLink)} />
      </td>
      <td style={{ borderLeft: "1px solid var(--border)", ...missingHighlightStyle(release.nct_lyric) }}>
        <PickSelect styles={styles} opts={PICK_OPTS} value={release.nct_lyric} onChange={(v) => onUpdateField(release, "nct_lyric", v)} />
      </td>
      <td style={missingHighlightStyle(release.zing_lyric)}>
        <PickSelect styles={styles} opts={PICK_OPTS} value={release.zing_lyric} onChange={(v) => onUpdateField(release, "zing_lyric", v)} />
      </td>
      <td title={isOverride ? "Row override" : "Workstation default"}>
        <select className={styles.select} style={{ minWidth: "16ch" }} value={pic || ""} onChange={(e) => onUpdatePic(release.id, e.target.value)}>
          <option value="">— Unassigned —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </td>
      <td>
        <input className={styles.input} style={{ minWidth: 140 }} defaultValue={release.pre_release_note || ""} onBlur={(e) => onUpdateField(release, "pre_release_note", e.target.value)} />
      </td>
    </tr>
  );
}
