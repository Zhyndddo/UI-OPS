"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import StatusCounter from "../../../lib/StatusCounter";
import UrlField from "../../../lib/UrlField";
import { sortByReleaseDateDesc, filterProfilesByTeam } from "../../../lib/workstationHelpers";
import styles from "../../shared.module.css";

const STATUS_OPTS = ["", "Chưa thực hiện", "Đang thực hiện", "Đã pitching", "Không thực hiện"];
const NCT_ZING_OPTS = ["", "Chưa thực hiện", "Đã pitching", "Không hỗ trợ", "Có gói"];
const CANCEL_VALUES = ["Không thực hiện", "Không hỗ trợ"];
const DONE_VALUE = "Đã pitching";
const TYPE_TABS = [
  ["priority", "Priority"],
  ["spotify", "Spotify"],
  ["nct", "NCT"],
  ["zing", "Zing"],
];

// The Pitching ticket is just the request (which of the 4 types were
// asked for, chosen at New Release creation) — the actual work lives on
// the release itself. This workstation surfaces the queue and lets OPS
// do that work in one place — clicking a row opens the popup now,
// instead of expanding inline, so each type gets its own clean tab.
export default function PitchingWorkstation() {
  const [rows, setRows] = useState([]); // { ticket, release }
  const [profiles, setProfiles] = useState([]);
  const [defaultPic, setDefaultPic] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [openTicketId, setOpenTicketId] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "pitching").single();
    if (!tab) { setLoading(false); return; }
    const { data: tickets } = await supabase.from("tickets").select("*").eq("tab_id", tab.id).is("deleted_at", null);
    const dids = [...new Set((tickets || []).map((t) => t.data?.releaseId).filter(Boolean))];
    let releaseMap = {};
    if (dids.length > 0) {
      const { data: rels } = await supabase
        .from("releases")
        .select("id, did, title, main_artist, release_date, release_time, upc, priority_pitching, isrc, apple_id, pitching_status_spotify, pitching_status_nct, pitching_status_zing, pitch_genre, pitch_mood, pitch_instrumental, pitch_note, pitch_memo")
        .in("did", dids);
      (rels || []).forEach((r) => (releaseMap[r.did] = r));
    }
    const allRows = (tickets || []).map((t) => ({ ticket: t, release: releaseMap[t.data?.releaseId] || null }));
    setRows(allRows.filter((row) => row.release?.upc));

    const { data: profs } = await supabase.from("profiles").select("id, name, segment, role").order("name");
    setProfiles(filterProfilesByTeam(profs || [], "OPS"));

    const { data: assigns } = await supabase.from("workstation_assignments").select("release_id, pic_profile_id").eq("workstation", "pitching");
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

  async function updateRelease(release, field, value) {
    setRows((prev) => prev.map((row) => (row.release?.id === release.id ? { ...row, release: { ...row.release, [field]: value } } : row)));
    await supabase.from("releases").update({ [field]: value }).eq("id", release.id);
  }

  async function updatePic(releaseId, profileId) {
    setAssignments((prev) => ({ ...prev, [releaseId]: profileId || undefined }));
    if (!profileId) {
      await supabase.from("workstation_assignments").delete().eq("workstation", "pitching").eq("release_id", releaseId);
      return;
    }
    const { data: existing } = await supabase.from("workstation_assignments").select("id").eq("workstation", "pitching").eq("column_key", "all").eq("release_id", releaseId).maybeSingle();
    if (existing) await supabase.from("workstation_assignments").update({ pic_profile_id: profileId }).eq("id", existing.id);
    else await supabase.from("workstation_assignments").insert({ workstation: "pitching", column_key: "all", release_id: releaseId, pic_profile_id: profileId });
  }

  function requestedTypes(ticket) {
    return TYPE_TABS.filter(([key]) => ticket.data?.[key]).map(([key]) => key);
  }
  function statusFor(release, key) {
    if (key === "priority") return release?.priority_pitching;
    if (key === "spotify") return release?.pitching_status_spotify;
    if (key === "nct") return release?.pitching_status_nct;
    if (key === "zing") return release?.pitching_status_zing;
    return null;
  }

  function isDone(row) {
    const types = requestedTypes(row.ticket);
    if (types.length === 0) return false;
    return types.every((k) => statusFor(row.release, k) === DONE_VALUE);
  }
  function isCancel(row) {
    const types = requestedTypes(row.ticket);
    if (types.length === 0) return false;
    return types.every((k) => CANCEL_VALUES.includes(statusFor(row.release, k)));
  }

  const counts = useMemo(() => {
    let done = 0, notDone = 0, cancel = 0;
    rows.forEach((row) => {
      if (isCancel(row)) cancel++;
      else if (isDone(row)) done++;
      else notDone++;
    });
    return { done, notDone, cancel };
  }, [rows]);

  const visibleRows = useMemo(() => {
    const filtered = showDone ? rows : rows.filter((row) => !isDone(row));
    return sortByReleaseDateDesc(filtered.map((row) => ({ ...row, release_date: row.release?.release_date })));
  }, [rows, showDone]);

  const openRow = rows.find((row) => row.ticket.id === openTicketId);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1200 }}>
          <TypeSwitcher kind="workstation" current="pitching" />
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 8 }}>Pitching</h1>

          <StatusCounter done={counts.done} notDone={counts.notDone} cancel={counts.cancel} />
          <button onClick={() => setShowDone((s) => !s)} className={styles.btnSmall} style={{ marginBottom: 16 }}>
            {showDone ? "Hide done rows" : `Show done rows (${counts.done})`}
          </button>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : visibleRows.length === 0 ? (
            <div className={styles.emptyState}>{rows.length === 0 ? "No Pitching tickets with UPC filled yet." : "Nothing outstanding."}</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table className={styles.table} style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, zIndex: 2, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>Release info</th>
                  <th>Requested</th>
                  <th>PIC</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const types = requestedTypes(row.ticket);
                  const rid = row.release?.id;
                  return (
                    <tr key={row.ticket.id} onClick={() => setOpenTicketId(row.ticket.id)} style={{ cursor: "pointer" }}>
                      <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>
                        {row.release ? (
                          <Link href={`/releases/${rid}`} className={styles.rowLink} onClick={(e) => e.stopPropagation()}>{row.release.title}</Link>
                        ) : (
                          <span>Release {row.ticket.data?.releaseId} (not found)</span>
                        )}
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                          {row.release?.main_artist} · {row.release?.did} · {fmtDate(row.release?.release_date)} {row.release?.release_time}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {types.map((t) => (
                            <span key={t} className={styles.statusBadge} style={{ background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
                              {TYPE_TABS.find(([k]) => k === t)[1]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select
                          className={styles.select}
                          style={{ minWidth: 130 }}
                          value={(rid && assignments[rid]) ?? defaultPic ?? ""}
                          onChange={(e) => updatePic(rid, e.target.value)}
                        >
                          <option value="">— Unassigned —</option>
                          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {openRow && (
        <PitchingPopup
          row={openRow}
          onClose={() => setOpenTicketId(null)}
          onUpdateRelease={updateRelease}
        />
      )}
    </AppShell>
  );
}

function PitchingPopup({ row, onClose, onUpdateRelease }) {
  const types = TYPE_TABS.filter(([key]) => row.ticket.data?.[key]);
  const [activeType, setActiveType] = useState(types[0]?.[0]);
  const release = row.release;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 24, maxWidth: 640, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div className={styles.eyebrow}>// Pitching</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{release?.title}</h2>
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{release?.main_artist}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
          {types.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveType(key)}
              className={`${styles.tabBtn} ${activeType === key ? styles.tabBtnActive : ""}`}
              style={{ border: "1px solid var(--border)", borderRadius: 6 }}
            >
              {label}
            </button>
          ))}
        </div>

        {activeType === "priority" && (
          <div className={styles.grid2}>
            <Field label="Priority Pitching Status">
              <select className={styles.select} value={release?.priority_pitching || ""} onChange={(e) => onUpdateRelease(release, "priority_pitching", e.target.value)}>
                {STATUS_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
              </select>
            </Field>
            <Field label="ISRC">
              <input className={styles.input} defaultValue={release?.isrc || ""} onBlur={(e) => onUpdateRelease(release, "isrc", e.target.value)} />
            </Field>
            <Field label="Apple ID">
              <input className={styles.input} defaultValue={release?.apple_id || ""} onBlur={(e) => onUpdateRelease(release, "apple_id", e.target.value)} />
            </Field>
          </div>
        )}

        {activeType === "spotify" && (
          <div className={styles.grid2}>
            <Field label="Status">
              <select className={styles.select} value={release?.pitching_status_spotify || ""} onChange={(e) => onUpdateRelease(release, "pitching_status_spotify", e.target.value)}>
                {STATUS_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
              </select>
            </Field>
            <Field label="Pitch Genre">
              <input className={styles.input} defaultValue={release?.pitch_genre || ""} onBlur={(e) => onUpdateRelease(release, "pitch_genre", e.target.value)} />
            </Field>
            <Field label="Mood">
              <input className={styles.input} defaultValue={release?.pitch_mood || ""} onBlur={(e) => onUpdateRelease(release, "pitch_mood", e.target.value)} />
            </Field>
            <Field label="Instrumental">
              <input className={styles.input} defaultValue={release?.pitch_instrumental || ""} onBlur={(e) => onUpdateRelease(release, "pitch_instrumental", e.target.value)} />
            </Field>
            <Field label="Memo">
              <input className={styles.input} defaultValue={release?.pitch_memo || ""} onBlur={(e) => onUpdateRelease(release, "pitch_memo", e.target.value)} />
            </Field>
            <Field label="Pitch Note">
              <input className={styles.input} defaultValue={release?.pitch_note || ""} onBlur={(e) => onUpdateRelease(release, "pitch_note", e.target.value)} />
            </Field>
          </div>
        )}

        {activeType === "nct" && (
          <Field label="NCT Status">
            <select className={styles.select} value={release?.pitching_status_nct || ""} onChange={(e) => onUpdateRelease(release, "pitching_status_nct", e.target.value)}>
              {NCT_ZING_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
            </select>
          </Field>
        )}

        {activeType === "zing" && (
          <Field label="Zing Status">
            <select className={styles.select} value={release?.pitching_status_zing || ""} onChange={(e) => onUpdateRelease(release, "pitching_status_zing", e.target.value)}>
              {NCT_ZING_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
            </select>
          </Field>
        )}
      </div>
    </div>
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
