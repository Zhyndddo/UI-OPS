"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
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
  const [assignments, setAssignments] = useState({}); // release_id -> pic_profile_id
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: rels } = await supabase
      .from("releases")
      .select("id, did, title, main_artist, release_date, release_time, upc, drive_link, link_lbm, link_share, smartlink, link_preorder, upload_status")
      .eq("requested", true)
      .order("release_date", { ascending: false });
    setReleases(rels || []);

    const { data: profs } = await supabase.from("profiles").select("id, name").order("name");
    setProfiles(profs || []);

    const { data: assigns } = await supabase
      .from("workstation_assignments")
      .select("release_id, pic_profile_id")
      .eq("workstation", "upload")
      .not("release_id", "is", null);
    const map = {};
    (assigns || []).forEach((a) => (map[a.release_id] = a.pic_profile_id));
    setAssignments(map);

    setLoading(false);
  }

  async function updateField(release, field, value) {
    setReleases((prev) => prev.map((r) => (r.id === release.id ? { ...r, [field]: value } : r)));
    await supabase.from("releases").update({ [field]: value }).eq("id", release.id);
  }

  // First real, settable PIC assignment (row-level, one per release) —
  // Confirm/Pre-release only show a default-PIC tooltip so far; this one
  // actually writes to workstation_assignments.
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

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1300 }}>
          <TypeSwitcher kind="workstation" current="upload" />
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 16 }}>Upload</h1>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : releases.length === 0 ? (
            <div className={styles.emptyState}>No releases have had SEND UPLOAD clicked yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table className={styles.table} style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, zIndex: 2, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>UPC / Link Drive / Release</th>
                  <th>Link LBM</th>
                  <th>Link Share</th>
                  <th>Smartlink</th>
                  <th>Pre-order</th>
                  <th>Upload Status</th>
                  <th>PIC</th>
                </tr>
              </thead>
              <tbody>
                {releases.map((r) => (
                  <tr key={r.id}>
                    <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>
                      <input
                        className={styles.input}
                        style={{ padding: "4px 8px", fontSize: 12, marginBottom: 4 }}
                        defaultValue={r.upc || ""}
                        placeholder="UPC…"
                        onBlur={(e) => updateField(r, "upc", e.target.value)}
                      />
                      <input
                        className={styles.input}
                        style={{ padding: "4px 8px", fontSize: 12, marginBottom: 4 }}
                        defaultValue={r.drive_link || ""}
                        placeholder="Link Drive…"
                        onBlur={(e) => updateField(r, "drive_link", e.target.value)}
                      />
                      <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{r.main_artist} · {r.did} · {fmtDate(r.release_date)} {r.release_time}</div>
                    </td>
                    <td><input className={styles.input} style={{ minWidth: 160 }} defaultValue={r.link_lbm || ""} onBlur={(e) => updateField(r, "link_lbm", e.target.value)} /></td>
                    <td><input className={styles.input} style={{ minWidth: 160 }} defaultValue={r.link_share || ""} onBlur={(e) => updateField(r, "link_share", e.target.value)} /></td>
                    <td><input className={styles.input} style={{ minWidth: 160 }} defaultValue={r.smartlink || ""} onBlur={(e) => updateField(r, "smartlink", e.target.value)} /></td>
                    <td><input className={styles.input} style={{ minWidth: 160 }} defaultValue={r.link_preorder || ""} onBlur={(e) => updateField(r, "link_preorder", e.target.value)} /></td>
                    <td>
                      <select className={styles.select} style={{ minWidth: 110 }} value={r.upload_status || "Running"} onChange={(e) => updateField(r, "upload_status", e.target.value)}>
                        {UPLOAD_STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className={styles.select} style={{ minWidth: 130 }} value={assignments[r.id] || ""} onChange={(e) => updatePic(r, e.target.value)}>
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
