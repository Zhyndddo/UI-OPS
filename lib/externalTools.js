// Round 91 — small shared home for external-tool link defaults that are
// admin-editable via Config → External Tool Links (app/config/page.js,
// ArtistProfileLinksSection), same app_settings row (key
// "artist_profile_links") the Spotify/Apple Music/Discovery Mode links
// already live in. Pulled out to its own lib file (rather than exported
// from app/config/page.js directly) so a consuming page — Booking Board —
// doesn't need to import from another route's page.js.
export const ARTIST_PROFILE_LINKS_SETTING_KEY = "artist_profile_links";

// Booking Board's / Media Booking ticket's "🔗 Short Links" button falls
// back to this if the setting row hasn't been saved yet (brand-new
// installs, or before anyone's opened Tools Directory → the "Short Links
// Tool" card under Artist Profile) — keep in sync with whatever's actually
// saved there once a dev edits it.
//
// Round 413 — switched from Linkfire's own dashboard to the team's own
// internal short-link tool, per explicit report ("since we change to
// shortlink recently"). The constant name (and the app_settings field key,
// "linkfire") are both kept as-is rather than renamed, to avoid touching
// every read site (app/booking/page.js, app/tickets/media-booking/page.js,
// this row's shape itself) for a cosmetic rename — only the VALUE changed.
// Any already-saved app_settings row still holds the old Linkfire URL
// until a dev re-saves it (via the Tools Directory card above) or the
// migration in sql/pending/add-round413-shortlinks-url.sql is run.
export const DEFAULT_LINKFIRE_URL = "https://internal.vieent.com/short-links";
