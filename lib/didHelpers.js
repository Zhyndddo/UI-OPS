// DID (Release ID) computation, shared between the New Release create form
// (a live preview before the real DB-assigned DID exists) and the release
// detail page (round 86 follow-up item 7 — re-deriving the prefix on
// Save). Mirrors _field_initials()/set_release_did() in schema.sql exactly,
// minus the sequence suffix (that part is DB-only at creation time, by
// design — see set_release_did()'s comment). Keep this in sync if the SQL
// rule ever changes.
export function fieldInitials(field) {
  const words = (field || "").trim().split(/\s+/).filter(Boolean);
  const letterFor = (w) => {
    if (!w) return "#";
    if (w.includes("-")) return "#";
    return w[0].toUpperCase();
  };
  return letterFor(words[0]) + letterFor(words[1]);
}

// Live preview shown while creating a release, before a real DID exists —
// title/artist initials + release date, with a "####" placeholder standing
// in for the sequence suffix the DB trigger will assign on insert.
export function didPreview(title, mainArtist, releaseDate) {
  const titleInit = fieldInitials(title);
  const artistInit = fieldInitials(mainArtist);
  const datePart = releaseDate ? releaseDate.split("-").reverse().join("") : "--------"; // input value is YYYY-MM-DD → DDMMYYYY
  return `${titleInit}${artistInit}-${datePart}-####`;
}

// Same computation as didPreview, minus the trailing "-####" placeholder —
// exactly what set_release_did() in schema.sql writes before its own
// DB-assigned numeric suffix. Returns null until there's enough to compute
// a real (non-placeholder) prefix.
export function didPrefixFor(title, mainArtist, releaseDate) {
  if (!title?.trim() || !mainArtist?.trim() || !releaseDate) return null;
  const titleInit = fieldInitials(title);
  const artistInit = fieldInitials(mainArtist);
  const datePart = releaseDate.split("-").reverse().join("");
  return `${titleInit}${artistInit}-${datePart}`;
}

// Round 86 follow-up item 7 — re-derives a DID's PREFIX (title+artist
// initials + release date) from the CURRENT field values, while keeping
// the existing trailing sequence suffix untouched. Per explicit request:
// title/release date sometimes change after creation and the original
// snapshot stops reflecting reality; recomputing automatically on every
// regular Save (not a separate opt-in action) is what the team wants,
// explicitly accepting that this breaks the DID's earlier documented
// "never changes after creation" guarantee (see set_release_did()'s
// comment in schema.sql). Since most ticket types store this DID as a
// point-in-time snapshot string (not a live foreign key), the caller is
// responsible for migrating any existing tickets' stored DID too when
// this returns a different value — see saveTab() in
// app/releases/[id]/page.js.
//
// Returns the unchanged did if a new prefix can't be computed yet
// (title/artist/date still incomplete), if there's no did to begin with,
// or if the newly-derived prefix is identical to the current one (no
// pointless write/migration).
export function recomputeDid(currentDid, title, mainArtist, releaseDate) {
  if (!currentDid) return currentDid;
  const newPrefix = didPrefixFor(title, mainArtist, releaseDate);
  if (!newPrefix) return currentDid;
  const lastDash = currentDid.lastIndexOf("-");
  if (lastDash === -1) return currentDid;
  const suffix = currentDid.slice(lastDash + 1);
  const currentPrefix = currentDid.slice(0, lastDash);
  if (currentPrefix === newPrefix) return currentDid;
  return `${newPrefix}-${suffix}`;
}
