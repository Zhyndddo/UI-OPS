"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { isTicketDone } from "../../lib/helpers";
import { useAuth } from "../../lib/AuthContext";
import { TEAMS, TEAM_TICKET_TYPES, TICKET_TYPE_LABELS, SHARED_TICKET_TYPES } from "../../lib/teamTypes";
import styles from "../shared.module.css";

// New Release "done" logic, per the agreed exceptions:
//   - status Đã Hủy (cancel) or Đang chờ (pending) → done regardless
//   - Chỉ Phát Hành contract → only needs the core OPS URL fields
//   - everything else → the broad set of tracked fields across all tabs
function isReleaseDone(r) {
  if (r.status === "Đã Hủy" || r.status === "Đang chờ") return true;
  if (r.project_type === "Chỉ Phát Hành") {
    return !!(r.smartlink && r.upc && r.link_lbm);
  }
  // meta_* fields are tri-state strings ("false"/"true"/"update") — only
  // "true" counts as done, so these need their own comparison instead of
  // falling into the plain Boolean() check below (which the string "false"
  // would incorrectly pass).
  const metaChecks = [r.meta_audio, r.meta_artwork, r.meta_working_files, r.meta_lyric, r.meta_mv, r.meta_doc];
  const checks = [
    r.smartlink, r.upc, r.link_lbm, r.link_share,
    r.pitching_status_spotify || r.pitching_status_nct || r.pitching_status_zing,
    r.canva_status, r.artist_pick_status, r.musixmatch_link,
  ];
  return metaChecks.every((v) => v === "true") && checks.every(Boolean);
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

    // Bug fix: this used to key off `isDev` alone — a dev always got the
    // full union of every ticket type no matter which team tab was
    // clicked, so the ALL/AR/Marketing/OPS/Design tabs above visibly
    // changed `viewTeam` state but the ticket table underneath never
    // actually read it, and looked identical on every tab. Now it keys
    // off `effectiveTeam` (which IS `viewTeam` for a dev) — "All" (the
    // dev-only catch-all tab) still shows every type; picking one team
    // narrows to just that team's types, same as a real admin/exc sees
    // for their own team below.
    const visibleTypes = effectiveTeam === "All" ? ticketTabs.map((t) => t.key) : [...(TEAM_TICKET_TYPES[effectiveTeam] || []), ...SHARED_TICKET_TYPES];

    return visibleTypes.map((key) => {
      const typeTickets = tickets.filter((t) => tabById[t.tab_id] === key);
      const total = typeTickets.length;
      const done = typeTickets.filter((t) => isTicketDone(t.status)).length;
      return { key, label: TICKET_TYPE_LABELS[key] || key, total, done, notDone: total - done };
    });
  }, [isDev, effectiveTeam, tickets, ticketTabs]);

  // New Release summary applies to every team except Design, which has no
  // stake in the release pipeline itself. Same bug as visibleTypes above —
  // `isDev ||` used to force this on even when a dev had the Design tab
  // selected, so switching to Design never hid it like it does for a real
  // Design admin/exc. Dropped: effectiveTeam alone is correct for both
  // (it's already `viewTeam` for a dev, `profile.segment` otherwise).
  const showNewRelease = effectiveTeam !== "Design";

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
