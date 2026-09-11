"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { readMagicLinkThemeLock } from "../../../lib/magicLinkThemeLock";
import styles from "../../shared.module.css";
import pageStyles from "./page.module.css";

// Round 305 — public, no-login magic link for the TikTok channel
// reference list, per explicit request ("generate a vercel magiclink for
// the table... use the layout from picture 1"). Same standalone-page
// convention as app/pick-package/[token] and app/performance-report/[token]
// (no AppShell, no auth) — gated by sql/pending/add-round305-channel-
// reference-share-links.sql's channel_reference_share_links table, NOT
// magic_links (see that migration's header for why this needed its own
// table). Read-only: view the list, click a link to open it — no other
// interactivity, per explicit request.
//
// Content is the 3 blocks pictured (VPOP-TIKTOK / INDIE-TIKTOK / TIKTOK
// MIỀN TÂY-BOLERO), sourced live from booking_channels filtered to
// platform='TikTok' and brand in ('VPOP','INDIE','ENVI - MIỀN TÂY/BOLERO')
// — the same 3 brand values Round 304's reference-sheet import tagged
// these channels with. Not a snapshot: adding/editing a TikTok channel on
// /booking-channels shows up here on next load, same "live query, not a
// point-in-time copy" contract as the Performance magic link.
const BLOCKS = [
  { brand: "VPOP", title: "VPOP - TIKTOK", accent: "#ff9d1a", accentBg: "rgba(255, 157, 26, 0.12)" },
  { brand: "INDIE", title: "INDIE - TIKTOK", accent: "#5fd68a", accentBg: "rgba(95, 214, 138, 0.12)" },
  { brand: "ENVI - MIỀN TÂY/BOLERO", title: "TIKTOK MIỀN TÂY/BOLERO", accent: "#c46bff", accentBg: "rgba(196, 107, 255, 0.14)" },
];

// Best-effort color mapping for the sheet's "Type" tag, matching picture
// 1's palette as closely as a fixed small set reasonably can. A note value
// that isn't one of these still renders — just in the plain gray fallback
// — so a new/unrecognized tag from a future import never breaks the page.
const NOTE_COLORS = {
  "Reup lyrics": { bg: "rgba(90, 170, 255, 0.16)", fg: "#7fb8ff" },
  "Key lyrics": { bg: "rgba(214, 178, 95, 0.18)", fg: "#d6b25f" },
  "Key news/tổng hợp": { bg: "rgba(255, 100, 100, 0.16)", fg: "#ff7a7a" },
  "Reup news/tổng hợp": { bg: "rgba(255, 100, 100, 0.16)", fg: "#ff7a7a" },
  "Key trend tổng hợp": { bg: "rgba(255, 110, 180, 0.16)", fg: "#ff8fc4" },
  "ĐU PHIM": { bg: "rgba(70, 160, 110, 0.2)", fg: "#5fbf8a" },
};
const DEFAULT_NOTE_COLOR = { bg: "var(--bg-hover)", fg: "var(--text-dim)" };

function formatFollowers(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("vi-VN").format(n);
}

export default function ChannelReferenceSharePage() {
  const { token } = useParams();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [channelsByBrand, setChannelsByBrand] = useState({});

  const [themeLock, setThemeLock] = useState(null);
  useEffect(() => {
    if (!supabase) return;
    readMagicLinkThemeLock(supabase).then(setThemeLock);
  }, []);

  useEffect(() => {
    if (!supabase || !token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function load() {
    setLoading(true);
    setError(null);
    const { data: link, error: linkErr } = await supabase
      .from("channel_reference_share_links")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (linkErr || !link) {
      setError("This link doesn't look valid. Double-check the URL you were sent.");
      setLoading(false);
      return;
    }
    if (link.revoked_at) {
      setError("This link is no longer active. Ask whoever sent it for a new one.");
      setLoading(false);
      return;
    }
    // Best-effort — a failed write here shouldn't block showing the page.
    supabase
      .from("channel_reference_share_links")
      .update({ last_viewed_at: new Date().toISOString() })
      .eq("id", link.id)
      .then(() => {});

    const brands = BLOCKS.map((b) => b.brand);
    const { data: rows } = await supabase
      .from("booking_channels")
      .select("id, name, platform, brand, url, follower_count, note")
      .eq("platform", "TikTok")
      .in("brand", brands)
      .order("follower_count", { ascending: false, nullsFirst: false });
    const grouped = {};
    brands.forEach((b) => { grouped[b] = []; });
    (rows || []).forEach((r) => { if (grouped[r.brand]) grouped[r.brand].push(r); });
    setChannelsByBrand(grouped);
    setLoading(false);
  }

  useEffect(() => { document.title = "Channel Reference — TikTok"; }, []);

  if (loading) {
    return <div className={styles.page} data-theme={themeLock || undefined}><div className={styles.container} style={{ maxWidth: 1200 }}>Loading…</div></div>;
  }
  if (error) {
    return (
      <div className={styles.page} data-theme={themeLock || undefined}>
        <div className={styles.container} style={{ maxWidth: 640 }}>
          <div className={styles.errorBox}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page} data-theme={themeLock || undefined}>
      <div className={styles.container} style={{ maxWidth: 1200 }}>
        <div style={{ marginBottom: 20 }}>
          <div className={styles.eyebrow}>// Channel Reference</div>
          <h1 className={styles.title} style={{ marginBottom: 0 }}>TikTok Channel List</h1>
        </div>
        <div className={pageStyles.grid}>
          {BLOCKS.map((block) => (
            <div key={block.brand} className={pageStyles.block}>
              <div className={pageStyles.blockHeader} style={{ background: block.accent }}>{block.title}</div>
              <div className={pageStyles.blockBody}>
                {(channelsByBrand[block.brand] || []).length === 0 ? (
                  <div style={{ color: "var(--text-faint)", fontSize: 13, padding: "12px 4px" }}>No channels yet.</div>
                ) : (
                  channelsByBrand[block.brand].map((c) => {
                    const noteColor = NOTE_COLORS[c.note] || DEFAULT_NOTE_COLOR;
                    return (
                      <a
                        key={c.id}
                        href={c.url || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={pageStyles.row}
                        style={!c.url ? { pointerEvents: "none", opacity: 0.6 } : undefined}
                      >
                        <span className={pageStyles.rowPlatform}>TIKTOK</span>
                        <span className={pageStyles.rowFollowers}>{formatFollowers(c.follower_count)}</span>
                        <span className={pageStyles.rowName}>{c.name}</span>
                        {c.note && (
                          <span className={pageStyles.rowNote} style={{ background: noteColor.bg, color: noteColor.fg }}>
                            {c.note}
                          </span>
                        )}
                      </a>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
