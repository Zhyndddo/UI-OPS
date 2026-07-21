"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate, metadataPercent } from "../../lib/helpers";
import styles from "../shared.module.css";

export default function ReleasesDashboard() {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("releases")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setReleases(data || []);
        setLoading(false);
      });
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let thisWeek = 0,
      thisMonth = 0,
      preRelease = 0,
      released = 0,
      postRelease = 0;

    releases.forEach((r) => {
      const created = new Date(r.created_at);
      if (created >= startOfWeek) thisWeek++;
      if (created >= startOfMonth) thisMonth++;

      const rd = r.release_date ? new Date(r.release_date) : null;
      if (rd) {
        if (rd > now) preRelease++;
        else {
          const daysSince = (now - rd) / (1000 * 60 * 60 * 24);
          if (daysSince <= 7) released++;
          else postRelease++;
        }
      }
    });

    return { total: releases.length, thisWeek, thisMonth, preRelease, released, postRelease };
  }, [releases]);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.topRow}>
          <div>
            <div className={styles.eyebrow}>// Overview</div>
            <h1 className={styles.title} style={{ marginBottom: 0 }}>
              New Release
            </h1>
          </div>
          <Link href="/new-release" className={styles.btnPrimary}>
            + New Release
          </Link>
        </div>

        <div className={styles.statRow}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Total Releases</div>
            <div className={styles.statValue}>{stats.total}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>This Week</div>
            <div className={styles.statValue}>{stats.thisWeek}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>This Month</div>
            <div className={styles.statValue}>{stats.thisMonth}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Pre-release</div>
            <div className={styles.statValue}>{stats.preRelease}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Release</div>
            <div className={styles.statValue}>{stats.released}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Post-release</div>
            <div className={styles.statValue}>{stats.postRelease}</div>
          </div>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : releases.length === 0 ? (
          <div className={styles.emptyState}>No releases yet — create one to get started.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>DID</th>
                <th>Channel</th>
                <th>Package</th>
                <th>Label</th>
                <th>Name</th>
                <th>Artist</th>
                <th>Release Date</th>
                <th>Status</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((r) => {
                const pct = metadataPercent(r);
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/releases/${r.id}`} className={styles.rowLink}>
                        {r.did || "—"}
                      </Link>
                    </td>
                    <td>{r.requester_segment || "—"}</td>
                    <td style={{ maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.project_type || "—"}
                    </td>
                    <td>{r.label || "—"}</td>
                    <td>
                      <Link href={`/releases/${r.id}`} className={styles.rowLink}>
                        {r.title}
                      </Link>
                    </td>
                    <td>{r.main_artist}</td>
                    <td>{fmtDate(r.release_date)}</td>
                    <td>
                      <span className={styles.statusBadge} style={{ background: "rgba(255,107,26,0.12)", color: "#ff9d5c" }}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.pill} ${pct > 0 ? styles.pillOrange : styles.pillGray}`}>
                        {pct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
