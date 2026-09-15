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
// channel list (below that, unchanged). Same one-row JSON blob as before,
// just one more key — no migration needed since `value` is jsonb.
export const CHANNEL_REFERENCE_INTRO_KEY = "channel_reference_intro";

// Returns { title, text, canvaUrl } (all "" if unset/unreachable) — every
// call site treats blank as "nothing to show," so a missing row fails
// safely open to just not rendering the block, same fail-open shape
// readMagicLinkThemeLock uses.
export async function readChannelReferenceIntro(supabase) {
  if (!supabase) return { title: "", text: "", canvaUrl: "" };
  try {
    const { data } = await supabase.from("global_settings").select("value").eq("key", CHANNEL_REFERENCE_INTRO_KEY).maybeSingle();
    return { title: data?.value?.title || "", text: data?.value?.text || "", canvaUrl: data?.value?.canvaUrl || "" };
  } catch {
    return { title: "", text: "", canvaUrl: "" };
  }
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
