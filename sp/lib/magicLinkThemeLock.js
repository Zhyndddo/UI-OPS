// Round 233/234 — dev-configurable theme lock for the magic links this
// app sends out to people outside the team (Performance report share,
// Package / Media Report offer). Round 233 first shipped this as one
// lock per link; per explicit correction, it's one single switch that
// applies to every send-out uniformly instead — the point is that
// external recipients see a consistent look regardless of which link
// they got, not a per-link choice. (To be precise about the thing this
// replaces: it was never really "depends on who created the link" —
// lib/ThemeContext.js's theme comes from the VISITOR's own browser
// localStorage, not the sender's. In practice that means most outside
// recipients — who've never opened this app before — were already just
// seeing the plain default (dark), and only a rare recipient with their
// own saved preference, e.g. a team member testing the link themselves,
// would see something else. This switch removes that inconsistency
// entirely rather than trying to pin it per link.)
//
// Stored as one global_settings row (key below), same idiom as every
// other site-wide setting in this app (Tro Gia Booking, Tool Directory,
// Pitching extra services, etc.) — no new table needed, and the
// public/anon Supabase client already has read access to global_settings
// (both magic link pages query it directly today for other settings).
//
// "zhyn" (Cosmic) is deliberately NOT offered as a lockable value here —
// it's gated to one specific account (see lib/AuthContext.js) as a
// personal theme, not something to send out to external recipients.
export const MAGIC_LINK_THEME_LOCK_KEY = "magic_link_theme_lock";

export const LOCKABLE_THEMES = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

const VALID_VALUES = LOCKABLE_THEMES.map((t) => t.value);

// Returns a valid theme string, or null if unset/invalid/unreachable —
// every call site treats null as "no lock," so a missing row or a bad
// value both fail safely open to the normal per-visitor theme rather
// than breaking the page.
export async function readMagicLinkThemeLock(supabase) {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from("global_settings").select("value").eq("key", MAGIC_LINK_THEME_LOCK_KEY).maybeSingle();
    const value = data?.value?.theme;
    return VALID_VALUES.includes(value) ? value : null;
  } catch {
    return null;
  }
}
