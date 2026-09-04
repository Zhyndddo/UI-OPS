// Round 250 — static phase classification for every workstation and ticket
// task type, per explicit request: "lock in" which release-lifecycle phase
// each task type's work belongs to (Pre-release / Release / Post-release /
// Not phase-bound), independent of any individual release's actual date.
// This is a property of the TASK TYPE itself (design work is always
// pre-release work, a manual claim is always post-release work), not
// derived from a release's release_date the way "is this release upcoming"
// is elsewhere in the app — see the Round 247/248-era discussion that
// explicitly rejected deriving this dynamically per-release.
//
// This table was fully worked out and confirmed once already in an earlier
// session, but never got written to a real file — it only existed in that
// conversation's history, which a compaction later lost. This is that
// classification, re-supplied and confirmed directly by the user, now
// persisted so it survives future compactions. If this list and the user's
// own memory of "what we agreed" ever disagree, the user's word wins —
// update this file, don't argue from what's written here.
//
// Column ids match the ones lib/teamTypes.js's routes are keyed by, and the
// "workstation:"/"ticket:" prefixes match app/task-table/page.js's own
// column id convention (colId), so this map can be looked up directly by
// the same id used everywhere else. The Re-Check (confirm) workstation is
// the one type that splits across two phases depending on which of its two
// PIC-assignable phases the work is — see workstation:confirm_phase1 vs
// workstation:confirm_phase2 below; every other task type is a single flat
// phase for its whole lifetime.

export const TASK_PHASES = ["Pre-release", "Release", "Post-release", "Not phase-bound"];

export const TASK_PHASE = {
  // --- Workstations ---
  "workstation:booking": "Pre-release",
  "workstation:booking_not_in_package": "Pre-release", // ticket type, see below too — listed here only as a note, real entry is ticket:booking_not_in_package
  "workstation:upload": "Pre-release", // "New Release Setup"
  "workstation:confirm_phase1": "Pre-release", // Re-Check, Phase 1
  "workstation:confirm_phase2": "Release", // Re-Check, Phase 2 (Smartlink)
  "workstation:pre_release": "Pre-release", // Canva/lyrics workstation
  "workstation:pitching": "Pre-release",
  "workstation:package_price": "Pre-release",
  "workstation:stream": "Post-release", // Streaming
  "workstation:milestone": "Post-release",

  // --- Tickets ---
  "ticket:newrelease_upload": "Pre-release",
  "ticket:phu_luc": "Pre-release", // Phụ Lục Truyền Thông
  "ticket:phu_luc_mg": "Pre-release",
  "ticket:phu_luc_publishing": "Pre-release",
  "ticket:publishing": "Pre-release",
  "ticket:hop_dong_youtube": "Pre-release",
  "ticket:hop_dong_publishing": "Pre-release",
  "ticket:hop_dong_nhac_so": "Pre-release",
  "ticket:pre_order_itunes": "Pre-release",
  "ticket:priority_sync_lyric": "Pre-release",
  "ticket:mv_spotify": "Pre-release", // Music Video on Spotify
  "ticket:discovery_mode_spotify": "Pre-release",
  "ticket:sony_publish": "Pre-release",
  "ticket:split_share": "Pre-release", // Splitshare
  "ticket:co_trong_net_youtube": "Pre-release",
  "ticket:media_booking": "Pre-release",
  "ticket:pitching_info": "Pre-release",
  "ticket:pitching": "Pre-release",
  "ticket:artist_profile": "Pre-release",
  "ticket:phai_sinh": "Pre-release",
  "ticket:batch_phai_sinh": "Pre-release", // not a real task-table column (merged into phai_sinh), kept for completeness
  "ticket:booking_not_in_package": "Pre-release",

  "ticket:youtube_ads": "Release",

  "ticket:manual_claim": "Post-release",
  "ticket:report_conflict": "Post-release",
  "ticket:stream_update": "Post-release",
  "ticket:design": "Post-release",

  "ticket:khac": "Not phase-bound",
};

// Any column id not in the table above (shouldn't happen once this stays in
// sync with teamTypes.js, but a new task type landing here before this file
// is updated for it is a real possibility) falls into "Not phase-bound"
// rather than silently vanishing from the grouped view or throwing.
export function phaseForColumn(colId) {
  return TASK_PHASE[colId] || "Not phase-bound";
}
