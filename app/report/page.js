"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate } from "../../lib/helpers";
import styles from "../shared.module.css";

// Round 56 — new "Report" nav item. Distinct from /summary (a live
// per-team "what's not done yet" worklist): this reads across
// releases/media_booking_package_categories/package value fields and
// presents a coherent read — KPI cards, tables, and column/pie charts —
// on 3 things the team asked for: (A) Release Pipeline Health, (B) Booking
// Board Activity, (C) Package/Revenue Value. Everything here is a plain
// read (no writes) computed client-side from a handful of table reads.

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

export default function ReportPage() {
  const [releases, setReleases] = useState([]);
  const [rollups, setRollups] = useState([]); // media_booking_package_categories, with category name
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: rels }, { data: rollupRows }] = await Promise.all([
      supabase
        .from("releases")
        .select("id, did, title, main_artist, label, release_date, project_type, status, package_locked, package_total_value, package_vieent_support, package_label_payment, package_payment_status, media_report_status, link_media_report"),
      supabase.from("media_booking_package_categories").select("release_id, category_id, brand, skipped, package_categories(name)"),
    ]);
    setReleases(rels || []);
    setRollups(rollupRows || []);
    setLoading(false);
  }

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
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20, maxWidth: 720 }}>
            A read-only rollup across releases, the Booking Board, and package value — tables and charts,
            computed live from the same data everywhere else in the app reads/writes. Nothing here is editable;
            follow a release's link to act on it.
          </p>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
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
                )}
              </SectionCard>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
