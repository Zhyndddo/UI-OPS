"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import styles from "../../shared.module.css";

// Pulled out of the New Release popup's Pre-release & Note tab into its
// own workstation page, mirroring how Booking already got one — same
// fields, just not locked inside the popup anymore. Tracked with ONE PIC
// per release here (not per-field), per the agreed pattern.
export default function PreReleaseWorkstation() {
  const [releases, setReleases] = useState([]);
  const [defaultPic, setDefaultPic] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: rels } = await supabase
      .from("releases")
      .select("id, did, title, main_artist, release_date, canva_mv_status, canva_status, artist_pick_status, musixmatch_link, musixmatch_status, nct_lyric")
      .order("release_date", { ascending: false });
    setReleases(rels || []);
    const { data: assign } = await supabase
      .from("workstation_assignments")
      .select("*, profiles(name)")
      .eq("workstation", "pre_release")
      .eq("column_key", "all")
      .is("release_id", null)
      .maybeSingle();
    setDefaultPic(assign?.profiles?.name || null);
    setLoading(false);
  }

  async function updateField(release, field, value) {
    setReleases((prev) => prev.map((r) => (r.id === release.id ? { ...r, [field]: value } : r)));
    await supabase.from("releases").update({ [field]: value }).eq("id", release.id);
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1300 }}>
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 4 }}>Pre-release</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }} title={defaultPic ? `Default PIC: ${defaultPic}` : "No default PIC set"}>
            {defaultPic ? `Default PIC: ${defaultPic}` : "No default PIC set"}
          </p>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : releases.length === 0 ? (
            <div className={styles.emptyState}>No releases yet.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Release</th>
                  <th>CANVA MV</th>
                  <th>CANVA</th>
                  <th>Artist Pick</th>
                  <th>Musixmatch Link</th>
                  <th>Musixmatch Status</th>
                  <th>NCT Lyric</th>
                </tr>
              </thead>
              <tbody>
                {releases.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{r.main_artist} · {r.did} · {fmtDate(r.release_date)}</div>
                    </td>
                    <td><input className={styles.input} style={{ minWidth: 110 }} defaultValue={r.canva_mv_status || ""} onBlur={(e) => updateField(r, "canva_mv_status", e.target.value)} /></td>
                    <td><input className={styles.input} style={{ minWidth: 110 }} defaultValue={r.canva_status || ""} onBlur={(e) => updateField(r, "canva_status", e.target.value)} /></td>
                    <td><input className={styles.input} style={{ minWidth: 110 }} defaultValue={r.artist_pick_status || ""} onBlur={(e) => updateField(r, "artist_pick_status", e.target.value)} /></td>
                    <td><input className={styles.input} style={{ minWidth: 140 }} defaultValue={r.musixmatch_link || ""} onBlur={(e) => updateField(r, "musixmatch_link", e.target.value)} /></td>
                    <td><input className={styles.input} style={{ minWidth: 110 }} defaultValue={r.musixmatch_status || ""} onBlur={(e) => updateField(r, "musixmatch_status", e.target.value)} /></td>
                    <td><input className={styles.input} style={{ minWidth: 110 }} defaultValue={r.nct_lyric || ""} onBlur={(e) => updateField(r, "nct_lyric", e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
