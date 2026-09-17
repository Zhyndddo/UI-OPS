// Round 317 — configurable intro text block for the Channel Reference
// magic link (/channels/[token]), per explicit request ("a configable
// text block, config in the channel reference table as per the team
// request"). Same "one global_settings row, no new table" idiom as
// lib/magicLinkThemeLock.js — this is one shared block for every viewer
// of that link, not per-token/per-viewer, edited from the Booking
// Channels admin page (app/booking-channels/page.js) and read by the
// public magic link page. The public/anon Supabase client already has
// read access to global_settings (see magicLinkThemeLock.js's own note —
// both magic link pages already query it for other settings).
// Round 327 — added `title`, and canvaUrl is now rendered as a live embed
// (not just an outbound link) when it's an actual Canva URL. Explicit
// request: "a form, so that i can put what i like up there" — title (top),
// intro paragraph (below title), Canva embed (below that), existing
// channel list (below that, unchanged).
//
// Round 329 — BUG FIX: nothing saved here was ever actually showing up on
// the public link ("i saved the intro but it's not showing"). Root cause:
// global_settings.value is a plain `text` column in production (see
// sql/reference/prod_schema_clean.sql — `value text`, not jsonb), same as
// every OTHER global_settings-backed setting in this app (see
// lib/troGiaBooking.js's header comment, and app/config/page.js's several
// other settings, which all JSON.stringify before writing and JSON.parse
// after reading for exactly this reason). This file (and
// lib/magicLinkThemeLock.js, fixed alongside it) was written against the
// wrong assumption — reading `data.value.title` off a raw string always
// silently returns undefined (a string has no such property), so the
// block never rendered no matter what was saved, and writing a raw JS
// object into a text column never stored anything read-back-able either.
// Fixed by parsing/stringifying explicitly, matching the rest of the app.
export const CHANNEL_REFERENCE_INTRO_KEY = "channel_reference_intro";

// Round 339 — added `sheetUrl`: a public Google Sheet ("i can ask them for
// a public link") whose one tab gets embedded as a native table on the
// magic link, per explicit spec (render our own styled table, not
// Google's iframe; click-through goes to the exact URL pasted here; data
// is fetched live on every page load — see app/api/channel-reference-
// sheet/route.js). Stored as the raw URL the admin pastes (the normal
// .../edit?gid=...#gid=... link copied straight out of the browser) —
// parseGoogleSheetUrl below pulls the spreadsheet id + gid out of it both
// for the live fetch and to double as the "view details" link target, so
// there's only one field to configure, not a separate embed-vs-link pair.
//
// Round 365 — added `sheetUrl2`: a SECOND sheet tab to embed the same way
// as `sheetUrl`, per explicit request ("add this one under the
// Distribution Support - Media Booking 2026 table. it's from same spread
// sheet just different sheet of that table" — the Ratecard Ads tab).
// Deliberately just one more flat field, not an array — this page has
// exactly 2 fixed sheet slots by design (Distribution Support, Ratecard
// Ads), not an open-ended list of sheets, so a fixed second field matches
// the actual shape of the request instead of over-generalizing for a
// "however many sheets" case nobody asked for.
//
// Returns { title, text, canvaUrl, sheetUrl, sheetUrl2 } (all "" if
// unset/unreachable/unparseable) — every call site treats blank as
// "nothing to show," so a missing or malformed row fails safely open to
// just not rendering the block, same fail-open shape
// readMagicLinkThemeLock uses.
export async function readChannelReferenceIntro(supabase) {
  if (!supabase) return { title: "", text: "", canvaUrl: "", sheetUrl: "", sheetUrl2: "" };
  try {
    const { data } = await supabase.from("global_settings").select("value").eq("key", CHANNEL_REFERENCE_INTRO_KEY).maybeSingle();
    const parsed = data?.value ? JSON.parse(data.value) : null;
    return {
      title: parsed?.title || "",
      text: parsed?.text || "",
      canvaUrl: parsed?.canvaUrl || "",
      sheetUrl: parsed?.sheetUrl || "",
      sheetUrl2: parsed?.sheetUrl2 || "",
    };
  } catch {
    return { title: "", text: "", canvaUrl: "", sheetUrl: "", sheetUrl2: "" };
  }
}

// Serializes { title, text, canvaUrl, sheetUrl, sheetUrl2 } for writing
// back into global_settings.value — the `text`-column counterpart to the
// JSON.parse above. Callers pass this as the `value` in their upsert.
export function serializeChannelReferenceIntro(intro) {
  return JSON.stringify({
    title: intro.title || "",
    text: intro.text || "",
    canvaUrl: intro.canvaUrl || "",
    sheetUrl: intro.sheetUrl || "",
    sheetUrl2: intro.sheetUrl2 || "",
  });
}

// Round 339 — pulls { spreadsheetId, gid } out of any of the URL shapes
// Google actually hands you for a sheet: the normal edit link with a
// "#gid=..." hash (what you get copying straight from the address bar),
// one with "?gid=..." as a query param instead, or a bare
// ".../d/<id>/edit" with no gid at all (defaults to gid "0", Sheets' own
// convention for a spreadsheet's first tab). Returns null for anything
// that isn't a docs.google.com/spreadsheets URL at all, so callers can
// fail safely closed rather than trying to fetch an arbitrary site.
export function parseGoogleSheetUrl(rawUrl) {
  if (!rawUrl) return null;
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!/(^|\.)docs\.google\.com$/.test(u.hostname)) return null;
  const idMatch = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const hashParams = new URLSearchParams(u.hash.replace(/^#/, ""));
  const gid = u.searchParams.get("gid") || hashParams.get("gid") || "0";
  return { spreadsheetId: idMatch[1], gid };
}

// Rewrites a Canva share/view URL into Canva's iframe-embed form so it
// renders live instead of just linking out. Canva's own embed convention:
// the design's `/view` URL with an `embed` query flag appended
// (https://www.canva.com/design/<id>/<secret>/view?embed — see Canva's
// "Embed a design" docs). Anything not on canva.com returns null so the
// caller can fall back to a plain outbound link instead of iframing an
// arbitrary site (most non-Canva sites block iframing anyway via
// X-Frame-Options/CSP, so a fake embed would just render blank).
export function toCanvaEmbedUrl(rawUrl) {
  if (!rawUrl) return null;
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!/(^|\.)canva\.com$/.test(u.hostname)) return null;
  if (!/\/view\/?$/.test(u.pathname)) {
    u.pathname = `${u.pathname.replace(/\/$/, "")}/view`;
  }
  if (!u.searchParams.has("embed")) {
    return `${u.origin}${u.pathname}${u.search ? `${u.search}&embed` : "?embed"}`;
  }
  return u.toString();
}
