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
export const CHANNEL_REFERENCE_INTRO_KEY = "channel_reference_intro";

// Returns { text, canvaUrl } (both "" if unset/unreachable) — every call
// site treats blank as "nothing to show," so a missing row fails safely
// open to just not rendering the block, same fail-open shape
// readMagicLinkThemeLock uses.
export async function readChannelReferenceIntro(supabase) {
  if (!supabase) return { text: "", canvaUrl: "" };
  try {
    const { data } = await supabase.from("global_settings").select("value").eq("key", CHANNEL_REFERENCE_INTRO_KEY).maybeSingle();
    return { text: data?.value?.text || "", canvaUrl: data?.value?.canvaUrl || "" };
  } catch {
    return { text: "", canvaUrl: "" };
  }
}
