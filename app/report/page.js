"use client";

import AppShell from "../../lib/AppShell";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate, fetchAllRows } from "../../lib/helpers";
import { useAuth } from "../../lib/AuthContext";
import { REPORTING_TEAMS, TEAM_TICKET_TYPES, TICKET_TYPE_LABELS, SHARED_TICKET_TYPES, resolveTeamKey } from "../../lib/teamTypes";
import { canViewCrossTeam } from "../../lib/permissions";
import styles from "../shared.module.css";

// Round 56 — "Report" nav item: KPI cards, tables, and column/pie charts
// across releases/media_booking_package_categories/package value fields —
// (A) Release Pipeline Health, (B) Booking Board Activity, (C) Package/
// Revenue Value. Read-only, computed client-side.
//
// Round 57 — merged in what used to be the separate /summary page (a live
// per-team "what's not done yet" worklist) as a second tab, "Team
// Worklist", per explicit request ("I forgot we have the summary item
// already, can you merge them?"). /summary itself now just redirects here
// — see app/summary/page.js. Kept as a second TAB rather than mixed into
// Overview because they answer different questions (aggregate rollup vs.
// "what does MY team still need to finish") and the worklist needs its
// own team switcher, which doesn't make sense bolted onto Overview.

// Fixed categorical color order — reused app tokens (accent orange,
// blue, green, yellow, dark-orange, purple, red, teal), same identity-vs-
// magnitude split the rest of the app already uses (ADS_BRAND_COLORS,
// ADS_STATUS_COLORS, etc.) — assigned by position, never re-picked when a
// filter changes which categories are present.
const CHART_COLORS = ["#ff6b1a", "#5b9dff", "#7ee6a8", "#ffca4d", "#e0672c", "#a78bfa", "#ff8a80", "#3fa7a0"];

function fmtVnd(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}
function fmtCompactVnd(n) {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B đ`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M đ`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K đ`;
  return fmtVnd(n);
}

// Groups an array by keyFn, returns [{label, value}] sorted desc by value.
// Buckets past `capAt` fold into a single "Other" bucket, per the
// "a 9th series folds into Other" rule — a table/report shouldn't ever
// silently drop the tail, so the fold keeps the total honest.
function groupCounts(rows, keyFn, capAt = 8) {
  const counts = {};
  rows.forEach((r) => {
    const key = keyFn(r) || "—";
    counts[key] = (counts[key] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  if (sorted.length <= capAt) return sorted;
  const head = sorted.slice(0, capAt - 1);
  const otherTotal = sorted.slice(capAt - 1).reduce((s, r) => s + r.value, 0);
  return [...head, { label: "Other", value: otherTotal }];
}

// New Release "done" logic, per the agreed exceptions — ported verbatim
// from the old /summary page:
//   - status Đã Hủy (cancel) or Đang chờ (pending) → done regardless
//   - Chỉ Phát Hành contract → only needs the core OPS URL fields
//   - everything else → the broad set of tracked fields across all tabs
function isReleaseDone(r) {
  if (r.status === "Đã Hủy" || r.status === "Đang chờ") return true;
  if (r.project_type === "Chỉ Phát Hành") {
    return !!(r.smartlink && r.upc && r.link_lbm);
  }
  const metaChecks = [r.meta_audio, r.meta_artwork, r.meta_working_files, r.meta_lyric, r.meta_mv, r.meta_doc];
  const checks = [
    r.smartlink, r.upc, r.link_lbm, r.link_share,
    r.pitching_status_spotify || r.pitching_status_nct || r.pitching_status_zing,
    r.canva_status, r.artist_pick_status, r.musixmatch_link,
  ];
  return metaChecks.every((v) => v === "true") && checks.every(Boolean);
}

// ── Column (bar) chart — plain CSS bars, no SVG lib needed. singleHue=true
// means every bar is the same accent (this is a magnitude series, not
// distinct identities) — otherwise bars take CHART_COLORS in fixed order.
function BarChart({ data, singleHue, valueFormatter = (v) => v, height = 160 }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <div style={{ color: "var(--text-faint)", fontSize: 12 }}>No data.</div>;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height, borderBottom: "1px solid var(--border)", paddingBottom: 4 }}>
        {data.map((d, i) => {
          const barHeight = Math.max(2, (d.value / max) * (height - 24));
          const color = singleHue ? "var(--accent)" : CHART_COLORS[i % CHART_COLORS.length];
          return (
            <div key={d.label} style={{ flex: "1 1 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", minWidth: 0, height: "100%" }} title={`${d.label}: ${valueFormatter(d.value)}`}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4, whiteSpace: "nowrap" }}>{valueFormatter(d.value)}</div>
              <div style={{ width: "100%", maxWidth: 44, height: barHeight, background: color, borderRadius: "4px 4px 0 0" }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        {data.map((d) => (
          <div key={d.label} style={{ flex: "1 1 0", minWidth: 0, textAlign: "center", fontSize: 10, color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.label}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pie chart — CSS conic-gradient for the slices (no arc-path math
// needed), legend to the side carries the labels/%s so identity is never
// color-alone. Categorical colors, fixed order.
function PieChart({ data, valueFormatter = (v) => v }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0 || data.length === 0) return <div style={{ color: "var(--text-faint)", fontSize: 12 }}>No data.</div>;
  let cumulative = 0;
  const stops = data.map((d, i) => {
    const start = (cumulative / total) * 360;
    cumulative += d.value;
    const end = (cumulative / total) * 360;
    return `${CHART_COLORS[i % CHART_COLORS.length]} ${start}deg ${end}deg`;
  });
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ width: 140, height: 140, borderRadius: "50%", background: `conic-gradient(${stops.join(", ")})`, flexShrink: 0 }} />
      <div style={{ display: "grid", gap: 6 }}>
        {data.map((d, i) => (
          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
            <span style={{ color: "var(--text)" }}>{d.label}</span>
            <span style={{ color: "var(--text-faint)" }}>
              {valueFormatter(d.value)} ({total ? Math.round((d.value / total) * 100) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: subtitle ? 2 : 12 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 14 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function KpiCard({ label, value, sub }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const PIPELINE_TYPES = ["BRIEF & DATA", "DEALING"];
const PAYMENT_STATUS_ORDER = ["Chưa Thực Hiện", "Đã Thanh Toán Một Phần", "Đã Thanh Toán"];

// Round 61 fix — the production build failed: "useSearchParams() should
// be wrapped in a suspense boundary" (Next.js requires this for a page
// that reads the URL's query string, so it can bail out of static
// prerendering just for that part instead of failing the whole build).
// Missed this in round 57 when ?tab=worklist was added — other pages in
// this app use useSearchParams without one (see app/releases/[id]/page.js)
// but apparently never got caught by a real build, just got lucky on
// however Next.js decided to prerender them. Split the component so the
// actual page logic lives in ReportPageInner and the default export just
// wraps it in <Suspense>.
export default function ReportPage() {
  return (
    <Suspense fallback={<AppShell><div className={styles.page}><div className={styles.container}>Loading…</div></div></AppShell>}>
      <ReportPageInner />
    </Suspense>
  );
}

function ReportPageInner() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  // /summary redirects here with ?tab=worklist so old bookmarks land on
  // the right tab instead of always defaulting to Overview.
  const [tab, setTab] = useState(searchParams.get("tab") === "worklist" ? "worklist" : "overview");
  const [releases, setReleases] = useState([]);
  const [rollups, setRollups] = useState([]); // media_booking_package_categories, with category name
  const [ticketTabs, setTicketTabs] = useState([]); // Team Worklist tab only
  const [loading, setLoading] = useState(true);

  // Team Worklist's own team switcher — dev sees everyone and can browse
  // any team; teamlead/admin/exc are fixed to their own team (their real
  // scope, not a simulation). Same behavior /summary had, just renamed to
  // canViewCrossTeam (still dev-only) for clarity.
  const isCrossTeam = canViewCrossTeam(profile);
  const [viewTeam, setViewTeam] = useState(profile?.segment || "AR");
  const effectiveTeam = isCrossTeam ? viewTeam : profile?.segment;

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  // Round 150 — load-reduction pass, item 3 (see project doc
  // "load-reduction-additional-ideas.md"). This used to be a bare
  // supabase.from("releases").select("*") — every column, AND with no
  // fetchAllRows pagination, so once total release volume passed
  // PostgREST's default 1000-row cap this page was silently truncating
  // the same way /tickets and the confirm/pre_release worklist counts
  // did before their own Round 59/60/150 fixes (see DATA_FIXES.md). Two
  // fixes bundled here: (1) fetchAllRows so this no longer silently caps
  // at 1000 releases — a real correctness bug, not just a load-time one;
  // (2) pruned the column list to exactly what this page's charts and
  // isReleaseDone() read (verified by grepping every `r.<field>` use in
  // this file), instead of pulling every column on the table.
  const REPORT_RELEASE_FIELDS = [
    "id", "main_artist", "title", "label", "release_date", "project_type", "status",
    "link_media_report", "media_report_status",
    "package_total_value", "package_payment_status", "package_vieent_support", "package_locked",
    "smartlink", "upc", "link_lbm", "link_share",
    "pitching_status_spotify", "pitching_status_nct", "pitching_status_zing",
    "canva_status", "artist_pick_status", "musixmatch_link",
    "meta_audio", "meta_artwork", "meta_working_files", "meta_lyric", "meta_mv", "meta_doc",
  ].join(", ");

  async function load() {
    setLoading(true);
    const [{ data: rels }, { data: rollupRows }, { data: tabs }] = await Promise.all([
      fetchAllRows(() => supabase.from("releases").select(REPORT_RELEASE_FIELDS).order("id")),
      supabase.from("media_booking_package_categories").select("release_id, category_id, brand, skipped, package_categories(name)"),
      supabase.from("ticket_tabs").select("id, key").order("sort_order"),
    ]);
    setReleases(rels || []);
    setRollups(rollupRows || []);
    setTicketTabs(tabs || []);
    setLoading(false);
  }

  // ── Team Worklist (merged in from the old /summary page) ─────────────
  const releaseStats = useMemo(() => {
    const total = releases.length;
    const done = releases.filter(isReleaseDone).length;
    return { total, done, notDone: total - done };
  }, [releases]);

  // Round 58 fix — this used to pull EVERY non-deleted ticket's full row
  // (select("*")) into `tickets` state and bucket-count client-side, same
  // as the bug found and fixed on /tickets: once total ticket volume
  // across the whole system passes Supabase/PostgREST's default 1000-row
  // response cap, that query silently truncates and most types read back
  // as 0/undercounted. Switched to per-type COUNT(*) queries (via
  // { count: "exact", head: true }, same pattern as the sidebar's release
  // total) — no row cap applies to a count. Runs whenever the visible
  // team/type list changes (dev's team switcher) rather than once on
  // mount, since which types are relevant depends on effectiveTeam.
  const [ticketStatsByType, setTicketStatsByType] = useState([]);
  const [ticketStatsLoading, setTicketStatsLoading] = useState(true);
  useEffect(() => {
    if (!supabase || ticketTabs.length === 0) return;
    setTicketStatsLoading(true);
    (async () => {
      const tabIdByKey = {};
      ticketTabs.forEach((t) => (tabIdByKey[t.key] = t.id));
      const visibleTypes =
        effectiveTeam === "All" ? ticketTabs.map((t) => t.key) : [...(TEAM_TICKET_TYPES[resolveTeamKey(effectiveTeam)] || []), ...SHARED_TICKET_TYPES];
      const results = await Promise.all(
        visibleTypes.map(async (key) => {
          const tabId = tabIdByKey[key];
          if (!tabId) return { key, label: TICKET_TYPE_LABELS[key] || key, total: 0, done: 0, notDone: 0 };
          const [{ count: total }, { count: done }] = await Promise.all([
            supabase.from("tickets").select("id", { count: "exact", head: true }).eq("tab_id", tabId).is("deleted_at", null),
            // Must match lib/helpers.js's isTicketDone() status list exactly.
            supabase
              .from("tickets")
              .select("id", { count: "exact", head: true })
              .eq("tab_id", tabId)
              .is("deleted_at", null)
              .in("status", ["COMPLETE", "REFUND", "CANCELED", "CANCEL", "Hoàn thành", "Từ chối", "Hủy"]),
          ]);
          return { key, label: TICKET_TYPE_LABELS[key] || key, total: total || 0, done: done || 0, notDone: (total || 0) - (done || 0) };
        })
      );
      setTicketStatsByType(results);
      setTicketStatsLoading(false);
    })();
  }, [effectiveTeam, ticketTabs]);
  const showNewRelease = effectiveTeam !== "Design";

  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  // ── A. Release Pipeline Health ────────────────────────────────────────
  const projectTypeChart = useMemo(() => groupCounts(releases, (r) => r.project_type), [releases]);
  const statusChart = useMemo(() => groupCounts(releases, (r) => r.status), [releases]);
  const atRiskReleases = useMemo(() => {
    return releases
      .filter((r) => PIPELINE_TYPES.includes(r.project_type) && r.release_date && r.release_date < todayStr)
      .sort((a, b) => (a.release_date || "").localeCompare(b.release_date || ""));
  }, [releases, todayStr]);

  // ── B. Booking Board Activity ───────────────────────────────────────
  const mediaReportChart = useMemo(() => {
    const withLink = releases.filter((r) => r.link_media_report);
    return groupCounts(withLink, (r) => (r.media_report_status === "sent" ? "Artist Sent" : r.media_report_status === "ready" ? "Ready (not sent)" : "Not converted"));
  }, [releases]);
  const categoryBreadthChart = useMemo(() => {
    const byCategory = {};
    rollups.forEach((row) => {
      if (row.skipped) return;
      const name = row.package_categories?.name;
      if (!name) return;
      if (!byCategory[name]) byCategory[name] = new Set();
      byCategory[name].add(row.release_id);
    });
    return Object.entries(byCategory)
      .map(([label, ids]) => ({ label, value: ids.size }))
      .sort((a, b) => b.value - a.value);
  }, [rollups]);
  const readyNotSent = useMemo(() => {
    return releases.filter((r) => r.media_report_status === "ready").sort((a, b) => (a.release_date || "").localeCompare(b.release_date || ""));
  }, [releases]);

  // ── C. Package / Revenue Value ──────────────────────────────────────
  const valueByMonthChart = useMemo(() => {
    const byMonth = {};
    releases.forEach((r) => {
      if (!r.release_date || r.package_total_value == null) return;
      const month = r.release_date.slice(0, 7); // YYYY-MM
      byMonth[month] = (byMonth[month] || 0) + Number(r.package_total_value || 0);
    });
    return Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([label, value]) => ({ label, value }));
  }, [releases]);
  const paymentStatusChart = useMemo(() => {
    const withValue = releases.filter((r) => r.package_total_value != null);
    const counted = groupCounts(withValue, (r) => r.package_payment_status);
    // Keep the 3 real statuses in a fixed, meaningful order (progress, not
    // frequency) when all are present, rather than whatever groupCounts'
    // frequency sort landed on — falls back to frequency order if a status
    // outside the known 3 shows up (data drift), so nothing is dropped.
    if (counted.every((c) => PAYMENT_STATUS_ORDER.includes(c.label))) {
      return PAYMENT_STATUS_ORDER.map((label) => counted.find((c) => c.label === label)).filter(Boolean);
    }
    return counted;
  }, [releases]);
  const topByValue = useMemo(() => {
    return releases.filter((r) => r.package_total_value != null).sort((a, b) => (b.package_total_value || 0) - (a.package_total_value || 0)).slice(0, 10);
  }, [releases]);

  const totalPackageValue = useMemo(() => releases.reduce((s, r) => s + (Number(r.package_total_value) || 0), 0), [releases]);
  const totalVieentSupport = useMemo(() => releases.reduce((s, r) => s + (Number(r.package_vieent_support) || 0), 0), [releases]);
  const inPipelineCount = useMemo(() => releases.filter((r) => PIPELINE_TYPES.includes(r.project_type)).length, [releases]);
  const packageLockedCount = useMemo(() => releases.filter((r) => r.package_locked).length, [releases]);
  const mediaReportSentCount = useMemo(() => releases.filter((r) => r.media_report_status === "sent").length, [releases]);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.eyebrow}>// Report</div>
          <h1 className={styles.title}>Report</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 16, maxWidth: 720 }}>
            A read-only rollup across releases, the Booking Board, and package value — tables and charts,
            computed live from the same data everywhere else in the app reads/writes. Nothing here is editable;
            follow a release's link to act on it.
          </p>

          <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
            {[["overview", "Overview"], ["worklist", "Team Worklist"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`${styles.tabBtn} ${tab === key ? styles.tabBtnActive : ""}`}
                style={{ border: tab === key ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: tab === key ? "rgba(255,107,26,0.1)" : "transparent" }}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : tab === "worklist" ? (
            <>
              {isCrossTeam ? (
                <>
                  <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                    {["All", ...REPORTING_TEAMS].map((t) => (
                      <button
                        key={t}
                        onClick={() => setViewTeam(t)}
                        className={`${styles.tabBtn} ${viewTeam === t ? styles.tabBtnActive : ""}`}
                        style={{ border: viewTeam === t ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: viewTeam === t ? "rgba(255,107,26,0.1)" : "transparent" }}
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
              {ticketStatsLoading ? (
                <div className={styles.emptyState}>Loading…</div>
              ) : ticketStatsByType.length === 0 ? (
                <div className={styles.emptyState}>No ticket types visible for this team.</div>
              ) : (
                <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
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
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
                <KpiCard label="Total Releases" value={releases.length} />
                <KpiCard label="In Pipeline" value={inPipelineCount} sub="BRIEF & DATA / DEALING" />
                <KpiCard label="Package Locked" value={packageLockedCount} />
                <KpiCard label="Media Report Sent" value={mediaReportSentCount} />
                <KpiCard label="Total Package Value" value={fmtCompactVnd(totalPackageValue)} />
                <KpiCard label="Total VIEENT Support" value={fmtCompactVnd(totalVieentSupport)} />
              </div>

              <div className={styles.subheading}>A. Release Pipeline Health</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
                <SectionCard title="By Loại Dự Án (Project Type)">
                  <BarChart data={projectTypeChart} />
                </SectionCard>
                <SectionCard title="By Status">
                  <BarChart data={statusChart} />
                </SectionCard>
              </div>
              <SectionCard
                title={`At Risk — release date passed, still ${PIPELINE_TYPES.join("/")} (${atRiskReleases.length})`}
                subtitle="Release date has already come and gone but the package was never resolved past the pipeline stage."
              >
                {atRiskReleases.length === 0 ? (
                  <div style={{ color: "var(--text-faint)", fontSize: 12 }}>None — nothing overdue in the pipeline right now.</div>
                ) : (
                  <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
                    <table className={styles.table}>
                      <thead><tr><th>Release</th><th>Label</th><th>Release Date</th><th>Stage</th></tr></thead>
                      <tbody>
                        {atRiskReleases.slice(0, 20).map((r) => (
                          <tr key={r.id}>
                            <td><Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link> <span style={{ color: "var(--text-faint)", fontSize: 11 }}>· {r.main_artist}</span></td>
                            <td style={{ fontSize: 12 }}>{r.label}</td>
                            <td style={{ fontSize: 12, color: "#ff8a80" }}>{fmtDate(r.release_date)}</td>
                            <td style={{ fontSize: 12 }}>{r.project_type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {atRiskReleases.length > 20 && (
                  <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8 }}>+ {atRiskReleases.length - 20} more not shown.</div>
                )}
              </SectionCard>

              <div className={styles.subheading} style={{ marginTop: 20 }}>B. Booking Board Activity</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
                <SectionCard title="Media Report Conversion" subtitle="Of releases with a magic link generated.">
                  <PieChart data={mediaReportChart} />
                </SectionCard>
                <SectionCard title="Releases With a Summarized Hạng Mục" subtitle="How many releases have real (non-skipped) booking data per Hạng Mục.">
                  <BarChart data={categoryBreadthChart} />
                </SectionCard>
              </div>
              <SectionCard
                title={`Ready — Converted, Not Yet Sent to Artist (${readyNotSent.length})`}
                subtitle="Booking Board's Convert Media Report was clicked, but Send Artist hasn't been yet."
              >
                {readyNotSent.length === 0 ? (
                  <div style={{ color: "var(--text-faint)", fontSize: 12 }}>None right now.</div>
                ) : (
                  <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
                    <table className={styles.table}>
                      <thead><tr><th>Release</th><th>Label</th><th>Release Date</th></tr></thead>
                      <tbody>
                        {readyNotSent.slice(0, 20).map((r) => (
                          <tr key={r.id}>
                            <td><Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link> <span style={{ color: "var(--text-faint)", fontSize: 11 }}>· {r.main_artist}</span></td>
                            <td style={{ fontSize: 12 }}>{r.label}</td>
                            <td style={{ fontSize: 12 }}>{fmtDate(r.release_date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              <div className={styles.subheading} style={{ marginTop: 20 }}>C. Package / Revenue Value</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
                <SectionCard title="Total Package Value by Release Month" subtitle="Sum of Tổng Giá Trị Gói, grouped by release date's month (last 12 months with data).">
                  <BarChart data={valueByMonthChart} singleHue valueFormatter={fmtCompactVnd} />
                </SectionCard>
                <SectionCard title="Payment Status" subtitle="Of releases with a package value set.">
                  <PieChart data={paymentStatusChart} />
                </SectionCard>
              </div>
              <SectionCard title="Top 10 Releases by Package Value">
                {topByValue.length === 0 ? (
                  <div style={{ color: "var(--text-faint)", fontSize: 12 }}>No releases have a package value set yet.</div>
                ) : (
                  <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
                    <table className={styles.table}>
                      <thead><tr><th>Release</th><th>Label</th><th>Tổng Giá Trị Gói</th><th>VIEENT Hỗ Trợ</th><th>Payment Status</th></tr></thead>
                      <tbody>
                        {topByValue.map((r) => (
                          <tr key={r.id}>
                            <td><Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link> <span style={{ color: "var(--text-faint)", fontSize: 11 }}>· {r.main_artist}</span></td>
                            <td style={{ fontSize: 12 }}>{r.label}</td>
                            <td style={{ fontSize: 12, fontWeight: 700 }}>{fmtVnd(r.package_total_value)}</td>
                            <td style={{ fontSize: 12 }}>{fmtVnd(r.package_vieent_support)}</td>
                            <td style={{ fontSize: 12 }}>{r.package_payment_status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
