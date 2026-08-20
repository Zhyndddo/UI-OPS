"use client";

// Round 166 — Artist Profile request-type redesign, per explicit spec:
// the ticket type used to be one flat shape (Tên Nghệ Sĩ/Email/Spotify
// URL/Apple URL/Facebook URL/Note/PIC/Deadline/Status, "set up on which
// platforms" as a 3-way checkbox group) covering every kind of ask. The
// real workflow has 7 distinct request types across up to 7 platforms,
// each needing different fields — this file is the single source of
// truth for that shape, consumed by both the bespoke creation form
// (app/tickets/artist-profile/new/page.js) and the bespoke list page
// (app/tickets/artist-profile/page.js), same "one config, two renderers"
// pattern the rest of this app uses (see lib/ticketConfigs.js).
//
// Deliberately NOT built this round (explicit request — "just acknowledge
// for now, I will lay it out later"):
//   - Add Song's "does the artist already have a profile/tab on this
//     platform?" Yes/No gate (spec: NO -> blocked, told to go create a
//     NEW profile first instead).
//   - Gộp Profile's name-match validation (spec: the two profiles being
//     merged must show the exact same artist name, e.g. "Nguyễn Văn
//     Chung" == "Nguyễn Văn Chung" but != "Nguyen Van Chung").
// Both request types' FIELDS exist below so the form/list already collect
// the right data — just no blocking/validation logic wired to them yet.
//
// Every ticket's `data.requestType` is one of REQUEST_TYPE_KEYS below.
// Legacy tickets created before this round (either via the old manual
// form, or auto-created from the release detail page's "Artist Profile
// Verify" gate — that gate flow is UNCHANGED this round, still creates
// the old flat shape with no requestType) have `data.requestType`
// undefined — treated as "new" (NEW Profile) for display purposes
// everywhere below, since that's the closest match to what that gate
// always meant ("set this artist up"), and their old spotifyUrl/appleUrl/
// fbUrl/latestSong fields still read back fine under the new field keys
// where they overlap (see LEGACY_FIELD_FALLBACK below).

export const REQUEST_TYPES = [
  { key: "verification", label: "Artist Verification", group: "new" },
  { key: "new", label: "NEW Profile", group: "new" },
  { key: "update_bio", label: "Update Ảnh & Bio", group: "management" },
  { key: "add_song", label: "Add Song", group: "management" },
  { key: "remove_song", label: "Remove Song", group: "management" },
  { key: "merge", label: "Gộp Profile", group: "management" },
  { key: "transfer", label: "Chuyển Profile", group: "management" },
];

export const REQUEST_TYPE_KEYS = REQUEST_TYPES.map((t) => t.key);

export function requestTypeLabel(key) {
  return REQUEST_TYPES.find((t) => t.key === key)?.label || key || "—";
}

// Full platform vocabulary — was 3 (Spotify/Tiktok/Apple), now 7. Youtube
// is explicitly scoped to in-net channels only per spec ("youtube chỉ áp
// dụng kênh trong net") — kept as a note on the label rather than a
// separate field, since there's no other kind of Youtube channel this
// ticket type would ever be about.
export const ALL_PLATFORMS = [
  ["spotify", "Spotify"],
  ["apple", "Apple"],
  ["tiktok", "Tiktok"],
  ["facebook", "Facebook"],
  ["youtube", "Youtube (kênh trong net)"],
  ["zing", "Zing"],
  ["nct", "NCT"],
];

// Which platforms are valid for each request type — Verification is
// Spotify/Apple/Tiktok only, NEW is those 3 plus NCT/Zing/Youtube (6),
// every Management action (Update/Add/Remove/Merge/Transfer) is all 7.
export const PLATFORMS_BY_REQUEST_TYPE = {
  verification: ["spotify", "apple", "tiktok"],
  new: ["spotify", "apple", "tiktok", "nct", "zing", "youtube"],
  update_bio: ALL_PLATFORMS.map(([k]) => k),
  add_song: ALL_PLATFORMS.map(([k]) => k),
  remove_song: ALL_PLATFORMS.map(([k]) => k),
  merge: ALL_PLATFORMS.map(([k]) => k),
  transfer: ALL_PLATFORMS.map(([k]) => k),
};

export function platformOptionsForType(requestType) {
  const allowed = new Set(PLATFORMS_BY_REQUEST_TYPE[requestType] || ALL_PLATFORMS.map(([k]) => k));
  return ALL_PLATFORMS.filter(([k]) => allowed.has(k));
}

// Per-type extra fields, beyond the shared platform picker every type has.
// `key` is the data.<key> this writes to; kept distinct across types (see
// file header) so nothing collides if a ticket somehow got re-typed later.
// type: "text" | "url" | "select" (Yes/No-style) | "textarea".
export const FIELDS_BY_REQUEST_TYPE = {
  verification: [
    { key: "artistName", label: "Tên Nghệ Sĩ", type: "text", required: true },
    { key: "profileLink", label: "Link Profile Cần Verify", type: "url", required: true },
    { key: "email", label: "Email Nghệ Sĩ", type: "text", required: true },
  ],
  new: [
    { key: "artistName", label: "Tên Nghệ Sĩ", type: "text", required: true },
    { key: "socialLink", label: "Link Social (FB / Tiktok / Youtube)", type: "url", required: true },
    { key: "photoBioLink", label: "Link Hình Ảnh & Bio", type: "url", required: true },
    { key: "latestSong", label: "Bài Đã Phát Hành Gần Nhất", type: "text" },
  ],
  update_bio: [
    { key: "artistName", label: "Tên Nghệ Sĩ", type: "text", required: true },
    { key: "profileLink", label: "Link Profile", type: "url", required: true },
    { key: "photoBioLink", label: "File/Link Hình & Bio", type: "url", required: true },
  ],
  add_song: [
    { key: "artistName", label: "Tên Nghệ Sĩ", type: "text", required: true },
    { key: "profileLink", label: "Link Profile", type: "url", required: true },
    { key: "songLink", label: "Link Bài Hát Cần Map", type: "url", required: true },
    // Informational only this round — see file header. Not a blocking gate
    // yet, just captured so it's on record when the real gate gets built.
    { key: "hasExistingProfile", label: "Nghệ sĩ đã có profile/tab nhạc trên nền tảng này? (chưa chặn — ghi nhận)", type: "select", options: ["", "Yes", "No"] },
  ],
  remove_song: [
    { key: "artistName", label: "Tên Nghệ Sĩ", type: "text", required: true },
    { key: "profileLink", label: "Link Profile", type: "url", required: true },
    { key: "songLinkRemove", label: "Link Bài Hát Cần Remove", type: "url", required: true },
  ],
  merge: [
    { key: "artistName", label: "Tên Nghệ Sĩ", type: "text", required: true },
    { key: "wrongProfileLink", label: "Link Profile Sai", type: "url", required: true },
    { key: "correctProfileLink", label: "Link Profile Đúng", type: "url", required: true },
    // "cho add nhiều link" — free textarea, one link per line, rather than
    // a repeating-input widget this app has no existing pattern for
    // (Manual Claim's URL field uses the same one-link-per-line textarea
    // idiom for the same reason — see lib/ticketConfigs.js's manual_claim
    // multiline url field).
    { key: "mergeSongLinks", label: "Link Bài Hát Cần Gộp Về Profile Đúng (mỗi link 1 dòng)", type: "textarea", required: true, multiline: true },
  ],
  transfer: [
    { key: "oldStageName", label: "Tên Nghệ Danh Cũ", type: "text", required: true },
    { key: "newStageName", label: "Tên Nghệ Danh Mới", type: "text", required: true },
    { key: "oldProfileLink", label: "Link Profile Cũ", type: "url", required: true },
    { key: "newProfileLink", label: "Link Profile Mới", type: "url", required: true },
  ],
};

export function fieldsForType(requestType) {
  return FIELDS_BY_REQUEST_TYPE[requestType] || FIELDS_BY_REQUEST_TYPE.new;
}

// Legacy tickets (data.requestType undefined) were always shaped like
// today's "new" fields, just under slightly different keys for 2 of them
// (spotifyUrl/appleUrl/fbUrl never really existed as 3 separate fields in
// the new model — they collapse into one platform + one profileLink/
// socialLink now). Rather than a data migration, the list page reads
// these as a display-only fallback so old tickets keep showing something
// sensible instead of blank cells; nothing writes to these old keys going
// forward.
export const LEGACY_DISPLAY_FALLBACK = {
  artistName: "artistName",
  email: "email",
  latestSong: "latestSong",
};

export function isLegacyTicket(ticket) {
  return !ticket?.data?.requestType;
}
