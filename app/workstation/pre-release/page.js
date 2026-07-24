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
import styles from "../../shared.module.css";

// Field labels swapped per the redesign: the column that used to show as
// "CANVA MV" is now labeled CANVA, and the one that used to show as
// "CANVA" is now labeled MV — same underlying columns, just relabeled,
// converted from free text to real single-choice pickers, plus one
// genuinely new field (Zing Lyric).
const CANVA_OPTS = ["", "Done", "CUT", "No Vid"];
const MV_OPTS = ["", "LYRIC", "Đã có", "Chưa có", "Không có"];
const PICK_OPTS = ["", "Done", "Uneditible", "Skip"];
const MUSIXMATCH_STATUS_OPTS = ["", "Catalog", "Added", "Sync"];

export default function PreReleaseWorkstation() {
  const [releases, setReleases] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [defaultPic, setDefaultPic] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: rels } = await supabase
      .from("releases")
      .select("id, did, title, main_artist, release_date, release_time, canva_mv_status, canva_status, artist_pick_status, musixmatch_link, musixmatch_status, nct_lyric, zing_lyric");
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

  function isDone(r) {
    return !!(r.canva_mv_status && r.canva_status && r.artist_pick_status && r.musixmatch_link && r.musixmatch_status && r.nct_lyric && r.zing_lyric);
  }

  const counts = useMemo(() => {
    let done = 0, notDone = 0;
    releases.forEach((r) => (isDone(r) ? done++ : notDone++));
    return { done, notDone, cancel: 0 };
  }, [releases]);

  const visibleReleases = useMemo(() => {
    const filtered = showDone ? releases : releases.filter((r) => !isDone(r));
    return sortByReleaseDateDesc(filtered);
  }, [releases, showDone]);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1300 }}>
          <TypeSwitcher kind="workstation" current="pre_release" />
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 16 }}>Pre-release</h1>

          <StatusCounter done={counts.done} notDone={counts.notDone} cancel={counts.cancel} />
          <button onClick={() => setShowDone((s) => !s)} className={styles.btnSmall} style={{ marginBottom: 16 }}>
            {showDone ? "Hide done rows" : `Show done rows (${counts.done})`}
          </button>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : visibleReleases.length === 0 ? (
            <div className={styles.emptyState}>{releases.length === 0 ? "No releases yet." : "Nothing outstanding."}</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table className={styles.table} style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, zIndex: 2, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>Release info</th>
                  <th>CANVA</th>
                  <th>MV</th>
                  <th>Artist Pick</th>
                  <th>Musixmatch Status</th>
                  <th>Musixmatch Link</th>
                  <th>NCT Lyric</th>
                  <th>Zing Lyric</th>
                  <th>PIC</th>
                </tr>
              </thead>
              <tbody>
                {visibleReleases.map((r) => (
                  <PreReleaseRow
                    key={r.id}
                    release={r}
                    pic={assignments[r.id] ?? defaultPic}
                    isOverride={assignments[r.id] != null}
                    profiles={profiles}
                    onUpdateField={updateField}
                    onUpdatePic={updatePic}
                  />
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function PreReleaseRow({ release, pic, isOverride, profiles, onUpdateField, onUpdatePic }) {
  const [mmLink, setMmLink] = useState(release.musixmatch_link || "");

  return (
    <tr>
      <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>
        <Link href={`/releases/${release.id}`} className={styles.rowLink}>{release.title}</Link>
        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{release.main_artist} · {release.did} · {fmtDate(release.release_date)} {release.release_time}</div>
      </td>
      <td>
        <select className={styles.select} style={{ minWidth: 100 }} value={release.canva_mv_status || ""} onChange={(e) => onUpdateField(release, "canva_mv_status", e.target.value)}>
          {CANVA_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
        </select>
      </td>
      <td>
        <select className={styles.select} style={{ minWidth: 100 }} value={release.canva_status || ""} onChange={(e) => onUpdateField(release, "canva_status", e.target.value)}>
          {MV_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
        </select>
      </td>
      <td>
        <select className={styles.select} style={{ minWidth: 100 }} value={release.artist_pick_status || ""} onChange={(e) => onUpdateField(release, "artist_pick_status", e.target.value)}>
          {PICK_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
        </select>
      </td>
      <td>
        <select className={styles.select} style={{ minWidth: 100 }} value={release.musixmatch_status || ""} onChange={(e) => onUpdateField(release, "musixmatch_status", e.target.value)}>
          {MUSIXMATCH_STATUS_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
        </select>
      </td>
      <td style={{ minWidth: 180 }}>
        <UrlField styles={styles} value={mmLink} onChange={setMmLink} onBlur={() => onUpdateField(release, "musixmatch_link", mmLink)} />
      </td>
      <td>
        <select className={styles.select} style={{ minWidth: 100 }} value={release.nct_lyric || ""} onChange={(e) => onUpdateField(release, "nct_lyric", e.target.value)}>
          {PICK_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
        </select>
      </td>
      <td>
        <select className={styles.select} style={{ minWidth: 100 }} value={release.zing_lyric || ""} onChange={(e) => onUpdateField(release, "zing_lyric", e.target.value)}>
          {PICK_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
        </select>
      </td>
      <td title={isOverride ? "Row override" : "Workstation default"}>
        <select className={styles.select} style={{ minWidth: 130 }} value={pic || ""} onChange={(e) => onUpdatePic(release.id, e.target.value)}>
          <option value="">— Unassigned —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </td>
    </tr>
  );
}
