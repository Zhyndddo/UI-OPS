"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import styles from "../../shared.module.css";

// Phase 1 — cross-platform correctness checks while waiting for release.
// Phase 2 — re-visited after release, just verifies Smartlink. Same tool,
// visited twice, not two separate pages.
const PHASE1_FIELDS = [
  ["confirm_spotify_correct", "Spotify"],
  ["confirm_apple_correct", "Apple"],
  ["confirm_zing_correct", "Zing"],
  ["confirm_nct_correct", "NCT"],
  ["confirm_fb_correct", "Facebook"],
  ["confirm_ytb_correct", "YouTube"],
  ["confirm_insta_sound", "Instagram Sound"],
  ["confirm_lyrics_canva_check", "Lyrics/Canva Check"],
  ["confirm_tiktok_sound_updated", "TikTok Sound Updated"],
];

export default function ConfirmWorkstation() {
  const [phase, setPhase] = useState("confirm_phase1");
  const [releases, setReleases] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: rels } = await supabase
      .from("releases")
      .select("id, did, title, main_artist, release_date, smartlink, " + PHASE1_FIELDS.map(([k]) => k).join(", "))
      .order("release_date", { ascending: false });
    setReleases(rels || []);
    const { data: assigns } = await supabase
      .from("workstation_assignments")
      .select("*, profiles(name)")
      .in("workstation", ["confirm_phase1", "confirm_phase2"])
      .is("release_id", null); // column defaults only, for now — row overrides are a fast-follow
    setAssignments(assigns || []);
    setLoading(false);
  }

  function defaultPicFor(columnKey) {
    return assignments.find((a) => a.workstation === phase && a.column_key === columnKey)?.profiles?.name;
  }

  async function toggleField(release, field) {
    const newVal = !release[field];
    setReleases((prev) => prev.map((r) => (r.id === release.id ? { ...r, [field]: newVal } : r)));
    await supabase.from("releases").update({ [field]: newVal }).eq("id", release.id);
  }

  async function updateSmartlink(release, value) {
    setReleases((prev) => prev.map((r) => (r.id === release.id ? { ...r, smartlink: value } : r)));
    await supabase.from("releases").update({ smartlink: value }).eq("id", release.id);
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1300 }}>
          <TypeSwitcher kind="workstation" current="confirm" />
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 16 }}>Re-Check</h1>

          <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
            {[["confirm_phase1", "Phase 1 — Correctness"], ["confirm_phase2", "Phase 2 — Smartlink"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setPhase(key)}
                className={`${styles.tabBtn} ${phase === key ? styles.tabBtnActive : ""}`}
                style={{ border: "1px solid var(--border)", borderRadius: 6 }}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : releases.length === 0 ? (
            <div className={styles.emptyState}>No releases yet.</div>
          ) : phase === "confirm_phase1" ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Release</th>
                  {PHASE1_FIELDS.map(([key, label]) => {
                    const pic = defaultPicFor(key);
                    return (
                      <th key={key} title={pic ? `Default: ${pic}` : "No default PIC set"} style={{ textAlign: "center", cursor: "help" }}>
                        {label}
                        {pic && <div style={{ fontWeight: 400, color: "var(--text-faint)", fontSize: 9 }}>{pic}</div>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {releases.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{r.main_artist} · {r.did} · {fmtDate(r.release_date)}</div>
                    </td>
                    {PHASE1_FIELDS.map(([key]) => (
                      <td key={key} style={{ textAlign: "center" }}>
                        <input type="checkbox" checked={!!r[key]} onChange={() => toggleField(r, key)} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Release</th>
                  <th title={defaultPicFor("smartlink") ? `Default: ${defaultPicFor("smartlink")}` : "No default PIC set"} style={{ cursor: "help" }}>
                    Smartlink
                    {defaultPicFor("smartlink") && <div style={{ fontWeight: 400, color: "var(--text-faint)", fontSize: 9 }}>{defaultPicFor("smartlink")}</div>}
                  </th>
                </tr>
              </thead>
              <tbody>
                {releases.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{r.main_artist} · {r.did} · {fmtDate(r.release_date)}</div>
                    </td>
                    <td>
                      <input
                        className={styles.input}
                        style={{ maxWidth: 320 }}
                        defaultValue={r.smartlink || ""}
                        placeholder="https://…"
                        onBlur={(e) => updateSmartlink(r, e.target.value)}
                      />
                    </td>
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
