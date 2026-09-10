"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthContext";
import { fmtDate, uploadPercent } from "../../../lib/helpers";
import SonyPublishLockRow from "../../../lib/SonyPublishLockRow";
import { useSonyPublishDids } from "../../../lib/useSonyPublishDids";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import UrlField from "../../../lib/UrlField";
import LinkLbmSourceBadge from "../../../lib/LinkLbmSourceBadge";
import StatusCounter from "../../../lib/StatusCounter";
import { sortByReleaseDateDesc, isThisWeekOrNext, filterProfilesByTeam, autoAssignUnassigned } from "../../../lib/workstationHelpers";
import { logPicReassign } from "../../../lib/auditLog";
import { rowHighlightColor, DATE_HIGHLIGHT_LEGEND } from "../../../lib/releaseDateHighlight";
import ColorLegend from "../../../lib/ColorLegend";
import { useSortableRows } from "../../../lib/useSortableRows";
import SortableTh, { ResetSortButton } from "../../../lib/SortableTh";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import SearchBox, { matchesQuery } from "../../../lib/SearchBox";
import NotePopup from "../../../lib/ReleaseNotePopup";
import CopyrightPreviewPopup from "../../../lib/CopyrightPreviewPopup";
import { copyrightChecklistIsEmpty } from "../../../lib/copyrightChecklist";
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
  const [query, setQuery] = useState(""); // round 76 — quick index search box
  const [notePopup, setNotePopup] = useState(null); // { release, kind: "product" | "linkshare" } | null
  const [copyrightPopupRelease, setCopyrightPopupRelease] = useState(null); // release | null
  // Round 274 — dids with a real Priority Pitching request, so the Apple
  // ID field below (see UploadRow) only shows up where it's actually
  // needed. Mirrors the Pitching workstation's own check (a release
  // "has priority pitching" iff its Pitching ticket's data.priority flag
  // is set) rather than release.priority_pitching's status text, since
  // that column is auto-synced FROM the flag and can lag/be blank before
  // the Pitching workstation has ever loaded for this release — the flag
  // on the ticket itself is the actual source of truth.
  const [priorityDids, setPriorityDids] = useState(new Set());
  const sonyPublishDids = useSonyPublishDids();
  const { profile } = useAuth();

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    // Round 150 — load-reduction pass. These 3 queries are independent —
    // none reads a result from another — but were previously awaited one
    // at a time in series. Switched to Promise.all so they fire
    // concurrently instead; total wait time becomes roughly the slowest
    // single query rather than the sum of all 3. No query/column/filter
    // behavior changed. See project doc "load-reduction-additional-ideas.md".
    const [{ data: rels }, { data: profs }, { data: assigns }, { data: pitchTab }] = await Promise.all([
      supabase
        .from("releases")
        .select(
          "id, did, title, main_artist, release_date, release_time, upc, apple_id, drive_link, link_lbm, link_lbm_source, link_share, smartlink, link_preorder, upload_status, " +
          "link_ugc, link_media_report, requester_segment, linkshare_tiktok_timing, linkshare_facebook_timing, needs_update, " +
          // Round 88 2nd follow-up — Copyright popup column
          "single_album_ep, copyright_checklist"
        )
        .eq("requested", true),
      supabase.from("profiles").select("id, name, segment, role").order("name"),
      supabase.from("workstation_assignments").select("release_id, pic_profile_id, auto_assigned").eq("workstation", "upload"),
      // Round 274 — same tab lookup app/workstation/pitching/page.js does,
      // run alongside the 3 queries above instead of after them.
      supabase.from("ticket_tabs").select("id").eq("key", "pitching").single(),
    ]);
    setReleases(rels || []);
    setProfiles(filterProfilesByTeam(profs || [], "OPS"));

    const map = {};
    let def = null;
    const autoAssignedIds = [];
    (assigns || []).forEach((a) => {
      if (a.release_id === null) def = a.pic_profile_id;
      else {
        map[a.release_id] = a.pic_profile_id;
        if (a.auto_assigned) autoAssignedIds.push(a.release_id);
      }
    });

    // Round 296 — follow-up to Round 295: a config default only blocked
    // FUTURE auto-assigns, it couldn't un-stick a release the auto-assign
    // had already claimed before the default existed ("would it still fix
    // it until they manually do the other thing?" — no, so this fixes
    // that too). If a config default is now set, any existing row this
    // page's own past auto-assign wrote (auto_assigned=true — a human's
    // own pick is never flagged this way, see updatePic) is deleted here,
    // so the release falls back to showing the config default again. Runs
    // every load, so it's self-healing going forward too, not just a
    // one-time fix for the current backlog.
    if (def != null && autoAssignedIds.length > 0) {
      await supabase.from("workstation_assignments").delete().eq("workstation", "upload").in("release_id", autoAssignedIds);
      autoAssignedIds.forEach((rid) => { delete map[rid]; });
    }

    setDefaultPic(def);
    setAssignments(map);

    // Round 281 — auto-assign unassigned rows to team lead/admin, see
    // lib/workstationHelpers.js. Fire-and-forget after load, not awaited
    // here — don't block the page's first render on it. Only releases with
    // no per-release row (not in `map`) are genuinely unassigned.
    //
    // Round 295 — precedence fix, per explicit request ("i want to make
    // the config override the other rules, but manual input override
    // everything else"). Used to fire unconditionally the moment a
    // release had no per-release row, ignoring whether a config default
    // (`def`) was already set — so this auto-assign would silently win
    // over an admin's own Config → PIC Defaults choice the instant the
    // page loaded. Now it only runs when NO config default exists for
    // this workstation (`def == null`); when a default IS set, that
    // config value is left as the shown (but still unwritten) fallback
    // indefinitely — see the PIC <select>'s own `assignments[r.id] ??
    // defaultPic` below, unchanged. A real MANUAL per-release row still
    // always wins over both, since `map` is checked first either way —
    // only auto_assigned rows get reclaimed by the cleanup above.
    const scopedProfs = filterProfilesByTeam(profs || [], "OPS");
    Promise.all(
      (def == null ? (rels || []) : [])
        .filter((r) => map[r.id] == null)
        .map((r) =>
          autoAssignUnassigned({
            profiles: scopedProfs,
            segment: "OPS",
            entity: "workstation_assignment",
            entityId: `upload:${r.id}`,
            write: async (profileId) => {
              await supabase.from("workstation_assignments").insert({ workstation: "upload", column_key: "all", release_id: r.id, pic_profile_id: profileId, auto_assigned: true });
              setAssignments((prev) => (prev[r.id] != null ? prev : { ...prev, [r.id]: profileId }));
            },
          })
        )
    );

    // Round 274 — Priority Pitching dids, for UploadRow's Apple ID field.
    // t.data.releaseId is (despite the name) the release's `did`, same
    // field the Pitching workstation itself matches on.
    if (pitchTab) {
      const { data: pitchTickets } = await supabase.from("tickets").select("data").eq("tab_id", pitchTab.id).is("deleted_at", null);
      const priority = new Set();
      (pitchTickets || []).forEach((t) => { if (t.data?.priority && t.data?.releaseId) priority.add(t.data.releaseId); });
      setPriorityDids(priority);
    }

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
    const before = assignments[release.id] ?? null;
    setAssignments((prev) => ({ ...prev, [release.id]: profileId || undefined }));
    // Round 281 — manual PIC reassignment audit trail (separate from the
    // auto-assign case above, which logs itself via autoAssignUnassigned).
    logPicReassign({ actor: profile?.id, entity: "workstation_assignment", entityId: release.id, before, after: profileId || null });
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
    // Round 296 — a manual pick always clears auto_assigned, even if it's
    // overwriting a row this page's own auto-assign wrote earlier. Once a
    // human has touched it, it's a real manual assignment — never again
    // eligible to be reclaimed by a later-set config default.
    if (existing) {
      await supabase.from("workstation_assignments").update({ pic_profile_id: profileId, auto_assigned: false }).eq("id", existing.id);
    } else {
      await supabase.from("workstation_assignments").insert({ workstation: "upload", column_key: "all", release_id: release.id, pic_profile_id: profileId, auto_assigned: false });
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
    const base = showDone ? releases : releases.filter((r) => !isDone(r));
    return base.filter((r) => matchesQuery(r, query));
  }, [releases, showDone, query]);

  const { sorted: visibleReleases, sort, toggleSort, resetSort, isDefault } = useSortableRows(filteredReleases);
  const { pageRows: pagedReleases, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleReleases);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1400 }}>
          <TypeSwitcher kind="workstation" current="upload" />
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 8 }}>New Release Setup</h1>

          <StatusCounter done={counts.done} notDone={counts.notDone} cancel={counts.cancel} />
          <SearchBox value={query} onChange={setQuery} placeholder="Search this list…" />
          <button
            onClick={() => setShowDone((s) => !s)}
            className={styles.btnSmall}
            style={{ marginBottom: 16 }}
          >
            {showDone ? "Hide done rows" : `Show done rows (${counts.done})`}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <ResetSortButton isDefault={isDefault} onReset={resetSort} styles={styles} />
            <ColorLegend
              entries={[
                ...DATE_HIGHLIGHT_LEGEND,
                { color: "var(--missing-highlight)", label: "Still-empty required field (UPC/Apple ID/Link Drive/Link LBM/Link Share/Smartlink)" },
              ]}
            />
          </div>

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
                  {/* Round 88 2nd follow-up — read-only Copyright preview,
                      same data the release's own Copyrights tab edits. */}
                  <th>Copyright</th>
                  <SortableTh label="Upload Status" sortKey="upload_status" sort={sort} onToggle={toggleSort} />
                  <th title={defaultPic ? `Default: ${profiles.find((p) => p.id === defaultPic)?.name}` : "No default set"}>PIC</th>
                </tr>
              </thead>
              <tbody>
                {pagedReleases.map((r) =>
                  sonyPublishDids.has(r.did) ? (
                    <SonyPublishLockRow key={r.id} colSpan={8} />
                  ) : (
                    <UploadRow
                      key={r.id}
                      release={r}
                      pic={assignments[r.id] ?? defaultPic}
                      isOverride={assignments[r.id] != null}
                      profiles={profiles}
                      highlight={isThisWeekOrNext(r.release_date)}
                      dateHighlight={rowHighlightColor(r)}
                      hasPriorityPitching={priorityDids.has(r.did)}
                      onUpdateField={updateField}
                      onUpdatePic={updatePic}
                      onOpenNote={(kind) => setNotePopup({ release: r, kind })}
                      onOpenCopyright={() => setCopyrightPopupRelease(r)}
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

      {notePopup && (
        <NotePopup
          release={notePopup.release}
          kind={notePopup.kind}
          onUpdate={(patch) => updateNoteField(notePopup.release, patch)}
          onClose={() => setNotePopup(null)}
        />
      )}
      {copyrightPopupRelease && (
        <CopyrightPreviewPopup release={copyrightPopupRelease} onClose={() => setCopyrightPopupRelease(null)} />
      )}
    </AppShell>
  );
}

// Round 83 item 2 — purple highlight on every still-empty fillable field
// in this table (UPC, Link Drive, Link LBM, Link Share, Smartlink), per
// explicit request. An inset box-shadow rather than a background fill so
// it works the same whether it's wrapping a plain input or a UrlField
// component (whose own input already paints an opaque background) — see
// --missing-highlight/--missing-highlight-bg in app/globals.css.
function missingHighlightStyle(value) {
  return value
    ? undefined
    : { boxShadow: "inset 0 0 0 2px var(--missing-highlight)", background: "var(--missing-highlight-bg)", borderRadius: 6 };
}

function UploadRow({ release, pic, isOverride, profiles, highlight, dateHighlight, hasPriorityPitching, onUpdateField, onUpdatePic, onOpenNote, onOpenCopyright }) {
  const URL_KEYS = ["drive_link", "link_lbm", "link_share", "smartlink"];
  const [drafts, setDrafts] = useState(() => {
    const initial = {};
    URL_KEYS.forEach((k) => (initial[k] = release[k] || ""));
    return initial;
  });
  const [upc, setUpc] = useState(release.upc || "");
  // Round 274 — Apple ID, only editable here for rows with a real
  // Priority Pitching request (see hasPriorityPitching above) — other
  // rows don't need it filled in at this stage. Same releases.apple_id
  // column the Pitching workstation's own Priority tab already edits
  // (app/workstation/pitching/page.js), just another entry point.
  const [appleId, setAppleId] = useState(release.apple_id || "");

  // Round 77 — was a hardcoded near-black box (#1a120a) with text left on
  // var(--text)/var(--text-faint)/.rowLink's inherited color, which flip to
  // near-black on the light theme — dark text on a near-black box, exactly
  // the "hard to read" bug reported. Switched to the shared highlight
  // tokens (see globals.css) — same fix Booking's "Releasing Today" row
  // already used, now shared instead of two separate hardcoded copies.
  //
  // Round 139 — `dateHighlight` (today/this-week, same rule + colors as
  // the Re-Check workstation, see lib/releaseDateHighlight.js) takes
  // priority over this row's own older "this or next week" tint when both
  // apply. It's a plain background swap with no forced text color — same
  // pattern the Re-Check workstation uses — because these are bright
  // pastel fills, not the always-dark --highlight-bg box the forced white
  // --highlight-text was designed to sit on.
  const rowStyle = dateHighlight ? { background: dateHighlight } : highlight ? { background: "var(--highlight-row-tint)" } : undefined;
  const stickyBg = dateHighlight || (highlight ? "var(--highlight-bg)" : "var(--bg)");
  const linkColor = dateHighlight ? undefined : highlight ? "var(--highlight-text)" : undefined;
  const faintColor = dateHighlight ? "var(--text-faint)" : highlight ? "var(--highlight-text-faint)" : "var(--text-faint)";

  return (
    <tr style={rowStyle}>
      <td style={{ position: "sticky", left: 0, zIndex: 1, background: stickyBg, borderRight: "2px solid var(--accent)" }}>
        {/* Round 274 — UPC cut to half width, per explicit request, to
            make room for Apple ID right next to it on Priority Pitching
            rows (see hasPriorityPitching). Non-priority rows keep UPC at
            the same half width rather than snapping back to full width,
            so the column doesn't jump around row to row. */}
        <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
          <input
            className={styles.input}
            style={{ padding: "4px 8px", fontSize: 12, flex: "0 0 50%", minWidth: 0, ...missingHighlightStyle(upc) }}
            value={upc}
            placeholder="UPC…"
            onChange={(e) => setUpc(e.target.value)}
            onBlur={() => onUpdateField(release, "upc", upc)}
          />
          {hasPriorityPitching && (
            <input
              className={styles.input}
              style={{ padding: "4px 8px", fontSize: 12, flex: "0 0 50%", minWidth: 0, ...missingHighlightStyle(appleId) }}
              value={appleId}
              placeholder="Apple ID…"
              onChange={(e) => setAppleId(e.target.value)}
              onBlur={() => onUpdateField(release, "apple_id", appleId)}
            />
          )}
        </div>
        <div style={{ marginBottom: 4, ...missingHighlightStyle(drafts.drive_link) }}>
          <UrlField
            styles={styles}
            value={drafts.drive_link}
            onChange={(v) => setDrafts((d) => ({ ...d, drive_link: v }))}
            onBlur={() => onUpdateField(release, "drive_link", drafts.drive_link)}
            placeholder="Link Drive…"
          />
        </div>
        <Link href={`/releases/${release.id}`} className={styles.rowLink} style={linkColor ? { color: linkColor } : undefined}>{release.title}</Link>
        {highlight && <span style={{ marginLeft: 6, fontSize: 9, color: "var(--accent)", fontWeight: 700 }}>THIS/NEXT WEEK</span>}
        <div style={{ fontSize: 11, color: faintColor }}>{release.main_artist} · {release.did} · {fmtDate(release.release_date)} {release.release_time}</div>
        {/* Round 280 — second entry point for creating a Bổ Sung DATA
            ticket, per explicit spec ("ticket create button have two
            place, one on the ticket page, another on the new release
            setup workstation"). Pre-fills the release so OPS doesn't have
            to search for it again right after looking at this row. */}
        <Link href={`/tickets/bo-sung-data/new?releaseId=${encodeURIComponent(release.did)}`} className={styles.btnSmall} style={{ display: "inline-block", marginTop: 4, fontSize: 10, textDecoration: "none" }}>
          + Bổ Sung DATA
        </Link>
      </td>
      <td style={{ minWidth: 180, ...missingHighlightStyle(drafts.link_lbm) }}>
        <UrlField styles={styles} value={drafts.link_lbm} onChange={(v) => setDrafts((d) => ({ ...d, link_lbm: v }))} onBlur={() => onUpdateField(release, "link_lbm", drafts.link_lbm)} />
        {/* Round 211 — who's actually expected to create this upload, see lib/LinkLbmSourceBadge.js */}
        <LinkLbmSourceBadge styles={styles} value={release.link_lbm_source} onChange={(v) => onUpdateField(release, "link_lbm_source", v)} />
      </td>
      <td style={{ minWidth: 180, ...missingHighlightStyle(drafts.link_share) }}>
        <UrlField styles={styles} value={drafts.link_share} onChange={(v) => setDrafts((d) => ({ ...d, link_share: v }))} onBlur={() => onUpdateField(release, "link_share", drafts.link_share)} />
      </td>
      {/* No highlight while needs_update disables this field — it isn't
          actually editable right now, so flagging it "missing" would be
          misleading (see PRIORITY_MODE_WARNING). */}
      <td style={{ minWidth: 180, ...(release.needs_update ? undefined : missingHighlightStyle(drafts.smartlink)) }}>
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
        <button
          type="button"
          onClick={onOpenCopyright}
          title="Copyright — click to view (read-only)"
          style={{
            background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 0,
            color: copyrightChecklistIsEmpty(release.copyright_checklist) ? "var(--text-faint)" : "var(--accent-soft)",
          }}
        >
          ©
        </button>
      </td>
      <td>
        <select className={styles.select} style={{ minWidth: 110 }} value={release.upload_status || "Running"} onChange={(e) => onUpdateField(release, "upload_status", e.target.value)}>
          {UPLOAD_STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td title={isOverride ? "Row override" : "Workstation default"}>
        <select className={styles.select} style={{ minWidth: "16ch" }} value={pic || ""} onChange={(e) => onUpdatePic(release, e.target.value)}>
          <option value="">— Unassigned —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </td>
    </tr>
  );
}
