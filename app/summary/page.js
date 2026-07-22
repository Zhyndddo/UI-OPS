"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { ticketStatus } from "../../lib/helpers";
import styles from "../shared.module.css";

const ROLES = ["Admin", "Dev", "OPS", "AR", "Marketing"];

// Which ticket types each role cares about — no real auth exists yet, this
// is just a UI-level simulation ("view as role") until real login/roles
// are wired up. Admin/Dev always see everything.
const ROLE_TICKET_TYPES = {
  OPS: ["newrelease_upload", "phai_sinh", "manual_claim", "report_conflict", "design"],
  AR: ["phai_sinh", "manual_claim", "report_conflict", "artist_profile", "phu_luc"],
  Marketing: ["media_booking", "package_prep", "stream_update"],
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
};

// New Release "done" logic, per the agreed exceptions:
//   - status Đã Hủy (cancel) or Đang chờ (pending) → done regardless
//   - Chỉ Phát Hành contract → only needs the core OPS URL fields
//   - everything else → the broad set of tracked fields across all tabs
// This mirrors the Tasklist tab's own checklist, just rolled into one
// boolean per release instead of a field-by-field breakdown.
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
  const [role, setRole] = useState("Admin");
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

    const visibleTypes =
      role === "Admin" || role === "Dev" ? ticketTabs.map((t) => t.key) : ROLE_TICKET_TYPES[role] || [];

    return visibleTypes.map((key) => {
      const typeTickets = tickets.filter((t) => tabById[t.tab_id] === key);
      const total = typeTickets.length;
      const done = typeTickets.filter((t) => {
        const s = ticketStatus(t);
        return s === "Đã hoàn thành" || s === "Refund" || s === "Cancel";
      }).length;
      return { key, label: TICKET_TYPE_LABELS[key] || key, total, done, notDone: total - done };
    });
  }, [role, tickets, ticketTabs]);

  const showNewRelease = role === "Admin" || role === "Dev" || role === "OPS" || role === "AR";

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>// Summary</div>
        <h1 className={styles.title} style={{ marginBottom: 16 }}>Summary</h1>

        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`${styles.tabBtn} ${role === r ? styles.tabBtnActive : ""}`}
              style={{ border: "1px solid var(--border)", borderRadius: 6 }}
            >
              {r}
            </button>
          ))}
        </div>
        <p style={{ color: "var(--text-faint)", fontSize: 11, marginBottom: 24 }}>
          "View as" role selector — no real login/access-control exists yet, this only changes what's shown
          on this page, not actual permissions.
        </p>

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
              <div className={styles.emptyState}>No ticket types visible for this role.</div>
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
