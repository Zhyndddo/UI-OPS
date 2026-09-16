"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { readMagicLinkThemeLock } from "../../../lib/magicLinkThemeLock";
import { readChannelReferenceIntro, toCanvaEmbedUrl } from "../../../lib/channelReferenceIntro";
// Round 339 note: no parseGoogleSheetUrl import needed here — this page
// only ever passes intro.sheetUrl straight through to
// /api/channel-reference-sheet, which does its own parsing/validation
// server-side (see that route + the SSRF-guard comment on it).
import PlatformIcon from "../../../lib/PlatformIcon";
import styles from "../../shared.module.css";
import pageStyles from "./page.module.css";

// Round 317 — fixed platform display order for the new per-platform
// counter strip (item 1) — same order app/booking-channels/page.js's own
// BOOKING_PLATFORMS uses, so this page's summary reads in the same order
// the admin page's own filters do. A platform value outside this list
// (shouldn't happen, but never silently drop data) is appended after,
// alphabetical.
const PLATFORM_ORDER = ["TikTok", "Facebook", "Instagram", "YouTube", "Thread"];

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
//
// Round 313 — Round 311's flat 3-column CSS grid (groups auto-flowing
// into whichever column they happened to land in) is replaced with 3
// fixed super-columns per explicit request: VPOP - MANSTREAM (VIEENT -
// SOCIAL + VPOP - COMMUNITY + VPOP - TIKTOK, with Distribution Support
// riding along in the same column but set visually apart, not folded
// into that group), INDIE (INDIE - COMMUNITY + INDIE - TIKTOK), and
// MIỀN TÂY - BOLERO (ENVI + MIỀN TÂY/BOLERO - COMMUNITY + TIKTOK MIỀN
// TÂY/BOLERO). See COLUMN_META below for the exact assignment.
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

// Round 340 — Distribution Support is no longer one of the channel-list
// groups at all: per explicit request ("remove the table Distribution
// Support - MEDIA BOOKING CHANNEL, one of the table, which only have 1
// row and its an external url, click to redirect"), it moved to its own
// second tab entirely (see the tab JSX below) rather than riding along in
// the VPOP - MANSTREAM column. Its one row's `url`/`name` (read straight
// out of channelsByGroup, same live data this page already loads — never
// hardcoded) becomes that tab's "Click for more detail" link.
const DISTRIBUTION_GROUP = "Distribution Support - MEDIA BOOKING CHANNEL";

// Round 313 — per explicit request, the page's already-existing groups
// (Round 311's GROUP_META, unchanged) get bundled under 3 super-columns
// instead of auto-flowing into whichever of the 3 CSS grid columns they
// happen to land in. Each entry's `groups` are stacked top-to-bottom in
// that column, in that order. Any GROUP_META group not listed in any
// column here — or a channel_group value this page has never heard of at
// all — still isn't dropped: it falls into a trailing "Other" column,
// same never-silently-drop guarantee Round 311 had (DISTRIBUTION_GROUP is
// the one deliberate exception — see its own tab instead).
const COLUMN_META = [
  {
    label: "VPOP - MANSTREAM",
    groups: ["VIEENT - SOCIAL", "VPOP - COMMUNITY", "VPOP - TIKTOK"],
  },
  {
    label: "INDIE",
    groups: ["INDIE - COMMUNITY", "INDIE - TIKTOK"],
  },
  {
    label: "MIỀN TÂY - BOLERO",
    groups: ["ENVI", "MIỀN TÂY/BOLERO - COMMUNITY", "TIKTOK MIỀN TÂY/BOLERO"],
  },
];
const COLUMN_ASSIGNED_GROUPS = new Set(COLUMN_META.flatMap((c) => c.groups));

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

  // Round 317 — configurable intro text block, admin-edited from
  // app/booking-channels/page.js, read here the same fail-open way
  // themeLock is above (blank text/canvaUrl just means the block
  // doesn't render — see the conditional in the JSX below).
  const [intro, setIntro] = useState({ title: "", text: "", canvaUrl: "", sheetUrl: "" });
  useEffect(() => {
    if (!supabase) return;
    readChannelReferenceIntro(supabase).then(setIntro);
  }, []);
  // Round 327 — null when canvaUrl isn't an actual Canva link (or is
  // blank), so the JSX falls back to a plain outbound link for anything
  // else pasted in that field.
  const canvaEmbedSrc = useMemo(() => toCanvaEmbedUrl(intro.canvaUrl), [intro.canvaUrl]);
  // Round 335 — text fallback for the title row if the wordmark image
  // itself 404s/fails, so the page's <h1> is never empty.
  const [wordmarkFailed, setWordmarkFailed] = useState(false);
  // Round 338 — BUG FIX for "the text literally half page wide": the
  // paragraph WAS already rendering at the container's full width (Round
  // 337 confirmed there's no width constraint in the CSS) — the actual
  // cause was `white-space: pre-wrap` faithfully preserving every single
  // line break stored in intro.text, including ones that were never
  // meant as real paragraph breaks. The admin almost certainly typed this
  // into a narrow textarea, so each visual wrap in that box got saved as
  // a literal "\n" — pre-wrap then forces the SAME short line width on
  // this page regardless of how wide its own container is, which is
  // exactly the "stops right in the middle and breaks line" symptom.
  // Fix: only treat a BLANK line (two+ newlines) as an intentional
  // paragraph break; a lone "\n" inside a paragraph gets collapsed back
  // to a space so the browser reflows it to fill the real container
  // width, the same way it would if the admin had typed it as one long
  // line. Each paragraph renders as its own <p> (normal white-space, no
  // more pre-wrap) so wrapping is back to ordinary browser behavior.
  const introParagraphs = useMemo(() => {
    if (!intro.text) return [];
    return intro.text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
      .filter(Boolean);
  }, [intro.text]);

  // Round 339 — Google Sheet preview ("I want to embed the first sheet
  // (overall). then use the normal url as a click for details"). Fetched
  // through our own API route (not a client-side fetch straight to
  // docs.google.com) both to avoid CORS on that endpoint and to keep the
  // SSRF guard server-side — see app/api/channel-reference-sheet/route.js.
  // Fetched live on every load per explicit spec, not cached client-side
  // beyond the browser's normal handling of the route's own 60s
  // Cache-Control hint.
  const [sheetData, setSheetData] = useState(null);
  const [sheetError, setSheetError] = useState(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  // Round 346 — "add a sixth counter for the external, based on the fetch
  // table... we can do pre-load fetch and save somewhere then re-fetch on
  // page load": the live sheet fetch above can take a while (up to ~50s
  // worst case, see route.js), which would leave the 6th counter tile
  // blank/loading every single visit. Instead, the last successfully
  // fetched row count is cached in localStorage (keyed by the sheet URL,
  // so a changed admin config doesn't show a stale count from a different
  // sheet) and used to paint the tile immediately on load; the real fetch
  // above still runs every time and overwrites it once it resolves, so
  // the number is never more than one page-load stale.
  const [sheetCount, setSheetCount] = useState(null);
  useEffect(() => {
    if (!intro.sheetUrl) {
      setSheetCount(null);
      return;
    }
    try {
      const cached = window.localStorage.getItem(`channelRef.sheetCount.${intro.sheetUrl}`);
      if (cached != null) setSheetCount(Number(cached));
    } catch {
      // localStorage unavailable (private mode, etc.) — fine, just no
      // pre-loaded count until the live fetch below resolves.
    }
  }, [intro.sheetUrl]);
  useEffect(() => {
    if (!intro.sheetUrl) {
      setSheetData(null);
      setSheetError(null);
      return;
    }
    let cancelled = false;
    setSheetLoading(true);
    setSheetError(null);
    fetch(`/api/channel-reference-sheet?url=${encodeURIComponent(intro.sheetUrl)}`)
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) {
          setSheetError(body.error || "Failed to load sheet.");
          setSheetData(null);
        } else {
          setSheetData(body);
          setSheetCount(body.rows.length);
          try {
            window.localStorage.setItem(`channelRef.sheetCount.${intro.sheetUrl}`, String(body.rows.length));
          } catch {
            // best-effort cache only
          }
        }
      })
      .catch(() => {
        if (!cancelled) setSheetError("Failed to load sheet.");
      })
      .finally(() => {
        if (!cancelled) setSheetLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [intro.sheetUrl]);

  // Round 345 — the sheet's own row 1 is a merged title cell spanning
  // several columns ("HỖ TRỢ 10%...\nNhận booking lẻ..." — two lines,
  // separated by a real line break inside that one Sheets cell), which
  // Google's CSV export flattens into a header row where only the FIRST
  // cell has text and every other cell in that row is empty. That's a
  // reliable enough signature to detect generically (no hardcoded
  // column count, since a merge can span any number of columns) and
  // render as one centered, spanning title instead of a normal per-
  // column header row — "this title text box expand (merge) all column
  // so it mimic effect that the text is in centre of the whole table."
  const sheetTitleLines = useMemo(() => {
    const headers = sheetData?.headers;
    if (!headers || headers.length < 2) return null;
    if (!headers[0]?.trim()) return null;
    if (headers.slice(1).some((h) => h.trim())) return null;
    return headers[0].split(/\r\n|\n|\r/).filter((line) => line.trim() !== "");
  }, [sheetData]);

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

  // Round 317 — per-platform summary strip, per explicit request ("add a
  // new counter for the channel magic link: per platform on top like a
  // summarize"). Tallies every channel across every group (independent
  // of which of the 3 columns it landed in), keyed by platform, ordered
  // per PLATFORM_ORDER above — a platform value outside that fixed list
  // still isn't dropped, it's appended after, alphabetical, same
  // never-silently-drop convention GROUP_META/COLUMN_META use.
  const platformTallies = useMemo(() => {
    const byPlatform = {};
    Object.entries(channelsByGroup).forEach(([group, rows]) => {
      // Round 340 — Distribution Support moved to its own tab (see
      // DISTRIBUTION_GROUP above) and isn't a real channel anyway (its
      // one row is just an external redirect link), so it no longer
      // counts toward this tab's per-platform summary.
      if (group === DISTRIBUTION_GROUP) return;
      (rows || []).forEach((c) => {
        const p = c.platform || "Unknown";
        if (!byPlatform[p]) byPlatform[p] = { platform: p, count: 0, followerSum: 0 };
        byPlatform[p].count += 1;
        byPlatform[p].followerSum += c.follower_count || 0;
      });
    });
    const known = PLATFORM_ORDER.filter((p) => byPlatform[p]).map((p) => byPlatform[p]);
    const unknown = Object.keys(byPlatform)
      .filter((p) => !PLATFORM_ORDER.includes(p))
      .sort()
      .map((p) => byPlatform[p]);
    return [...known, ...unknown];
  }, [channelsByGroup]);

  // Round 346 — BUG FIX / revert ("remove the tabs entirely. only 1 page
  // now"): the Round 340 two-tab split is gone, everything lives on one
  // scrolling page again (see the single return JSX below) — the
  // Distribution Support group's one row is still just data read live off
  // channelsByGroup, never hardcoded, but it now powers the 6th "External"
  // counter tile and the "Click for more detail" button inline rather
  // than a whole separate tab.
  const distributionRow = (channelsByGroup[DISTRIBUTION_GROUP] || [])[0] || null;

  // Round 346 — "every counter is now clickable... if click on the
  // external, go to that table; otherwise go to the channel (on reference
  // list) table": one array driving all 6 tiles (5 real platforms +
  // "External"), each carrying the anchor id it scrolls to, so the JSX
  // below is a single .map instead of 5 near-duplicate tiles plus one
  // bespoke 6th.
  const counterTiles = useMemo(() => {
    const tiles = platformTallies.map((p) => ({
      key: p.platform,
      label: p.platform,
      count: p.count,
      sub: `${formatFollowers(p.followerSum)} followers`,
      anchor: "#channel-list",
    }));
    if (intro.sheetUrl) {
      tiles.push({
        key: "external",
        label: "External",
        count: sheetCount,
        sub: sheetCount == null ? (sheetLoading ? "loading…" : "—") : `${sheetCount} ${sheetCount === 1 ? "entry" : "entries"}`,
        anchor: "#sheet-preview",
      });
    }
    return tiles;
  }, [platformTallies, intro.sheetUrl, sheetCount, sheetLoading]);

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

  // Round 313 — render one group's block (extracted out of the old flat
  // map so both the 3 fixed super-columns and the trailing "Other"
  // column can share it). `setApart` adds the dashed-divider spacing
  // (see .blockSetApart in the CSS) for a group that rides along in a
  // column without being visually folded into the ones above it.
  function renderGroupBlock(group, { setApart } = {}) {
    const meta = GROUP_META.find((m) => m.group === group) || DEFAULT_GROUP_META;
    const rows = channelsByGroup[group] || [];
    const followerSum = rows.reduce((sum, c) => sum + (c.follower_count || 0), 0);
    return (
      <div
        key={group}
        className={setApart ? `${pageStyles.block} ${pageStyles.blockSetApart}` : pageStyles.block}
      >
        <div className={pageStyles.blockHeader} style={{ background: meta.accent }}>
          <div>{group}</div>
          {/* Round 311 — per-group count + follower sum, per explicit
              request. followerSum is 0 (shown as "0 followers", not
              hidden) for a group like Distribution Support whose one
              row has no follower_count at all — that's still an
              accurate total, not a bug. */}
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
                  {/* Round 347 — "switch the name of the platform in the
                      table into the icon... reduce the load speed" — an
                      inline SVG (see lib/PlatformIcon.js), not an <img>
                      pointing at a PNG, so this never costs an extra
                      network request. title= keeps the platform name
                      reachable on hover/for a screen reader now that the
                      text itself isn't in the DOM. */}
                  <span className={pageStyles.rowPlatform} title={c.platform || undefined}>
                    <PlatformIcon platform={c.platform} />
                  </span>
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
  }

  // Groups this page has data for but that aren't claimed by any of the
  // 3 fixed columns above — an unrecognized channel_group value. Still
  // rendered, just appended as a trailing "Other" column rather than
  // silently dropped. DISTRIBUTION_GROUP is deliberately excluded here
  // too (Round 340) — it's not an "unclaimed" group, it moved to its own
  // tab on purpose.
  const otherGroups = groupOrder.filter((g) => !COLUMN_ASSIGNED_GROUPS.has(g) && g !== DISTRIBUTION_GROUP);

  return (
    <div className={styles.page} data-theme={themeLock || undefined}>
      <div className={styles.container} style={{ maxWidth: 1200 }}>
        {/* Round 346 — "revert time... remove the tabs entirely. only 1
            page now": back to a single plain title (eyebrow + wordmark
            <h1>, no tab switcher, no visually-hidden duplicate heading —
            there's only one section for it to name now). */}
        <div className={pageStyles.eyebrow}>// Channel Reference</div>
        <h1 className={pageStyles.pageTitle}>
          {wordmarkFailed ? (
            <span className={pageStyles.pageTitleText}>{intro.title || "VSounder"}</span>
          ) : (
            <img
              src={`/brand/vsounder-wordmark-${themeLock || "dark"}.png`}
              alt={intro.title || "VSounder"}
              className={pageStyles.brandWordmark}
              onError={() => setWordmarkFailed(true)}
            />
          )}
        </h1>

        {/* Round 346 — "pull the intro text and canva embed right under
            the vsounder title. split the space in two: intro text on the
            left, canva on the right, same size if we can. Still vertical
            (intro text first) on mobile version" — intro text comes first
            in the DOM so the mobile single-column stack (see CSS) puts it
            on top with no extra JS/markup branching needed. */}
        {(introParagraphs.length > 0 || intro.canvaUrl) && (
          <div className={pageStyles.introCanvaRow}>
            {introParagraphs.length > 0 && (
              <div className={pageStyles.introText}>
                {introParagraphs.map((paragraph, i) => (
                  <p key={i} className={pageStyles.introParagraph}>{paragraph}</p>
                ))}
              </div>
            )}
            {intro.canvaUrl && (
              <div className={pageStyles.canvaEmbedSection}>
                {canvaEmbedSrc ? (
                  <div className={pageStyles.canvaEmbedWrap}>
                    <iframe
                      src={canvaEmbedSrc}
                      loading="lazy"
                      allow="fullscreen"
                      allowFullScreen
                      className={pageStyles.canvaEmbedFrame}
                      title={intro.title || "Canva reference"}
                    />
                  </div>
                ) : (
                  <a href={intro.canvaUrl} target="_blank" rel="noopener noreferrer" className={pageStyles.introCanvaLink}>
                    Open reference →
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Round 346 — "under the canva embed is the counter. now add a
            sixth... for the external, based on the fetch table. every
            counter is now clickable" — counterTiles above already builds
            the 5 platform tiles + the External tile with the right anchor
            on each; this is just the render. */}
        {counterTiles.length > 0 && (
          <div className={pageStyles.platformStrip}>
            {counterTiles.map((tile) => (
              <a key={tile.key} href={tile.anchor} className={pageStyles.platformStripItem}>
                <div className={pageStyles.platformStripPlatform}>{tile.label}</div>
                <div className={pageStyles.platformStripCount}>
                  {tile.count == null ? "…" : `${tile.count} ${tile.key === "external" ? (tile.count === 1 ? "entry" : "entries") : tile.count === 1 ? "channel" : "channels"}`}
                </div>
                <div className={pageStyles.platformStripFollowers}>{tile.sub}</div>
              </a>
            ))}
          </div>
        )}

        {/* Round 346 — "under the counter is the channel reference list" —
            same COLUMN_META/otherGroups rendering as before, just no
            longer gated behind a tab. id="channel-list" is the scroll
            target for the 5 platform counter tiles above. */}
        <div id="channel-list" className={pageStyles.grid}>
          {COLUMN_META.map((col) => {
            const colGroups = col.groups.filter((g) => (channelsByGroup[g]?.length || 0) > 0);
            if (colGroups.length === 0) return null;
            return (
              <div key={col.label} className={pageStyles.column}>
                <div className={pageStyles.columnTitle}>{col.label}</div>
                {colGroups.map((group) => renderGroupBlock(group))}
              </div>
            );
          })}
          {otherGroups.length > 0 && (
            <div className={pageStyles.column}>
              <div className={pageStyles.columnTitle}>Other</div>
              {otherGroups.map((group) => renderGroupBlock(group))}
            </div>
          )}
        </div>

        {/* Round 346 — "then under there is the fetch table, and under
            the fetch table is still click for detail button we have" —
            the Round 339/345 Google Sheet preview, unchanged content,
            just no longer its own tab. id="sheet-preview" is the scroll
            target for the External counter tile above. */}
        {intro.sheetUrl && (
          <div id="sheet-preview" className={pageStyles.sheetSection}>
            {sheetLoading && !sheetData && (
              <div className={pageStyles.sheetStatus}>Loading sheet…</div>
            )}
            {sheetError && (
              <div className={pageStyles.sheetStatus}>{sheetError}</div>
            )}
            {sheetData && sheetData.rows.length > 0 && (
              <div className={pageStyles.sheetTableWrap}>
                <table className={pageStyles.sheetTable}>
                  <thead>
                    {sheetTitleLines ? (
                      <tr>
                        <th colSpan={sheetData.headers.length} className={pageStyles.sheetTitleCell}>
                          {sheetTitleLines.map((line, i) => (
                            <div key={i} className={i === 0 ? pageStyles.sheetTitleMain : pageStyles.sheetTitleSub}>
                              {line}
                            </div>
                          ))}
                        </th>
                      </tr>
                    ) : (
                      <tr>
                        {sheetData.headers.map((h, i) => (
                          <th key={i}>{h}</th>
                        ))}
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {sheetData.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Round 342 — still applies: only show this when it points
                somewhere different from the detail link below. */}
            {intro.sheetUrl !== distributionRow?.url && (
              <a href={intro.sheetUrl} target="_blank" rel="noopener noreferrer" className={pageStyles.introCanvaLink}>
                View full sheet →
              </a>
            )}
          </div>
        )}

        {/* Round 346 — "still click for detail button we have": kept
            outside the sheetUrl-gated block above (unlike the old
            distribution tab, this button doesn't depend on a sheet being
            configured at all — it's the Distribution Support row's own
            redirect link). */}
        {distributionRow?.url && (
          <a
            href={distributionRow.url}
            target="_blank"
            rel="noopener noreferrer"
            className={pageStyles.distributionDetailLink}
          >
            Click for more detail →
          </a>
        )}
      </div>
    </div>
  );
}
