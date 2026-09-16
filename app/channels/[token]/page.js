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

  // Round 340 — two-tab page: "vsounder" (the channel reference — same
  // content as before, minus Distribution Support) and "distribution"
  // (the new Google Sheet preview tab, replacing that removed group).
  // Both tab titles stay mounted at all times (see the JSX below) so the
  // size/opacity swap between them can transition smoothly instead of
  // one unmounting and the other popping in — clicking EITHER title just
  // flips to the other tab, since with only two tabs that's unambiguous
  // either way you read "click the title to switch."
  const [activeTab, setActiveTab] = useState("vsounder");
  function toggleTab() {
    setActiveTab((t) => (t === "vsounder" ? "distribution" : "vsounder"));
  }

  // Round 340 — the Distribution Support group's one row IS the redirect
  // link for the new tab ("the external link we already used to
  // redirect") — read live off the same channelsByGroup data the old
  // group block used, never hardcoded.
  const distributionRow = (channelsByGroup[DISTRIBUTION_GROUP] || [])[0] || null;

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
        {/* Round 332 — rebuilt as one shell. Round 340 — rebuilt again into
            two tabs ("turn the page into two tab page... each tab have
            some kind of a frame so they know what page they are on"):
            "vsounder" (this page's original content, minus Distribution
            Support) and "distribution" (the Round 339 Google Sheet
            preview + a click-through, replacing that removed group). A
            real <h1> (visually hidden) names whichever tab is active for
            accessibility/SEO — decoupled from the two animated visual
            titles below it, so swapping tabs never remounts either title
            element (needed for the transition to actually animate
            instead of popping). */}
        <h1 className={pageStyles.srOnly}>
          {activeTab === "vsounder" ? intro.title || "VSounder — Channel Reference" : "[Distribution Support] MEDIA BOOKING 2026"}
        </h1>

        {/* Round 340 — the two-title tab switcher: current tab's title
            grows and sits on top, the other shrinks and sits tucked
            below-and-to-the-side (not a subtitle — the offset + dimmed
            color reads as "the other tab," not "a caption for this one").
            Both titles stay mounted always; only CSS classes toggle, so
            font-size/opacity/image-height all transition instead of
            snapping. Clicking EITHER title flips to the other tab — with
            only two tabs, "switch to the other" is the same action no
            matter which one you click. */}
        <div className={pageStyles.tabHeader}>
          <div className={pageStyles.tabEyebrow}>{activeTab === "vsounder" ? "// Channel Reference" : "// Distribution Support"}</div>
          <div className={pageStyles.tabTitleRow} role="tablist" aria-label="Page section">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "vsounder"}
              className={`${pageStyles.tabTitleBtn} ${activeTab === "vsounder" ? pageStyles.tabTitleActive : pageStyles.tabTitleInactive}`}
              onClick={toggleTab}
            >
              {wordmarkFailed ? (
                <span className={pageStyles.tabTitleText}>{intro.title || "VSounder"}</span>
              ) : (
                <img
                  src={`/brand/vsounder-wordmark-${themeLock || "dark"}.png`}
                  alt={intro.title || "VSounder"}
                  className={pageStyles.brandWordmark}
                  onError={() => setWordmarkFailed(true)}
                />
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "distribution"}
              className={`${pageStyles.tabTitleBtn} ${activeTab === "distribution" ? pageStyles.tabTitleActive : pageStyles.tabTitleInactive}`}
              onClick={toggleTab}
            >
              <span className={pageStyles.tabTitleText}>[Distribution Support] MEDIA BOOKING 2026</span>
            </button>
          </div>
        </div>

        {activeTab === "vsounder" ? (
          <>
            {platformTallies.length > 0 && (
              <div className={pageStyles.platformStrip}>
                {platformTallies.map((p) => (
                  <div key={p.platform} className={pageStyles.platformStripItem}>
                    <div className={pageStyles.platformStripPlatform}>{p.platform}</div>
                    <div className={pageStyles.platformStripCount}>{p.count} channel{p.count === 1 ? "" : "s"}</div>
                    <div className={pageStyles.platformStripFollowers}>{formatFollowers(p.followerSum)} followers</div>
                  </div>
                ))}
              </div>
            )}

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

            <div className={pageStyles.grid}>
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
          </>
        ) : (
          <div className={pageStyles.distributionTab}>
            {/* Round 339 (moved here in Round 340) — Google Sheet preview:
                a public sheet's one tab ("the first sheet (overall)")
                rendered as our own styled table, not Google's iframe
                embed — per explicit spec, the exact URL pasted in admin
                also doubles as the "view full sheet" click-through link.
                Fails open the same way the Canva embed does: a load error
                shows a small inline message plus the outbound link
                instead of breaking the page. */}
            {intro.sheetUrl ? (
              <div className={pageStyles.sheetSection}>
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
                {/* Round 342 — BUG FIX ("there are two View full sheet
                    and click for more detail. serving the same thing"):
                    this link and the "Click for more detail" link below
                    are two different admin-set fields (intro.sheetUrl vs.
                    the Distribution Support row's own url) that just
                    happen to often be set to the same URL — rather than
                    delete one outright (they CAN legitimately differ —
                    e.g. the sheet embedded here vs. a separate page with
                    more context), only show this one when it actually
                    points somewhere different from the detail link below. */}
                {intro.sheetUrl !== distributionRow?.url && (
                  <a href={intro.sheetUrl} target="_blank" rel="noopener noreferrer" className={pageStyles.introCanvaLink}>
                    View full sheet →
                  </a>
                )}
              </div>
            ) : (
              <div className={pageStyles.sheetStatus}>No sheet configured yet — add a Google Sheet URL in Magic Link Intro.</div>
            )}

            {/* Round 340 — "a row under said something like Click for
                more detail, and use the external link we already used to
                re-direct" — the Distribution Support group's one row,
                read live off the same data the old channel-list block
                used (never hardcoded), rather than a group card. */}
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
        )}
      </div>
    </div>
  );
}
