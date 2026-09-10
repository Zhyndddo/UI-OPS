// Round 280 — extracted out of app/releases/[id]/page.js (where these two
// consts used to live, unexported) so the new Bổ Sung DATA ticket type can
// read the exact same "Metadata Checklist" field list/required set instead
// of duplicating it — the release detail page's Metadata Checklist section
// and this ticket type are two views onto the SAME release columns, not two
// copies of similar data (see app/tickets/bo-sung-data/page.js). Values are
// tri-state strings, matching lib/GateFields.js's GateToggle: "true" (Yes),
// "false" (No), "update" (TBU), or null/undefined (never touched — same as
// "false" for display, per GateToggle's `value={form[m.key] || "false"}`
// fallback, but distinct for "has anyone even looked at this" purposes).
export const META_ITEMS = [
  { key: "meta_audio", label: "Audio" },
  { key: "meta_artwork", label: "Artwork" },
  { key: "meta_working_files", label: "Working Files" },
  { key: "meta_lyric", label: "Lyric" },
  { key: "meta_mv", label: "MV" },
  { key: "meta_doc", label: "Metadata" },
];

// Send Upload only actually needs these 4 — Working Files and MV are
// tracked for completeness but don't gate the ticket (release page) or the
// Bổ Sung DATA auto-complete rule (this ticket type).
export const REQUIRED_META_KEYS = ["meta_audio", "meta_artwork", "meta_lyric", "meta_doc"];

// A field counts as "resolved" once someone has made a real decision on it
// — for a required field that means Yes specifically (matches Send
// Upload's gate); for an optional one, Yes OR No both count (TBU/blank
// don't — "not decided yet" isn't the same as "decided, not needed").
export function isMetaFieldResolved(key, value) {
  if (REQUIRED_META_KEYS.includes(key)) return value === "true";
  return value === "true" || value === "false";
}

// Every META_ITEMS key not yet resolved on this release — the "missing
// data" tag list Bổ Sung DATA shows per row, and the reconciliation check
// that decides when a ticket auto-completes. Reads the release row
// directly (whatever `release` object the caller already has), so it's
// always checked against the CURRENT product data, not a snapshot taken
// at ticket-creation time.
export function missingMetaKeys(release) {
  if (!release) return META_ITEMS.map((m) => m.key);
  return META_ITEMS.filter((m) => !isMetaFieldResolved(m.key, release[m.key])).map((m) => m.key);
}
