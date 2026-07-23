"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { ticketStatus } from "../../lib/helpers";
import { useAuth } from "../../lib/AuthContext";
import styles from "../shared.module.css";

const TEAMS = ["AR", "Marketing", "OPS", "Design"];

// Which ticket types each team cares about.
const TEAM_TICKET_TYPES = {
  OPS: ["newrelease_upload", "phai_sinh", "manual_claim", "report_conflict", "pitching"],
  AR: ["phai_sinh", "manual_claim", "report_conflict", "artist_profile", "phu_luc"],
  Marketing: ["media_booking", "package_prep", "stream_update"],
  Design: ["design"],
};

const TICKET_TYPE_LABELS = {
  design: "Design",
  newrelease_upload: "Newrelease Upload",
  phai_sinh: "Phái Sinh",
  media_booking: "Media Booking",
  manual_claim: "Manual Claim",
  report_conflict: "Report Conflict",
  artist_profile: "Artist Profile",
  phu_luc: "Phụ Lục",
  stream_update: "Stream Update",
  khac: "Khác",
  package_prep: "Package Prep",
  pitching: "Pitching",
};

// New Release "done" logic, per the agreed exceptions:
//   - status Đã Hủy (cancel) or Đang chờ (pending) → done regardless
//   - Chỉ Phát Hành contract → only needs the core OPS URL fields
//   - everything else → the broad set of tracked fields across all tabs
function isReleaseDone(r) {
  if (r.status === "Đã Hủy" || r.status === "Đang chờ") return true;
  if (r.project_type === "Chỉ Phát Hành") {
    return !!(r.smartlink && r.upc && r.link_lbm);
  }
  const checks = [
    r.meta_audio, r.meta_artwork, r.meta_working_files, r.meta_lyric, r.meta_mv, r.meta_doc,
    r.smartlink, r.upc, r.link_lbm, r.link_share,
    r.pitching_status_spotify || r.pitching_status_nct || r.pitching_status_zing,
    r.canva_status, r.artist_pick_status, r.musixmatch_link,
  ];
  return checks.every(Boolean);
}

export default function SummaryPage() {
  const { profile } = useAuth();
  // dev sees everything and can browse any team's view (real oversight
  // privilege, not a simulation); admin/exc are fixed to their own team —
  // that's just their actual scope now, not a "view as" toggle.
  const isDev = profile?.role === "dev";
  const [viewTeam, setViewTeam] = useState(profile?.segment || "AR");
  const effectiveTeam = isDev ? viewTeam : profile?.segment;

  const [releases, setReleases] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [ticketTabs, setTicketTabs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: rels } = await supabase.from("releases").select("*");
    const { data: tabs } = await supabase.from("ticket_tabs").select("id, key").order("sort_order");
    const { data: tix } = await supabase.from("tickets").select("*").is("deleted_at", null);
    setReleases(rels || []);
    setTicketTabs(tabs || []);
    setTickets(tix || []);
    setLoading(false);
  }

  const releaseStats = useMemo(() => {
    const total = releases.length;
    const done = releases.filter(isReleaseDone).length;
    return { total, done, notDone: total - done };
  }, [releases]);

  const ticketStatsByType = useMemo(() => {
    const tabById = {};
    ticketTabs.forEach((t) => (tabById[t.id] = t.key));

    const visibleTypes = isDev ? ticketTabs.map((t) => t.key) : TEAM_TICKET_TYPES[effectiveTeam] || [];

    return visibleTypes.map((key) => {
      const typeTickets = tickets.filter((t) => tabById[t.tab_id] === key);
      const total = typeTickets.length;
      const done = typeTickets.filter((t) => {
        const s = ticketStatus(t);
        return s === "Đã hoàn thành" || s === "Refund" || s === "Cancel";
      }).length;
      return { key, label: TICKET_TYPE_LABELS[key] || key, total, done, notDone: total - done };
    });
  }, [isDev, effectiveTeam, tickets, ticketTabs]);

  // New Release summary applies to every team except Design, which has no
  // stake in the release pipeline itself.
  const showNewRelease = isDev || effectiveTeam !== "Design";

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>// Summary</div>
        <h1 className={styles.title} style={{ marginBottom: 16 }}>Summary</h1>

        {isDev ? (
          <>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {["All", ...TEAMS].map((t) => (
                <button
                  key={t}
                  onClick={() => setViewTeam(t)}
                  className={`${styles.tabBtn} ${viewTeam === t ? styles.tabBtnActive : ""}`}
                  style={{ border: "1px solid var(--border)", borderRadius: 6 }}
                >
                  {t}
                </button>
              ))}
            </div>
            <p style={{ color: "var(--text-faint)", fontSize: 11, marginBottom: 24 }}>
              Dev — browsing any team's view. Everyone else sees only their own team's data.
            </p>
          </>
        ) : (
          <p style={{ color: "var(--text-faint)", fontSize: 11, marginBottom: 24 }}>
            Showing {effectiveTeam || "—"} team's data.
          </p>
        )}

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : (
          <>
            {showNewRelease && (
              <>
                <div className={styles.subheading} style={{ marginTop: 0 }}>New Release</div>
                <div className={styles.statRow} style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Total</div>
                    <div className={styles.statValue}>{releaseStats.total}</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Not Done</div>
                    <div className={styles.statValue} style={{ color: "var(--warn-fg)" }}>{releaseStats.notDone}</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Done</div>
                    <div className={styles.statValue} style={{ color: "var(--success-fg)" }}>{releaseStats.done}</div>
                  </div>
                </div>
                <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: -16, marginBottom: 28 }}>
                  "Done" exceptions: Đã Hủy/Đang chờ always count as done; Chỉ Phát Hành contracts only need
                  Smartlink/UPC/Link LBM filled; everything else needs the broad field set across all tabs.
                </p>
              </>
            )}

            <div className={styles.subheading} style={{ marginTop: 0 }}>Ticket</div>
            {ticketStatsByType.length === 0 ? (
              <div className={styles.emptyState}>No ticket types visible for this team.</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr><th>Type</th><th>Total</th><th>Not Done</th><th>Done</th></tr>
                </thead>
                <tbody>
                  {ticketStatsByType.map((t) => (
                    <tr key={t.key}>
                      <td>{t.label}</td>
                      <td>{t.total}</td>
                      <td style={{ color: "var(--warn-fg)" }}>{t.notDone}</td>
                      <td style={{ color: "var(--success-fg)" }}>{t.done}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
    </AppShell>
  );
}
