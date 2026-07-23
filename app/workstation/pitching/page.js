"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import styles from "../../shared.module.css";

const STATUS_OPTS = ["", "Chưa thực hiện", "Đang thực hiện", "Đã pitching", "Không thực hiện"];
const NCT_ZING_OPTS = ["", "Chưa thực hiện", "Đã pitching", "Không hỗ trợ", "Có gói"];

// The Pitching ticket is just the request (which of the 4 types were
// asked for, chosen at New Release creation) — the actual work already
// lives on the release itself (pitching_status_spotify/nct/zing, Spotify's
// extra fields). This workstation surfaces the queue of active Pitching
// tickets and lets OPS do that real work in one place, instead of hunting
// down each release's own Pitching tab one at a time.
export default function PitchingWorkstation() {
  const [rows, setRows] = useState([]); // { ticket, release }
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "pitching").single();
    if (!tab) { setLoading(false); return; }
    const { data: tickets } = await supabase.from("tickets").select("*").eq("tab_id", tab.id).is("deleted_at", null).order("created_at", { ascending: false });
    const dids = [...new Set((tickets || []).map((t) => t.data?.releaseId).filter(Boolean))];
    let releaseMap = {};
    if (dids.length > 0) {
      const { data: rels } = await supabase
        .from("releases")
        .select("id, did, title, main_artist, pitching_status_spotify, pitching_status_nct, pitching_status_zing, pitching_pills_nct, pitching_pills_zing, pitch_genre, pitch_mood, pitch_instrumental, pitch_note, pitch_memo")
        .in("did", dids);
      (rels || []).forEach((r) => (releaseMap[r.did] = r));
    }
    setRows((tickets || []).map((t) => ({ ticket: t, release: releaseMap[t.data?.releaseId] || null })));
    setLoading(false);
  }

  async function updateRelease(release, field, value) {
    setRows((prev) => prev.map((row) => (row.release?.id === release.id ? { ...row, release: { ...row.release, [field]: value } } : row)));
    await supabase.from("releases").update({ [field]: value }).eq("id", release.id);
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1100 }}>
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 4 }}>Pitching</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 24 }}>
            The queue of active Pitching tickets — the real status/note fields live on each release
            directly, edited here instead of hunting down the release's own Pitching tab one at a time.
          </p>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : rows.length === 0 ? (
            <div className={styles.emptyState}>No Pitching tickets yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {rows.map(({ ticket, release }) => {
                const types = [
                  ticket.data?.priority && "Priority",
                  ticket.data?.spotify && "Spotify",
                  ticket.data?.nct && "NCT",
                  ticket.data?.zing && "Zing",
                ].filter(Boolean);
                return (
                  <div key={ticket.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                    <div
                      onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}
                      style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                    >
                      <div>
                        {release ? (
                          <Link href={`/releases/${release.id}`} className={styles.rowLink} onClick={(e) => e.stopPropagation()}>{release.title}</Link>
                        ) : (
                          <span>Release {ticket.data?.releaseId} (not found)</span>
                        )}
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{release?.main_artist}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {types.map((t) => (
                          <span key={t} className={styles.statusBadge} style={{ background: "var(--warn-bg)", color: "var(--warn-fg)" }}>{t}</span>
                        ))}
                        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{expandedId === ticket.id ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {expandedId === ticket.id && release && (
                      <div style={{ borderTop: "1px solid var(--border)", padding: 16 }}>
                        {ticket.data?.spotify && (
                          <>
                            <div className={styles.subheading} style={{ marginTop: 0 }}>Spotify</div>
                            <div className={styles.grid2} style={{ marginBottom: 16 }}>
                              <Field label="Status">
                                <select className={styles.select} value={release.pitching_status_spotify || ""} onChange={(e) => updateRelease(release, "pitching_status_spotify", e.target.value)}>
                                  {STATUS_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                                </select>
                              </Field>
                              <Field label="Pitch Genre">
                                <input className={styles.input} defaultValue={release.pitch_genre || ""} onBlur={(e) => updateRelease(release, "pitch_genre", e.target.value)} />
                              </Field>
                              <Field label="Mood">
                                <input className={styles.input} defaultValue={release.pitch_mood || ""} onBlur={(e) => updateRelease(release, "pitch_mood", e.target.value)} />
                              </Field>
                              <Field label="Instrumental">
                                <input className={styles.input} defaultValue={release.pitch_instrumental || ""} onBlur={(e) => updateRelease(release, "pitch_instrumental", e.target.value)} />
                              </Field>
                              <Field label="Memo">
                                <input className={styles.input} defaultValue={release.pitch_memo || ""} onBlur={(e) => updateRelease(release, "pitch_memo", e.target.value)} />
                              </Field>
                              <Field label="Pitch Note">
                                <input className={styles.input} defaultValue={release.pitch_note || ""} onBlur={(e) => updateRelease(release, "pitch_note", e.target.value)} />
                              </Field>
                            </div>
                          </>
                        )}
                        {ticket.data?.nct && (
                          <>
                            <div className={styles.subheading}>NCT</div>
                            <Field label="Status">
                              <select className={styles.select} value={release.pitching_status_nct || ""} onChange={(e) => updateRelease(release, "pitching_status_nct", e.target.value)}>
                                {NCT_ZING_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                              </select>
                            </Field>
                          </>
                        )}
                        {ticket.data?.zing && (
                          <>
                            <div className={styles.subheading}>Zing</div>
                            <Field label="Status">
                              <select className={styles.select} value={release.pitching_status_zing || ""} onChange={(e) => updateRelease(release, "pitching_status_zing", e.target.value)}>
                                {NCT_ZING_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                              </select>
                            </Field>
                          </>
                        )}
                        {ticket.data?.priority && (
                          <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 12 }}>
                            Priority was requested — no extra fields beyond the flag itself.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}
