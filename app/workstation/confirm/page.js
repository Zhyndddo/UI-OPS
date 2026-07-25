"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import { BoolToggle } from "../../../lib/GateFields";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import UrlField from "../../../lib/UrlField";
import StatusCounter from "../../../lib/StatusCounter";
import { sortByReleaseDateDesc, filterProfilesByTeam } from "../../../lib/workstationHelpers";
import styles from "../../shared.module.css";

// Same tool, visited twice — Phase 1 while waiting for release, Phase 2
// after it's live. Rebuilt from scratch: the 6 individual DSP checks now
// live behind one bulk Yes/No (only reads "Yes" once every one of them
// is true), matching how everything else on this page is a plain Yes/No
// like the release detail popup, not a tri-state gate.
const DSP_CHECK_FIELDS = ["confirm_spotify_correct", "confirm_apple_correct", "confirm_zing_correct", "confirm_nct_correct", "confirm_fb_correct", "confirm_ytb_correct"];

const SELECT_FIELDS = "id, did, title, main_artist, release_date, release_time, link_lbm, release_category, project_type, smartlink, confirm_insta_sound, confirm_tiktok_sound_updated, confirm_smartlink_updated, " + DSP_CHECK_FIELDS.join(", ");

export default function ConfirmWorkstation() {
  const [phase, setPhase] = useState("confirm_phase1");
  const [releases, setReleases] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [defaultPics, setDefaultPics] = useState({}); // phase -> profile_id
  const [assignments, setAssignments] = useState({}); // phase -> { release_id -> profile_id }
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: rels } = await supabase.from("releases").select(SELECT_FIELDS);
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

    setLoading(false);
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
  function isDonePhase1(r) { return dspAllChecked(r) && !!r.link_lbm; }
  function isDonePhase2(r) { return !!r.smartlink && r.confirm_smartlink_updated && r.confirm_insta_sound && r.confirm_tiktok_sound_updated; }
  const isDone = phase === "confirm_phase1" ? isDonePhase1 : isDonePhase2;

  const counts = useMemo(() => {
    let done = 0, notDone = 0;
    releases.forEach((r) => (isDone(r) ? done++ : notDone++));
    return { done, notDone, cancel: 0 };
  }, [releases, phase]);

  const visibleReleases = useMemo(() => {
    const filtered = showDone ? releases : releases.filter((r) => !isDone(r));
    return sortByReleaseDateDesc(filtered);
  }, [releases, showDone, phase]);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1300 }}>
          <TypeSwitcher kind="workstation" current="confirm" />
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 16 }}>Re-Check</h1>

          <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
            {[["confirm_phase1", "Phase 1: Pre-release"], ["confirm_phase2", "Phase 2 — Smartlink"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setPhase(key); setShowDone(false); }}
                className={`${styles.tabBtn} ${phase === key ? styles.tabBtnActive : ""}`}
                style={{ border: "1px solid var(--border)", borderRadius: 6 }}
              >
                {label}
              </button>
            ))}
          </div>

          <StatusCounter done={counts.done} notDone={counts.notDone} cancel={counts.cancel} />
          <button onClick={() => setShowDone((s) => !s)} className={styles.btnSmall} style={{ marginBottom: 16 }}>
            {showDone ? "Hide done rows" : `Show done rows (${counts.done})`}
          </button>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : visibleReleases.length === 0 ? (
            <div className={styles.emptyState}>{releases.length === 0 ? "No releases yet." : "Nothing outstanding."}</div>
          ) : phase === "confirm_phase1" ? (
            <div style={{ overflowX: "auto" }}>
            <table className={styles.table} style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, zIndex: 2, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>Release info</th>
                  <th>DSP check</th>
                  <th>URL LBM</th>
                  <th>Tag Gói</th>
                  <th>Product Type</th>
                  <th>PIC</th>
                </tr>
              </thead>
              <tbody>
                {visibleReleases.map((r) => (
                  <tr key={r.id}>
                    <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>
                      <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{r.main_artist} · {r.did} · {fmtDate(r.release_date)} {r.release_time}</div>
                    </td>
                    <td style={{ minWidth: 90 }}>
                      <BoolToggle value={dspAllChecked(r)} onChange={(v) => bulkToggleDsp(r, v)} />
                    </td>
                    <td style={{ minWidth: 180 }}>
                      <LbmCell release={r} onUpdateField={updateField} />
                    </td>
                    <td><span className={styles.statusBadge} style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>{r.release_category || "—"}</span></td>
                    <td><span className={styles.statusBadge} style={{ background: "rgba(255,107,26,0.12)", color: "#ff9d5c" }}>{r.project_type || "—"}</span></td>
                    <td>
                      <select className={styles.select} style={{ minWidth: 130 }} value={assignments.confirm_phase1?.[r.id] ?? defaultPics.confirm_phase1 ?? ""} onChange={(e) => updatePic(r.id, e.target.value)}>
                        <option value="">— Unassigned —</option>
                        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table className={styles.table} style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, zIndex: 2, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>Release info</th>
                  <th>Smartlink</th>
                  <th>URL LBM</th>
                  <th>Update Smartlink</th>
                  <th>Sound Instagram</th>
                  <th>Sound TikTok</th>
                  <th>PIC</th>
                </tr>
              </thead>
              <tbody>
                {visibleReleases.map((r) => (
                  <tr key={r.id}>
                    <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>
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
                    <td>
                      <select className={styles.select} style={{ minWidth: 130 }} value={assignments.confirm_phase2?.[r.id] ?? defaultPics.confirm_phase2 ?? ""} onChange={(e) => updatePic(r.id, e.target.value)}>
                        <option value="">— Unassigned —</option>
                        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                  </tr>
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

function LbmCell({ release, onUpdateField }) {
  const [draft, setDraft] = useState(release.link_lbm || "");
  return <UrlField styles={styles} value={draft} onChange={setDraft} onBlur={() => onUpdateField(release, "link_lbm", draft)} />;
}

function SmartlinkCell({ release, onUpdateField }) {
  const [draft, setDraft] = useState(release.smartlink || "");
  return <UrlField styles={styles} value={draft} onChange={setDraft} onBlur={() => onUpdateField(release, "smartlink", draft)} />;
}
