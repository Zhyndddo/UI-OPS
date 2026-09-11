"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { readMagicLinkThemeLock } from "../../../lib/magicLinkThemeLock";
import styles from "../../shared.module.css";
import pageStyles from "./page.module.css";

// Round 305 — public, no-login magic link for the channel reference list,
// per explicit request ("generate a vercel magiclink for the table...
// use the layout from picture 1"). Same standalone-page convention as
// app/pick-package/[token] and app/performance-report/[token] (no
// AppShell, no auth) — gated by sql/pending/add-round305-channel-
// reference-share-links.sql's channel_reference_share_links table, NOT
// magic_links (see that migration's header for why this needed its own
// table). Read-only: view the list, click a link to open it — no other
// interactivity, per explicit request.
//
// Round 311 — rebuilt from 3 hardcoded TikTok-only brand blocks into
// however many groups booking_channels.channel_group actually has, each
// spanning every platform (not just TikTok) — per explicit request to
// group the list the way the reference sheet itself does (e.g.
// "VIEENT - SOCIAL" is 5 different platforms, one channel each) and to
// show each group's channel count + follower sum in its header. Order and
// color are still a fixed lookup (GROUP_META) rather than derived from
// the data, same reasoning the original 3-block version had: a stable,
// intentional reading order beats whatever order a live query happens to
// return, and a group not in this list (something added later without
// updating this page) still renders — just in encounter order, appended
// after the ones this page knows about, with a neutral color, so a new
// group is never silently dropped.
const GROUP_META = [
  { group: "VIEENT - SOCIAL", accent: "#5b9dff", accentBg: "rgba(91, 157, 255, 0.12)" },
  { group: "VPOP - COMMUNITY", accent: "#ff9d1a", accentBg: "rgba(255, 157, 26, 0.12)" },
  { group: "VPOP - TIKTOK", accent: "#ff9d1a", accentBg: "rgba(255, 157, 26, 0.12)" },
  { group: "INDIE - COMMUNITY", accent: "#5fd68a", accentBg: "rgba(95, 214, 138, 0.12)" },
  { group: "INDIE - TIKTOK", accent: "#5fd68a", accentBg: "rgba(95, 214, 138, 0.12)" },
  { group: "ENVI", accent: "#c46bff", accentBg: "rgba(196, 107, 255, 0.14)" },
  { group: "MIỀN TÂY/BOLERO - COMMUNITY", accent: "#c46bff", accentBg: "rgba(196, 107, 255, 0.14)" },
  { group: "TIKTOK MIỀN TÂY/BOLERO", accent: "#c46bff", accentBg: "rgba(196, 107, 255, 0.14)" },
  { group: "Distribution Support - MEDIA BOOKING CHANNEL", accent: "#9a9a9a", accentBg: "rgba(154, 154, 154, 0.14)" },
];
const DEFAULT_GROUP_META = { accent: "#9a9a9a", accentBg: "rgba(154, 154, 154, 0.14)" };

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
  const [channelsByGroup, setChannelsByGroup] = useState({});
  const [groupOrder, setGroupOrder] = useState([]);

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

    // Round 311 — every platform now, not just TikTok (channel_group
    // spans platforms, e.g. VIEENT - SOCIAL is TikTok+YouTube+Facebook+
    // Instagram+Thread) — only still excludes rows with no group set at
    // all, so an ungrouped channel doesn't silently show up here.
    const { data: rows } = await supabase
      .from("booking_channels")
      .select("id, name, platform, channel_group, url, follower_count, note")
      .not("channel_group", "is", null)
      .order("follower_count", { ascending: false, nullsFirst: false });
    const grouped = {};
    (rows || []).forEach((r) => {
      (grouped[r.channel_group] = grouped[r.channel_group] || []).push(r);
    });
    // Known groups first, in GROUP_META's fixed order; anything else
    // (a group not yet added to GROUP_META) appended after, alphabetical,
    // so it's still visible rather than dropped.
    const known = GROUP_META.map((m) => m.group).filter((g) => grouped[g]?.length > 0);
    const unknown = Object.keys(grouped).filter((g) => !known.includes(g)).sort();
    setGroupOrder([...known, ...unknown]);
    setChannelsByGroup(grouped);
    setLoading(false);
  }

  useEffect(() => { document.title = "Channel Reference"; }, []);

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
          <h1 className={styles.title} style={{ marginBottom: 0 }}>Channel List</h1>
        </div>
        <div className={pageStyles.grid}>
          {groupOrder.map((group) => {
            const meta = GROUP_META.find((m) => m.group === group) || DEFAULT_GROUP_META;
            const rows = channelsByGroup[group] || [];
            const followerSum = rows.reduce((sum, c) => sum + (c.follower_count || 0), 0);
            return (
              <div key={group} className={pageStyles.block}>
                <div className={pageStyles.blockHeader} style={{ background: meta.accent }}>
                  <div>{group}</div>
                  {/* Round 311 — per-group count + follower sum, per
                      explicit request. followerSum is 0 (shown as "0
                      followers", not hidden) for a group like Distribution
                      Support whose one row has no follower_count at all —
                      that's still an accurate total, not a bug. */}
                  <div className={pageStyles.blockHeaderMeta}>
                    {rows.length} channel{rows.length === 1 ? "" : "s"} · {formatFollowers(followerSum)} followers
                  </div>
                </div>
                <div className={pageStyles.blockBody}>
                  {rows.length === 0 ? (
                    <div style={{ color: "var(--text-faint)", fontSize: 13, padding: "12px 4px" }}>No channels yet.</div>
                  ) : (
                    rows.map((c) => {
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
                          <span className={pageStyles.rowPlatform}>{(c.platform || "").toUpperCase()}</span>
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
            );
          })}
        </div>
      </div>
    </div>
  );
}
