"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { usePerformanceRollup, PerformanceRollupView } from "../../../lib/PerformanceReport";
import styles from "../../shared.module.css";

// Round 222 — the public, no-login side of the Performance report share
// link (generated from the admin-only Performance tab on /report, see
// app/report/page.js's PerformanceTab and add-round222-performance-
// share-links.sql). Standalone page (no AppShell, no auth) — same
// convention as app/pick-package/[token]/page.js's magic link.
//
// Deliberately NOT a snapshot: this only reads the share-link row for its
// filter (query_type/query_value) and its expires_at — the actual
// performance numbers come from usePerformanceRollup(), the exact same
// live query the admin tab runs, so the link always reflects current
// data right up until it expires.
export default function PerformanceSharePage() {
  const { token } = useParams();
  const [link, setLink] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !token) return;
    load();
  }, [token]);

  async function load() {
    setLoading(true);
    setError(null);
    const { data: row, error: err } = await supabase.from("performance_share_links").select("*").eq("token", token).maybeSingle();
    if (err || !row) {
      setError("This link doesn't look valid. Double-check the URL you were sent.");
      setLoading(false);
      return;
    }
    if (new Date(row.expires_at) < new Date()) {
      setError("This link has expired. Ask whoever sent it to generate a new one.");
      setLoading(false);
      return;
    }
    setLink(row);
    setLoading(false);
  }

  const { data, loading: rollupLoading } = usePerformanceRollup(link?.query_type, link?.query_value);

  useEffect(() => {
    if (link?.query_label) document.title = `${link.query_label} — Performance`;
  }, [link?.query_label]);

  if (loading) return <div className={styles.page}><div className={styles.container} style={{ maxWidth: 900 }}>Loading…</div></div>;
  if (error) return <div className={styles.page}><div className={styles.container} style={{ maxWidth: 640 }}><div className={styles.errorBox}>{error}</div></div></div>;

  return (
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 900 }}>
        <div className={styles.eyebrow}>// Performance</div>
        <h1 className={styles.title}>{link?.query_label}</h1>
        <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
          Live performance rollup — this link expires {link ? new Date(link.expires_at).toLocaleString() : "—"}.
        </p>
        {rollupLoading || !data ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : (
          <PerformanceRollupView data={data} styles={styles} linkToReleases={false} mode={link?.query_type} />
        )}
      </div>
    </div>
  );
}
