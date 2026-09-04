// Round 91 — small shared home for external-tool link defaults that are
// admin-editable via Config → External Tool Links (app/config/page.js,
// ArtistProfileLinksSection), same app_settings row (key
// "artist_profile_links") the Spotify/Apple Music/Discovery Mode links
// already live in. Pulled out to its own lib file (rather than exported
// from app/config/page.js directly) so a consuming page — Booking Board —
// doesn't need to import from another route's page.js.
export const ARTIST_PROFILE_LINKS_SETTING_KEY = "artist_profile_links";

// Booking Board's "🔗 Linkfire" button falls back to this if the setting
// row hasn't been saved yet (brand-new installs, or before anyone's opened
// Config → External Tool Links) — keep in sync with whatever's actually
// saved there once an admin edits it.
export const DEFAULT_LINKFIRE_URL = "https://app.linkfire.com/#/vieent-music";
