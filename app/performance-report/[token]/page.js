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

  // Round 230 — song-mode only: crawl the one release's link_share page
  // (a Labelmaster share URL) for its cover image via /api/crawl-og-image,
  // and show it beside the title. Deliberately not attempted for artist
  // mode (many releases, no single link_share to point at) or when the
  // release has no link_share on file yet — the header just renders as it
  // always has in either case, so there's nothing to fix up if the crawl
  // never runs.
  const [ogImage, setOgImage] = useState(null);
  const songLinkShare = link?.query_type === "song" ? data?.releases?.[0]?.link_share : null;
  useEffect(() => {
    setOgImage(null);
    if (!songLinkShare) return;
    let cancelled = false;
    fetch(`/api/crawl-og-image?url=${encodeURIComponent(songLinkShare)}`)
      .then((res) => res.json())
      .then((body) => { if (!cancelled && body?.image) setOgImage(body.image); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [songLinkShare]);

  useEffect(() => {
    if (link?.query_label) document.title = `${link.query_label} — Performance`;
  }, [link?.query_label]);

  if (loading) return <div className={styles.page}><div className={styles.container} style={{ maxWidth: 900 }}>Loading…</div></div>;
  if (error) return <div className={styles.page}><div className={styles.container} style={{ maxWidth: 640 }}><div className={styles.errorBox}>{error}</div></div></div>;

  return (
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 900 }}>
        {/* Round 230 — cover image (when crawled) sits left of the name;
            the eyebrow/title/expiry column scales up a notch alongside it
            so the row reads as one deliberate header instead of a small
            image jammed next to unchanged-size text. No image → exactly
            the original layout, unchanged. */}
        <div style={{ display: "flex", alignItems: "center", gap: ogImage ? 18 : 0 }}>
          {ogImage && (
            <img
              src={ogImage}
              alt=""
              style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", flexShrink: 0, border: "1px solid var(--border)" }}
              onError={() => setOgImage(null)}
            />
          )}
          <div>
            <div className={styles.eyebrow} style={ogImage ? { fontSize: 13 } : undefined}>// Performance</div>
            <h1 className={styles.title} style={ogImage ? { fontSize: 32 } : undefined}>{link?.query_label}</h1>
          </div>
        </div>
        <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20, marginTop: ogImage ? -12 : 0 }}>
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
