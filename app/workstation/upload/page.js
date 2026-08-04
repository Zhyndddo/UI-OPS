"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, uploadPercent } from "../../../lib/helpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import UrlField from "../../../lib/UrlField";
import StatusCounter from "../../../lib/StatusCounter";
import { sortByReleaseDateDesc, isThisWeekOrNext, filterProfilesByTeam } from "../../../lib/workstationHelpers";
import { useSortableRows } from "../../../lib/useSortableRows";
import SortableTh, { ResetSortButton } from "../../../lib/SortableTh";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import NotePopup from "../../../lib/ReleaseNotePopup";
import { PRIORITY_MODE_WARNING } from "../../../lib/releaseNotes";
import styles from "../../shared.module.css";

const UPLOAD_STATUS_OPTS = ["Running", "Pending", "Cancel"];

// Converted from a ticket into a workstation — SEND UPLOAD still creates
// the Newrelease Upload ticket for record-keeping, but the actual work
// (filling in the URLs OPS returns) happens here, matching the same
// ticket-triggers/workstation-does-the-work split as Package/Media
// Booking. Every field except PIC maps straight back to the release.
export default function UploadWorkstation() {
  const [releases, setReleases] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [defaultPic, setDefaultPic] = useState(null);
  const [assignments, setAssignments] = useState({}); // release_id -> pic_profile_id
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [notePopup, setNotePopup] = useState(null); // { release, kind: "product" | "linkshare" } | null

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: rels } = await supabase
      .from("releases")
      .select(
        "id, did, title, main_artist, release_date, release_time, upc, drive_link, link_lbm, link_share, smartlink, link_preorder, upload_status, " +
        "link_ugc, link_media_report, requester_segment, linkshare_tiktok_timing, linkshare_facebook_timing, needs_update"
      )
      .eq("requested", true);
    setReleases(rels || []);

    const { data: profs } = await supabase.from("profiles").select("id, name, segment, role").order("name");
    setProfiles(filterProfilesByTeam(profs || [], "OPS"));

    const { data: assigns } = await supabase
      .from("workstation_assignments")
      .select("release_id, pic_profile_id")
      .eq("workstation", "upload");
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

  // Same immediate-write pattern as updateField, but takes a whole patch
  // object (used by the Note/Linkshare Note popup, which can edit several
  // config fields) and also keeps the open popup's own copy of the release
  // in sync so the "Generated Note" preview updates live as you type.
  async function updateNoteField(release, patch) {
    setReleases((prev) => prev.map((r) => (r.id === release.id ? { ...r, ...patch } : r)));
    setNotePopup((p) => (p && p.release.id === release.id ? { ...p, release: { ...p.release, ...patch } } : p));
    await supabase.from("releases").update(patch).eq("id", release.id);
  }

  async function updatePic(release, profileId) {
    setAssignments((prev) => ({ ...prev, [release.id]: profileId || undefined }));
    if (!profileId) {
      await supabase.from("workstation_assignments").delete().eq("workstation", "upload").eq("release_id", release.id);
      return;
    }
    const { data: existing } = await supabase
      .from("workstation_assignments")
      .select("id")
      .eq("workstation", "upload")
      .eq("column_key", "all")
      .eq("release_id", release.id)
      .maybeSingle();
    if (existing) {
      await supabase.from("workstation_assignments").update({ pic_profile_id: profileId }).eq("id", existing.id);
    } else {
      await supabase.from("workstation_assignments").insert({ workstation: "upload", column_key: "all", release_id: release.id, pic_profile_id: profileId });
    }
  }

  // "Done" here (a first pass — the real rule is the team's call later):
  // Cancel status is its own bucket; otherwise done once every URL this
  // workstation tracks is filled in.
  function isDone(r) {
    return r.upload_status !== "Cancel" && uploadPercent(r) === 100;
  }
  function isCancel(r) {
    return r.upload_status === "Cancel";
  }

  const counts = useMemo(() => {
    let done = 0, notDone = 0, cancel = 0;
    releases.forEach((r) => {
      if (isCancel(r)) cancel++;
      else if (isDone(r)) done++;
      else notDone++;
    });
    return { done, notDone, cancel };
  }, [releases]);

  const filteredReleases = useMemo(() => {
    return showDone ? releases : releases.filter((r) => !isDone(r));
  }, [releases, showDone]);

  const { sorted: visibleReleases, sort, toggleSort, resetSort, isDefault } = useSortableRows(filteredReleases);
  const { pageRows: pagedReleases, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleReleases);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1300 }}>
          <TypeSwitcher kind="workstation" current="upload" />
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 8 }}>Upload</h1>

          <StatusCounter done={counts.done} notDone={counts.notDone} cancel={counts.cancel} />
          <button
            onClick={() => setShowDone((s) => !s)}
            className={styles.btnSmall}
            style={{ marginBottom: 16 }}
          >
            {showDone ? "Hide done rows" : `Show done rows (${counts.done})`}
          </button>
          <ResetSortButton isDefault={isDefault} onReset={resetSort} styles={styles} />

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : visibleReleases.length === 0 ? (
            <div className={styles.emptyState}>{releases.length === 0 ? "No releases have had SEND UPLOAD clicked yet." : "Nothing outstanding — everything's done."}</div>
          ) : (
            <>
            <div className={styles.scrollBox} style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh" }}>
            <table className={styles.table} style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <SortableTh
                    sortKey="release_date"
                    sort={sort}
                    onToggle={toggleSort}
                    style={{ position: "sticky", left: 0, zIndex: 21, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}
                  >
                    UPC / Link Drive / Release
                  </SortableTh>
                  <th>Link LBM</th>
                  <th>Link Share</th>
                  <th>Smartlink</th>
                  {/* Pre-order column removed — Link Preorder is now edited
                      from the Pre-order Itunes ticket popup instead (see
                      app/tickets/pre-order-itunes/page.js), same real
                      releases.link_preorder column, one editing surface. */}
                  {/* Renamed from plain "Note" — this is the existing
                      brief-backed popup (product note + linkshare timing),
                      distinct from the independent Note columns added to
                      Pitching/Confirm/Pre-release/Booking. Label change
                      only, no behavior change. */}
                  <th>Upload Note</th>
                  <SortableTh label="Upload Status" sortKey="upload_status" sort={sort} onToggle={toggleSort} />
                  <th title={defaultPic ? `Default: ${profiles.find((p) => p.id === defaultPic)?.name}` : "No default set"}>PIC</th>
                </tr>
              </thead>
              <tbody>
                {pagedReleases.map((r) => (
                  <UploadRow
                    key={r.id}
                    release={r}
                    pic={assignments[r.id] ?? defaultPic}
                    isOverride={assignments[r.id] != null}
                    profiles={profiles}
                    highlight={isThisWeekOrNext(r.release_date)}
                    onUpdateField={updateField}
                    onUpdatePic={updatePic}
                    onOpenNote={(kind) => setNotePopup({ release: r, kind })}
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

      {notePopup && (
        <NotePopup
          release={notePopup.release}
          kind={notePopup.kind}
          onUpdate={(patch) => updateNoteField(notePopup.release, patch)}
          onClose={() => setNotePopup(null)}
        />
      )}
    </AppShell>
  );
}

function UploadRow({ release, pic, isOverride, profiles, highlight, onUpdateField, onUpdatePic, onOpenNote }) {
  const URL_KEYS = ["drive_link", "link_lbm", "link_share", "smartlink"];
  const [drafts, setDrafts] = useState(() => {
    const initial = {};
    URL_KEYS.forEach((k) => (initial[k] = release[k] || ""));
    return initial;
  });
  const [upc, setUpc] = useState(release.upc || "");

  const rowStyle = highlight ? { background: "rgba(255,107,26,0.06)" } : undefined;

  return (
    <tr style={rowStyle}>
      <td style={{ position: "sticky", left: 0, zIndex: 1, background: highlight ? "#1a120a" : "var(--bg)", borderRight: "2px solid var(--accent)" }}>
        <input
          className={styles.input}
          style={{ padding: "4px 8px", fontSize: 12, marginBottom: 4 }}
          value={upc}
          placeholder="UPC…"
          onChange={(e) => setUpc(e.target.value)}
          onBlur={() => onUpdateField(release, "upc", upc)}
        />
        <div style={{ marginBottom: 4 }}>
          <UrlField
            styles={styles}
            value={drafts.drive_link}
            onChange={(v) => setDrafts((d) => ({ ...d, drive_link: v }))}
            onBlur={() => onUpdateField(release, "drive_link", drafts.drive_link)}
            placeholder="Link Drive…"
          />
        </div>
        <Link href={`/releases/${release.id}`} className={styles.rowLink}>{release.title}</Link>
        {highlight && <span style={{ marginLeft: 6, fontSize: 9, color: "var(--accent)", fontWeight: 700 }}>THIS/NEXT WEEK</span>}
        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{release.main_artist} · {release.did} · {fmtDate(release.release_date)} {release.release_time}</div>
      </td>
      <td style={{ minWidth: 180 }}>
        <UrlField styles={styles} value={drafts.link_lbm} onChange={(v) => setDrafts((d) => ({ ...d, link_lbm: v }))} onBlur={() => onUpdateField(release, "link_lbm", drafts.link_lbm)} />
      </td>
      <td style={{ minWidth: 180 }}>
        <UrlField styles={styles} value={drafts.link_share} onChange={(v) => setDrafts((d) => ({ ...d, link_share: v }))} onBlur={() => onUpdateField(release, "link_share", drafts.link_share)} />
      </td>
      <td style={{ minWidth: 180 }}>
        <UrlField
          styles={styles}
          value={drafts.smartlink}
          onChange={(v) => setDrafts((d) => ({ ...d, smartlink: v }))}
          onBlur={() => onUpdateField(release, "smartlink", drafts.smartlink)}
          disabled={release.needs_update}
          disabledTitle={PRIORITY_MODE_WARNING}
        />
      </td>
      <td>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => onOpenNote("product")}
            title="Upload Note — Link Drive, Smartlink, UPC, etc."
            style={{ background: "none", border: "none", color: "var(--accent-soft)", cursor: "pointer", fontSize: 16, padding: 0 }}
          >
            📝
          </button>
          <button
            type="button"
            onClick={() => onOpenNote("linkshare")}
            title="Linkshare Note — Tiktok/Facebook release timing"
            style={{ background: "none", border: "none", color: "var(--accent-soft)", cursor: "pointer", fontSize: 16, padding: 0 }}
          >
            🔗
          </button>
        </div>
      </td>
      <td>
        <select className={styles.select} style={{ minWidth: 110 }} value={release.upload_status || "Running"} onChange={(e) => onUpdateField(release, "upload_status", e.target.value)}>
          {UPLOAD_STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td title={isOverride ? "Row override" : "Workstation default"}>
        <select className={styles.select} style={{ minWidth: 130 }} value={pic || ""} onChange={(e) => onUpdatePic(release, e.target.value)}>
          <option value="">— Unassigned —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </td>
    </tr>
  );
}
