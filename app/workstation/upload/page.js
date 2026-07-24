"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import UrlField from "../../../lib/UrlField";
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
                  <UploadRow key={r.id} release={r} pic={assignments[r.id]} profiles={profiles} onUpdateField={updateField} onUpdatePic={updatePic} />
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

function UploadRow({ release, pic, profiles, onUpdateField, onUpdatePic }) {
  const URL_KEYS = ["drive_link", "link_lbm", "link_share", "smartlink", "link_preorder"];
  const [drafts, setDrafts] = useState(() => {
    const initial = {};
    URL_KEYS.forEach((k) => (initial[k] = release[k] || ""));
    return initial;
  });
  const [upc, setUpc] = useState(release.upc || "");

  return (
    <tr>
      <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>
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
            rows={1}
            placeholder="Link Drive…"
          />
        </div>
        <Link href={`/releases/${release.id}`} className={styles.rowLink}>{release.title}</Link>
        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{release.main_artist} · {release.did} · {fmtDate(release.release_date)} {release.release_time}</div>
      </td>
      <td style={{ minWidth: 180 }}>
        <UrlField styles={styles} value={drafts.link_lbm} onChange={(v) => setDrafts((d) => ({ ...d, link_lbm: v }))} onBlur={() => onUpdateField(release, "link_lbm", drafts.link_lbm)} rows={1} />
      </td>
      <td style={{ minWidth: 180 }}>
        <UrlField styles={styles} value={drafts.link_share} onChange={(v) => setDrafts((d) => ({ ...d, link_share: v }))} onBlur={() => onUpdateField(release, "link_share", drafts.link_share)} rows={1} />
      </td>
      <td style={{ minWidth: 180 }}>
        <UrlField styles={styles} value={drafts.smartlink} onChange={(v) => setDrafts((d) => ({ ...d, smartlink: v }))} onBlur={() => onUpdateField(release, "smartlink", drafts.smartlink)} rows={1} />
      </td>
      <td style={{ minWidth: 180 }}>
        <UrlField styles={styles} value={drafts.link_preorder} onChange={(v) => setDrafts((d) => ({ ...d, link_preorder: v }))} onBlur={() => onUpdateField(release, "link_preorder", drafts.link_preorder)} rows={1} />
      </td>
      <td>
        <select className={styles.select} style={{ minWidth: 110 }} value={release.upload_status || "Running"} onChange={(e) => onUpdateField(release, "upload_status", e.target.value)}>
          {UPLOAD_STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td>
        <select className={styles.select} style={{ minWidth: 130 }} value={pic || ""} onChange={(e) => onUpdatePic(release, e.target.value)}>
          <option value="">— Unassigned —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </td>
    </tr>
  );
}
