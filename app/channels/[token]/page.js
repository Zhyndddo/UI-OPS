"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { readMagicLinkThemeLock } from "../../../lib/magicLinkThemeLock";
import { readChannelReferenceIntro, toCanvaEmbedUrl } from "../../../lib/channelReferenceIntro";
import { readChannelReferenceSheetSnapshot } from "../../../lib/channelReferenceSheetSnapshot";
import { computeSheetCount } from "../../../lib/channelReferenceSheetCount";
// Round 339 note: no parseGoogleSheetUrl import needed here — this page
// only ever passes intro.sheetUrl straight through to
// /api/channel-reference-sheet, which does its own parsing/validation
// server-side (see that route + the SSRF-guard comment on it).
import PlatformIcon from "../../../lib/PlatformIcon";
import { resolvePlatformKey, PLATFORM_COLORS } from "../../../lib/platformBrand";
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
// Round 368 — "VIEENT - SOCIAL table use orange plate (basically switch
// color of vieent social and vpop tables)": VIEENT - SOCIAL and the 2
// VPOP groups simply trade accent values (blue <-> orange) — everything
// downstream (blockHeader background, the pastelized title text, the
// counter-tile colors in platformBrand.js-adjacent code) reads this table
// instead of a hardcoded color, so the swap is just these 2 lines.
const GROUP_META = [
  { group: "VIEENT - SOCIAL", accent: "#ff9d1a", accentBg: "rgba(255, 157, 26, 0.12)" },
  { group: "VPOP - COMMUNITY", accent: "#5b9dff", accentBg: "rgba(91, 157, 255, 0.12)" },
  { group: "VPOP - TIKTOK", accent: "#5b9dff", accentBg: "rgba(91, 157, 255, 0.12)" },
  { group: "INDIE - COMMUNITY", accent: "#5fd68a", accentBg: "rgba(95, 214, 138, 0.12)" },
  { group: "INDIE - TIKTOK", accent: "#5fd68a", accentBg: "rgba(95, 214, 138, 0.12)" },
  { group: "ENVI", accent: "#c46bff", accentBg: "rgba(196, 107, 255, 0.14)" },
  // Round 365 — "this table ENVI - MIỀN TÂY/BOLERO belong to sub-group
  // MIỀN TÂY - BOLERO of group Community Channel": a distinct
  // channel_group value from plain "ENVI" above (that one stays in
  // OFFICIAL_GROUPS, unchanged) — this one was showing up in the
  // trailing "Other" column since it wasn't in GROUP_META/COLUMN_META at
  // all yet. Same purple accent as its two MIỀN TÂY - BOLERO siblings.
  { group: "ENVI - MIỀN TÂY/BOLERO", accent: "#c46bff", accentBg: "rgba(196, 107, 255, 0.14)" },
  { group: "MIỀN TÂY/BOLERO - COMMUNITY", accent: "#c46bff", accentBg: "rgba(196, 107, 255, 0.14)" },
  { group: "TIKTOK MIỀN TÂY/BOLERO", accent: "#c46bff", accentBg: "rgba(196, 107, 255, 0.14)" },
  { group: "Distribution Support - MEDIA BOOKING CHANNEL", accent: "#9a9a9a", accentBg: "rgba(154, 154, 154, 0.14)" },
];
const DEFAULT_GROUP_META = { accent: "#9a9a9a", accentBg: "rgba(154, 154, 154, 0.14)" };

// Round 363 — "change the font color to that of a pastel version of the
// color used for the box containing it": each .blockHeader is painted
// solid with that group's own `accent` (see the style={{ background:
// meta.accent }} below), so the title text needs to be a much LIGHTER
// tint of that same hue to stay readable sitting on top of it — not the
// existing `accentBg` field, which is a low-opacity rgba() meant to be
// composited over the page's dark surface elsewhere, not used as a solid
// text color. Blends the accent 72% toward white (a "pastel" is
// conventionally just a hue at high lightness/low saturation, and mixing
// toward white is the simplest way to get there from a single hex
// value) — computed from `accent` instead of hand-picked per group, so a
// future GROUP_META color change never leaves a stale pastel behind.
function pastelizeHex(hex, whiteMix = 0.72) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c) => Math.round(c * (1 - whiteMix) + 255 * whiteMix);
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Round 363 — "allow me to bold or format text on the config text field
// in the reference table": rather than a full rich-text editor (a much
// bigger lift for one formatting need), the admin's plain textarea
// (app/booking-channels/page.js) now supports **bold** — the same
// double-asterisk convention Markdown/Slack/WhatsApp already use, so
// nothing new to learn — and this splits each paragraph on that marker,
// rendering the wrapped portions as <strong>. Anything not wrapped in
// **...** renders as plain text exactly as before; a paragraph with no
// "**" in it at all just returns itself unchanged.
function renderBoldText(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    return m ? <strong key={i}>{m[1]}</strong> : part;
  });
}

// Round 340 — Distribution Support is no longer one of the channel-list
// groups at all: per explicit request ("remove the table Distribution
// Support - MEDIA BOOKING CHANNEL, one of the table, which only have 1
// row and its an external url, click to redirect"), it moved to its own
// second tab entirely (see the tab JSX below) rather than riding along in
// the VPOP - MANSTREAM column. Its one row's `url`/`name` (read straight
// out of channelsByGroup, same live data this page already loads — never
// hardcoded) becomes that tab's "Click for more detail" link.
const DISTRIBUTION_GROUP = "Distribution Support - MEDIA BOOKING CHANNEL";

// Round 364 — "taking two social of vieent and envi out to become their
// own group": VIEENT - SOCIAL and ENVI used to ride along inside the
// VPOP - MANSTREAM and MIỀN TÂY - BOLERO columns respectively (see the
// COLUMN_META this replaced, in this file's git history). Per explicit
// request, they're pulled out into their own top-level "OFFICIAL
// CHANNEL" section, sitting above the rest ("COMMUNITY CHANNEL" —
// COLUMN_META below), rather than being folded into either community
// column. Side-note clarification from the same request: the MIỀN TÂY -
// BOLERO column's own label stays the same, it just no longer includes
// ENVI now that ENVI has its own home above it.
const OFFICIAL_GROUPS = ["VIEENT - SOCIAL", "ENVI"];

// Round 313 — per explicit request, the page's already-existing groups
// (Round 311's GROUP_META, unchanged) get bundled under 3 super-columns
// instead of auto-flowing into whichever of the 3 CSS grid columns they
// happen to land in. Each entry's `groups` are stacked top-to-bottom in
// that column, in that order. Any GROUP_META group not listed in any
// column here (or in OFFICIAL_GROUPS above) — or a channel_group value
// this page has never heard of at all — still isn't dropped: it falls
// into a trailing "Other" column, same never-silently-drop guarantee
// Round 311 had (DISTRIBUTION_GROUP is the one deliberate exception —
// see its own tab instead).
// Round 368 — "remove VPOP - MANSTREAM, INDIE, MIỀN TÂY - BOLERO name
// entirely (still have 3 sub groups but no name showing)": the 3 columns
// keep their groups but lose their label text — label: "" renders no
// heading at all (see the JSX below's `col.label &&` guard) rather than
// an empty one.
const COLUMN_META = [
  {
    label: "",
    groups: ["VPOP - COMMUNITY"],
  },
  {
    label: "",
    groups: ["INDIE - COMMUNITY"],
  },
  {
    label: "",
    groups: ["ENVI - MIỀN TÂY/BOLERO", "MIỀN TÂY/BOLERO - COMMUNITY"],
  },
];

// Round 368 — "split 3 table VPOP - TIKTOK, INDIE - TIKTOK, TIKTOK MIỀN
// TÂY/BOLERO into a new group of TIKTOK Channels" first landed as a 4th
// COLUMN_META column (still inside Community Channel's grid); explicit
// follow-up ("not new column, new group entirely like community and
// official channel") promoted it to its own top-level section, a peer of
// OFFICIAL_GROUPS/COLUMN_META rather than folded into either — see the
// "TikTok Channels" .topSection in the JSX below, which reuses .grid the
// same way Community Channel does (each of these 3 groups gets its own
// column, one group per column, no COLUMN_META-style sub-stacking needed
// since none of them share a column with another group here).
const TIKTOK_GROUPS = ["VPOP - TIKTOK", "INDIE - TIKTOK", "TIKTOK MIỀN TÂY/BOLERO"];

const COLUMN_ASSIGNED_GROUPS = new Set([
  ...OFFICIAL_GROUPS,
  ...COLUMN_META.flatMap((c) => c.groups),
  ...TIKTOK_GROUPS,
]);

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

// Round 350 — "whichever numbers that is below 1000 and not 0 returns
// something like this: <1000 instead of real number" — a small follower
// count reads as noise/imprecision-bait next to the big ones anyway;
// exactly 0 is left alone (still a real, meaningful "0 followers"), and
// anything at or above 1000 still gets its real formatted number.
function formatFollowers(n) {
  if (n == null) return "—";
  if (n > 0 && n < 1000) return "<1000";
  return new Intl.NumberFormat("vi-VN").format(n);
}

// Round 357 — renders the daily cron's fetchedAt (an ISO timestamp) in
// Vietnam local time, since "8:00" in the request was a local time and
// the on-page proof should read the same way. Falls back to the raw ISO
// string for a malformed/unparseable value rather than throwing.
function formatAutoRefreshedAt(iso) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// Round 357 — sumRowNumbers/isKenhCountRow (Round 348/349) moved to
// lib/channelReferenceSheetCount.js so the new daily auto-fetch cron
// (app/api/cron/channel-reference-sheet/route.js) counts the sheet
// exactly the same way this page does, instead of a second hand-copied
// implementation drifting out of sync. isColumnTitleRow stays local — it
// only drives this page's own row styling, the cron has no use for it.

// Round 349 — "this row also a column title row" (the BIG CHANNEL 1/BIG
// CHANNEL 2/KOL DANCE/COVER row wasn't getting the Round 348 highlight):
// Round 348 only styled body row 0 as the column-title row, but the sheet
// repeats that pattern (a title row, then 4 data rows) once per section.
// Detected structurally instead of by position: every "Số lượng"/"Đơn
// Giá"/etc. data row in this sheet has its own row label in the first
// cell; a column-title row is the one where that first cell is BLANK but
// at least one other cell in the row has text — true for both the CAPCUT
// and the BIG CHANNEL title rows, and for however many more sections a
// future edit to the sheet adds.
function isColumnTitleRow(row) {
  if (!row || row.length === 0) return false;
  if (String(row[0] || "").trim() !== "") return false;
  return row.slice(1).some((cell) => String(cell || "").trim() !== "");
}

// Round 370 — "apply exclusively to the Ratecard Ads: row TRỢ GIÁ BOOKING
// ADS YOUTUBE * Chỉ áp dụng với dự án phát hành qua Vieent: the text block
// 'hỗ trợ 10% đối với kênh youtube...' is a merge cell, can you make that
// change (it merge 5 columns counting from itself to the right)": Google's
// CSV export flattens an in-sheet merged cell to one cell holding the text
// with blank cells trailing it (same flattening detectMergedTitleLines
// already works around, for the sheet's own title instead of an ordinary
// body row). Matched by this row's own label text rather than a generic
// "long cell with blanks after it" structural rule, since that would risk
// merging other short label/value rows that just happen to have empty
// trailing columns — only this one row is a real merge in the sheet.
// Deliberately only referenced from the Ratecard Ads (sheetData2) render
// below, never the Distribution Support table above it.
function isRatecardYoutubeMergeRow(row) {
  return String(row?.[0] || "").trim().toUpperCase().startsWith("TRỢ GIÁ BOOKING ADS YOUTUBE");
}

// Round 371 — BUG FIX ("it's clipping all the cell data, could be due to
// my example last session"): the real sheet has the merged paragraph
// starting in column C (index 2), not column B (index 1) — column B ("AD
// FORMAT") is its own blank cell in this row. Round 370 assumed index 1
// unconditionally, so it rendered that blank cell as the "merged" one and
// the actual paragraph text (sitting one column further right) never
// appeared at all — not truncated, just entirely missing. Finds the first
// non-blank cell after the row's own label (index 0) instead of assuming
// a fixed position, so it keeps working regardless of how many blank
// columns sit between the label and the merged text.
function findRatecardMergeStart(row) {
  for (let i = 1; i < row.length; i++) {
    if (String(row[i] || "").trim() !== "") return i;
  }
  return -1;
}

// Round 345 — see the sheetTitleLines useMemo below for the full
// reasoning; extracted to a plain function in Round 365 so the second
// (Ratecard Ads) sheet can reuse the exact same merged-title detection.
function detectMergedTitleLines(headers) {
  if (!headers || headers.length < 2) return null;
  if (!headers[0]?.trim()) return null;
  if (headers.slice(1).some((h) => h.trim())) return null;
  return headers[0].split(/\r\n|\n|\r/).filter((line) => line.trim() !== "");
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
  // computed count (see sumRowNumbers/Round 348 above) is cached in
  // localStorage (keyed by the sheet URL, so a changed admin config
  // doesn't show a stale count from a different sheet) and used to paint
  // the tile immediately on load; the real fetch above still runs every
  // time and overwrites it once it resolves, so the number is never more
  // than one page-load stale.
  const [sheetCount, setSheetCount] = useState(null);
  // Round 357 — "the auto fetch, run a fetch every day at 8:00": the last
  // snapshot written by the new daily cron (app/api/cron/channel-
  // reference-sheet/route.js), read here so this page can (a) show "auto-
  // refreshed daily · last: ..." next to the sheet, and (b) fall back on
  // it below if this viewer's own live fetch never gets a chance to
  // resolve/succeed — the localStorage cache from Round 346 is still the
  // FIRST fallback (it's this browser's own last-seen number, so it's at
  // least as fresh as the daily snapshot most of the time); the snapshot
  // is the one that still works on a visitor's very first-ever visit,
  // which localStorage can't.
  const [sheetSnapshot, setSheetSnapshot] = useState(null);
  useEffect(() => {
    if (!supabase) return;
    readChannelReferenceSheetSnapshot(supabase).then(setSheetSnapshot);
  }, []);
  useEffect(() => {
    if (!intro.sheetUrl) {
      setSheetCount(null);
      return;
    }
    try {
      const cached = window.localStorage.getItem(`channelRef.sheetCount.${intro.sheetUrl}`);
      if (cached != null) {
        setSheetCount(Number(cached));
        return;
      }
    } catch {
      // localStorage unavailable (private mode, etc.) — fall through to
      // the daily snapshot below instead.
    }
    if (sheetSnapshot && sheetSnapshot.sheetUrl === intro.sheetUrl) {
      setSheetCount(sheetSnapshot.count);
    }
  }, [intro.sheetUrl, sheetSnapshot]);
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
          // Round 357 — a failed live fetch no longer leaves the tile
          // blank when a daily snapshot exists: falls back to it exactly
          // like the initial-load effect above does.
          if (sheetCount == null && sheetSnapshot && sheetSnapshot.sheetUrl === intro.sheetUrl) {
            setSheetCount(sheetSnapshot.count);
          }
        } else {
          setSheetData(body);
          // Round 349 — sum EVERY "N kênh" row (see isKenhCountRow in
          // lib/channelReferenceSheetCount.js), not just the first one —
          // this sheet has one per column-title section (CAPCUT's, then
          // BIG CHANNEL's further down).
          const countSum = computeSheetCount(body.rows);
          setSheetCount(countSum);
          try {
            window.localStorage.setItem(`channelRef.sheetCount.${intro.sheetUrl}`, String(countSum));
          } catch {
            // best-effort cache only
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSheetError("Failed to load sheet.");
          if (sheetCount == null && sheetSnapshot && sheetSnapshot.sheetUrl === intro.sheetUrl) {
            setSheetCount(sheetSnapshot.count);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setSheetLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Round 365 — extracted to a plain function so the new Ratecard Ads
  // sheet (sheetData2 below) can detect the exact same merged-title
  // shape without a second copy of this logic.
  const sheetTitleLines = useMemo(() => detectMergedTitleLines(sheetData?.headers), [sheetData]);

  // Round 365 — "add this one under the Distribution Support - Media
  // Booking 2026 table. it's from same spread sheet just different sheet
  // of that table" — a second, independent sheet embed (Ratecard Ads),
  // same fetch-through-our-own-route mechanism as the first (see
  // intro.sheetUrl's own useEffect above and app/api/channel-reference-
  // sheet/route.js's SSRF guard, which now checks against either
  // configured URL). Deliberately simpler than the first sheet's state:
  // no localStorage pre-paint cache or daily-snapshot fallback, since
  // those exist specifically to keep the External COUNTER tile from
  // showing blank while its own fetch is in flight — this second sheet
  // has no counter tile of its own, just a table, so a plain "Loading…"
  // on first render is fine.
  const [sheetData2, setSheetData2] = useState(null);
  const [sheetError2, setSheetError2] = useState(null);
  const [sheetLoading2, setSheetLoading2] = useState(false);
  useEffect(() => {
    if (!intro.sheetUrl2) {
      setSheetData2(null);
      setSheetError2(null);
      return;
    }
    let cancelled = false;
    setSheetLoading2(true);
    setSheetError2(null);
    fetch(`/api/channel-reference-sheet?url=${encodeURIComponent(intro.sheetUrl2)}`)
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) {
          setSheetError2(body.error || "Failed to load sheet.");
          setSheetData2(null);
        } else {
          setSheetData2(body);
        }
      })
      .catch(() => {
        if (!cancelled) setSheetError2("Failed to load sheet.");
      })
      .finally(() => {
        if (!cancelled) setSheetLoading2(false);
      });
    return () => {
      cancelled = true;
    };
  }, [intro.sheetUrl2]);
  const sheetTitleLines2 = useMemo(() => detectMergedTitleLines(sheetData2?.headers), [sheetData2]);

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
      // Round 354 — "based on the platform color, also color the counter
      // cell accordingly": PLATFORM_COLORS[key] is undefined for a
      // platform value outside the 5 brand icons cover — colors stays
      // null and the tile just keeps its plain default look, same
      // never-silently-drop fallback the rest of this page uses.
      colors: PLATFORM_COLORS[resolvePlatformKey(p.platform)] || null,
    }));
    if (intro.sheetUrl) {
      // Round 349 — BUG FIX ("no under line for the followers, as of
      // now, we are making a duplicate of the ... channel for two
      // line"): the External tile has no follower concept, so unlike the
      // 5 platform tiles it gets no `sub` line at all — the count line
      // below (tile.count + "channel(s)") already says everything this
      // tile has to say, once.
      tiles.push({
        key: "external",
        label: "External",
        count: sheetCount,
        sub: null,
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
          <div className={pageStyles.blockHeaderTitle} style={{ color: pastelizeHex(meta.accent) }}>{group}</div>
          {/* Round 311 — per-group count + follower sum, per explicit
              request. followerSum is 0 (shown as "0 followers", not
              hidden) for a group like Distribution Support whose one
              row has no follower_count at all — that's still an
              accurate total, not a bug. */}
          <div className={pageStyles.blockHeaderMeta}>
            {rows.length} channel{rows.length === 1 ? "" : "s"} · {formatFollowers(followerSum)} followers
          </div>
        </div>
        {/* Round 364 — "split this line from the table header badge and
            align it to the content so it would be like real column
            title": Round 350's "Platform · Channel Name · Followers ·
            Type" legend used to be one plain text line INSIDE the
            colored .blockHeader, not aligned to anything below it. Moved
            out to its own row between the header and the body, sharing
            .row's exact grid-template-columns (32px 1fr 56px 104px) so
            each label sits directly above its actual column instead of
            just naming them in prose. Hidden on mobile (see the media
            query in the CSS) since the <=480px .row layout is a
            different 2-line shape these 4 fixed columns no longer match. */}
        <div className={pageStyles.blockColumnTitles}>
          {/* Round 368 — "font size didn't fix it... remove the platform
              text entirely, leave that as blank, we consider the icon and
              the name as one pseudo column": the shrunk 7px label (Round
              367) still wasn't enough room on the narrower group columns,
              so "Platform" is dropped rather than shrunk further — the
              icon+name pair now reads as one combined column with no
              label of its own. The cell stays in the DOM (empty) so the
              grid still has 4 tracks and Channel Name/Followers/Type stay
              aligned with their real columns below. */}
          <span></span>
          <span>Channel Name</span>
          <span className={pageStyles.blockColumnTitleFollowers}>Followers</span>
          <span>Type</span>
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
                      text itself isn't in the DOM.
                      Round 350 — "move the channel name column before the
                      followers column": name now comes right after the
                      platform icon, followers moved after it — see the
                      matching .row grid-template-columns reorder in the
                      CSS. */}
                  <span className={pageStyles.rowPlatform} title={c.platform || undefined}>
                    <PlatformIcon platform={c.platform} />
                  </span>
                  <span className={pageStyles.rowName}>{c.name}</span>
                  <span className={pageStyles.rowFollowers}>
                    {formatFollowers(c.follower_count)}
                    {/* Round 367 — "use a small followers as a unit right
                        next to the number": desktop already labels this
                        column via .blockColumnTitles ("Followers"), so
                        this unit text is mobile-only (see
                        .rowFollowersUnit's default display:none, switched
                        on only inside the <=480px media query). */}
                    <span className={pageStyles.rowFollowersUnit}>followers</span>
                  </span>
                  {c.note && (
                    // Round 353 — note's column is now a fixed width
                    // (see .rowNote in the CSS) so the follower column
                    // next to it stays aligned down the block; title=
                    // keeps the untruncated text reachable on hover for
                    // a note long enough to get ellipsized.
                    <span
                      className={pageStyles.rowNote}
                      style={{ background: noteColor.bg, color: noteColor.fg }}
                      title={c.note}
                    >
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
                  <p key={i} className={pageStyles.introParagraph}>{renderBoldText(paragraph)}</p>
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
              // Round 354 — the per-platform accent/tint (see .row's
              // --tile-accent / --tile-accent-bg custom properties in the
              // CSS) is passed as inline style rather than a per-platform
              // CSS class so PLATFORM_COLORS stays the one place these
              // colors are defined; a tile with no match (External, or an
              // unrecognized platform) just gets no override and falls
              // back to the plain default look already in the CSS.
              <a
                key={tile.key}
                href={tile.anchor}
                className={pageStyles.platformStripItem}
                style={
                  tile.colors
                    ? { "--tile-accent": tile.colors.accent, "--tile-accent-bg": tile.colors.accentBg }
                    : undefined
                }
              >
                <div className={pageStyles.platformStripPlatform}>{tile.label}</div>
                <div className={pageStyles.platformStripCount}>
                  {tile.count == null ? "…" : `${tile.count} ${tile.count === 1 ? "channel" : "channels"}`}
                </div>
                {tile.sub && <div className={pageStyles.platformStripFollowers}>{tile.sub}</div>}
              </a>
            ))}
          </div>
        )}

        {/* Round 346 — "under the counter is the channel reference list" —
            id="channel-list" is the scroll target for the 5 platform
            counter tiles above.
            Round 364 — "split into 2 group: OFFICIAL CHANNEL... COMMUNITY
            CHANNEL": OFFICIAL_GROUPS (VIEENT - SOCIAL, ENVI) render in
            their own section first, above the existing 3-column
            COLUMN_META layout (now labeled COMMUNITY CHANNEL) — same
            never-render-an-empty-section guard as everywhere else on this
            page (officialGroupsPresent.length check below). */}
        <div id="channel-list">
          {(() => {
            const officialGroupsPresent = OFFICIAL_GROUPS.filter((g) => (channelsByGroup[g]?.length || 0) > 0);
            if (officialGroupsPresent.length === 0) return null;
            return (
              <div className={pageStyles.topSection}>
                <div className={pageStyles.topSectionTitle}>Official Channel</div>
                <div className={pageStyles.officialGrid}>
                  {officialGroupsPresent.map((group) => renderGroupBlock(group))}
                </div>
              </div>
            );
          })()}

          <div className={pageStyles.topSectionTitle}>Community Channel</div>
          <div className={pageStyles.grid}>
          {COLUMN_META.map((col) => {
            const colGroups = col.groups.filter((g) => (channelsByGroup[g]?.length || 0) > 0);
            if (colGroups.length === 0) return null;
            return (
              // Round 368 — col.label can now be "" (see COLUMN_META
              // above), so the key uses the column's groups instead of
              // its label to stay unique, and the heading itself only
              // renders when there's actually a label to show.
              <div key={col.groups.join("|")} className={pageStyles.column}>
                {col.label && <div className={pageStyles.columnTitle}>{col.label}</div>}
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

          {/* Round 368 — "not new column, new group entirely like
              community and official channel, please make change": TikTok
              Channels is its own top-level section (a peer of Official
              Channel/Community Channel above), not a 4th COLUMN_META
              column squeezed into Community Channel's grid. Reuses
              .grid/.column the same way Community Channel does — each of
              the 3 TIKTOK_GROUPS gets its own column, one group per
              column (no sub-stacking, unlike COLUMN_META's columns). */}
          {(() => {
            const tiktokGroupsPresent = TIKTOK_GROUPS.filter((g) => (channelsByGroup[g]?.length || 0) > 0);
            if (tiktokGroupsPresent.length === 0) return null;
            return (
              <div className={pageStyles.topSection} style={{ marginTop: 24 }}>
                <div className={pageStyles.topSectionTitle}>TikTok Channels</div>
                <div className={pageStyles.grid}>
                  {tiktokGroupsPresent.map((group) => (
                    <div key={group} className={pageStyles.column}>
                      {renderGroupBlock(group)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Round 346 — "then under there is the fetch table, and under
            the fetch table is still click for detail button we have" —
            the Round 339/345 Google Sheet preview. id="sheet-preview" is
            the scroll target for the External counter tile above.
            Round 350 — "above the external table we fetch, add the
            badge name... And wrap or move the click for more detail to
            be closer to the table so it would mean it belong to the
            table": rendered unconditionally now (not gated behind
            intro.sheetUrl) so the badge + detail button are always
            reachable here even before a sheet URL is configured, same
            never-silently-drop fallback the rest of this section already
            used for a missing sheetUrl.
            Round 351 — "make the badge bigger. so that it becomes an
            equal to others table": the small pill from Round 350 is now
            a real section header — "Distribution Support - Media Booking
            2026" as the big/bold title, with the sheet's own merged
            title (sheetTitleLines — "HỖ TRỢ 10%...\nNhận booking lẻ...")
            demoted to a subtitle underneath it, sized the way
            .sheetTitleMain/.sheetTitleSub used to inside the table's own
            thead. Since that content now lives up here, the table's
            <thead> no longer repeats it as a spanning title row (that
            would just be the same two lines shown twice, right on top of
            each other) — sheetTitleLines skips straight to the real
            per-column header row (or, for this sheet, straight into
            tbody, since its "header" row IS the merged title). */}
        <div id="sheet-preview" className={pageStyles.sheetSection}>
          <div className={pageStyles.sheetSectionHeader}>
            <div className={pageStyles.sheetSectionTitle}>Distribution Support - Media Booking 2026</div>
            {sheetTitleLines && (
              <div className={pageStyles.sheetSectionSubtitle}>
                {sheetTitleLines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
            {/* Round 357 — "the auto fetch, run a fetch every day at
            8:00": visible proof the daily cron is actually running, not
            just a number that might be live or might be stale with no
            way to tell. sheetSnapshot is null until the cron has fired
            at least once (right after this round ships), so this line
            just doesn't render yet rather than showing a fake time. */}
            {sheetSnapshot && sheetSnapshot.sheetUrl === intro.sheetUrl && (
              <div className={pageStyles.sheetSectionMeta}>
                Auto-refreshed daily at 08:00 · last: {formatAutoRefreshedAt(sheetSnapshot.fetchedAt)}
              </div>
            )}
          </div>
          {intro.sheetUrl ? (
            <>
              {sheetLoading && !sheetData && (
                <div className={pageStyles.sheetStatus}>Loading sheet…</div>
              )}
              {sheetError && (
                <div className={pageStyles.sheetStatus}>{sheetError}</div>
              )}
              {sheetData && sheetData.rows.length > 0 && (
                <div className={pageStyles.sheetTableWrap}>
                  <table className={pageStyles.sheetTable}>
                    {!sheetTitleLines && (
                      <thead>
                        <tr>
                          {sheetData.headers.map((h, i) => (
                            <th key={i}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                    )}
                    <tbody>
                      {sheetData.rows.map((row, i) => (
                        // Round 348/349 — "put a title color for the row
                        // of the column title row like the one with
                        // CAPCUT 1, CAPCUT 2... or BIG CHANNEL 1, BIG
                        // CHANNEL 2": detected structurally (see
                        // isColumnTitleRow above) instead of assuming
                        // it's only body row 0 — this sheet repeats the
                        // title-row/4-data-rows pattern once per section,
                        // so every such row gets the highlight, not just
                        // the first.
                        <tr
                          key={i}
                          className={isColumnTitleRow(row) ? pageStyles.sheetColumnTitleRow : undefined}
                        >
                          {row.map((cell, j) => (
                            <td key={j}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Round 342 — still applies: only show this when it
                  points somewhere different from the detail link below. */}
              {intro.sheetUrl !== distributionRow?.url && (
                <a href={intro.sheetUrl} target="_blank" rel="noopener noreferrer" className={pageStyles.introCanvaLink}>
                  View full sheet →
                </a>
              )}
            </>
          ) : (
            <div className={pageStyles.sheetStatus}>No sheet configured yet — add a Google Sheet URL in Magic Link Intro.</div>
          )}

          {/* Round 350 — moved from its own standalone block into this
              section so it visually reads as belonging to this table,
              not a separate unrelated button floating below it. Still
              independent of whether a sheet URL is configured — it's the
              Distribution Support row's own redirect link, not sourced
              from the sheet fetch.
              Round 371 — "change the button of Distribution Support...
              'clicking for more detail' to be like that of Ratecard Ads
              (just a line no button)": swapped from .distributionDetailLink
              (bordered button chrome) to .introCanvaLink, the same plain
              text-link style the "View full sheet →" links already use
              in both sheet sections. .distributionDetailLink itself is
              now unused (kept in the CSS rather than deleted, in case a
              future button-style link elsewhere wants to reuse it). */}
          {distributionRow?.url && (
            <a
              href={distributionRow.url}
              target="_blank"
              rel="noopener noreferrer"
              className={pageStyles.introCanvaLink}
            >
              Click for more detail →
            </a>
          )}
        </div>

        {/* Round 365 — "add this one under the Distribution Support -
            Media Booking 2026 table. it's from same spread sheet just
            different sheet of that table" — Ratecard Ads, a second sheet
            embed just below the first one. Unlike the Distribution
            Support section above (which always renders — it's also home
            to that group's own "Click for more detail" redirect button),
            this one is gated entirely behind intro.sheetUrl2 being set:
            there's no other always-relevant content living in this
            section, so an unconfigured second sheet just means nothing
            renders here at all rather than an empty card. */}
        {intro.sheetUrl2 && (
          <div className={pageStyles.sheetSection}>
            <div className={pageStyles.sheetSectionHeader}>
              <div className={pageStyles.sheetSectionTitle}>Ratecard Ads</div>
              {sheetTitleLines2 && (
                <div className={pageStyles.sheetSectionSubtitle}>
                  {sheetTitleLines2.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
            {sheetLoading2 && !sheetData2 && (
              <div className={pageStyles.sheetStatus}>Loading sheet…</div>
            )}
            {sheetError2 && (
              <div className={pageStyles.sheetStatus}>{sheetError2}</div>
            )}
            {sheetData2 && sheetData2.rows.length > 0 && (
              <div className={pageStyles.sheetTableWrap}>
                <table className={pageStyles.sheetTable}>
                  {!sheetTitleLines2 && (
                    <thead>
                      <tr>
                        {sheetData2.headers.map((h, i) => (
                          <th key={i}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {/* Round 368 — "the orange text rule is not needed for
                        it [Ratecard Ads]. I guess i will fix each
                        external embed table individually so the rule
                        apply correctly": isColumnTitleRow's blank-first-
                        cell heuristic was written for the Distribution
                        Support sheet's own layout (see that function's
                        Round 349 comment) and doesn't mean the same thing
                        in this sheet — so this table no longer runs rows
                        through it at all, unlike the Distribution Support
                        table above which is unchanged. */}
                    {sheetData2.rows.map((row, i) => {
                      // Round 370 — see isRatecardYoutubeMergeRow above:
                      // this one row's 2nd cell is a merged cell in the
                      // real sheet (5 columns, counting itself), flattened
                      // by the CSV export into one long-text cell followed
                      // by blanks — rendered here with a real colSpan
                      // instead of 4 empty <td>s trailing it.
                      if (isRatecardYoutubeMergeRow(row)) {
                        const start = findRatecardMergeStart(row);
                        if (start !== -1) {
                          const mergeSpan = Math.min(5, row.length - start);
                          const before = row.slice(0, start);
                          const after = row.slice(start + mergeSpan);
                          return (
                            <tr key={i}>
                              {before.map((cell, j) => (
                                <td key={j}>{cell}</td>
                              ))}
                              <td colSpan={mergeSpan}>{row[start]}</td>
                              {after.map((cell, j) => (
                                <td key={start + mergeSpan + j}>{cell}</td>
                              ))}
                            </tr>
                          );
                        }
                      }
                      return (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j}>{cell}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <a href={intro.sheetUrl2} target="_blank" rel="noopener noreferrer" className={pageStyles.introCanvaLink}>
              View full sheet →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
